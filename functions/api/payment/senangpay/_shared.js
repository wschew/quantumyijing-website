const enc = new TextEncoder();

export const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  }
});

export const clean = (value,max=300) => String(value ?? '').trim().slice(0,max);

export function senangConfig(env){
  const merchantId=clean(env.SENANGPAY_MERCHANT_ID,100);
  const secret=clean(env.SENANGPAY_SECRET_KEY,300);
  const mode=String(env.SENANGPAY_MODE||'sandbox').toLowerCase()==='live'?'live':'sandbox';
  if(!merchantId || !secret) throw new Error('SenangPay is not configured.');
  return {
    merchantId, secret, mode,
    paymentBase: mode==='live' ? 'https://app.senangpay.my/payment/' : 'https://sandbox.senangpay.my/payment/'
  };
}

export function safeEqual(a,b){
  const x=String(a||'').toLowerCase(), y=String(b||'').toLowerCase();
  if(x.length!==y.length) return false;
  let diff=0;
  for(let i=0;i<x.length;i++) diff |= x.charCodeAt(i)^y.charCodeAt(i);
  return diff===0;
}

export async function hmacSha256(secret, message){
  const key=await crypto.subtle.importKey(
    'raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']
  );
  const sig=await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function requestHash(secret, detail, amount, orderId){
  // Official senangPay manual-integration sequence:
  // Secret Key + Detail + Amount + Order ID, HMAC-SHA256 keyed by Secret Key.
  return hmacSha256(secret, `${secret}${detail}${amount}${orderId}`);
}

export async function responseHash(secret, statusId, orderId, transactionId, msg){
  // Official return/callback verification sequence:
  // Secret Key + Status ID + Order ID + Transaction ID + Message.
  return hmacSha256(secret, `${secret}${statusId}${orderId}${transactionId}${msg}`);
}

export function mapStatus(statusId){
  if(String(statusId)==='1') return 'Paid';
  if(String(statusId)==='2') return 'Pending';
  return 'Failed';
}

export async function parseGatewayParams(request){
  const url=new URL(request.url);
  if(request.method==='GET'){
    return Object.fromEntries(url.searchParams.entries());
  }
  const type=request.headers.get('content-type')||'';
  if(type.includes('application/json')){
    return await request.json();
  }
  const fd=await request.formData();
  return Object.fromEntries(fd.entries());
}

export async function recordGatewayEvent(db, data){
  try{
    await db.prepare(`INSERT INTO payment_gateway_events(
      provider,event_type,order_reference,transaction_id,status_id,message,
      hash_received,hash_verified,gateway_mode,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
      'SenangPay', data.eventType||'', data.orderId||'', data.transactionId||'',
      data.statusId||'', data.msg||'', data.hashReceived||'', data.hashVerified?1:0,
      data.mode||'', JSON.stringify(data.payload||{})
    ).run();
  }catch(err){
    console.warn('Gateway event log skipped', err);
  }
}

export async function applyGatewayResult(context, params, eventType){
  const {merchantId,secret,mode}=senangConfig(context.env);
  const statusId=clean(params.status_id,10);
  const orderId=clean(params.order_id,100);
  const transactionId=clean(params.transaction_id,100);
  const msg=clean(params.msg,160);
  const receivedHash=clean(params.hash,200).toLowerCase();

  if(!orderId || !receivedHash){
    return {ok:false,verified:false,status:400,error:'Missing gateway parameters.'};
  }

  const expected=await responseHash(secret,statusId,orderId,transactionId,msg);
  const verified=safeEqual(receivedHash,expected);
  const db=context.env.ENQUIRIES_DB;

  await recordGatewayEvent(db,{
    eventType,orderId,transactionId,statusId,msg,hashReceived:receivedHash,
    hashVerified:verified,mode,payload:{status_id:statusId,order_id:orderId,transaction_id:transactionId,msg}
  });

  if(!verified){
    return {ok:false,verified:false,status:400,error:'Payment verification failed.',orderId,transactionId};
  }

  const order=await db.prepare(`SELECT id,order_reference,total,currency,payment_status
    FROM orders WHERE order_reference=? LIMIT 1`).bind(orderId).first();
  if(!order){
    return {ok:false,verified:true,status:404,error:'Order not found.',orderId,transactionId};
  }

  const mapped=mapStatus(statusId);
  // Never downgrade an already-paid order because a later browser return says failed/pending.
  const nextOrderStatus=order.payment_status==='Paid' ? 'Paid' : mapped;
  const now=new Date().toISOString();

  let payment=null;
  if(transactionId){
    payment=await db.prepare(`SELECT id,status FROM payments
      WHERE order_id=? AND provider='SenangPay' AND provider_transaction_id=? LIMIT 1`)
      .bind(order.id,transactionId).first();
  }
  if(!payment){
    payment=await db.prepare(`SELECT id,status FROM payments
      WHERE order_id=? AND provider='SenangPay'
      ORDER BY id DESC LIMIT 1`).bind(order.id).first();
  }

  if(payment){
    await db.prepare(`UPDATE payments SET
      provider_transaction_id=?,amount=?,currency=?,status=?,raw_reference=?,
      paid_at=?,payment_method='SenangPay',gross_amount=?,
      verification_status=?,verified_at=?,customer_receipt_issuer='Quantum YiJing',
      gateway_mode=?,gateway_message=?,gateway_hash_verified=1
      WHERE id=?`).bind(
        transactionId,Number(order.total||0),order.currency||'MYR',mapped,
        `${eventType}:${transactionId}:${msg}`,
        mapped==='Paid'?now:'',
        Number(order.total||0),
        mapped==='Paid'?'Verified':'Unverified',
        mapped==='Paid'?now:'',
        mode,msg,payment.id
      ).run();
  }else{
    await db.prepare(`INSERT INTO payments(
      order_id,provider,provider_transaction_id,amount,currency,status,raw_reference,paid_at,
      payment_method,gross_amount,provider_fee,net_amount,settlement_date,bank_received_amount,
      verification_status,verified_at,customer_receipt_issuer,notes,
      gateway_mode,gateway_message,gateway_hash_verified
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      order.id,'SenangPay',transactionId,Number(order.total||0),order.currency||'MYR',
      mapped,`${eventType}:${transactionId}:${msg}`,mapped==='Paid'?now:'',
      'SenangPay',Number(order.total||0),0,0,'',0,
      mapped==='Paid'?'Verified':'Unverified',mapped==='Paid'?now:'',
      'Quantum YiJing',
      mapped==='Paid'?'Gateway payment verified; settlement fee and bank amount awaiting reconciliation.':'',
      mode,msg,1
    ).run();
  }

  await db.prepare(`UPDATE orders SET payment_provider='SenangPay',payment_status=?,external_order_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(nextOrderStatus,transactionId||'',order.id).run();

  return {
    ok:true,verified:true,status:200,orderId,transactionId,msg,
    gatewayStatus:mapped,orderStatus:nextOrderStatus,total:Number(order.total||0),
    currency:order.currency||'MYR',mode
  };
}

export function esc(v){
  return String(v??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
