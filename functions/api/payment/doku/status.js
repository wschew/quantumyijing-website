import {
  json,clean,config,signature,requestTarget,statusEndpoint,
  basicAuthorization,logEvent,markPaid
} from './_shared.js';

export async function onRequestGet(context){
  const ref=clean(new URL(context.request.url).searchParams.get('order'),100);
  if(!ref) return json({error:'Order reference required.'},400);

  const db=context.env.ENQUIRIES_DB;
  const order=await db.prepare(`SELECT
    id,order_reference,currency,total,payment_status,payment_provider,external_order_id
    FROM orders WHERE order_reference=? LIMIT 1`).bind(ref).first();
  if(!order) return json({error:'Order not found.'},404);

  if(!order.external_order_id){
    return json({ok:true,order:{
      orderReference:order.order_reference,currency:order.currency,
      total:Number(order.total||0),paymentStatus:order.payment_status,
      paymentProvider:order.payment_provider,checkoutId:'',remoteStatus:'NOT_CREATED'
    }});
  }

  let cfg;
  try{cfg=config(context.env)}catch(e){return json({error:e.message},503)}

  const endpoint=statusEndpoint(cfg.endpoint,order.external_order_id);
  const requestId=crypto.randomUUID();
  const timestamp=new Date().toISOString();
  const target=requestTarget(endpoint);
  const sig=await signature(
    cfg.secret,cfg.clientId,requestId,timestamp,target,'','GET'
  );

  const r=await fetch(endpoint,{
    method:'GET',
    headers:{
      'accept':'application/json',
      'authorization':basicAuthorization(cfg.apiKey),
      'Client-Id':cfg.clientId,
      'Request-Id':requestId,
      'Request-Timestamp':timestamp,
      'Signature':sig
    }
  });

  let d={};
  try{d=await r.json()}catch{}
  const orderStatus=clean(d?.order?.status,40).toUpperCase();
  const paymentStatus=clean(d?.payment?.status,40).toUpperCase();
  const state=clean(d?.payment?.state,40).toUpperCase();

  await logEvent(db,{
    eventType:'StatusCheck',orderRef:ref,transactionId:order.external_order_id,
    status:orderStatus||paymentStatus||String(r.status),
    message:`${orderStatus||paymentStatus}${state?` / ${state}`:''}`,
    verified:r.ok,mode:cfg.mode,payload:{httpStatus:r.status,response:d}
  });

  if(r.ok && (orderStatus==='PAID' || paymentStatus==='SUCCESS')){
    await markPaid(db,{
      orderRef:ref,checkoutId:order.external_order_id,
      statusMessage:`${orderStatus||paymentStatus}${state?` / ${state}`:''}`,
      mode:cfg.mode
    });
  }

  const latest=await db.prepare(`SELECT
    o.payment_status,py.verification_status,py.gateway_message
    FROM orders o
    LEFT JOIN payments py ON py.id=(SELECT MAX(p2.id) FROM payments p2 WHERE p2.order_id=o.id)
    WHERE o.id=?`).bind(order.id).first();

  return json({
    ok:r.ok,
    httpStatus:r.status,
    order:{
      orderReference:order.order_reference,
      currency:order.currency,
      total:Number(order.total||0),
      paymentStatus:latest?.payment_status||order.payment_status,
      paymentProvider:order.payment_provider,
      checkoutId:order.external_order_id,
      remoteOrderStatus:orderStatus,
      remotePaymentStatus:paymentStatus,
      remoteState:state,
      verificationStatus:latest?.verification_status||'',
      gatewayMessage:latest?.gateway_message||''
    },
    doku:r.ok?d:undefined,
    error:r.ok?undefined:(d?.message||d?.error||'DOKU status request failed.')
  },r.ok?200:502);
}
export function onRequest(c){
  return c.request.method==='GET'
    ? onRequestGet(c)
    : json({error:'Method not allowed.'},405);
}
