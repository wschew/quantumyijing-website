import {
  clean,config,signature,requestTarget,logEvent,esc,basicAuthorization
} from './_shared.js';

const bad=(m,s=400)=>new Response(
  `<!doctype html><meta charset="utf-8"><title>Payment</title>
  <body style="font-family:Arial;padding:40px">
  <h2>Unable to start payment</h2><p>${esc(m)}</p>
  <p><a href="/products.html">Return to Products</a></p></body>`,
  {status:s,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}
);

export async function onRequestPost(context){
  let body={};
  try{
    const t=context.request.headers.get('content-type')||'';
    body=t.includes('application/json')
      ? await context.request.json()
      : Object.fromEntries((await context.request.formData()).entries());
  }catch{return bad('Invalid payment request.');}

  const ref=clean(body.order_reference||body.orderReference,64);
  if(!/^[A-Za-z0-9-]{4,64}$/.test(ref)) return bad('Invalid order reference.');

  let cfg;
  try{cfg=config(context.env)}catch(e){return bad(e.message,503)}

  const db=context.env.ENQUIRIES_DB;
  const o=await db.prepare(`SELECT
    o.id,o.order_reference,o.customer_name,o.customer_email,o.customer_phone,
    o.currency,o.total,o.payment_status,o.payment_provider,
    p.sku,p.name_en,p.senangpay_enabled
    FROM orders o
    JOIN order_items oi ON oi.order_id=o.id
    JOIN products p ON p.id=oi.product_id
    WHERE o.order_reference=? LIMIT 1`).bind(ref).first();

  if(!o) return bad('Order not found.',404);
  if(o.payment_status==='Paid') return bad('This order has already been paid.');
  if(String(o.payment_provider||'')!=='DOKU') return bad('This order is not assigned to DOKU checkout.');
  if(Number(o.senangpay_enabled)!==1) return bad('Online payment is not enabled for this product.');
  if(String(o.currency||'MYR').toUpperCase()!=='MYR') return bad('DOKU checkout is currently limited to MYR orders on this website.');

  const amount=Number(o.total||0);
  if(!(amount>0)) return bad('Order amount is invalid.');

  const checkoutId=crypto.randomUUID();
  const expires=new Date(Date.now()+60*60*1000).toISOString();
  const payload={
    id:checkoutId,
    order:{
      amount:Number(amount.toFixed(2)),
      invoice_number:ref,
      currency:'MYR',
      expired_at:expires
    },
    customer:{
      name:clean(o.customer_name,255),
      email:clean(o.customer_email,128),
      phone:clean(o.customer_phone,32)
    }
  };

  const raw=JSON.stringify(payload);
  const requestId=crypto.randomUUID();
  const timestamp=new Date().toISOString();
  const target=requestTarget(cfg.endpoint);
  const sig=await signature(
    cfg.secret,cfg.clientId,requestId,timestamp,target,raw,'POST'
  );

  const r=await fetch(cfg.endpoint,{
    method:'POST',
    headers:{
      'accept':'application/json',
      'content-type':'application/json',
      'authorization':basicAuthorization(cfg.apiKey),
      'Client-Id':cfg.clientId,
      'Request-Id':requestId,
      'Request-Timestamp':timestamp,
      'Signature':sig
    },
    body:raw
  });

  let d={};
  try{d=await r.json()}catch{}
  const responseCheckoutId=clean(d?.id||checkoutId,100);
  const payUrl=clean(
    d?.payment?.checkout_url || d?.payment?.url || d?.response?.payment?.url,
    1000
  );

  await logEvent(db,{
    eventType:'Start',orderRef:ref,transactionId:responseCheckoutId,
    status:String(r.status),message:payUrl?'Checkout created':'Checkout creation failed',
    verified:r.ok,mode:cfg.mode,payload:{httpStatus:r.status,response:d}
  });

  if(!r.ok||!payUrl){
    console.error('DOKU Checkout create failed',r.status,d);
    return bad('DOKU did not create a checkout session. Please contact the Academy or try again later.',502);
  }

  await db.prepare(`UPDATE orders SET
    payment_provider='DOKU',payment_status='Pending',external_order_id=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(responseCheckoutId,o.id).run();

  let py=await db.prepare(`SELECT id FROM payments
    WHERE order_id=? AND provider='DOKU' ORDER BY id DESC LIMIT 1`).bind(o.id).first();
  if(py){
    await db.prepare(`UPDATE payments SET
      provider_transaction_id=?,amount=?,currency=?,status='Pending',
      payment_method='DOKU',gross_amount=?,gateway_mode=?,gateway_message='Checkout created'
      WHERE id=?`).bind(
        responseCheckoutId,amount,o.currency||'MYR',amount,cfg.mode,py.id
      ).run();
  }else{
    await db.prepare(`INSERT INTO payments(
      order_id,provider,provider_transaction_id,amount,currency,status,raw_reference,paid_at,
      payment_method,gross_amount,provider_fee,net_amount,settlement_date,bank_received_amount,
      verification_status,verified_at,customer_receipt_issuer,notes,
      gateway_mode,gateway_message,gateway_hash_verified
    ) VALUES(?,?,?,?,?,'Pending','','','DOKU',?,0,0,'',0,'Unverified','',
      'Quantum YiJing','DOKU checkout created; awaiting verified payment.',?,'Checkout created',0)`)
      .bind(o.id,'DOKU',responseCheckoutId,amount,o.currency||'MYR',amount,cfg.mode).run();
  }

  return Response.redirect(payUrl,303);
}
export function onRequest(c){
  return c.request.method==='POST'?onRequestPost(c):bad('Method not allowed.',405);
}
