const enc=new TextEncoder();
export const clean=(v,max=300)=>String(v??'').trim().slice(0,max);
export const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function b64(bytes){let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s)}
export function config(env){
 const clientId=clean(env.DOKU_CLIENT_ID,128),secret=clean(env.DOKU_SECRET_KEY,512),endpoint=clean(env.DOKU_CHECKOUT_ENDPOINT,500);
 if(!clientId||!secret)throw new Error('DOKU credentials are not configured.');
 if(!endpoint)throw new Error('DOKU_CHECKOUT_ENDPOINT is not configured for this environment.');
 const u=new URL(endpoint); if(u.protocol!=='https:')throw new Error('DOKU endpoint must use HTTPS.');
 return {clientId,secret,endpoint};
}
export async function digest(body){const h=await crypto.subtle.digest('SHA-256',enc.encode(body));return b64(h)}
export async function hmac(secret,text){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',k,enc.encode(text)))}
export async function signature(secret,clientId,requestId,timestamp,target,body){
 const dg=await digest(body); const component=`Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:${target}\nDigest:${dg}`;
 return `HMACSHA256=${await hmac(secret,component)}`;
}
export function requestTarget(endpoint){const u=new URL(endpoint);return u.pathname+u.search}
export async function logEvent(db,data){try{await db.prepare(`INSERT INTO payment_gateway_events(provider,event_type,order_reference,transaction_id,status_id,message,hash_received,hash_verified,gateway_mode,payload) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind('DOKU',data.eventType||'',data.orderRef||'',data.transactionId||'',data.status||'',data.message||'',data.signature||'',data.verified?1:0,data.mode||'',JSON.stringify(data.payload||{})).run()}catch(e){console.warn('DOKU event log skipped',e)}}
