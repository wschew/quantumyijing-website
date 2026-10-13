// Internal consultation service only. No public routes or delivery-provider calls.
import {createCustomerIdentity} from './customer-identity.js';
import {createConsultationAuth} from './auth.js';
import {randomSecret,tokenHash} from './auth-crypto.js';
import {identifier} from './foundation.js';
import {PORTAL_COOKIE,CONTEXT_COOKIE,CSRF_HEADER,TOKEN,sessionCookie} from './customer-request-security.js';
import {CHANNELS,CHALLENGE_MS,WINDOW_MS,REQUEST_LIMIT,VERIFY_LIMIT,ATTEMPT_LIMIT,normalizeContact} from './contact-policy.js';
import {contactFingerprint,challengeDigest,verifyChallengeDigest,encryptContact,decryptContact} from './contact-crypto.js';
const NOW="(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const PEXP="(CAST(strftime('%s',p.expires_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.expires_at),4,3) AS INTEGER))";
const PCREATED="(CAST(strftime('%s',p.created_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.created_at),4,3) AS INTEGER))";
const ALIVE=`x.revoked_at IS NULL AND x.expires_at>${NOW} AND x.issued_at<=${NOW} AND x.customer_id=p.customer_id
 AND COALESCE(p.revoked_at,'')='' AND ${PEXP}>${NOW} AND ${PCREATED}<=${NOW} AND c.status='Active'`;
const CUSTOMER=`SELECT 1 FROM consultation_customer_contexts x JOIN academy_portal_sessions p ON p.id=x.portal_session_id JOIN customers c ON c.id=p.customer_id
 WHERE x.id=? AND x.version=? AND x.customer_id=? AND x.token_hash=? AND p.token_hash=? AND ${ALIVE}`;
const QY=`SELECT 1 FROM consultation_auth_sessions qs JOIN consultation_auth_account qa ON qa.id=qs.account_id
 WHERE qs.id=? AND qs.token_hash=? AND qs.revoked_at IS NULL AND qs.created_at<=${NOW} AND qs.expires_at>${NOW}
 AND qa.id=1 AND qa.enabled=1 AND qs.password_version=qa.password_version`;
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const denied=()=>reply(401,{ok:false,error:'Contact authorization denied.'});
const unavailable=()=>reply(503,{ok:false,error:'Contact operation unavailable.'});
const conflict=()=>reply(409,{ok:false,error:'Contact operation expired, conflicted or limited.'});
function envelope(row,kind){return {id:row.id,customerId:row.customer_id,contextId:row.context_id,contextVersion:row.context_version,channel:row.channel,kind,keyId:row.key_id,
 fingerprintKeyId:row.fingerprint_key_id,fingerprint:row.fingerprint,challengeKeyId:row.challenge_key_id,challengeHash:row.challenge_hash,challengeId:kind==='Challenge'?row.id:row.challenge_id,
 nonce:new Uint8Array(row.nonce),ciphertext:new Uint8Array(row.ciphertext)};}
