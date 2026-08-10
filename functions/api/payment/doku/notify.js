import {
  clean,config,signature,logEvent,safeEqual,markPaid
} from './_shared.js';

export async function onRequestPost(context){
  const raw=await context.request.text();
  let p={};
  try{p=JSON.parse(raw)}catch{return new Response(null,{status:400})}

  let cfg;
  try{cfg=config(context.env)}catch{return new Response(null,{status:503})}

  const h=context.request.headers;
  const client=h.get('Client-Id')||h.get('client-id')||'';
  const rid=h.get('Request-Id')||h.get('request-id')||'';
  const ts=h.get('Request-Timestamp')||h.get('request-timestamp')||'';
  const received=h.get('Signature')||h.get('signature')||'';
  const target=new URL(context.request.url).pathname;

  const expected=await signature(cfg.secret,client,rid,ts,target,raw,'POST');
  const verified=client===cfg.clientId && safeEqual(received,expected);

  const ref=clean(p?.order?.invoice_number||p?.invoice_number,100);
  const checkoutId=clean(p?.id||p?.transaction?.id||p?.payment?.transaction_id,120);
  const paymentStatus=clean(p?.payment?.status||p?.transaction?.status||p?.status,40).toUpperCase();
  const state=clean(p?.payment?.state||p?.transaction?.state,40).toUpperCase();

  await logEvent(context.env.ENQUIRIES_DB,{
    eventType:'Notification',orderRef:ref,transactionId:checkoutId,
    status:paymentStatus,message:`${paymentStatus}${state?` / ${state}`:''}`,
    signature:received,verified,mode:cfg.mode,payload:p
  });

  if(!verified) return new Response(null,{status:401});

  if(ref && paymentStatus==='SUCCESS'){
    await markPaid(context.env.ENQUIRIES_DB,{
      orderRef:ref,checkoutId,statusMessage:`SUCCESS${state?` / ${state}`:''}`,mode:cfg.mode
    });
  }

  // DOKU Malaysia documentation specifies HTTP 200 with no response body.
  return new Response(null,{status:200});
}
export function onRequest(c){
  return c.request.method==='POST'
    ? onRequestPost(c)
    : new Response(null,{status:405});
}
