import {
  clean,config,signature,logEvent,safeEqual,moneyEqual,markPaid,markTerminal
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
  const signatureVerified=client===cfg.clientId && safeEqual(received,expected);

  const ref=clean(p?.order?.invoice_number||p?.invoice_number,100);
  const checkoutId=clean(
    p?.id||p?.transaction?.id||p?.transaction?.original_request_id||
    p?.payment?.transaction_id,120
  );
  const paymentStatus=clean(
    p?.payment?.status||p?.transaction?.status||p?.status,40
  ).toUpperCase();
  const state=clean(
    p?.payment?.state||p?.transaction?.state,40
  ).toUpperCase();
  const channel=clean(
    p?.payment?.channel||p?.channel?.id||p?.service?.id,80
  );

  const remoteAmount=Number(p?.payment?.amount ?? p?.order?.amount);
  const remoteCurrency=clean(
    p?.payment?.currency||p?.order?.currency,12
  ).toUpperCase();

  const db=context.env.ENQUIRIES_DB;
  const local=ref?await db.prepare(`SELECT
    id,total,currency,payment_status,payment_provider,external_order_id
    FROM orders WHERE order_reference=? LIMIT 1`).bind(ref).first():null;

  const orderFound=!!local;
  const amountVerified=orderFound && moneyEqual(local.total,remoteAmount);
  const currencyVerified=orderFound &&
    String(local.currency||'MYR').toUpperCase()===remoteCurrency;
  const integrityVerified=signatureVerified && orderFound && amountVerified && currencyVerified;

  await logEvent(db,{
    eventType:'Notification',orderRef:ref,transactionId:checkoutId,
    status:paymentStatus,message:[
      paymentStatus,state,channel,
      signatureVerified?'signature-ok':'signature-failed',
      amountVerified?'amount-ok':'amount-mismatch',
      currencyVerified?'currency-ok':'currency-mismatch'
    ].filter(Boolean).join(' / '),
    signature:received,verified:integrityVerified,mode:cfg.mode,payload:p
  });

  if(!signatureVerified) return new Response(null,{status:401});
  if(!ref||!orderFound) return new Response(null,{status:404});
  if(!amountVerified||!currencyVerified) return new Response(null,{status:409});

  if(paymentStatus==='SUCCESS'){
    await markPaid(db,{
      orderRef:ref,checkoutId,
      statusMessage:`SUCCESS${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,
      mode:cfg.mode
    });
  }else if(paymentStatus==='FAILED'){
    await markTerminal(db,{
      orderRef:ref,checkoutId,status:'Failed',
      statusMessage:`FAILED${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,
      mode:cfg.mode
    });
  }else if(paymentStatus==='EXPIRED'){
    await markTerminal(db,{
      orderRef:ref,checkoutId,status:'Expired',
      statusMessage:`EXPIRED${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,
      mode:cfg.mode
    });
  }

  // DOKU Global notification expects HTTP 200 with no body.
  // Cards documentation also accepts HTTP 200; empty body is intentionally used.
  return new Response(null,{status:200});
}
export function onRequest(c){
  return c.request.method==='POST'
    ? onRequestPost(c)
    : new Response(null,{status:405});
}
