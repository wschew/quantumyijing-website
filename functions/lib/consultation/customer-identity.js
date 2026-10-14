// Server-owned primary DB only. Existing portal helpers are never called or modified.
import {randomSecret,tokenHash} from './auth-crypto.js';
import {PORTAL_COOKIE,CONTEXT_COOKIE,CSRF_HEADER,TOKEN,trustedOrigin,sessionCookie,requestAllowed,contextCookie,clearContextCookie} from './customer-request-security.js';
export const CONTEXT_MS=30*60*1000;
export const MIN_ISSUANCE_MS=5000;
const NOW="(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const expiry="(CAST(strftime('%s',p.expires_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.expires_at),4,3) AS INTEGER))";
const parentCreated="(CAST(strftime('%s',p.created_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.created_at),4,3) AS INTEGER))";
const live=`${parentCreated}<=${NOW} AND ${expiry}>${parentCreated} AND p.token_hash=? AND COALESCE(p.revoked_at,'')='' AND ${expiry}>${NOW} AND c.status='Active'`;
const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
const response=(status,body,extra={})=>Response.json(body,{status,headers:{...headers,...extra}});
const denied=()=>({error:response(401,{ok:false,error:'Customer authorization denied.'})});
const rejected=()=>({error:response(403,{ok:false,error:'Request rejected.'})});
const unavailable=()=>({error:response(503,{ok:false,error:'Customer context unavailable.'})});
export function createCustomerIdentity({db,origin}) {
 trustedOrigin(origin);
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')throw Error('Authoritative customer binding required');
 async function portal(request,{mutation=false}={}) {
  if(!requestAllowed(request,origin,{mutation}))return rejected();
  const token=sessionCookie(request,PORTAL_COOKIE);
  if(!token)return denied();
  const digest=await tokenHash(token);
  const row=await db.prepare(`SELECT p.id AS portal_session_id,p.customer_id,${expiry} AS expires_at
   FROM academy_portal_sessions p JOIN customers c ON c.id=p.customer_id WHERE ${live}`).bind(digest).first();
  if(!row||!Number.isSafeInteger(row.customer_id)||row.customer_id<1||!Number.isSafeInteger(row.portal_session_id)||row.portal_session_id<1||!Number.isSafeInteger(row.expires_at))return denied();
  return {principal:Object.freeze({customerId:row.customer_id,portalSessionId:row.portal_session_id,expiresAt:row.expires_at}),digest};
 }
 async function portalIdentity(request) {
  try{const result=await portal(request);return result.error?result:{principal:result.principal};}catch{return unavailable();}
 }
 async function checked(request,{mutation=false}={}) {
  const parent=await portal(request,{mutation});
  if(parent.error)return parent;
  const token=sessionCookie(request,CONTEXT_COOKIE);
  const csrf=mutation?request.headers.get(CSRF_HEADER):null;
  if(!token||(mutation&&!TOKEN.test(csrf||'')))return denied();
  const digest=await tokenHash(token),csrfDigest=mutation?await tokenHash(csrf):null;
  const row=await db.prepare(`SELECT x.id,x.customer_id,x.portal_session_id,x.version,MIN(x.expires_at,${expiry}) AS expires_at
   FROM consultation_customer_contexts x JOIN academy_portal_sessions p ON p.id=x.portal_session_id
   JOIN customers c ON c.id=p.customer_id
   WHERE x.token_hash=? AND x.customer_id=p.customer_id AND x.revoked_at IS NULL AND x.expires_at>${NOW}
   AND x.issued_at<=${NOW} AND ${live}${mutation?' AND x.csrf_hash=?':''}`)
   .bind(...[digest,parent.digest,...(mutation?[csrfDigest]:[])]).first();
  if(!row||!Number.isSafeInteger(row.customer_id)||row.customer_id<1||!Number.isSafeInteger(row.portal_session_id)||row.portal_session_id<1||!Number.isSafeInteger(row.version)||row.version<1||!Number.isSafeInteger(row.expires_at))return denied();
  return {principal:Object.freeze({customerId:row.customer_id,portalSessionId:row.portal_session_id,contextId:row.id,version:row.version,expiresAt:row.expires_at}),parentDigest:parent.digest,digest,csrfDigest};
 }
 async function authorize(request,{stateChanging=false}={}) {
  if(typeof stateChanging!=='boolean')return rejected();
  try{const result=await checked(request,{mutation:stateChanging});return result.error?result:{principal:result.principal};}catch{return unavailable();}
 }
 function evidence(contextId,version,event) {
  return db.prepare(`INSERT INTO consultation_customer_context_events(id,context_id,version,event,occurred_at)
   VALUES(?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,${NOW})`).bind(crypto.randomUUID(),contextId,version,event);
 }
 // Reproducible only with the secret HttpOnly context cookie; not stored in browser storage.
 async function csrfFor(token){const bytes=Uint8Array.from(token.match(/../g),x=>parseInt(x,16));const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('qy-consultation-context-csrf-v1:'+origin));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');}
 async function credentials(){const token=randomSecret(),csrf=await csrfFor(token);return {token,csrf,tokenDigest:await tokenHash(token),csrfDigest:await tokenHash(csrf)};}
 async function resume(request){
  if(!requestAllowed(request,origin,{mutation:true}))return response(403,{ok:false,code:'CONTEXT_ORIGIN_REJECTED'});
  try{
   const read=new Request(request.url,{method:'GET',headers:request.headers});
   const a=await checked(read);if(a.error)return response(401,{ok:false,code:'CONTEXT_SESSION_REQUIRED'});
   const token=sessionCookie(request,CONTEXT_COOKIE),csrf=await csrfFor(token);
   const row=await db.prepare(`SELECT x.id,x.version,x.customer_id,MIN(x.expires_at,${expiry}) expires_at FROM consultation_customer_contexts x JOIN academy_portal_sessions p ON p.id=x.portal_session_id JOIN customers c ON c.id=p.customer_id WHERE x.id=? AND x.version=? AND x.token_hash=? AND x.csrf_hash=? AND x.customer_id=p.customer_id AND x.revoked_at IS NULL AND x.issued_at<=${NOW} AND x.expires_at>${NOW} AND ${live}`).bind(a.principal.contextId,a.principal.version,a.digest,await tokenHash(csrf),a.parentDigest).first();
   if(!row)return response(409,{ok:false,code:'CONTEXT_RESUME_UNAVAILABLE'});
   return response(200,{ok:true,resumed:true,csrfToken:csrf,context:{id:row.id,version:row.version,customerId:row.customer_id,expiresAt:row.expires_at}});
  }catch{return response(503,{ok:false,code:'CONTEXT_UNAVAILABLE'});}
 }
 // Commit is already complete here. Never report an issuance failure as an unexecuted mutation.
 async function success(creds,id,version,parentDigest) {
  try {
   const row=await db.prepare(`SELECT MIN(x.expires_at,${expiry}) AS expires_at,${NOW} AS now
    FROM consultation_customer_contexts x JOIN academy_portal_sessions p ON p.id=x.portal_session_id
    JOIN customers c ON c.id=p.customer_id
    WHERE x.id=? AND x.version=? AND x.token_hash=? AND x.csrf_hash=? AND x.customer_id=p.customer_id
    AND x.revoked_at IS NULL AND x.issued_at<=${NOW} AND x.expires_at>=${NOW}+1000 AND ${live}
    AND ${expiry}>=${NOW}+1000`).bind(id,version,creds.tokenDigest,creds.csrfDigest,parentDigest).first();
   if(!row)return response(409,{ok:false,committed:true,issued:false,error:'Context became unavailable after commit. Reauthenticate before further action.'});
   const seconds=Math.floor((row.expires_at-row.now)/1000);
   if(seconds<1)return response(409,{ok:false,committed:true,issued:false,error:'Context became unavailable after commit. Reauthenticate before further action.'});
   return response(200,{ok:true,committed:true,issued:true,csrfToken:creds.csrf,expiresAt:row.expires_at},{'set-cookie':contextCookie(creds.token,seconds)});
  }catch{return response(503,{ok:false,committed:true,issued:false,error:'Context issuance could not be verified after commit. Reauthenticate before further action.'});}
 }
 function failure(error){return typeof error?.message==='string'&&error.message.includes('customer context authorization failed')?denied().error:unavailable().error;}
 async function establish(request) {
  try {
   const parent=await portal(request,{mutation:true});if(parent.error)return parent.error;
   const current=await db.prepare('SELECT id,version,revoked_at,expires_at FROM consultation_customer_contexts WHERE portal_session_id=?').bind(parent.principal.portalSessionId).first();
   const creds=await credentials();const id=current?.id||crypto.randomUUID();
   const mutation=current
    ?db.prepare(`UPDATE consultation_customer_contexts SET token_hash=?,csrf_hash=?,version=version+1,issued_at=${NOW},
     expires_at=MIN(${NOW}+${CONTEXT_MS},(SELECT ${expiry} FROM academy_portal_sessions p WHERE p.id=consultation_customer_contexts.portal_session_id)),revoked_at=NULL
     WHERE id=? AND version=? AND (revoked_at IS NOT NULL OR expires_at<=${NOW})
     AND EXISTS(SELECT 1 FROM academy_portal_sessions p JOIN customers c ON c.id=p.customer_id WHERE p.id=consultation_customer_contexts.portal_session_id AND p.customer_id=consultation_customer_contexts.customer_id AND ${live} AND ${expiry}>=${NOW}+${MIN_ISSUANCE_MS})`)
     .bind(creds.tokenDigest,creds.csrfDigest,id,current.version,parent.digest)
    :db.prepare(`INSERT INTO consultation_customer_contexts(id,portal_session_id,customer_id,token_hash,csrf_hash,version,created_at,issued_at,expires_at)
     SELECT ?,p.id,p.customer_id,?,?,1,${NOW},${NOW},MIN(${NOW}+${CONTEXT_MS},${expiry})
     FROM academy_portal_sessions p JOIN customers c ON c.id=p.customer_id WHERE ${live} AND ${expiry}>=${NOW}+${MIN_ISSUANCE_MS}
     AND NOT EXISTS(SELECT 1 FROM consultation_customer_contexts WHERE portal_session_id=p.id)`)
     .bind(id,creds.tokenDigest,creds.csrfDigest,parent.digest);
   await db.batch([mutation,evidence(id,current?current.version+1:1,'Established')]);
   return await success(creds,id,current?current.version+1:1,parent.digest);
  }catch(error){return failure(error);}
 }
 async function change(request,rotate) {
  try {
   const auth=await checked(request,{mutation:true});if(auth.error)return auth.error;
   const principal=auth.principal,creds=rotate?await credentials():null;
   const guard=`id=? AND version=? AND token_hash=? AND csrf_hash=? AND revoked_at IS NULL AND expires_at>${NOW}
    AND EXISTS(SELECT 1 FROM academy_portal_sessions p JOIN customers c ON c.id=p.customer_id WHERE p.id=consultation_customer_contexts.portal_session_id AND p.customer_id=consultation_customer_contexts.customer_id AND ${live}${rotate?` AND ${expiry}>=${NOW}+${MIN_ISSUANCE_MS}`:''})`;
   const mutation=rotate
    ?db.prepare(`UPDATE consultation_customer_contexts SET token_hash=?,csrf_hash=?,version=version+1,issued_at=${NOW},
     expires_at=MIN(${NOW}+${CONTEXT_MS},(SELECT ${expiry} FROM academy_portal_sessions p WHERE p.id=consultation_customer_contexts.portal_session_id)) WHERE ${guard}`)
     .bind(creds.tokenDigest,creds.csrfDigest,principal.contextId,principal.version,auth.digest,auth.csrfDigest,auth.parentDigest)
    :db.prepare(`UPDATE consultation_customer_contexts SET version=version+1,revoked_at=${NOW} WHERE ${guard}`)
     .bind(principal.contextId,principal.version,auth.digest,auth.csrfDigest,auth.parentDigest);
   await db.batch([mutation,evidence(principal.contextId,principal.version+1,rotate?'Rotated':'Revoked')]);
   return rotate?await success(creds,principal.contextId,principal.version+1,auth.parentDigest):response(200,{ok:true},{'set-cookie':clearContextCookie()});
  }catch(error){return failure(error);}
 }
 return Object.freeze({portalIdentity,authorize,establish,resume,rotate:request=>change(request,true),revoke:request=>change(request,false)});
}
