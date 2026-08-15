const enc=new TextEncoder();

export const DOKU_API_VERSION='arabica.2025-12-01';

export const clean=(v,max=300)=>String(v??'').trim().slice(0,max);
export const json=(d,s=200)=>new Response(JSON.stringify(d),{
  status:s,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  }
});
export const esc=v=>String(v??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

function b64Bytes(bytes){
  let s='';
  for(const b of new Uint8Array(bytes)) s+=String.fromCharCode(b);
  return btoa(s);
}
export function basicAuthorization(apiKey){
  return `Basic ${btoa(`${apiKey}:`)}`;
}
export function config(env){
  const clientId=clean(env.DOKU_CLIENT_ID,128);
  const secret=clean(env.DOKU_SECRET_KEY,512);
  const apiKey=clean(env.DOKU_API_KEY,512);
  const endpoint=clean(env.DOKU_CHECKOUT_ENDPOINT,500);
  if(!clientId||!secret||!apiKey) throw new Error('DOKU Malaysia credentials are not fully configured.');
  if(!endpoint) throw new Error('DOKU_CHECKOUT_ENDPOINT is not configured for this environment.');
  const u=new URL(endpoint);
  if(u.protocol!=='https:') throw new Error('DOKU endpoint must use HTTPS.');
  if(!u.pathname.endsWith('/v3/checkouts')) throw new Error('DOKU_CHECKOUT_ENDPOINT must end with /v3/checkouts.');
  const mode=u.hostname.includes('sandbox')?'sandbox':'production';
  return {clientId,secret,apiKey,endpoint,mode,apiVersion:DOKU_API_VERSION};
}
export async function digest(body){
  const h=await crypto.subtle.digest('SHA-256',enc.encode(body));
  return b64Bytes(h);
}
export async function hmac(secret,text){
  const k=await crypto.subtle.importKey(
    'raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']
  );
  return b64Bytes(await crypto.subtle.sign('HMAC',k,enc.encode(text)));
}
export async function signature(
  secret,
  timestamp,
  target,
  body='',
  method='POST'
){
  const parts=[
    `Request-Timestamp:${timestamp}`,
    `Request-Target:${target}`
  ];

  if(['POST','PATCH'].includes(String(method).toUpperCase())){
    parts.push(`Digest:${await digest(body)}`);
  }

  return `HMACSHA256=${await hmac(
    secret,
    parts.join('\n')
  )}`;
}

export function requestTarget(endpoint){
  const u=new URL(endpoint);
  return u.pathname+u.search;
}
export function statusEndpoint(checkoutEndpoint,checkoutId){
  const u=new URL(checkoutEndpoint);
  u.pathname=u.pathname.replace(/\/v3\/checkouts\/?$/,'')+`/v3/checkouts/${encodeURIComponent(checkoutId)}`;
  u.search='';
  return u.toString();
}
export function safeEqual(a,b){
  a=String(a||''); b=String(b||'');
  if(a.length!==b.length) return false;
  let d=0;
  for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i);
  return d===0;
}
export function moneyEqual(a,b){
  const x=Number(a), y=Number(b);
  if(!Number.isFinite(x)||!Number.isFinite(y)) return false;
  return Math.round(x*100)===Math.round(y*100);
}
export async function logEvent(db,data){
  try{
    await db.prepare(`INSERT INTO payment_gateway_events(
      provider,event_type,order_reference,transaction_id,status_id,message,
      hash_received,hash_verified,gateway_mode,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
      'DOKU',data.eventType||'',data.orderRef||'',data.transactionId||'',
      data.status||'',data.message||'',data.signature||'',
      data.verified?1:0,data.mode||'',JSON.stringify(data.payload||{})
    ).run();
  }catch(e){ console.warn('DOKU event log skipped',e); }
}
export async function markPaid(db,{orderRef,checkoutId='',statusMessage='SUCCESS',mode=''}) {
  const o=await db.prepare(`SELECT id,total,currency,payment_status
    FROM orders WHERE order_reference=? LIMIT 1`).bind(orderRef).first();
  if(!o) return {ok:false,error:'Order not found.'};

  const now=new Date().toISOString();
  let py=await db.prepare(`SELECT id FROM payments
    WHERE order_id=? AND provider='DOKU' ORDER BY id DESC LIMIT 1`).bind(o.id).first();

  if(py){
    await db.prepare(`UPDATE payments SET
      provider_transaction_id=?,amount=?,currency=?,status='Paid',raw_reference=?,paid_at=?,
      payment_method='DOKU',gross_amount=?,verification_status='Verified',verified_at=?,
      customer_receipt_issuer='Quantum YiJing',gateway_mode=?,gateway_message=?,
      gateway_hash_verified=1
      WHERE id=?`).bind(
        checkoutId,Number(o.total||0),o.currency||'MYR',
        `DOKU:${checkoutId||orderRef}`,now,Number(o.total||0),now,
        mode,statusMessage,py.id
      ).run();
  }else{
    await db.prepare(`INSERT INTO payments(
      order_id,provider,provider_transaction_id,amount,currency,status,raw_reference,paid_at,
      payment_method,gross_amount,provider_fee,net_amount,settlement_date,bank_received_amount,
      verification_status,verified_at,customer_receipt_issuer,notes,
      gateway_mode,gateway_message,gateway_hash_verified
    ) VALUES(?,?,?,?,?,'Paid',?,?, 'DOKU',?,0,0,'',0,'Verified',?,
      'Quantum YiJing','Gateway payment verified; settlement awaiting reconciliation.',?,?,1)`)
      .bind(
        o.id,'DOKU',checkoutId,Number(o.total||0),o.currency||'MYR',
        `DOKU:${checkoutId||orderRef}`,now,Number(o.total||0),now,mode,statusMessage
      ).run();
  }

  await db.prepare(`UPDATE orders SET
    payment_provider='DOKU',payment_status='Paid',external_order_id=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(checkoutId||'',o.id).run();

  return {ok:true,total:Number(o.total||0),currency:o.currency||'MYR'};
}
export async function markTerminal(db,{orderRef,checkoutId='',status='Failed',statusMessage='',mode=''}) {
  const normalized=String(status).toLowerCase()==='expired'?'Expired':'Failed';
  const o=await db.prepare(`SELECT id,total,currency,payment_status
    FROM orders WHERE order_reference=? LIMIT 1`).bind(orderRef).first();
  if(!o) return {ok:false,error:'Order not found.'};
  if(o.payment_status==='Paid') return {ok:true,ignored:true};

  let py=await db.prepare(`SELECT id FROM payments
    WHERE order_id=? AND provider='DOKU' ORDER BY id DESC LIMIT 1`).bind(o.id).first();

  if(py){
    await db.prepare(`UPDATE payments SET
      provider_transaction_id=?,status=?,payment_method='DOKU',
      verification_status='Verified',verified_at=?,
      gateway_mode=?,gateway_message=?,gateway_hash_verified=1
      WHERE id=?`).bind(
        checkoutId,normalized,new Date().toISOString(),mode,statusMessage||normalized,py.id
      ).run();
  }

  await db.prepare(`UPDATE orders SET
    payment_provider='DOKU',payment_status=?,external_order_id=COALESCE(NULLIF(?,''),external_order_id),
    updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(normalized,checkoutId,o.id).run();

  return {ok:true,status:normalized};
}
