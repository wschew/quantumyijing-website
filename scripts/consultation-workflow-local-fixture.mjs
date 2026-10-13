// Explicit synthetic-only factory. Cannot accept a database binding or real provider.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {newPasswordRecord,randomSecret,tokenHash} from '../functions/lib/consultation/auth-crypto.js';
import {createWorkflowKeys} from '../functions/lib/consultation/workflow-runtime.js';
import {createCustomerIdentity} from '../functions/lib/consultation/customer-identity.js';
import {createConsultationAuth} from '../functions/lib/consultation/auth.js';
import {createCustomerContact} from '../functions/lib/consultation/customer-contact.js';
import {createAccountStepup} from '../functions/lib/consultation/account-stepup.js';
import {createConsultationWorkflow} from '../functions/lib/consultation/workflow.js';
import {createCaptureReview} from '../functions/lib/consultation/capture-review.js';
import {createWorkflowLifecycle} from '../functions/lib/consultation/workflow-lifecycle.js';
import {createWorkflowHandler,readWorkflowBody} from '../functions/lib/consultation/workflow-handler.js';
import {createWorkflowGuards,DB_NOW} from '../functions/lib/consultation/workflow-guards.js';
import {requestAllowed} from '../functions/lib/consultation/customer-request-security.js';
export const LOCAL_MIGRATIONS=Object.freeze([
 'migrate-v4.0-phase-f1f2-academy-portal.sql','migrate-c1-consultation-auth.sql',
 'migrate-c1-consultation-customer-identity.sql','migrate-c1-bazi-consultation-foundation.sql',
 'migrate-c1-consultation-customer-intake.sql','migrate-c1-consultation-contact-verification.sql',
 'migrate-c1-consultation-account-stepup.sql','migrate-c1-consultation-workflow.sql',
 'migrate-c1-consultation-workflow-lifecycle.sql','migrate-c1-consultation-capture-review.sql','migrate-c1-consultation-workflow-evidence-guards.sql'
]);
function binding(raw){
 return {prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){if(/^\s*SELECT/i.test(sql))return {results:raw.prepare(sql).all(...values)};return {meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};},async batch(plan){raw.exec('BEGIN');try{const result=[];for(const p of plan)result.push(await p.run());raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
const reply=(status,data,headers={})=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
export async function createSyntheticWorkflow({origin,password,syntheticOnly}){
 const url=new URL(origin);
 if(syntheticOnly!==true||url.protocol!=='https:'||url.origin!==origin||!['localhost','127.0.0.1'].includes(url.hostname)||url.username||url.password)throw Error('Explicit HTTPS loopback synthetic mode required');
 const credential=await newPasswordRecord(password),raw=new DatabaseSync(':memory:');
 try{
  raw.exec("PRAGMA foreign_keys=ON; CREATE TABLE customers(id INTEGER PRIMARY KEY,status TEXT NOT NULL,email TEXT,phone TEXT); CREATE TABLE products(id INTEGER PRIMARY KEY); CREATE TABLE enquiries(id INTEGER PRIMARY KEY); CREATE TABLE coaches(id INTEGER PRIMARY KEY); CREATE TABLE orders(id INTEGER PRIMARY KEY,enquiry_id INTEGER REFERENCES enquiries(id),order_reference TEXT,currency TEXT,total REAL,payment_status TEXT); CREATE TABLE order_items(id INTEGER PRIMARY KEY,order_id INTEGER REFERENCES orders(id),product_id INTEGER REFERENCES products(id),quantity INTEGER,unit_price REAL,line_total REAL); CREATE TABLE payments(id INTEGER PRIMARY KEY,order_id INTEGER REFERENCES orders(id),amount REAL,currency TEXT,status TEXT,verification_status TEXT,accounting_eligible INTEGER); CREATE TABLE customer_enquiry_links(id INTEGER PRIMARY KEY,customer_id INTEGER REFERENCES customers(id),enquiry_id INTEGER UNIQUE REFERENCES enquiries(id)); INSERT INTO customers VALUES(1,'Active','synthetic@example.invalid',''),(2,'Active','other@example.invalid',''); INSERT INTO products VALUES(1); INSERT INTO coaches VALUES(1);");
  for(const file of LOCAL_MIGRATIONS)raw.exec(readFileSync(new URL('../database/'+file,import.meta.url),'utf8').replace(/^\uFEFF/,''));
  raw.prepare("INSERT INTO consultation_auth_account VALUES(1,'qy-local-test',1,'PBKDF2-SHA256',600000,?,?,1,?)").run(credential.salt,credential.hash,Date.now());
  raw.exec(`CREATE TABLE synthetic_local_actions(id TEXT NOT NULL PRIMARY KEY,actor_reference TEXT NOT NULL,action TEXT NOT NULL,occurred_at INTEGER NOT NULL);
   CREATE TABLE synthetic_capture_evidence(id TEXT NOT NULL PRIMARY KEY,booking_id TEXT NOT NULL UNIQUE REFERENCES consultation_bookings(id),offer_id TEXT NOT NULL UNIQUE REFERENCES consultation_offers(id),customer_id INTEGER NOT NULL REFERENCES customers(id),order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),amount_sen INTEGER NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Verified','Unknown','Revoked')),captured_at INTEGER);`);
  const db=binding(raw),keys=await createWorkflowKeys(JSON.stringify(Object.fromEntries(['intake','contact','lookup','challenge'].map(p=>[p,{active:p+'-local-v1',keys:{[p+'-local-v1']:randomSecret()}}]))));
  const identity=createCustomerIdentity({db,origin}),qyAuth=createConsultationAuth({db,origin}),guards=createWorkflowGuards({db,origin});
  const mockOutbox=new Map();
  const stepup=createAccountStepup({db,origin,keys,mockDelivery:async message=>{mockOutbox.set(message.challengeId,{...message});}});
  const contacts=createCustomerContact({db,origin,keyProvider:keys.contact.provider,fingerprintKeyProvider:keys.lookup.provider,challengeKeyProvider:keys.challenge.provider,activeKeyId:keys.contact.activeKeyId,activeFingerprintKeyId:keys.lookup.activeKeyId,activeChallengeKeyId:keys.challenge.activeKeyId});
  const policies=Object.fromEntries(['consultation_privacy','future_calculations','marketing'].map(p=>[p,{version:'synthetic-local-v1',hash:'a'.repeat(64)}]));
  async function readCaptureEvidence({bookingId,offerId,orderId,customerId}){
   const row=await db.prepare('SELECT * FROM synthetic_capture_evidence WHERE booking_id=? AND offer_id=? AND order_id=? AND customer_id=?').bind(bookingId,offerId,orderId,customerId).first();
   if(!row||row.status!=='Verified'||!Number.isSafeInteger(row.captured_at))return null;
   return {source:'ProviderVerified',providerTimestampVerified:true,customerId,authoritative:true,verificationStatus:'Verified',bookingId,offerId,orderId,amountSen:row.amount_sen,currency:row.currency,capturedAt:row.captured_at,
    guardSql:`SELECT 1 FROM synthetic_capture_evidence e JOIN consultation_offers o ON o.id=e.offer_id JOIN consultation_bookings b ON b.id=e.booking_id WHERE e.id=? AND e.status='Verified' AND e.booking_id=? AND e.offer_id=? AND e.order_id=? AND e.customer_id=? AND e.amount_sen=? AND e.currency=? AND e.captured_at=? AND o.order_id=e.order_id AND b.customer_id=e.customer_id`,
    guardValues:[row.id,bookingId,offerId,orderId,customerId,row.amount_sen,row.currency,row.captured_at]};
  }
  const captures=createCaptureReview({db,origin,keys,readProviderCaptureEvidence:readCaptureEvidence});
  const workflow=createConsultationWorkflow({db,origin,keys,stepup,contacts,productId:1,practitionerId:1,policies,countryCodes:['MY','SG','CN','TW','HK','AU','GB','US'],bookingPolicy:{version:'synthetic-local-v1',hash:'b'.repeat(64)},readCaptureEvidence:captures.readEvidence});
  const lifecycle=createWorkflowLifecycle({db,origin,keys,stepup});
  const baseHandler=createWorkflowHandler({origin,workflow,stepup,contacts,identity,qyAuth,policies,lifecycle,captures,captureAdapterConfigured:true});
  async function mockCapture(request,input){
   if(!input||Object.keys(input).some(k=>!['id','expectedVersion','mode'].includes(k))||!['timely','late','unknown'].includes(input.mode))throw Error('Synthetic capture rejected');
   const auth=await guards.qy(request,true);
   const row=await db.prepare(`SELECT b.id,b.customer_id,b.row_version,b.state,o.id offer_id,o.order_id,o.selling_price_sen,o.currency,o.accepted_at,o.expires_at,${DB_NOW} now FROM consultation_bookings b JOIN consultation_offers o ON o.id=b.current_offer_id WHERE b.id=?`).bind(input.id).first();
   if(!row||!['PaymentPending','ExceptionReview'].includes(row.state)||row.row_version!==input.expectedVersion||row.order_id!==null)throw Error('Synthetic capture conflict');
   const orderId=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM orders').first()).n;
   const stamp=input.mode==='unknown'?null:input.mode==='late'?row.expires_at+1:row.now;
   const audit=()=>db.prepare(`INSERT INTO synthetic_local_actions SELECT CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'MockCapture',${DB_NOW}`).bind(crypto.randomUUID(),auth.principal.sessionId);
   await db.batch([db.prepare(`UPDATE consultation_bookings SET row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND row_version=? AND state=? AND EXISTS(${auth.sql})`).bind(row.id,row.row_version,row.state,...auth.values),audit(),
    db.prepare('INSERT INTO enquiries(id) VALUES(?)').bind(orderId),db.prepare('INSERT INTO customer_enquiry_links(customer_id,enquiry_id) VALUES(?,?)').bind(row.customer_id,orderId),db.prepare("INSERT INTO orders VALUES(?,?,?,'MYR',?,'Paid')").bind(orderId,orderId,'SYNTHETIC-'+orderId,row.selling_price_sen/100),db.prepare('INSERT INTO order_items(order_id,product_id,quantity,unit_price,line_total) VALUES(?,1,1,?,?)').bind(orderId,row.selling_price_sen/100,row.selling_price_sen/100),db.prepare("INSERT INTO payments VALUES(?,?,?,'MYR','Paid','Verified',1)").bind(orderId,orderId,row.selling_price_sen/100),db.prepare("UPDATE consultation_offers SET order_id=? WHERE id=? AND order_id IS NULL AND state='Accepted'").bind(orderId,row.offer_id),audit(),
    db.prepare('INSERT INTO synthetic_capture_evidence VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),row.id,row.offer_id,row.customer_id,orderId,row.selling_price_sen,row.currency,input.mode==='unknown'?'Unknown':'Verified',stamp)]);
   return {syntheticOnly:true,id:row.id,rowVersion:row.row_version+1,mode:input.mode};
  }
  async function outbox(request){
   const auth=await guards.qy(request);
   const rows=await db.prepare(`SELECT h.id FROM consultation_account_challenges h JOIN consultation_account_contacts c ON c.id=h.contact_id JOIN consultation_customer_contexts x ON x.id=h.context_id JOIN academy_portal_sessions p ON p.id=x.portal_session_id JOIN customers u ON u.id=p.customer_id
    WHERE h.consumed_at IS NULL AND h.attempts<5 AND h.expires_at>${DB_NOW} AND c.revoked_at IS NULL AND x.version=h.context_version AND x.revoked_at IS NULL AND x.expires_at>${DB_NOW} AND COALESCE(p.revoked_at,'')='' AND datetime(p.expires_at)>datetime('now') AND u.status='Active' AND EXISTS(${auth.sql})`).bind(...auth.values).all();
   const ids=new Set(rows.results.map(r=>r.id));for(const id of mockOutbox.keys())if(!ids.has(id))mockOutbox.delete(id);
   return {syntheticOnly:true,records:Array.from(mockOutbox.values())};
  }
  async function handler(request){
   try{
    const requestURL=new URL(request.url),path=requestURL.pathname;
    if(!requestAllowed(request,origin,{mutation:request.method==='POST'}))return reply(403,{ok:false});
    if(path==='/api/consultation/local/customer-login'&&request.method==='POST'){
     const input=await readWorkflowBody(request,1024);if(!input||Array.isArray(input)||Object.keys(input).length)return reply(400,{ok:false});
     const token=randomSecret(),now=Date.now();await db.batch([db.prepare("UPDATE academy_portal_sessions SET revoked_at=? WHERE customer_id=1 AND COALESCE(revoked_at,'')=''").bind(new Date(now).toISOString()),db.prepare('INSERT INTO academy_portal_sessions(customer_id,token_hash,created_at,expires_at) VALUES(1,?,?,?)').bind(await tokenHash(token),new Date(now).toISOString(),new Date(now+3600000).toISOString())]);
     return reply(200,{ok:true,syntheticOnly:true},{'set-cookie':`QY_PORTAL_SESSION=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`});
    }
    if(path==='/api/consultation/qy/local/outbox'&&request.method==='GET')return reply(200,{ok:true,...await outbox(request)});
    if(path==='/api/consultation/qy/local/capture'&&request.method==='POST'){
     return reply(200,{ok:true,...await mockCapture(request,await readWorkflowBody(request,1024))});
    }
    const response=await baseHandler(request);
    if(path==='/api/consultation/qy/bookings'&&response.ok)return reply(200,{...await response.json(),syntheticLocal:true});
    return response;
   }catch{return reply(409,{ok:false,error:'Synthetic local operation rejected. No automatic retry.'});}
  }
  return Object.freeze({handler,db,origin,dispose(){mockOutbox.clear();raw.close();}});
 }catch(error){raw.close();throw Error('Synthetic consultation initialization failed');}
}
