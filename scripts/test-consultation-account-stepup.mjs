import {createAppointmentPreferences} from '../functions/lib/consultation/appointment-preferences.js';
﻿import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createCaptureReview} from '../functions/lib/consultation/capture-review.js';
import {issueOffer} from '../functions/lib/consultation/foundation.js';
import {createWorkflowLifecycle} from '../functions/lib/consultation/workflow-lifecycle.js';
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
 await db.prepare('CREATE TABLE orders(id INTEGER PRIMARY KEY,enquiry_id INTEGER REFERENCES enquiries(id),currency TEXT,total REAL,payment_status TEXT)').run();
 await db.prepare('CREATE TABLE order_items(id INTEGER PRIMARY KEY,order_id INTEGER REFERENCES orders(id),product_id INTEGER REFERENCES products(id),quantity INTEGER,unit_price REAL,line_total REAL)').run();
 await db.prepare('CREATE TABLE payments(id INTEGER PRIMARY KEY,order_id INTEGER REFERENCES orders(id),amount REAL,currency TEXT,status TEXT,verification_status TEXT,accounting_eligible INTEGER)').run();
 await db.prepare('CREATE TABLE customer_enquiry_links(id INTEGER PRIMARY KEY,customer_id INTEGER REFERENCES customers(id),enquiry_id INTEGER UNIQUE REFERENCES enquiries(id))').run();
 await db.prepare('INSERT INTO products VALUES(1)').run();await db.prepare('INSERT INTO coaches VALUES(1)').run();
 for(const name of ['migrate-v4.0-phase-f1f2-academy-portal.sql','migrate-c1-consultation-auth.sql','migrate-c1-consultation-customer-identity.sql','migrate-c1-bazi-consultation-foundation.sql','migrate-c1-consultation-customer-intake.sql','migrate-c1-consultation-contact-verification.sql','migrate-c1-consultation-account-stepup.sql','migrate-c1-consultation-workflow.sql','migrate-c1-consultation-workflow-lifecycle.sql','migrate-c1-consultation-capture-review.sql','migrate-c1-consultation-workflow-evidence-guards.sql','migrate-c1-consultation-availability.sql'])for(const sql of split(read(name)))await db.prepare(sql).run();
 // Broad historical availability is synthetic fixture data only, not a runtime default.
 await db.prepare("INSERT INTO consultation_availability_windows VALUES('historical-test-coverage',1,946684800000,4102444800000,'Active',1,915148800000,915148800000)").run();
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
 // U2-A is additive and exercised against both SQLite and local D1.
 for(const sql of split(read('migrate-c1-consultation-preferences.sql')))await db.prepare(sql).run();
 const preferences=createAppointmentPreferences({db,origin,stepup:service});
 const pb=await wf.submit(req(0,true),{commandId:'preferences-request',intake});
 const baseInput={id:pb.id,expectedVersion:0,expectedRevision:0,commandId:'preferences-first',starts:[Date.now()+100*3600000,Date.now()+110*3600000]};
 await t('preferences require customer ownership and authenticated reads',async()=>{await assert.rejects(preferences.read(req(1),pb.id));await assert.rejects(preferences.read(new Request(origin),pb.id));await assert.rejects(preferences.save(req(1,true),baseInput));});
 await t('preferences reject malformed and duplicate values atomically',async()=>{for(const starts of [[],[baseInput.starts[0],baseInput.starts[0]],['2030-01-01'],[NaN],[Date.now()-1],Array(4).fill(baseInput.starts[0]),[null]])await assert.rejects(preferences.save(req(0,true),{...baseInput,starts}));assert.equal((await db.prepare('SELECT row_version FROM consultation_bookings WHERE id=?').bind(pb.id).first()).row_version,0);});
 const ps=await preferences.save(req(0,true),baseInput);
 await t('preferences preserve rank without reserving, offering or payment changes',async()=>{assert.equal(ps.revision,1);const row=await db.prepare('SELECT state,current_offer_id,row_version,current_start_at FROM consultation_bookings WHERE id=?').bind(pb.id).first();assert.equal(row.state,'Submitted');assert.equal(row.current_offer_id,null);assert.equal(row.current_start_at,null);assert.equal(row.row_version,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_slot_reservations WHERE booking_id=?').bind(pb.id).first()).n,0);assert.deepEqual((await preferences.read(qyGet,pb.id,{qy:true})).starts,baseInput.starts);});
 await t('stale preference and booking revisions roll back',async()=>{await assert.rejects(preferences.save(req(0,true),{...baseInput,commandId:'stale-preferences'}));await assert.rejects(preferences.save(req(0,true),{...baseInput,expectedVersion:1,commandId:'stale-only-preferences'}));assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_appointment_preferences WHERE booking_id=?').bind(pb.id).first()).n,1);});
 await t('duplicate command rolls back otherwise valid CAS',async()=>{await assert.rejects(preferences.save(req(0,true),{...baseInput,expectedVersion:1,expectedRevision:1}));assert.equal((await db.prepare('SELECT row_version FROM consultation_bookings WHERE id=?').bind(pb.id).first()).row_version,1);});
 await t('preferences revision append preserves prior evidence',async()=>{const next=await preferences.save(req(0,true),{...baseInput,expectedVersion:1,expectedRevision:1,commandId:'preferences-second',starts:[baseInput.starts[1]]});assert.equal(next.revision,2);assert.equal((await preferences.read(req(),pb.id)).starts[0],baseInput.starts[1]);assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_appointment_preferences WHERE booking_id=?').bind(pb.id).first()).n,2);});
 await t('preference REPLACE collisions cannot erase evidence',async()=>{const row=await db.prepare('SELECT * FROM consultation_appointment_preferences WHERE booking_id=? AND revision=1').bind(pb.id).first();const names=Object.keys(row);await assert.rejects(db.prepare('INSERT OR REPLACE INTO consultation_appointment_preferences('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')').bind(...names.map(k=>row[k])).run());assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_appointment_preferences WHERE booking_id=?').bind(pb.id).first()).n,2);});
 // A QY review changes booking CAS, but preference edits remain allowed until the offer.
 const pr=await wf.change(qyReq,{id:pb.id,to:'UnderReview',expectedVersion:2,commandId:'preferences-review'});
 await preferences.save(req(0,true),{...baseInput,expectedVersion:pr.rowVersion,expectedRevision:2,commandId:'preferences-under-review'});
 const po=await wf.propose(qyReq,{id:pb.id,startAt:Date.now()+200*3600000,expectedVersion:pr.rowVersion+1,commandId:'preferences-offer'});
 await t('issued offer permanently closes preference revisions',async()=>{await assert.rejects(preferences.save(req(0,true),{...baseInput,expectedVersion:po.rowVersion,expectedRevision:3,commandId:'preferences-after-offer'}));assert.equal((await preferences.read(req(),pb.id)).editable,false);});

 await t('booking and encrypted intake submitted atomically',async()=>{assert.equal(b.state,'Submitted');assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_workflow_intakes').first()).n,2);});
 await t('duplicate submission rolls back all records',async()=>{await assert.rejects(wf.submit(req(0,true),{commandId:'submit-1',intake}));assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_bookings').first()).n,2);});
 await t('operational listing omits private fields',async()=>{const rows=await wf.list(qyGet,{qy:true});assert.equal(rows.length,2);assert.ok(!JSON.stringify(rows).includes('Synthetic private questions'));assert.equal(rows[0].birthDate,undefined);});
 await t('QY private read decrypts correct assigned case',async()=>assert.equal((await wf.readPrivate(qyGet,b.id)).questions,intake.questions));
 await t('ADMIN_TOKEN cannot read private intake',()=>assert.rejects(wf.readPrivate(new Request(origin,{headers:{authorization:'Bearer synthetic'}}),b.id)));
 b=await wf.change(qyReq,{id:b.id,to:'UnderReview',expectedVersion:0,commandId:'review-1'});
 await t('stale version rejected',()=>assert.rejects(wf.change(qyReq,{id:b.id,to:'Declined',expectedVersion:0,commandId:'stale-1'})));
 await t('72-hour lead time enforced',()=>assert.rejects(wf.propose(qyReq,{id:b.id,startAt:Date.now()+3600000,expectedVersion:b.rowVersion,commandId:'early-slot'})));
 const proposed=await wf.propose(qyReq,{id:b.id,startAt:Date.now()+73*3600000,expectedVersion:b.rowVersion,commandId:'offer-1'});
 await t('offer locked at regular MYR1300 with draft promotion inactive',()=>assert.equal(proposed.offer.sellingPriceSen,130000));
 await t('U1 listing includes authoritative offer metadata and QY-only customer ID',async()=>{const staff=(await wf.list(qyGet,{qy:true})).find(r=>r.id===b.id),customer=(await wf.list(req())).find(r=>r.id===b.id);assert.equal(staff.customer_id,1);assert.equal(customer.customer_id,undefined);for(const row of [staff,customer]){assert.equal(row.selling_price_sen,proposed.offer.sellingPriceSen);assert.equal(row.currency,proposed.offer.currency);assert.equal(row.offer_expires_at,proposed.offer.expiresAt);assert.equal(row.current_start_at,proposed.offer.startAt);assert.equal(row.birthDate,undefined);assert.equal(row.ciphertext,undefined);}});
 await t('U1 operational listing still rejects unauthenticated access',()=>assert.rejects(wf.list(new Request(origin),{qy:true})));
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
 await t('local controller QY listing uses dedicated session',async()=>{const res=await handler(new Request(origin+'/api/consultation/qy/bookings',{headers:qyGet.headers}));assert.equal(res.status,200);assert.equal((await res.json()).records.length,3);});
 await t('local controller rejects foreign Origin before mutation',async()=>{const res=await handler(new Request(origin+'/api/consultation/bookings',{method:'POST',headers:{...Object.fromEntries(req(0,true).headers),origin:'https://foreign.invalid'},body:'{}'}));assert.equal(res.status,403);});
 await t('local controller refuses unwired payment operation',async()=>assert.equal((await handler(new Request(origin+'/api/consultation/qy/payment/reconcile',{method:'POST',headers:qyReq.headers,body:'{}'}))).status,404));
 await t('local controller rejects malformed UTF8 without reflecting it',async()=>{const res=await handler(new Request(origin+'/api/consultation/bookings',{method:'POST',headers:req(0,true).headers,body:new Uint8Array([123,34,120,34,58,34,255,34,125])}));assert.equal(res.status,409);assert.ok(!(await res.text()).includes('255'));});
 await t('local controller bounds request body',async()=>assert.equal((await handler(new Request(origin+'/api/consultation/bookings',{method:'POST',headers:req(0,true).headers,body:'x'.repeat(20001)}))).status,409));


 const lifecycle=createWorkflowLifecycle({db,origin,keys,stepup:service});
 const hour=3600000;
 async function historicalFixture(startAt,state='Confirmed'){
  const record=await wf.submit(req(0,true),{commandId:crypto.randomUUID(),intake});
  const issuedAt=Math.min(Date.now()-1000,startAt-80*hour);
  const o=await issueOffer({id:crypto.randomUUID(),bookingId:record.id,customerId:1,practitionerId:1,startAt,issuedAt,policyVersion:'synthetic-v1',policyHash:'b'.repeat(64)});
  const accepted=state!=='Offered';
  await db.prepare('INSERT INTO consultation_offers(id,booking_id,revision,state,practitioner_id,start_at,end_at,issued_at,expires_at,regular_price_sen,selling_price_sen,currency,policy_version,policy_hash,snapshot_hash,issued_by,accepted_at,acceptance_customer_id,acceptance_policy_hash,acceptance_snapshot_hash) VALUES(?,?,1,?,1,?,?,?,?,130000,130000,\'MYR\',?,?,?,\'qy-1\',?,?,?,?)').bind(o.id,record.id,state==='Confirmed'?'Verified':accepted?'Accepted':'Issued',o.startAt,o.endAt,o.issuedAt,o.expiresAt,o.policyVersion,o.policyHash,o.snapshotHash,accepted?issuedAt+1:null,accepted?1:null,accepted?o.policyHash:null,accepted?o.snapshotHash:null).run();
  await db.prepare('UPDATE consultation_bookings SET state=?,current_offer_id=?,practitioner_id=1,current_start_at=?,current_end_at=?,original_start_at=? WHERE id=?').bind(state,o.id,o.startAt,o.endAt,state==='Confirmed'?o.startAt:null,record.id).run();
  await db.prepare('INSERT INTO consultation_slot_reservations VALUES(?,?,?,1,?,?,?,?)').bind(crypto.randomUUID(),record.id,o.id,o.startAt,o.endAt,state==='Confirmed'?'Confirmed':'Held',state==='Confirmed'?null:o.expiresAt).run();
  return {...record,state,offer:o};
 }
 const rb=await historicalFixture(Date.now()+96*hour);
 await t('reschedule rejects customer-supplied request timestamp',()=>assert.rejects(lifecycle.requestReschedule(req(0,true),{id:rb.id,expectedVersion:0,commandId:'forged-request-time',requestedAt:Date.now()-86400000})));
 let request1=await lifecycle.requestReschedule(req(0,true),{id:rb.id,expectedVersion:0,commandId:'reschedule-free'});
 await t('timely request retains free eligibility',()=>assert.equal(request1.eligibility,'FreeEligible'));
 await t('duplicate pending reschedule rejected',()=>assert.rejects(lifecycle.requestReschedule(req(0,true),{id:rb.id,expectedVersion:request1.rowVersion,commandId:'duplicate-pending'})));
 await t('truthy owner approval rejected',()=>assert.rejects(lifecycle.decideReschedule(qyReq,{id:rb.id,requestId:request1.requestId,expectedVersion:request1.rowVersion,commandId:'truthy-approval',replacementStart:Date.now()+48*hour,ownerApproved:'true'})));
 const moved=await lifecycle.decideReschedule(qyReq,{id:rb.id,requestId:request1.requestId,expectedVersion:request1.rowVersion,commandId:'approve-free',replacementStart:Date.now()+48*hour,ownerApproved:false});
 await t('approved replacement can occur sooner than a new 72-hour booking offer',()=>assert.equal(moved.decision,'Approved'));
 await t('one free move preserves immutable original offer and price',async()=>{const b=await db.prepare('SELECT * FROM consultation_bookings WHERE id=?').bind(rb.id).first();assert.equal(b.free_reschedule_used,1);assert.equal(b.original_start_at,rb.offer.startAt);assert.equal(b.current_offer_id,rb.offer.id);assert.equal((await db.prepare('SELECT snapshot_hash FROM consultation_offers WHERE id=?').bind(rb.offer.id).first()).snapshot_hash,rb.offer.snapshotHash);});
 await t('list displays actual replacement appointment',async()=>{const row=(await wf.list(qyGet,{qy:true})).find(r=>r.id===rb.id);assert.ok(row.current_start_at<rb.offer.startAt);});
 await t('completion uses replacement end, not original schedule',()=>assert.rejects(wf.change(qyReq,{id:rb.id,to:'Completed',expectedVersion:moved.rowVersion,commandId:'early-replacement-completion'})));
 const extra=await lifecycle.requestReschedule(req(0,true),{id:rb.id,expectedVersion:moved.rowVersion,commandId:'reschedule-additional'});
 const ownerReview=await lifecycle.decideReschedule(qyReq,{id:rb.id,requestId:extra.requestId,expectedVersion:extra.rowVersion,commandId:'additional-review',replacementStart:Date.now()+50*hour,ownerApproved:false});
 await t('additional reschedule requires QY owner approval',()=>assert.equal(ownerReview.decision,'OwnerReview'));
 const additional=await lifecycle.decideReschedule(qyReq,{id:rb.id,requestId:extra.requestId,expectedVersion:ownerReview.rowVersion,commandId:'additional-approved',replacementStart:Date.now()+50*hour,ownerApproved:true});
 await t('explicit QY approval permits additional move without resetting free use',async()=>{assert.equal(additional.decision,'Approved');assert.equal((await db.prepare('SELECT free_reschedule_used FROM consultation_bookings WHERE id=?').bind(rb.id).first()).free_reschedule_used,1);});
 const outRequest=await lifecycle.requestReschedule(req(0,true),{id:rb.id,expectedVersion:additional.rowVersion,commandId:'window-request'});
 const outside=await lifecycle.decideReschedule(qyReq,{id:rb.id,requestId:outRequest.requestId,expectedVersion:outRequest.rowVersion,commandId:'outside-window',replacementStart:rb.offer.startAt+31*86400000,ownerApproved:true});
 await t('30-day exception never extends or forfeits automatically',async()=>{assert.equal(outside.decision,'OwnerReview');assert.equal((await db.prepare('SELECT state FROM consultation_bookings WHERE id=?').bind(rb.id).first()).state,'Confirmed');});
 const active=await db.prepare("SELECT * FROM consultation_workflow_appointments WHERE booking_id=? AND state='Active'").bind(rb.id).first();
 await t('REPLACE replacement appointment evidence rejected',async()=>{const names=Object.keys(active);await assert.rejects(db.prepare('REPLACE INTO consultation_workflow_appointments('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')').bind(...names.map(k=>active[k])).run());});

 await t('REPLACE through active-booking unique key cannot erase appointment history',async()=>{const start=active.start_at+5*hour,id=crypto.randomUUID();await db.prepare("INSERT INTO consultation_reschedule_requests(id,booking_id,requested_at,appointment_start_snapshot,original_start_snapshot,request_type,state,eligibility,replacement_start_at) VALUES(?,?,?,?,?,'Additional','Approved',0,?)").bind(id,rb.id,Date.now(),active.start_at,rb.offer.startAt,start).run();const row={...active,id:crypto.randomUUID(),sequence:active.sequence+1,start_at:start,end_at:start+5400000,request_id:id,created_at:Date.now()};const names=Object.keys(row);await assert.rejects(db.prepare('INSERT OR REPLACE INTO consultation_workflow_appointments('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')').bind(...names.map(k=>row[k])).run());assert.equal((await db.prepare("SELECT id FROM consultation_workflow_appointments WHERE booking_id=? AND state='Active'").bind(rb.id).first()).id,active.id);});

 const blockedOffer=await wf.submit(req(0,true),{commandId:'overlap-submit',intake});
 const blockedReview=await wf.change(qyReq,{id:blockedOffer.id,to:'UnderReview',expectedVersion:0,commandId:'overlap-review'});
 // An initial 72-hour offer conflicts with a later replacement fixture below, in either table direction.
 const conflictBooking=await historicalFixture(Date.now()+144*hour);
 const conflictRequest=await lifecycle.requestReschedule(req(0,true),{id:conflictBooking.id,expectedVersion:0,commandId:'overlap-reschedule'});
 const conflictMove=await lifecycle.decideReschedule(qyReq,{id:conflictBooking.id,requestId:conflictRequest.requestId,expectedVersion:conflictRequest.rowVersion,commandId:'overlap-approve',replacementStart:Date.now()+80*hour,ownerApproved:false});assert.equal(conflictMove.decision,'Approved');
 await t('initial offer cannot overlap a replacement appointment',()=>assert.rejects(wf.propose(qyReq,{id:blockedOffer.id,expectedVersion:blockedReview.rowVersion,commandId:'overlap-propose',startAt:Date.now()+80*hour})));
 await t('failed overlap transaction preserves booking and offer counts',async()=>{assert.equal((await db.prepare('SELECT state FROM consultation_bookings WHERE id=?').bind(blockedOffer.id).first()).state,'UnderReview');assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_offers WHERE booking_id=?').bind(blockedOffer.id).first()).n,0);});
 const elapsed=await historicalFixture(Date.now()-2*hour);
 await db.prepare("INSERT INTO consultation_reschedule_requests(id,booking_id,requested_at,appointment_start_snapshot,original_start_snapshot,request_type,state,eligibility) VALUES(?,?,?,?,?,'Free','OwnerReview',1)").bind('historical-pending-'+label,elapsed.id,elapsed.offer.startAt-25*hour,elapsed.offer.startAt,elapsed.offer.startAt).run();
 await t('eligible pending request blocks genuine elapsed no-show forfeiture',()=>assert.rejects(lifecycle.forfeit(qyReq,{id:elapsed.id,expectedVersion:0,commandId:'protected-no-show',reason:'NoShowForfeited',lawfulException:false})));
 await t('eligible pending request also blocks unqualified cancellation forfeiture',()=>assert.rejects(lifecycle.forfeit(qyReq,{id:elapsed.id,expectedVersion:0,commandId:'protected-cancel',reason:'CancelledForfeited',lawfulException:false})));
 const absent=await historicalFixture(Date.now()-10*hour);
 const forfeited=await lifecycle.forfeit(qyReq,{id:absent.id,expectedVersion:0,commandId:'eligible-no-show',reason:'NoShowForfeited',lawfulException:false});
 await t('QY no-show records terminal state and 90-day private retention',async()=>{assert.equal(forfeited.state,'NoShowForfeited');const i=await db.prepare('SELECT i.* FROM consultation_customer_intakes i JOIN consultation_workflow_intakes w ON w.intake_id=i.id WHERE w.booking_id=?').bind(absent.id).first();assert.equal(i.retention_basis,'FinalCancelled');assert.ok(i.retention_until-i.terminal_at>=90*86400000);assert.ok(i.retention_until-i.terminal_at<91*86400000);});
 const expired=await historicalFixture(Date.now()+24*hour,'Offered');
 const expiry=await lifecycle.expireOffer(qyReq,{id:expired.id,expectedVersion:0,commandId:'expire-unaccepted'});
 await t('unaccepted expired offer releases slot and sets terminal retention',async()=>{assert.equal(expiry.state,'OfferExpired');assert.equal((await db.prepare('SELECT state FROM consultation_slot_reservations WHERE booking_id=?').bind(expired.id).first()).state,'Released');assert.equal((await db.prepare('SELECT i.retention_basis FROM consultation_customer_intakes i JOIN consultation_workflow_intakes w ON w.intake_id=i.id WHERE w.booking_id=?').bind(expired.id).first()).retention_basis,'FinalExpired');});
 const paidUnknown=await historicalFixture(Date.now()+26*hour,'PaymentPending');
 const unresolved=await lifecycle.expireOffer(qyReq,{id:paidUnknown.id,expectedVersion:0,commandId:'expire-accepted-review'});
 await t('expired accepted offer preserves ambiguous payment for review',async()=>{assert.equal(unresolved.state,'ExceptionReview');assert.equal((await db.prepare('SELECT i.retention_basis FROM consultation_customer_intakes i JOIN consultation_workflow_intakes w ON w.intake_id=i.id WHERE w.booking_id=?').bind(paidUnknown.id).first()).retention_basis,'Pending');});
 const deletion=await lifecycle.reportStatus(qyReq,{id:deliveredReport.id,expectedVersion:deliveredReport.rowVersion,commandId:'manual-pdf-delete',action:'Deleted',evidenceReference:'manual-deletion-confirmation'});
 await t('manual PDF deletion is metadata only and preserves encrypted intake',async()=>{assert.equal(deletion.reportState,'Deleted');assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_reports').first()).n,0);assert.equal((await wf.readPrivate(qyGet,deliveredReport.id)).questions,intake.questions);});
 await t('repeat manual PDF deletion rejected',()=>assert.rejects(lifecycle.reportStatus(qyReq,{id:deliveredReport.id,expectedVersion:deletion.rowVersion,commandId:'second-delete',action:'Deleted',evidenceReference:'manual-deletion-confirmation'})));
 const qyOnly=await service.reviewContact(qyReq,{customerId:2,channel:'email',contact:'other@example.invalid',evidenceReference:'other-canonical-review',independentlyVerified:true});
 const otherChallenge=await service.challenge(req(1,true),{contactId:qyOnly.id});await service.confirm(req(1,true),{challengeId:otherChallenge.id,code:delivered.at(-1).code});
 await t('authenticated other customer cannot reschedule another booking',()=>assert.rejects(lifecycle.requestReschedule(req(1,true),{id:rb.id,expectedVersion:outside.rowVersion,commandId:'cross-customer-reschedule'})));
 await t('lifecycle audit contains no intake plaintext',async()=>assert.ok(!JSON.stringify((await db.prepare('SELECT * FROM consultation_workflow_lifecycle_events').all()).results).includes(intake.questions)));


 const captures=createCaptureReview({db,origin,keys});
 async function existingFinanceOrder(id,customerId=1,total=1300){
  await db.prepare('INSERT INTO enquiries VALUES(?)').bind(id).run();
  await db.prepare('INSERT INTO customer_enquiry_links(customer_id,enquiry_id) VALUES(?,?)').bind(customerId,id).run();
  await db.prepare("INSERT INTO orders VALUES(?,?,'MYR',?,'Paid')").bind(id,id,total).run();
  await db.prepare('INSERT INTO order_items(order_id,product_id,quantity,unit_price,line_total) VALUES(?,1,1,?,?)').bind(id,total,total).run();
  await db.prepare("INSERT INTO payments VALUES(?,?,?,'MYR','Paid','Verified',1)").bind(id,id,total).run();
 }
 await existingFinanceOrder(1);await existingFinanceOrder(2,2);await existingFinanceOrder(3,1,1300.01);
 await t('finance order link rejects other canonical customer',()=>assert.rejects(captures.linkOrder(qyReq,{id:b.id,orderId:2,expectedVersion:review.rowVersion,commandId:'wrong-finance-customer'})));
 await t('finance order link rejects price differing from immutable offer',()=>assert.rejects(captures.linkOrder(qyReq,{id:b.id,orderId:3,expectedVersion:review.rowVersion,commandId:'wrong-finance-price'})));
 let bound=await captures.linkOrder(qyReq,{id:b.id,orderId:1,expectedVersion:review.rowVersion,commandId:'finance-link'});
 const paymentTime=Date.now()-10;
 const financeInput={id:b.id,expectedVersion:bound.rowVersion,commandId:'finance-review',capturedAt:paymentTime,supportingEvidenceReference:'independent-bank-proof',supportingEvidenceHash:'c'.repeat(64),independentlyFinanceVerified:true};
 await t('finance review rejects missing supporting evidence hash',()=>assert.rejects(captures.recordFinanceReview(qyReq,{...financeInput,supportingEvidenceHash:undefined})));
 await t('finance review rejects truthy verification flag',()=>assert.rejects(captures.recordFinanceReview(qyReq,{...financeInput,independentlyFinanceVerified:'true'})));
 await t('customer cannot create finance capture evidence',()=>assert.rejects(captures.recordFinanceReview(req(0,true),financeInput)));
 const financialBefore=JSON.stringify((await db.prepare('SELECT * FROM payments ORDER BY id').all()).results);
 bound=await captures.recordFinanceReview(qyReq,financeInput);
 await t('finance review records evidence but never automatically confirms',()=>assert.equal(bound.state,'ExceptionReview'));
 await t('finance annotation preserves frozen payment rows',async()=>assert.ok(financialBefore===JSON.stringify((await db.prepare('SELECT * FROM payments ORDER BY id').all()).results)));
 await t('finance evidence has required matching append-only audit',async()=>{const r=await db.prepare('SELECT r.id FROM consultation_capture_reviews r JOIN consultation_capture_audit a ON a.id=r.audit_id WHERE a.booking_id=r.booking_id AND a.actor_reference=r.reviewed_by AND a.event=\'IndependentFinanceReview\'').first();assert.ok(r);});
 await t('REPLACE finance evidence rejected',async()=>{const row=await db.prepare('SELECT * FROM consultation_capture_reviews LIMIT 1').first();const names=Object.keys(row);await assert.rejects(db.prepare('INSERT OR REPLACE INTO consultation_capture_reviews('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')').bind(...names.map(k=>row[k])).run());});

 await t('REPLACE finance evidence through unique audit ID rejected',async()=>{const row=await db.prepare('SELECT * FROM consultation_capture_reviews LIMIT 1').first();row.id=crypto.randomUUID();row.sequence++;const names=Object.keys(row);await assert.rejects(db.prepare('REPLACE INTO consultation_capture_reviews('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')').bind(...names.map(k=>row[k])).run());assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_capture_reviews').first()).n,1);});

 await t('duplicate finance review command rolls back new evidence',async()=>{const before=(await db.prepare('SELECT COUNT(*) n FROM consultation_capture_reviews').first()).n;await assert.rejects(captures.recordFinanceReview(qyReq,{...financeInput,expectedVersion:bound.rowVersion}));assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_capture_reviews').first()).n,before);});
 const reviewedWorkflow=createConsultationWorkflow({db,origin,keys,stepup:service,contacts,productId:1,practitionerId:1,policies,countryCodes:['MY'],bookingPolicy:{version:'synthetic-v1',hash:'b'.repeat(64)},readCaptureEvidence:captures.readEvidence});
 const confirmedFinance=await reviewedWorkflow.reconcilePayment(qyReq,{id:b.id,expectedVersion:bound.rowVersion,commandId:'finance-explicit-confirm'});
 await t('explicit QY action confirms independent verified timely full payment',()=>assert.equal(confirmedFinance.state,'Confirmed'));
 await existingFinanceOrder(4);
 const lateBound=await captures.linkOrder(qyReq,{id:paidUnknown.id,orderId:4,expectedVersion:unresolved.rowVersion,commandId:'late-order-link'});
 const lateOffer=await db.prepare('SELECT accepted_at FROM consultation_offers WHERE id=?').bind(paidUnknown.offer.id).first();
 const earlierFinance=await captures.recordFinanceReview(qyReq,{id:paidUnknown.id,expectedVersion:lateBound.rowVersion,commandId:'contradicting-finance-time',capturedAt:lateOffer.accepted_at+1,supportingEvidenceReference:'synthetic-finance-time',supportingEvidenceHash:'d'.repeat(64),independentlyFinanceVerified:true});
 const providerTime=Date.now()-1;
 const providerPolicy=createCaptureReview({db,origin,keys,readProviderCaptureEvidence:async args=>({source:'ProviderVerified',providerTimestampVerified:true,authoritative:true,verificationStatus:'Verified',...args,amountSen:130000,currency:'MYR',capturedAt:providerTime,guardSql:'SELECT 1 FROM payments WHERE id=? AND status=\'Paid\'',guardValues:[4]})});
 const lateWorkflow=createConsultationWorkflow({db,origin,keys,stepup:service,contacts,productId:1,practitionerId:1,policies,countryCodes:['MY'],bookingPolicy:{version:'synthetic-v1',hash:'b'.repeat(64)},readCaptureEvidence:providerPolicy.readEvidence});
 await t('known late provider capture cannot be overridden by earlier finance claim',async()=>assert.equal((await lateWorkflow.reconcilePayment(qyReq,{id:paidUnknown.id,expectedVersion:earlierFinance.rowVersion,commandId:'provider-priority-review'})).state,'ExceptionReview'));

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
