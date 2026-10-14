// Internal local-development service. No public endpoint or provider implementation.
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
import {identifier} from './foundation.js';
import {normalizeContact} from './contact-policy.js';
import {contactFingerprint} from './contact-crypto.js';
import {encryptIntake,decryptIntake} from './intake-crypto.js';
const fail=()=>{throw Error('Account step-up unavailable or rejected');};
const enc=new TextEncoder();
const statement=(db,sql,values=[])=>db.prepare(sql).bind(...values);
function otp(){const limit=Math.floor(4294967296/100000000)*100000000;let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);return String(n%100000000).padStart(8,'0');}
function message(row,code){return enc.encode(JSON.stringify(['qy-account-stepup-v1',row.id,row.customer_id,row.context_id,row.context_version,row.contact_id,code]));}
async function mac(provider,id,row,code){const key=await provider(id);if(key?.algorithm?.name!=='HMAC'||key.algorithm.hash?.name!=='SHA-256'||key.algorithm.length!==256||key.extractable!==false)fail();return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,message(row,code))),n=>n.toString(16).padStart(2,'0')).join('');}
function event(db,customerId,label,kind,actor){return statement(db,`INSERT INTO consultation_account_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,${DB_NOW})`,[crypto.randomUUID(),label,customerId,kind,actor]);}
export function createAccountStepup({db,origin,keys,mockDelivery,prepareMockDelivery=null}){
 if(typeof mockDelivery!=='function')fail();
 const guards=createWorkflowGuards({db,origin});
 async function options(request){
  try{const a=await guards.customer(request);const rows=await statement(db,`SELECT id,channel FROM consultation_account_contacts WHERE customer_id=? AND revoked_at IS NULL AND EXISTS(${a.sql}) ORDER BY CASE channel WHEN 'whatsapp' THEN 0 ELSE 1 END`,[a.principal.customerId,...a.values]).all();
   return Object.freeze({choices:rows.results.map(r=>Object.freeze({id:r.id,channel:r.channel})),manualReviewRequired:rows.results.length===0});
  }catch{fail();}
 }
 async function reviewContact(request,input){
  try{
   if(!input||Object.keys(input).some(k=>!['customerId','channel','contact','evidenceReference','independentlyVerified'].includes(k))||input.independentlyVerified!==true||!Number.isSafeInteger(input.customerId)||input.customerId<1)fail();
   identifier(input.evidenceReference);const contact=normalizeContact(input.channel,input.contact),a=await guards.qy(request,true),id=crypto.randomUUID();
   const e=await encryptIntake({channel:input.channel,contact},{id,customerId:input.customerId,payloadVersion:1,schemaVersion:1,keyId:keys.contact.activeKeyId},keys.contact.provider);
   const fingerprint=await contactFingerprint(keys.lookup.provider,keys.lookup.activeKeyId,input.channel,contact);
   await db.batch([statement(db,"INSERT INTO consultation_contact_nonces(key_id,nonce) VALUES(?,?)",[e.keyId,e.nonce]),statement(db,`INSERT INTO consultation_account_contacts(id,customer_id,channel,key_id,nonce,ciphertext,fingerprint_key_id,fingerprint,evidence_reference,reviewed_by,reviewed_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,${DB_NOW} WHERE EXISTS(${a.sql}) AND EXISTS(SELECT 1 FROM customers WHERE id=? AND status='Active')`,[id,input.customerId,input.channel,e.keyId,e.nonce,e.ciphertext,keys.lookup.activeKeyId,fingerprint,input.evidenceReference,a.principal.sessionId,...a.values,input.customerId]),
    event(db,input.customerId,'ContactReviewed','QY',a.principal.sessionId)]);
   return Object.freeze({id,channel:input.channel});
  }catch{fail();}
 }
 async function revokeContact(request,id){
  try{identifier(id);const a=await guards.qy(request,true);const row=await statement(db,'SELECT customer_id FROM consultation_account_contacts WHERE id=?',[id]).first();if(!row)fail();
   await db.batch([statement(db,`UPDATE consultation_account_contacts SET revoked_at=${DB_NOW} WHERE id=? AND revoked_at IS NULL AND EXISTS(${a.sql})`,[id,...a.values]),event(db,row.customer_id,'ContactRevoked','QY',a.principal.sessionId)]);
   return Object.freeze({revoked:true});
  }catch{fail();}
 }
 async function challenge(request,input){
  try{if(!input||Object.keys(input).some(k=>k!=='contactId'))fail();identifier(input.contactId);const a=await guards.customer(request,true);
   const contact=await statement(db,`SELECT * FROM consultation_account_contacts WHERE id=? AND customer_id=? AND revoked_at IS NULL AND EXISTS(${a.sql})`,[input.contactId,a.principal.customerId,...a.values]).first();if(!contact)fail();
   const plain=await decryptIntake({id:contact.id,customerId:contact.customer_id,payloadVersion:1,schemaVersion:1,keyId:contact.key_id,nonce:new Uint8Array(contact.nonce),ciphertext:new Uint8Array(contact.ciphertext)},keys.contact.provider);
   if(plain.channel!==contact.channel||await contactFingerprint(keys.lookup.provider,contact.fingerprint_key_id,plain.channel,plain.contact)!==contact.fingerprint)fail();
   const row={id:crypto.randomUUID(),customer_id:a.principal.customerId,context_id:a.principal.contextId,context_version:a.principal.version,contact_id:contact.id};const code=otp(),digest=await mac(keys.challenge.provider,keys.challenge.activeKeyId,row,code);
   const deliveryMessage=Object.freeze({purpose:'canonical_account_stepup',channel:plain.channel,recipient:plain.contact,code,challengeId:row.id});
   const deliveryPlan=prepareMockDelivery?await prepareMockDelivery(deliveryMessage,row):[];
   await db.batch([statement(db,`INSERT INTO consultation_account_challenges(id,customer_id,context_id,context_version,contact_id,digest_key_id,digest,created_at,expires_at)
    SELECT ?,?,?,?,?,?,?,${DB_NOW},MIN(${DB_NOW}+600000,x.expires_at) FROM consultation_customer_contexts x WHERE x.id=? AND x.expires_at>${DB_NOW}+5000
    AND EXISTS(${a.sql}) AND EXISTS(SELECT 1 FROM consultation_account_contacts WHERE id=? AND customer_id=? AND revoked_at IS NULL)
    AND (SELECT COUNT(*) FROM consultation_account_challenges WHERE customer_id=? AND created_at>${DB_NOW}-900000)<3`,[row.id,row.customer_id,row.context_id,row.context_version,row.contact_id,keys.challenge.activeKeyId,digest,row.context_id,...a.values,row.contact_id,row.customer_id,row.customer_id]),event(db,row.customer_id,'ChallengeIssued','Customer',row.context_id),...deliveryPlan]);
   // Test-only transport. Errors after commit never trigger an automatic resend/retry.
   try{await mockDelivery(Object.freeze({purpose:'canonical_account_stepup',channel:plain.channel,recipient:plain.contact,code,challengeId:row.id}));}
   catch{return Object.freeze({id:row.id,committed:true,delivery:'Unknown'});}
   return Object.freeze({id:row.id,committed:true,delivery:'Mocked'});
  }catch{fail();}
 }
 async function confirm(request,input){
  try{if(!input||Object.keys(input).some(k=>!['challengeId','code'].includes(k))||typeof input.code!=='string'||!/^\d{8}$/.test(input.code))fail();identifier(input.challengeId);const a=await guards.customer(request,true);
   const row=await statement(db,`SELECT h.* FROM consultation_account_challenges h JOIN consultation_account_contacts c ON c.id=h.contact_id WHERE h.id=? AND h.customer_id=? AND h.context_id=? AND h.context_version=? AND h.consumed_at IS NULL AND h.attempts<5 AND h.expires_at>${DB_NOW} AND c.revoked_at IS NULL AND EXISTS(${a.sql})`,[input.challengeId,a.principal.customerId,a.principal.contextId,a.principal.version,...a.values]).first();if(!row)fail();
   const key=await keys.challenge.provider(row.digest_key_id);
   const correct=await crypto.subtle.verify('HMAC',key,Uint8Array.from(row.digest.match(/../g),x=>parseInt(x,16)),message(row,input.code));
   const plan=[statement(db,`UPDATE consultation_account_challenges SET attempts=attempts+1,consumed_at=${correct?DB_NOW:'NULL'} WHERE id=? AND attempts=? AND consumed_at IS NULL AND attempts<5 AND expires_at>${DB_NOW}
    AND EXISTS(${a.sql}) AND EXISTS(SELECT 1 FROM consultation_account_contacts WHERE id=? AND revoked_at IS NULL)
    AND (SELECT COALESCE(SUM(attempts),0) FROM consultation_account_challenges WHERE customer_id=? AND created_at>${DB_NOW}-900000)<10`,[row.id,row.attempts,...a.values,row.contact_id,row.customer_id]),event(db,row.customer_id,correct?'StepupVerified':'ChallengeRejected','Customer',row.context_id)];
   if(correct)plan.push(statement(db,`INSERT INTO consultation_account_stepups SELECT ?,h.customer_id,h.context_id,h.context_version,h.contact_id,h.id,h.consumed_at,MIN(h.consumed_at+600000,x.expires_at) FROM consultation_account_challenges h JOIN consultation_customer_contexts x ON x.id=h.context_id WHERE h.id=?`,[crypto.randomUUID(),row.id]));
   await db.batch(plan);return Object.freeze({verified:correct});
  }catch{fail();}
 }
 async function progress(request,challengeId=null){
  if(challengeId!==null)identifier(challengeId);
  const a=await guards.customer(request);
  const row=await statement(db,`SELECT h.id,h.created_at,h.expires_at,h.attempts,h.consumed_at,c.revoked_at contact_revoked FROM consultation_account_challenges h JOIN consultation_account_contacts c ON c.id=h.contact_id WHERE h.customer_id=? AND c.customer_id=h.customer_id AND h.context_id=? AND h.context_version=? AND EXISTS(${a.sql}) ${challengeId===null?'':'AND h.id=?'} ORDER BY h.created_at DESC,h.id DESC LIMIT 1`,[a.principal.customerId,a.principal.contextId,a.principal.version,...a.values,...(challengeId===null?[]:[challengeId])]).first();
  const proof=await statement(db,`SELECT 1 FROM consultation_account_stepups s JOIN consultation_account_contacts c ON c.id=s.contact_id WHERE s.customer_id=? AND c.customer_id=s.customer_id AND s.context_id=? AND s.context_version=? AND s.expires_at>${DB_NOW} AND s.verified_at<=${DB_NOW} AND c.revoked_at IS NULL AND EXISTS(${a.sql})`,[a.principal.customerId,a.principal.contextId,a.principal.version,...a.values]).first();
  const challenge=row?{id:row.id,createdAt:row.created_at,expiresAt:row.expires_at,attempts:row.attempts,state:row.contact_revoked!==null?'Unavailable':row.consumed_at!==null?'Consumed':row.attempts>=5?'Locked':row.expires_at<=Date.now()?'Expired':'Pending'}:null;
  return {context:{id:a.principal.contextId,version:a.principal.version,customerId:a.principal.customerId,expiresAt:a.principal.expiresAt},verified:!!proof,challenge};
 }
 async function requireStepup(request,mutation=false){
  try{const a=await guards.customer(request,mutation);const sql=`${a.sql} AND EXISTS(SELECT 1 FROM consultation_account_stepups s JOIN consultation_account_contacts t ON t.id=s.contact_id WHERE s.customer_id=x.customer_id AND s.context_id=x.id AND s.context_version=x.version AND s.expires_at>${DB_NOW} AND s.verified_at<=${DB_NOW} AND t.customer_id=s.customer_id AND t.revoked_at IS NULL)`;
   if(!await statement(db,sql,a.values).first())fail();return {...a,sql};
  }catch{fail();}
 }
 return Object.freeze({options,reviewContact,revokeContact,challenge,confirm,progress,requireStepup});
}
