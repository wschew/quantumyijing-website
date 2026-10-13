import assert from 'node:assert/strict';
import https from 'node:https';
import net from 'node:net';
import {createSyntheticWorkflow} from './consultation-workflow-local-fixture.mjs';
import {startSyntheticServer} from './run-consultation-workflow-local.mjs';
let passed=0;
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const password='Synthetic-local-test-password-only';
const origin='https://127.0.0.1:8789';
await test('synthetic factory rejects Production origin',()=>assert.rejects(createSyntheticWorkflow({origin:'https://quantumyijing.com',password,syntheticOnly:true})));
await test('synthetic factory requires explicit mode',()=>assert.rejects(createSyntheticWorkflow({origin,password})));
const fixture=await createSyntheticWorkflow({origin,password,syntheticOnly:true});
function client(qy=false){
 const jar=new Map();let csrf='';
 return {async call(path,data){
  const headers={cookie:Array.from(jar.entries()).map(([k,v])=>k+'='+v).join('; ')};
  if(data!==undefined){headers.origin=origin;headers['content-type']='application/json';headers[qy?'x-qy-consultation-csrf':'x-qy-consultation-customer-csrf']=csrf;}
  const response=await fixture.handler(new Request(origin+'/api/consultation/'+path,{method:data===undefined?'GET':'POST',headers,...(data===undefined?{}:{body:JSON.stringify(data)})}));
  const cookie=response.headers.get('set-cookie');if(cookie){const [name,value]=cookie.split(';')[0].split('=');jar.set(name,value);assert.ok(cookie.includes('Secure')&&cookie.includes('HttpOnly'));}
  const result=await response.json();if(result.csrfToken)csrf=result.csrfToken;return {status:response.status,data:result};
 }};
}
const customer=client(),qy=client(true),outsider=client(true);
try{
 await test('mock outbox requires dedicated QY authentication',async()=>assert.equal((await outsider.call('qy/local/outbox')).status,409));
 await test('incorrect local password rejected',async()=>assert.equal((await qy.call('qy/login',{username:'qy-local-test',password:'incorrect-synthetic-password'})).status,401));
 await test('dedicated local QY login succeeds',async()=>assert.equal((await qy.call('qy/login',{username:'qy-local-test',password})).status,200));
 await test('synthetic portal session establishes isolated context',async()=>{assert.equal((await customer.call('local/customer-login',{})).status,200);assert.equal((await customer.call('context',{})).status,200);});
 await test('stored synthetic email is not trusted automatically',async()=>assert.equal((await customer.call('account/options')).data.manualReviewRequired,true));
 await test('customer cannot enroll canonical account contact',async()=>assert.equal((await customer.call('qy/account/review',{customerId:1,channel:'whatsapp',contact:'+19999999999',evidenceReference:'synthetic-independent-review',independentlyVerified:true})).status,409));
 const review=await qy.call('qy/account/review',{customerId:1,channel:'whatsapp',contact:'+19999999999',evidenceReference:'synthetic-independent-review',independentlyVerified:true});assert.equal(review.status,200);
 const issued=await customer.call('account/challenge',{contactId:review.data.id});assert.equal(issued.status,200);
 const inbox=await qy.call('qy/local/outbox');assert.equal(inbox.status,200);const message=inbox.data.records.find(r=>r.challengeId===issued.data.id);
 await test('account OTP is available only in authenticated local mock outbox',()=>assert.ok(message&&/^\d{8}$/.test(message.code)&&issued.data.code===undefined));
 await test('account-bound OTP verification succeeds end to end',async()=>assert.equal((await customer.call('account/confirm',{challengeId:issued.data.id,code:message.code})).data.verified,true));
 const reportChallenge=await customer.call('contact/challenge',{channel:'whatsapp',contact:'+19999999999'});assert.equal(reportChallenge.status,200);
 const instructions=await qy.call('qy/contact/instructions?id='+reportChallenge.data.challengeId);assert.equal(instructions.status,200);
 await qy.call('qy/contact/delivered',{challengeId:reportChallenge.data.challengeId,expectedRevision:instructions.data.revision});
 await customer.call('contact/confirm',{challengeId:reportChallenge.data.challengeId,code:instructions.data.code});
 const intake={fullName:'Synthetic Adult',calculationGender:'male',birthDate:'2000-02-29',birthTimePrecision:'unknown',birthTime:null,birthCity:'Synthetic City',birthCountry:'MY',questions:'Synthetic private question',reportChannel:'whatsapp',selfBooking:true,adultAcknowledged:true,privacyAcknowledgement:{accepted:true,version:'synthetic-local-v1'}};
 async function offered(hours){
  const submitted=await customer.call('bookings',{commandId:crypto.randomUUID(),intake});assert.equal(submitted.status,200);const id=submitted.data.id;
  const reviewed=await qy.call('qy/status',{id,to:'UnderReview',expectedVersion:0,commandId:crypto.randomUUID()});assert.equal(reviewed.status,200);
  const proposed=await qy.call('qy/offer',{id,startAt:Date.now()+hours*3600000,expectedVersion:reviewed.data.rowVersion,commandId:crypto.randomUUID()});assert.equal(proposed.status,200);
  const offer=(await customer.call('offer?id='+id)).data.offer;
  const accepted=await customer.call('offer/accept',{id,expectedVersion:proposed.data.rowVersion,commandId:crypto.randomUUID(),acknowledged:true,policyHash:offer.policyHash,snapshotHash:offer.snapshotHash});assert.equal(accepted.status,200);return {id,rowVersion:accepted.data.rowVersion};
 }
 const first=await offered(96);
 await test('missing capture evidence causes explicit ExceptionReview',async()=>{const r=await qy.call('qy/payment/reconcile',{id:first.id,expectedVersion:first.rowVersion,commandId:crypto.randomUUID()});assert.equal(r.status,200);assert.equal(r.data.state,'ExceptionReview');first.rowVersion=r.data.rowVersion;});
 const capture=await qy.call('qy/local/capture',{id:first.id,expectedVersion:first.rowVersion,mode:'timely'});assert.equal(capture.status,200);first.rowVersion=capture.data.rowVersion;
 await test('explicit QY review confirms only verified full timely mock capture',async()=>{const r=await qy.call('qy/payment/reconcile',{id:first.id,expectedVersion:first.rowVersion,commandId:crypto.randomUUID()});assert.equal(r.status,200);assert.equal(r.data.state,'Confirmed');first.rowVersion=r.data.rowVersion;});
 await test('duplicate capture cannot replace existing order evidence',async()=>assert.equal((await qy.call('qy/local/capture',{id:first.id,expectedVersion:first.rowVersion,mode:'timely'})).status,409));
 await test('confirmed consultation cannot complete before session end',async()=>assert.equal((await qy.call('qy/status',{id:first.id,to:'Completed',expectedVersion:first.rowVersion,commandId:crypto.randomUUID()})).status,409));
 const late=await offered(120);const lateCapture=await qy.call('qy/local/capture',{id:late.id,expectedVersion:late.rowVersion,mode:'late'});assert.equal(lateCapture.status,200);
 await test('late capture remains review-only',async()=>assert.equal((await qy.call('qy/payment/reconcile',{id:late.id,expectedVersion:lateCapture.data.rowVersion,commandId:crypto.randomUUID()})).data.state,'ExceptionReview'));
 const uncertain=await offered(144);const unknownCapture=await qy.call('qy/local/capture',{id:uncertain.id,expectedVersion:uncertain.rowVersion,mode:'unknown'});assert.equal(unknownCapture.status,200);
 let uncertainReview;
 await test('unknown capture never confirms',async()=>{uncertainReview=await qy.call('qy/payment/reconcile',{id:uncertain.id,expectedVersion:unknownCapture.data.rowVersion,commandId:crypto.randomUUID()});assert.equal(uncertainReview.data.state,'ExceptionReview');});
 const financeBody={id:uncertain.id,expectedVersion:uncertainReview.data.rowVersion,commandId:crypto.randomUUID(),capturedAt:Date.now()-1,supportingEvidenceReference:'synthetic-independent-finance-proof',supportingEvidenceHash:'c'.repeat(64),independentlyFinanceVerified:true};
 await test('customer cannot assert independent finance verification',async()=>assert.equal((await customer.call('qy/payment/finance-review',financeBody)).status,409));
 await test('finance fallback rejects missing evidence before any state change',async()=>assert.equal((await qy.call('qy/payment/finance-review',{...financeBody,supportingEvidenceHash:undefined})).status,409));
 const annotated=await qy.call('qy/payment/finance-review',financeBody);
 await test('finance review endpoint preserves review state',()=>{assert.equal(annotated.status,200);assert.equal(annotated.data.state,'ExceptionReview');assert.equal(annotated.data.reviewRecorded,true);});
 await test('finance annotation includes independent audit evidence',async()=>assert.equal((await fixture.db.prepare("SELECT COUNT(*) n FROM consultation_capture_reviews r JOIN consultation_capture_audit a ON a.id=r.audit_id AND a.event='IndependentFinanceReview'").first()).n,1));
 await test('explicit reconciliation uses documented finance fallback',async()=>{const resolved=await qy.call('qy/payment/reconcile',{id:uncertain.id,expectedVersion:annotated.data.rowVersion,commandId:crypto.randomUUID()});assert.equal(resolved.status,200);assert.equal(resolved.data.state,'Confirmed');});
 const raced=await offered(168);const raceCapture=await qy.call('qy/local/capture',{id:raced.id,expectedVersion:raced.rowVersion,mode:'timely'});assert.equal(raceCapture.status,200);
 const originalBatch=fixture.db.batch;let fired=false;
 fixture.db.batch=async plan=>{if(!fired){fired=true;await fixture.db.prepare("UPDATE synthetic_capture_evidence SET status='Revoked' WHERE booking_id=?").bind(raced.id).run();}return originalBatch(plan);};
 await test('revoked capture race aborts confirmation atomically',async()=>{const r=await qy.call('qy/payment/reconcile',{id:raced.id,expectedVersion:raceCapture.data.rowVersion,commandId:crypto.randomUUID()});assert.equal(r.status,409);const b=await fixture.db.prepare('SELECT state,row_version FROM consultation_bookings WHERE id=?').bind(raced.id).first();assert.equal(b.state,'PaymentPending');assert.equal(b.row_version,raceCapture.data.rowVersion);assert.equal((await fixture.db.prepare('SELECT state FROM consultation_slot_reservations WHERE booking_id=?').bind(raced.id).first()).state,'Held');});
 fixture.db.batch=originalBatch;
 await test('customer cannot invoke capture simulation',async()=>assert.equal((await customer.call('qy/local/capture',{id:raced.id,expectedVersion:raceCapture.data.rowVersion,mode:'timely'})).status,409));
 await test('no PDFs or real financial providers involved',async()=>{assert.equal((await fixture.db.prepare('SELECT COUNT(*) n FROM consultation_reports').first()).n,0);assert.equal((await fixture.db.prepare('SELECT COUNT(*) n FROM synthetic_capture_evidence').first()).n,4);});
 await test('logout invalidates QY mock outbox access',async()=>{assert.equal((await qy.call('qy/logout',{})).status,200);assert.equal((await qy.call('qy/local/outbox')).status,409);});
 await test('synthetic database integrity remains valid',async()=>{assert.equal((await fixture.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.equal(Object.values(await fixture.db.prepare('PRAGMA quick_check').first())[0],'ok');});
}finally{fixture.dispose();}
const reservation=net.createServer();await new Promise(ok=>reservation.listen(0,'127.0.0.1',ok));const port=reservation.address().port;await new Promise(ok=>reservation.close(ok));
const running=await startSyntheticServer({port,password});
function get(path){return new Promise((ok,no)=>{const r=https.request(running.origin+path,{method:'GET',rejectUnauthorized:false,agent:false},res=>{let bytes=0;res.on('data',chunk=>bytes+=chunk.length);res.on('end',()=>ok({status:res.statusCode,headers:res.headers,bytes}));});r.once('error',no);r.end();});}
try{
 for(const path of ['/customer.html','/qy.html','/workflow-ui.js','/workflow.css'])await test('HTTPS loopback serves '+path,async()=>{const r=await get(path);assert.equal(r.status,200);assert.ok(r.bytes>0);assert.equal(r.headers['cache-control'],'no-store');assert.ok(r.headers['content-security-policy'].includes("connect-src 'self'"));});
 await test('local server exposes no Production admin endpoint',async()=>assert.equal((await get('/api/admin?action=stats')).status,404));
 await test('local server refuses private outbox without authentication',async()=>assert.equal((await get('/api/consultation/qy/local/outbox')).status,409));
}finally{await running.close();}
console.log(`RESULT ${passed} passed, 0 failed; synthetic in-memory and HTTPS loopback only`);