function statement(db,sql,values=[]){return db.prepare(sql).bind(...values);}
function event(db,a,label,challengeId=null,{gate=false,qy=false}={}){
 return statement(db,`INSERT INTO consultation_contact_events(id,customer_id,context_id,challenge_id,event,actor_kind,actor_reference,occurred_at)
 VALUES(${gate?'CASE WHEN changes()=1 THEN ? ELSE NULL END':'?'},?,?,?,?,?,?,${NOW})`,
 [crypto.randomUUID(),a.principal.customerId,a.principal.contextId,challengeId,label,qy?'QY':'Customer',qy?'qy-session-'+a.sessionId:'customer-context-'+a.principal.contextId]);
}
function nonce(db,e){return statement(db,'INSERT INTO consultation_contact_nonces(key_id,nonce) VALUES(?,?)',[e.keyId,e.nonce]);}
export function createCustomerContact({db,origin,keyProvider,fingerprintKeyProvider,challengeKeyProvider,activeKeyId,activeFingerprintKeyId,activeChallengeKeyId}){
 const identity=createCustomerIdentity({db,origin}),qyAuth=createConsultationAuth({db,origin});
 for(const id of [activeKeyId,activeFingerprintKeyId,activeChallengeKeyId])identifier(id);
 async function customer(request,mutation){
  const auth=await identity.authorize(request,{stateChanging:mutation});
  if(auth.error)return null;
  const ctx=sessionCookie(request,CONTEXT_COOKIE),parent=sessionCookie(request,PORTAL_COOKIE);
  if(!ctx||!parent)return null;
  const a={principal:auth.principal,values:[auth.principal.contextId,auth.principal.version,auth.principal.customerId,await tokenHash(ctx),await tokenHash(parent)]};
  if(mutation)a.values.push(await tokenHash(request.headers.get(CSRF_HEADER)));
  a.guard=CUSTOMER+(mutation?' AND x.csrf_hash=?':'');
  return a;
 }
 async function qy(request,mutation){
  const auth=await qyAuth.requirePrivateAccess(request,{stateChanging:mutation});
  const token=sessionCookie(request,'__Host-QY_CONSULTATION');
  if(auth.error||!token)return null;
  const a={sessionId:auth.principal.sessionId,values:[auth.principal.sessionId,await tokenHash(token)]};
  if(mutation){const csrf=request.headers.get('x-qy-consultation-csrf');if(!TOKEN.test(csrf||''))return null;a.values.push(await tokenHash(csrf));}
  a.guard=QY+(mutation?' AND qs.csrf_hash=?':'');return a;
 }
 function reservation(a,verify=false){
  const window=verify?'verify_window':'request_window',count=verify?'attempts':'requests',limit=verify?VERIFY_LIMIT:REQUEST_LIMIT;
  return statement(db,`UPDATE consultation_contact_control SET ${window}=CASE WHEN ${window}+${WINDOW_MS}<=${NOW} THEN ${NOW} ELSE ${window} END,
   ${count}=CASE WHEN ${window}+${WINDOW_MS}<=${NOW} THEN 1 ELSE ${count}+1 END
   WHERE customer_id=? AND (${window}+${WINDOW_MS}<=${NOW} OR ${count}<${limit}) AND EXISTS(${a.guard})`,[a.principal.customerId,...a.values]);
 }
 async function requestChallenge(request,input){
  try{
   if(!input||Object.keys(input).some(k=>!['channel','contact'].includes(k)))return reply(400,{ok:false,error:'Contact input rejected.'});
   const contact=normalizeContact(input.channel,input.contact),a=await customer(request,true);if(!a)return denied();
   const id=crypto.randomUUID(),code=randomSecret();
   const c={id,customerId:a.principal.customerId,contextId:a.principal.contextId,contextVersion:a.principal.version,channel:input.channel,kind:'Challenge',keyId:activeKeyId,
    fingerprintKeyId:activeFingerprintKeyId,fingerprint:await contactFingerprint(fingerprintKeyProvider,activeFingerprintKeyId,input.channel,contact),challengeKeyId:activeChallengeKeyId,challengeHash:'0'.repeat(64),challengeId:id};
   c.challengeHash=await challengeDigest(challengeKeyProvider,activeChallengeKeyId,c,code);
   const e=await encryptContact({contact,code},c,keyProvider);
   const plan=[
    statement(db,`INSERT INTO consultation_contact_control(customer_id,request_window,requests,verify_window,attempts)
     SELECT ?,${NOW},0,${NOW},0 WHERE EXISTS(${a.guard}) ON CONFLICT(customer_id) DO NOTHING`,[c.customerId,...a.values]),
    reservation(a),event(db,a,'RequestReserved',null,{gate:true}),
    statement(db,"UPDATE consultation_contact_challenges SET state='Cancelled',superseded_by=?,revision=revision+1 WHERE customer_id=? AND channel=? AND state IN ('PendingDelivery','Delivered')",[id,c.customerId,c.channel]),
    statement(db,`UPDATE consultation_verified_contacts SET revoked_at=${NOW} WHERE customer_id=? AND channel=? AND revoked_at IS NULL`,[c.customerId,c.channel]),
    nonce(db,e),
    statement(db,`INSERT INTO consultation_contact_challenges(id,customer_id,context_id,context_version,channel,key_id,fingerprint_key_id,fingerprint,challenge_key_id,challenge_hash,nonce,ciphertext,state,requested_at,expires_at)
     SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'PendingDelivery',${NOW},MIN(${NOW}+${CHALLENGE_MS},x.expires_at,${PEXP})
     FROM consultation_customer_contexts x JOIN academy_portal_sessions p ON p.id=x.portal_session_id WHERE x.id=? AND MIN(x.expires_at,${PEXP})>=${NOW}+5000`,
     [id,c.customerId,c.contextId,c.contextVersion,c.channel,c.keyId,c.fingerprintKeyId,c.fingerprint,c.challengeKeyId,c.challengeHash,e.nonce,e.ciphertext,c.contextId]),
    event(db,a,'Requested',id,{gate:true}),
    statement(db,`INSERT INTO consultation_contact_events(id,customer_id,context_id,challenge_id,event,actor_kind,actor_reference,occurred_at)
     SELECT lower(hex(randomblob(16))),customer_id,?,id,'Superseded','Customer',?,${NOW} FROM consultation_contact_challenges WHERE superseded_by=?`,[c.contextId,'customer-context-'+c.contextId,id])
   ];
   await db.batch(plan);
   const row=await statement(db,'SELECT expires_at FROM consultation_contact_challenges WHERE id=?',[id]).first();
   return reply(200,{ok:true,challengeId:id,channel:c.channel,expiresAt:row.expires_at,delivery:'manual'});
  }catch(error){return classify(error);}
 }
 async function instructions(request,{challengeId}){
  try{
   identifier(challengeId);const operator=await qy(request,false);if(!operator)return denied();
   const condition=`h.id=? AND h.state='PendingDelivery' AND h.expires_at>${NOW} AND h.context_version=x.version AND ${ALIVE} AND EXISTS(${operator.guard})`;
   const join='FROM consultation_contact_challenges h JOIN consultation_customer_contexts x ON x.id=h.context_id JOIN academy_portal_sessions p ON p.id=x.portal_session_id JOIN customers c ON c.id=p.customer_id';
   const values=[challengeId,...operator.values],actor='qy-session-'+operator.sessionId;
   const results=await db.batch([
    statement(db,`SELECT h.* ${join} WHERE ${condition}`,values),
    statement(db,`INSERT INTO consultation_contact_events(id,customer_id,context_id,challenge_id,event,actor_kind,actor_reference,occurred_at)
     SELECT ?,h.customer_id,h.context_id,h.id,'InstructionsViewed','QY',?,${NOW} ${join} WHERE ${condition}
     AND NOT EXISTS(SELECT 1 FROM consultation_contact_events WHERE challenge_id=h.id AND event='InstructionsViewed' AND actor_reference=?)`,[crypto.randomUUID(),actor,...values,actor])
   ]);
   const row=results[0]?.results?.[0];if(!row)return conflict();
   const data=await decryptContact(envelope(row,'Challenge'),keyProvider);
   if(!await verifyChallengeDigest(challengeKeyProvider,envelope(row,'Challenge'),data.code)||await contactFingerprint(fingerprintKeyProvider,row.fingerprint_key_id,row.channel,data.contact)!==row.fingerprint)throw Error('Contact cryptography rejected');
   return reply(200,{ok:true,challengeId,channel:row.channel,recipient:data.contact,code:data.code,revision:row.revision,expiresAt:row.expires_at});
  }catch(error){return classify(error);}
 }
 async function markDelivered(request,{challengeId,expectedRevision}){
  try{
   identifier(challengeId);if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)return conflict();
   const operator=await qy(request,true);if(!operator)return denied();
   const row=await statement(db,'SELECT customer_id,context_id FROM consultation_contact_challenges WHERE id=?',[challengeId]).first();if(!row)return conflict();
   const a={...operator,principal:{customerId:row.customer_id,contextId:row.context_id}};
   await db.batch([
    statement(db,`UPDATE consultation_contact_challenges SET state='Delivered',delivered_at=${NOW},revision=revision+1
     WHERE id=? AND revision=? AND state='PendingDelivery' AND expires_at>${NOW} AND EXISTS(${operator.guard})
     AND EXISTS(SELECT 1 FROM consultation_customer_contexts x JOIN academy_portal_sessions p ON p.id=x.portal_session_id JOIN customers c ON c.id=p.customer_id
      WHERE x.id=consultation_contact_challenges.context_id AND x.version=consultation_contact_challenges.context_version AND ${ALIVE})`,[challengeId,expectedRevision,...operator.values]),
    event(db,a,'Delivered',challengeId,{gate:true,qy:true})
   ]);return reply(200,{ok:true});
  }catch(error){return classify(error);}
 }
 async function confirm(request,{challengeId,code}){
  try{
   identifier(challengeId);if(!TOKEN.test(code||''))return reply(400,{ok:false,error:'Contact response rejected.'});
   const a=await customer(request,true);if(!a)return denied();
   const row=await statement(db,`SELECT * FROM consultation_contact_challenges WHERE id=? AND customer_id=? AND context_id=? AND context_version=?
    AND state='Delivered' AND expires_at>${NOW} AND attempts<${ATTEMPT_LIMIT}`,[challengeId,a.principal.customerId,a.principal.contextId,a.principal.version]).first();
   if(!row)return conflict();
   const e=envelope(row,'Challenge'),valid=await verifyChallengeDigest(challengeKeyProvider,e,code);
   let proof=null;
   if(valid){const data=await decryptContact(e,keyProvider);if(await contactFingerprint(fingerprintKeyProvider,e.fingerprintKeyId,e.channel,data.contact)!==e.fingerprint)throw Error('Contact cryptography rejected');
    const {nonce:unusedNonce,ciphertext:unusedCiphertext,...meta}=e;
    proof=await encryptContact({contact:data.contact},{...meta,id:crypto.randomUUID(),kind:'Proof',keyId:activeKeyId},keyProvider);}
   const plan=[reservation(a,true),event(db,a,'VerificationReserved',null,{gate:true}),
    statement(db,`UPDATE consultation_contact_challenges SET attempts=attempts+1,revision=revision+1,
     state=CASE WHEN ?=1 THEN 'Verified' WHEN attempts+1>=${ATTEMPT_LIMIT} THEN 'Locked' ELSE 'Delivered' END,verified_at=CASE WHEN ?=1 THEN ${NOW} ELSE NULL END
     WHERE id=? AND revision=? AND state='Delivered' AND expires_at>${NOW} AND attempts<${ATTEMPT_LIMIT} AND EXISTS(${a.guard})`,[valid?1:0,valid?1:0,challengeId,row.revision,...a.values]),
    event(db,a,valid?'Verified':'Failed',challengeId,{gate:true})];
   if(valid)plan.push(nonce(db,proof),statement(db,`INSERT INTO consultation_verified_contacts(id,challenge_id,customer_id,context_id,context_version,channel,key_id,fingerprint_key_id,fingerprint,challenge_key_id,challenge_hash,nonce,ciphertext,verified_at,expires_at)
    SELECT ?,h.id,h.customer_id,h.context_id,h.context_version,h.channel,?,?,?,?,?,?,?,h.verified_at,MIN(x.expires_at,${PEXP})
    FROM consultation_contact_challenges h JOIN consultation_customer_contexts x ON x.id=h.context_id JOIN academy_portal_sessions p ON p.id=x.portal_session_id WHERE h.id=? AND h.state='Verified'`,
    [proof.id,proof.keyId,proof.fingerprintKeyId,proof.fingerprint,proof.challengeKeyId,proof.challengeHash,proof.nonce,proof.ciphertext,challengeId]));
   await db.batch(plan);
   return valid?reply(200,{ok:true,verified:true,verificationId:proof.id,channel:row.channel}):reply(400,{ok:false,error:'Contact response rejected.'});
  }catch(error){return classify(error);}
 }
 async function verifiedContact(request,channel){
  try{
   if(!CHANNELS.includes(channel))return null;const a=await customer(request,false);if(!a)return null;
   const row=await statement(db,`SELECT v.*,MIN(v.expires_at,${PEXP}) AS effective_expiry FROM consultation_verified_contacts v
    JOIN consultation_contact_challenges h ON h.id=v.challenge_id JOIN consultation_customer_contexts x ON x.id=v.context_id
    JOIN academy_portal_sessions p ON p.id=x.portal_session_id
    WHERE v.customer_id=? AND v.channel=? AND v.context_id=? AND v.context_version=? AND v.revoked_at IS NULL AND v.expires_at>${NOW}
    AND h.state='Verified' AND EXISTS(${a.guard})`,[a.principal.customerId,channel,a.principal.contextId,a.principal.version,...a.values]).first();
   if(!row)return null;const data=await decryptContact(envelope(row,'Proof'),keyProvider);
   if(await contactFingerprint(fingerprintKeyProvider,row.fingerprint_key_id,channel,data.contact)!==row.fingerprint)return null;
   return Object.freeze({verified:true,customerId:row.customer_id,channel,reference:row.id,value:data.contact,verifiedAt:row.verified_at,expiresAt:row.effective_expiry,purpose:'report_delivery'});
  }catch{return null;}
 }
 function classify(error){if(error?.message==='Contact input rejected')return reply(400,{ok:false,error:'Contact input rejected.'});return typeof error?.message==='string'&&error.message.includes('contact authorization or quota failed')?conflict():unavailable();}
 return Object.freeze({requestChallenge,instructions,markDelivered,confirm,verifiedContact});
}
