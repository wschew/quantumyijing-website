// Isolated, deny-by-default consultation auth service. No public route is wired.
// db must be a server-owned D1-compatible binding; origin must come from trusted configuration.
// This module never reads ADMIN_TOKEN, coach/affiliate credentials or portal sessions.
import {randomSecret,tokenHash,equalHash,passwordHash,validPassword} from './auth-crypto.js';
import {instant} from './foundation.js';
export const COOKIE_NAME='__Host-QY_CONSULTATION';
export const SESSION_MS=8*60*60*1000;
// Evaluated by SQLite inside each atomic mutation, not an earlier Worker timestamp.
const DATABASE_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const authorizationFailure=error=>typeof error?.message==='string'&&error.message.includes('consultation authorization failed');
const TOKEN_PATTERN=/^[a-f0-9]{64}$/;
const response=(status,body,headers={})=>Response.json(body,{status,headers:{
 'cache-control':'no-store','x-content-type-options':'nosniff',...headers
}});
const denied=()=>response(401,{ok:false,error:'Authentication failed.'});
const unavailable=()=>response(503,{ok:false,error:'Authentication unavailable.'});
const cookie=(value,age)=>`${COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
function sessionToken(request) {
 const matches=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE_NAME+'='));
 if(matches.length!==1) return null;
 const value=matches[0].slice(COOKIE_NAME.length+1);
 return TOKEN_PATTERN.test(value)?value:null;
}
function sameOrigin(request,origin) {
 const url=new URL(request.url);
 const site=request.headers.get('sec-fetch-site');
 return url.origin===origin && request.headers.get('origin')===origin && (!site||site==='same-origin');
}
function mutationRequest(request,origin) {
 return request.method==='POST' && sameOrigin(request,origin) &&
  (request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()==='application/json';
}
export function createConsultationAuth({db,origin,clock=()=>Date.now()}) {
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password) throw Error('Trusted HTTPS origin required');
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function') throw Error('Dedicated authentication binding required');
 const now=()=>instant(clock());
 async function verified(request) {
  if(new URL(request.url).origin!==origin) return null;
  const token=sessionToken(request);
  if(!token) return null;
  const hashed=await tokenHash(token);
  return db.prepare(`SELECT s.id,s.account_id,s.csrf_hash,s.expires_at
   FROM consultation_auth_sessions s JOIN consultation_auth_account a ON a.id=s.account_id
   WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>${DATABASE_NOW} AND s.created_at<=${DATABASE_NOW}
   AND a.enabled=1 AND s.password_version=a.password_version AND a.id=1`)
   .bind(hashed).first();
 }
 async function authorize(request,{stateChanging=false}={}) {
  if(typeof stateChanging!=='boolean') return {error:response(400,{ok:false,error:'Invalid operation.'})};
  try {
   const session=await verified(request);
   if(!session) return {error:denied()};
   if(stateChanging) {
    const csrf=request.headers.get('x-qy-consultation-csrf');
    if(!mutationRequest(request,origin)||!csrf||!TOKEN_PATTERN.test(csrf)||!equalHash(await tokenHash(csrf),session.csrf_hash)) {
     return {error:response(403,{ok:false,error:'Request rejected.'})};
    }
   } else if(!['GET','HEAD'].includes(request.method)) {
    return {error:response(405,{ok:false,error:'Method not allowed.'})};
   }
   // No password, token hash, CSRF hash, personal data or roles supplied by clients.
   return {principal:Object.freeze({accountId:1,sessionId:session.id,scope:'qy-consultation'})};
  } catch { return {error:unavailable()}; }
 }
 async function login(request,{username,password}) {
  if(!mutationRequest(request,origin)) return response(403,{ok:false,error:'Request rejected.'});
  try {
   const time=now();
   // Atomic reservation bounds concurrent guessing. Unknown usernames share this bucket.
   const reserved=await db.prepare(`UPDATE consultation_auth_control SET
    attempts=CASE WHEN ${DATABASE_NOW}>=window_started_at+900000 THEN 1 ELSE attempts+1 END,
    window_started_at=CASE WHEN ${DATABASE_NOW}>=window_started_at+900000 THEN ${DATABASE_NOW} ELSE window_started_at END,
    locked_until=CASE WHEN (CASE WHEN ${DATABASE_NOW}>=window_started_at+900000 THEN 1 ELSE attempts+1 END)>=5 THEN ${DATABASE_NOW}+900000 ELSE locked_until END
    WHERE id=1 AND locked_until<=${DATABASE_NOW} RETURNING attempts`)
    .first();
   if(!reserved) {
    return denied();
   }
   const account=await db.prepare('SELECT * FROM consultation_auth_account WHERE id=1 AND enabled=1').first();
   // Same expensive hash for wrong usernames; no default credential or account creation.
   const salt=account?.password_salt||'0'.repeat(64);
   const calculated=validPassword(password)?await passwordHash(password,salt):null;
   const usernameValid=typeof username==='string'&&username===account?.username;
   if(!account||!usernameValid||!equalHash(calculated,account.password_hash)) {
    // One fixed summary row; blocked requests do not write failure/audit rows.
    await db.prepare(`UPDATE consultation_auth_control SET failure_count=min(failure_count+1,1000000000),last_failed_at=${DATABASE_NOW} WHERE id=1`).run();
    return denied();
   }
   const token=randomSecret(),csrf=randomSecret(),sessionId=crypto.randomUUID();
   const tokenDigest=await tokenHash(token),csrfDigest=await tokenHash(csrf);
   // Credential/enabled-state drift must abort session creation and audit atomically.
   await db.batch([
    db.prepare(`INSERT INTO consultation_auth_sessions(id,account_id,token_hash,csrf_hash,password_version,created_at,expires_at)
     SELECT ?,id,?,?,password_version,?,? FROM consultation_auth_account
     WHERE id=1 AND enabled=1 AND password_version=? AND password_hash=?`)
     .bind(sessionId,tokenDigest,csrfDigest,time,time+SESSION_MS,account.password_version,account.password_hash),
    db.prepare(`INSERT INTO consultation_auth_audit(id,account_id,session_id,event,occurred_at)
     VALUES(?,1,(SELECT id FROM consultation_auth_sessions WHERE id=?),'login_success',?)`)
     .bind(crypto.randomUUID(),sessionId,time),
    db.prepare('UPDATE consultation_auth_control SET attempts=0,window_started_at=?,locked_until=0 WHERE id=1').bind(time)
   ]);
   return response(200,{ok:true,csrfToken:csrf,expiresAt:time+SESSION_MS},{'set-cookie':cookie(token,SESSION_MS/1000)});
  } catch(error) { return authorizationFailure(error)?denied():unavailable(); }
 }
 async function revoke(request,all) {
  const auth=await authorize(request,{stateChanging:true});
  if(auth.error) return auth.error;
  try {
   const tokenDigest=await tokenHash(sessionToken(request));
   const csrfDigest=await tokenHash(request.headers.get('x-qy-consultation-csrf'));
   const sessionId=auth.principal.sessionId;
   const event=all?'revoke_all':'logout';
   const live=`SELECT 1 FROM consultation_auth_sessions s JOIN consultation_auth_account a ON a.id=s.account_id
    WHERE s.id=? AND s.token_hash=? AND s.csrf_hash=? AND s.revoked_at IS NULL
    AND s.created_at<=${DATABASE_NOW} AND s.expires_at>${DATABASE_NOW}
    AND a.id=1 AND a.enabled=1 AND s.password_version=a.password_version`;
   const mutation=all
    ? db.prepare(`UPDATE consultation_auth_account SET password_version=password_version+1 WHERE id=1 AND enabled=1 AND EXISTS(${live})`)
      .bind(sessionId,tokenDigest,csrfDigest)
    : db.prepare(`UPDATE consultation_auth_sessions SET revoked_at=${DATABASE_NOW} WHERE id=? AND revoked_at IS NULL AND EXISTS(${live})`)
      .bind(sessionId,sessionId,tokenDigest,csrfDigest);
   const unit=[mutation,
    // changes() observes the immediately preceding guarded update in this batch.
    // Zero authorization rows => NULL session => trigger abort => whole batch rollback.
    db.prepare(`INSERT INTO consultation_auth_audit(id,account_id,session_id,event,occurred_at)
     VALUES(?,1,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,${DATABASE_NOW})`)
     .bind(crypto.randomUUID(),sessionId,event)
   ];
   if(all) unit.push(db.prepare(`UPDATE consultation_auth_sessions SET revoked_at=${DATABASE_NOW} WHERE account_id=1 AND revoked_at IS NULL`));
   await db.batch(unit);
   return response(200,{ok:true},{'set-cookie':cookie('',0)});
  } catch(error) { return authorizationFailure(error)?denied():unavailable(); }
 }
 const logout=request=>revoke(request,false);
 const revokeAll=request=>revoke(request,true);
 // Future private operations MUST call this guard for every request. Do not accept
 // a previously returned principal, client actor ID/role, or a shared admin credential.
 return Object.freeze({login,logout,revokeAll,requirePrivateAccess:authorize});
}