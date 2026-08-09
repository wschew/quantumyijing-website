import {senangConfig,requestHash,clean,esc,recordGatewayEvent} from './_shared.js';

function bad(message,status=400){
  return new Response(`<!doctype html><meta charset="utf-8"><title>Payment</title><body style="font-family:Arial;padding:40px"><h2>Unable to start payment</h2><p>${esc(message)}</p><p><a href="/products.html">Return to Products</a></p></body>`,{
    status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}
  });
}

export async function onRequestPost(context){
  let body={};
  try{
    const type=context.request.headers.get('content-type')||'';
    if(type.includes('application/json')) body=await context.request.json();
    else body=Object.fromEntries((await context.request.formData()).entries());
  }catch{return bad('Invalid payment request.');}

  const orderRef=clean(body.order_reference||body.orderReference,100);
  if(!/^[A-Za-z0-9-]{4,100}$/.test(orderRef)) return bad('Invalid order reference.');

  let cfg;
  try{cfg=senangConfig(context.env)}catch{return bad('SenangPay is not configured for this environment.',503);}

  const db=context.env.ENQUIRIES_DB;
  const order=await db.prepare(`
    SELECT o.id,o.order_reference,o.customer_name,o.customer_email,o.customer_phone,o.currency,o.total,
      o.payment_status,o.payment_provider,p.sku,p.name_en,p.senangpay_enabled
    FROM orders o
    JOIN order_items oi ON oi.order_id=o.id
    JOIN products p ON p.id=oi.product_id
    WHERE o.order_reference=? LIMIT 1
  `).bind(orderRef).first();

  if(!order) return bad('Order not found.',404);
  if(String(order.currency||'MYR').toUpperCase()!=='MYR') return bad('SenangPay checkout is currently configured for MYR orders only.');
  if(Number(order.senangpay_enabled)!==1) return bad('Online SenangPay payment is not enabled for this product.');
  if(order.payment_status==='Paid') return bad('This order has already been paid.');
  if(!['SenangPay',''].includes(String(order.payment_provider||''))) return bad('This order uses another payment provider.');

  // detail only uses characters permitted by senangPay's manual-integration guide.
  const detail=`Quantum_YiJing_${String(order.sku||'Order').replace(/[^A-Za-z0-9._-]/g,'_')}_${orderRef}`.slice(0,500);
  const amount=Number(order.total||0).toFixed(2);
  if(Number(amount)<=0) return bad('Order amount is invalid.');

  const hash=await requestHash(cfg.secret,detail,amount,orderRef);
  const action=`${cfg.paymentBase}${encodeURIComponent(cfg.merchantId)}`;

  await recordGatewayEvent(db,{
    eventType:'Start',orderId:orderRef,transactionId:'',statusId:'',msg:'Payment request created',
    hashReceived:'',hashVerified:true,mode:cfg.mode,
    payload:{detail,amount,order_id:orderRef}
  });

  const fields={
    detail,amount,order_id:orderRef,hash,
    name:clean(order.customer_name,100),
    email:clean(order.customer_email,160),
    phone:clean(order.customer_phone,60)
  };
  const inputs=Object.entries(fields).map(([k,v])=>`<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');

  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redirecting to senangPay</title></head><body style="font-family:Arial;background:#f5f8fc;color:#0b2f66;padding:40px;text-align:center"><h2>Redirecting to secure payment…</h2><p>Order ${esc(orderRef)} · RM ${esc(amount)}</p><form id="sp" method="post" action="${esc(action)}">${inputs}<button type="submit" style="padding:12px 20px;border:0;border-radius:10px;background:#1768c4;color:#fff;font-weight:700">Continue to senangPay</button></form><script>document.getElementById('sp').submit()</script></body></html>`,{
    headers:{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store',
      'referrer-policy':'no-referrer',
      'x-content-type-options':'nosniff'
    }
  });
}

export function onRequest(context){
  if(context.request.method==='POST') return onRequestPost(context);
  return bad('Method not allowed.',405);
}
