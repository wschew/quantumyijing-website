import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createWorkflowHandler} from '../functions/lib/consultation/workflow-handler.js';
import {createConsultationAuth} from '../functions/lib/consultation/auth.js';
import {createConsultationWorkflow} from '../functions/lib/consultation/workflow.js';
import {createCustomerContact} from '../functions/lib/consultation/customer-contact.js';
import {createAccountStepup} from '../functions/lib/consultation/account-stepup.js';
import {createWorkflowKeys} from '../functions/lib/consultation/workflow-runtime.js';
import {createCustomerIdentity} from '../functions/lib/consultation/customer-identity.js';
import {randomSecret,tokenHash} from '../functions/lib/consultation/auth-crypto.js';
let passed=0;
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const origin='https://synthetic.invalid';
const read=name=>readFileSync(new URL('../database/'+name,import.meta.url),'utf8').replace(/^\uFEFF/,'');
const split=sql=>sql.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|INSERT|$)/).map(s=>s.trim()).filter(Boolean);
function sqlite(raw){return {prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){if(/^\s*SELECT/i.test(sql))return {results:raw.prepare(sql).all(...values)};return {meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};},async batch(plan){raw.exec('BEGIN');try{const r=[];for(const p of plan)r.push(await p.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
const ring=Object.fromEntries(['intake','contact','lookup','challenge'].map((p,i)=>[p,{active:p+'-v1',keys:{[p+'-v1']:(i+1).toString(16).padStart(2,'0').repeat(32)}}]));
const keys=await createWorkflowKeys(JSON.stringify(ring));
async function checks(db,label){
 const t=(name,run)=>test(label+' '+name,run);
 await db.prepare("CREATE TABLE customers(id INTEGER PRIMARY KEY,status TEXT NOT NULL)").run();
 await db.prepare("INSERT INTO customers VALUES(1,'Active'),(2,'Active')").run();
 await db.prepare('CREATE TABLE products(id INTEGER PRIMARY KEY)').run();
 await db.prepare('CREATE TABLE enquiries(id INTEGER PRIMARY KEY)').run();
 await db.prepare('CREATE TABLE coaches(id INTEGER PRIMARY KEY)').run();
 await db.prepare('CREATE TABLE orders(id INTEGER PRIMARY KEY)').run();
 await db.prepare('INSERT INTO products VALUES(1)').run();await db.prepare('INSERT INTO coaches VALUES(1)').run();
 for(const name of ['migrate-v4.0-phase-f1f2-academy-portal.sql','migrate-c1-consultation-auth.sql','migrate-c1-consultation-customer-identity.sql','migrate-c1-bazi-consultation-foundation.sql','migrate-c1-consultation-customer-intake.sql','migrate-c1-consultation-contact-verification.sql','migrate-c1-consultation-account-stepup.sql','migrate-c1-consultation-workflow.sql'])for(const sql of split(read(name)))await db.prepare(sql).run();
 const now=Date.now(),qyToken=randomSecret(),qyCSRF=randomSecret();
 await db.prepare("INSERT INTO consultation_auth_account VALUES(1,'synthetic',1,'PBKDF2-SHA256',600000,?,?,1,?)").bind('a'.repeat(64),'b'.repeat(64),now-10000).run();
 await db.prepare('INSERT INTO consultation_auth_sessions VALUES(?,1,?,?,1,?,?,NULL)').bind('qy-1',await tokenHash(qyToken),await tokenHash(qyCSRF),now-10000,now+3600000).run();
 const qyReq=new Request(origin,{method:'POST',headers:{cookie:'__Host-QY_CONSULTATION='+qyToken,origin,'content-type':'application/json','x-qy-consultation-csrf':qyCSRF}});
 const parents=[];
 for(let i=1;i<=2;i++){const token=randomSecret();await db.prepare('INSERT INTO academy_portal_sessions(id,customer_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)').bind(i,i,await tokenHash(token),new Date(now-10000).toISOString(),new Date(now+3600000).toISOString()).run();parents.push(token);}
 const contexts=[];
 const identity=createCustomerIdentity({db,origin});
 for(const parent of parents){const res=await identity.establish(new Request(origin,{method:'POST',headers:{cookie:'QY_PORTAL_SESSION='+parent,origin,'content-type':'application/json'}}));assert.equal(res.status,200);contexts.push({token:res.headers.get('set-cookie').split(';')[0].split('=')[1],csrf:(await res.json()).csrfToken});}
 const req=(customer=0,mutation=false)=>new Request(origin,{method:mutation?'POST':'GET',headers:{cookie:'QY_PORTAL_SESSION='+parents[customer]+'; __Host-QY_CONSULTATION_CUSTOMER='+contexts[customer].token,...(mutation?{origin,'content-type':'application/json','x-qy-consultation-customer-csrf':contexts[customer].csrf}:{})}});
 const delivered=[];const service=createAccountStepup({db,origin,keys,mockDelivery:async payload=>delivered.push(payload)});
 await t('no trusted contact requires manual review',async()=>assert.deepEqual(await service.options(req()),{choices:[],manualReviewRequired:true}));
 await t('portal alone cannot authorize intake',()=>assert.rejects(service.requireStepup(req())));
 await t('ADMIN_TOKEN cannot enroll account contact',()=>assert.rejects(service.reviewContact(new Request(origin,{method:'POST',headers:{authorization:'Bearer synthetic-admin'}}),{customerId:1,channel:'email',contact:'a@example.invalid',evidenceReference:'review-1',independentlyVerified:true})));
 const input={customerId:1,channel:'email',contact:'a@example.invalid',evidenceReference:'independent-review-1',independentlyVerified:true};
 await t('unverified contact rejected',()=>assert.rejects(service.reviewContact(qyReq,{...input,independentlyVerified:false})));
 await t('truthy review flag rejected',()=>assert.rejects(service.reviewContact(qyReq,{...input,independentlyVerified:'true'})));
 const email=await service.reviewContact(qyReq,input);
 const wa=await service.reviewContact(qyReq,{...input,channel:'whatsapp',contact:'+60123456789',evidenceReference:'review-whatsapp'});
 await t('WhatsApp preferred with Email alternative',async()=>assert.deepEqual((await service.options(req())).choices.map(x=>x.channel),['whatsapp','email']));
 await t('other customer cannot select trusted contact',()=>assert.rejects(service.challenge(req(1,true),{contactId:email.id})));
 await t('newly entered contact rejected',()=>assert.rejects(service.challenge(req(0,true),{contactId:email.id,contact:'attacker@example.invalid'})));
 const challenge=await service.challenge(req(0,true),{contactId:wa.id});
 await t('mock delivery contains eight digit OTP',()=>assert.match(delivered.at(-1).code,/^\d{8}$/));
 await t('customer challenge receipt contains no OTP or recipient',()=>assert.deepEqual(Object.keys(challenge).sort(),['committed','delivery','id']));
 await t('cross-customer OTP substitution rejected',()=>assert.rejects(service.confirm(req(1,true),{challengeId:challenge.id,code:delivered.at(-1).code})));
 const wrong=delivered.at(-1).code==='00000000'?'11111111':'00000000';
 await t('incorrect OTP records failure but no proof',async()=>{assert.equal((await service.confirm(req(0,true),{challengeId:challenge.id,code:wrong})).verified,false);assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_account_stepups').first()).n,0);});
 await t('correct OTP grants account bound proof',async()=>assert.equal((await service.confirm(req(0,true),{challengeId:challenge.id,code:delivered.at(-1).code})).verified,true));
 await t('single use challenge rejects replay',()=>assert.rejects(service.confirm(req(0,true),{challengeId:challenge.id,code:delivered.at(-1).code})));
 await t('stepup guard is recheckable inside persistence SQL',async()=>{const guard=await service.requireStepup(req(0,true),true);assert.ok(await db.prepare(guard.sql).bind(...guard.values).first());});
 await t('contact proof cannot cross customer',()=>assert.rejects(service.requireStepup(req(1))));
 await t('contact ciphertext lacks plaintext',async()=>{const row=await db.prepare('SELECT * FROM consultation_account_contacts WHERE id=?').bind(email.id).first();assert.ok(!JSON.stringify(row).includes('a@example.invalid'));});
 await t('REPLACE contact evidence blocked',async()=>{const r=await db.prepare('SELECT * FROM consultation_account_contacts WHERE id=?').bind(email.id).first();const names=Object.keys(r);await assert.rejects(db.prepare(`INSERT OR REPLACE INTO consultation_account_contacts(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).bind(...names.map(k=>r[k])).run());});
 await t('REPLACE OTP proof blocked',async()=>{const r=await db.prepare('SELECT * FROM consultation_account_stepups').first();const names=Object.keys(r);await assert.rejects(db.prepare(`REPLACE INTO consultation_account_stepups(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).bind(...names.map(k=>r[k])).run());});
 await t('REPLACE audit blocked',async()=>{const r=await db.prepare('SELECT * FROM consultation_account_events LIMIT 1').first();const names=Object.keys(r);await assert.rejects(db.prepare(`REPLACE INTO consultation_account_events(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).bind(...names.map(k=>r[k])).run());});



 const contacts=createCustomerContact({db,origin,keyProvider:keys.contact.provider,fingerprintKeyProvider:keys.lookup.provider,challengeKeyProvider:keys.challenge.provider,activeKeyId:keys.contact.activeKeyId,activeFingerprintKeyId:keys.lookup.activeKeyId,activeChallengeKeyId:keys.challenge.activeKeyId});
 const deliveryChallenge=await contacts.requestChallenge(req(0,true),{channel:'whatsapp',contact:'+60123456789'});assert.equal(deliveryChallenge.status,200);const dc=await deliveryChallenge.json();
 const qyGet=new Request(origin,{headers:{cookie:'__Host-QY_CONSULTATION='+qyToken}});
 const instructions=await contacts.instructions(qyGet,{challengeId:dc.challengeId});assert.equal(instructions.status,200);const instructionsData=await instructions.json();
 assert.equal((await contacts.markDelivered(qyReq,{challengeId:dc.challengeId,expectedRevision:instructionsData.revision})).status,200);
 assert.equal((await contacts.confirm(req(0,true),{challengeId:dc.challengeId,code:instructionsData.code})).status,200);
 const policies=Object.fromEntries(['consultation_privacy','future_calculations','marketing'].map(p=>[p,{version:'synthetic-v1',hash:'a'.repeat(64)}]));
 const wf=createConsultationWorkflow({db,origin,keys,stepup:service,contacts,productId:1,practitionerId:1,policies,countryCodes:['MY'],bookingPolicy:{version:'synthetic-v1',hash:'b'.repeat(64)}});
 const intake={fullName:'Synthetic Adult',calculationGender:'female',birthDate:'2000-02-29',birthTimePrecision:'unknown',birthTime:null,birthCity:'Synthetic City',birthCountry:'MY',questions:'Synthetic private questions',reportChannel:'whatsapp',selfBooking:true,adultAcknowledged:true,privacyAcknowledgement:{accepted:true,version:'synthetic-v1'}};
 await t('intake without account proof fails closed',()=>assert.rejects(wf.submit(req(1,true),{commandId:'forged-booking',intake})));
 await t('intake rejects forged identifiers',()=>assert.rejects(wf.submit(req(0,true),{commandId:'forged-fields',intake:{...intake,customerId:2}})));
 let b=await wf.submit(req(0,true),{commandId:'submit-1',intake});
 await t('booking and encrypted intake submitted atomically',async()=>{assert.equal(b.state,'Submitted');assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_workflow_intakes').first()).n,1);});
 await t('duplicate submission rolls back all records',async()=>{await assert.rejects(wf.submit(req(0,true),{commandId:'submit-1',intake}));assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_bookings').first()).n,1);});
 await t('operational listing omits private fields',async()=>{const rows=await wf.list(qyGet,{qy:true});assert.equal(rows.length,1);assert.ok(!JSON.stringify(rows).includes('Synthetic private questions'));assert.equal(rows[0].birthDate,undefined);});
 await t('QY private read decrypts correct assigned case',async()=>assert.equal((await wf.readPrivate(qyGet,b.id)).questions,intake.questions));
 await t('ADMIN_TOKEN cannot read private intake',()=>assert.rejects(wf.readPrivate(new Request(origin,{headers:{authorization:'Bearer synthetic'}}),b.id)));
 b=await wf.change(qyReq,{id:b.id,to:'UnderReview',expectedVersion:0,commandId:'review-1'});
 await t('stale version rejected',()=>assert.rejects(wf.change(qyReq,{id:b.id,to:'Declined',expectedVersion:0,commandId:'stale-1'})));
 await t('72-hour lead time enforced',()=>assert.rejects(wf.propose(qyReq,{id:b.id,startAt:Date.now()+3600000,expectedVersion:b.rowVersion,commandId:'early-slot'})));
 const proposed=await wf.propose(qyReq,{id:b.id,startAt:Date.now()+73*3600000,expectedVersion:b.rowVersion,commandId:'offer-1'});
 await t('offer locked at regular MYR1300 with draft promotion inactive',()=>assert.equal(proposed.offer.sellingPriceSen,130000));
 await t('customer reads only own current offer',async()=>assert.equal((await wf.currentOffer(req(),b.id)).snapshotHash,proposed.offer.snapshotHash));
 await t('forged policy acceptance rejected',()=>assert.rejects(wf.accept(req(0,true),{id:b.id,expectedVersion:proposed.rowVersion,commandId:'bad-accept',acknowledged:true,snapshotHash:proposed.offer.snapshotHash,policyHash:'f'.repeat(64)})));
 const accepted=await wf.accept(req(0,true),{id:b.id,expectedVersion:proposed.rowVersion,commandId:'accept-1',acknowledged:true,snapshotHash:proposed.offer.snapshotHash,policyHash:proposed.offer.policyHash});
 await t('acceptance leaves booking unconfirmed until verified capture',()=>assert.equal(accepted.state,'PaymentPending'));
 const review=await wf.reconcilePayment(qyReq,{id:b.id,expectedVersion:accepted.rowVersion,commandId:'payment-review-1'});
 await t('missing authoritative capture evidence requires manual review',()=>assert.equal(review.state,'ExceptionReview'));
 await t('ordinary completion cannot bypass payment',()=>assert.rejects(wf.change(qyReq,{id:b.id,to:'Completed',expectedVersion:review.rowVersion,commandId:'fake-complete'})));
 await t('PDF preparation cannot bypass completion',()=>assert.rejects(wf.report(qyReq,{id:b.id,action:'Prepared',expectedVersion:review.rowVersion,commandId:'fake-report'})));
 await t('no order or payment writes performed',async()=>assert.equal((await db.prepare('SELECT COUNT(*) n FROM orders').first()).n,0));
 await t('private plaintext absent from audit',async()=>{const rows=(await db.prepare('SELECT * FROM consultation_workflow_events').all()).results;assert.ok(!JSON.stringify(rows).includes(intake.questions));});


 const completedFixture=await wf.submit(req(0,true),{commandId:'submit-completed-fixture',intake});
 // Synthetic pre-paid, already-ended appointment fixture, independent of capture reconciliation.
 const ended=Date.now()-3600000;
 await db.prepare("UPDATE consultation_bookings SET state='Confirmed',current_start_at=?,current_end_at=?,original_start_at=?,practitioner_id=1 WHERE id=?").bind(ended-5400000,ended,ended-5400000,completedFixture.id).run();
 const completed=await wf.change(qyReq,{id:completedFixture.id,to:'Completed',expectedVersion:0,commandId:'complete-fixture'});
 await t('completed intake receives revised five-year retention',async()=>{const i=await db.prepare('SELECT i.* FROM consultation_customer_intakes i JOIN consultation_workflow_intakes w ON w.intake_id=i.id WHERE w.booking_id=?').bind(completed.id).first();assert.equal(i.retention_basis,'Completed');assert.ok(i.retention_until-i.completed_at>4.9*365*86400000);assert.equal(i.payload_version,1);assert.equal((await wf.readPrivate(qyGet,completed.id)).birthDate,intake.birthDate);});
 const prepared=await wf.report(qyReq,{id:completed.id,action:'Prepared',expectedVersion:completed.rowVersion,commandId:'manual-prepared'});
 await t('report preparation stores metadata without PDFs',async()=>{const r=await db.prepare('SELECT * FROM consultation_manual_reports WHERE booking_id=?').bind(completed.id).first();assert.equal(r.state,'Prepared');assert.equal(r.object_key,undefined);assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_reports').first()).n,0);});
 await t('delivery without evidence rejected',()=>assert.rejects(wf.report(qyReq,{id:completed.id,action:'Delivered',expectedVersion:prepared.rowVersion,commandId:'bad-delivery'})));
 const deliveredReport=await wf.report(qyReq,{id:completed.id,action:'Delivered',expectedVersion:prepared.rowVersion,commandId:'manual-delivered',evidenceReference:'manual-customer-confirmation-1'});
 await t('manual confirmed delivery advances report status',()=>assert.equal(deliveredReport.state,'ReportDelivered'));
 await t('duplicate delivery safely rejected',()=>assert.rejects(wf.report(qyReq,{id:completed.id,action:'Delivered',expectedVersion:prepared.rowVersion,commandId:'manual-delivered',evidenceReference:'manual-customer-confirmation-1'})));

 const handler=createWorkflowHandler({origin,workflow:wf,stepup:service,contacts,identity,qyAuth:createConsultationAuth({db,origin}),policies});
 await t('local controller QY listing uses dedicated session',async()=>{const res=await handler(new Request(origin+'/api/consultation/qy/bookings',{headers:qyGet.headers}));assert.equal(res.status,200);assert.equal((await res.json()).records.length,2);});
 await t('local controller rejects foreign Origin before mutation',async()=>{const res=await handler(new Request(origin+'/api/consultation/bookings',{method:'POST',headers:{...Object.fromEntries(req(0,true).headers),origin:'https://foreign.invalid'},body:'{}'}));assert.equal(res.status,403);});
 await t('local controller refuses unwired payment operation',async()=>assert.equal((await handler(new Request(origin+'/api/consultation/qy/payment/reconcile',{method:'POST',headers:qyReq.headers,body:'{}'}))).status,404));
 await t('local controller rejects malformed UTF8 without reflecting it',async()=>{const res=await handler(new Request(origin+'/api/consultation/bookings',{method:'POST',headers:req(0,true).headers,body:new Uint8Array([123,34,120,34,58,34,255,34,125])}));assert.equal(res.status,409);assert.ok(!(await res.text()).includes('255'));});
 await t('local controller bounds request body',async()=>assert.equal((await handler(new Request(origin+'/api/consultation/bookings',{method:'POST',headers:req(0,true).headers,body:'x'.repeat(20001)}))).status,409));

 const rowBefore=(await db.prepare('SELECT COUNT(*) n FROM consultation_account_contacts').first()).n;
 let injected=false;const raceDb={prepare:sql=>db.prepare(sql),async batch(plan){if(!injected){injected=true;await db.prepare('UPDATE consultation_auth_account SET enabled=0').run();}return db.batch(plan);}};
 const race=createAccountStepup({db:raceDb,origin,keys,mockDelivery:async()=>{throw Error('No delivery expected');}});
 await t('QY revocation race rolls back enrollment and audit',async()=>{await assert.rejects(race.reviewContact(qyReq,{customerId:2,channel:'email',contact:'other@example.invalid',evidenceReference:'review-race',independentlyVerified:true}));assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_account_contacts').first()).n,rowBefore);});
 await db.prepare('UPDATE consultation_auth_account SET enabled=1').run();

 await t('contact revocation immediately blocks proof',async()=>{await service.revokeContact(qyReq,wa.id);await assert.rejects(service.requireStepup(req()));});
 const emailChallenge=await service.challenge(req(0,true),{contactId:email.id});
 await t('five incorrect attempts lock challenge',async()=>{const code=delivered.at(-1).code==='00000000'?'11111111':'00000000';for(let i=0;i<5;i++)assert.equal((await service.confirm(req(0,true),{challengeId:emailChallenge.id,code})).verified,false);await assert.rejects(service.confirm(req(0,true),{challengeId:emailChallenge.id,code:delivered.at(-1).code}));});
 await t('request quota is bounded',async()=>{await service.challenge(req(0,true),{contactId:email.id});const before=(await db.prepare('SELECT COUNT(*) n FROM consultation_account_events').first()).n;await assert.rejects(service.challenge(req(0,true),{contactId:email.id}));assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_account_events').first()).n,before);});
 await t('parent revocation prevents proof and further delivery',async()=>{await db.prepare("UPDATE academy_portal_sessions SET revoked_at=? WHERE id=1").bind(new Date().toISOString()).run();await assert.rejects(service.requireStepup(req()));await assert.rejects(service.options(req()));});
 await t('foreign keys intact',async()=>assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0));
 await t('supported quick check passes',async()=>assert.equal(Object.values(await db.prepare('PRAGMA quick_check').first())[0],'ok'));
}
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');try{await checks(sqlite(raw),'SQLite');}finally{raw.close();}
if(!process.env.QY_MINIFLARE_PATH)throw Error('Local D1 emulator required');
const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default{fetch(){throw Error("No HTTP")}}',compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-stepup'},d1Persist:false,cf:false,telemetry:{enabled:false}}));
try{await checks(await mf.getD1Database('DB'),'D1');}finally{await mf.dispose();}
console.log(`RESULT ${passed} passed, 0 failed; local synthetic only`);
