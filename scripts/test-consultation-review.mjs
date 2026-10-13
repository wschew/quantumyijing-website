import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createSyntheticWorkflow} from './consultation-workflow-local-fixture.mjs';
const origin='https://127.0.0.1:8789',password=randomBytes(32).toString('hex');
const fixture=await createSyntheticWorkflow({origin,password,syntheticOnly:true});let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name);}
let cookie='',csrf='';
async function review(input,overrides={}){const response=await fixture.handler(new Request(origin+'/api/consultation/qy/account/review',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-qy-consultation-csrf':csrf,...overrides},body:JSON.stringify(input)}));return {status:response.status,data:await response.json()};}
const input={customerId:1,channel:'whatsapp',contact:'60120000101',evidenceReference:'LOCAL-TEST-ALEX-001',independentlyVerified:true};
async function counts(){return Promise.all(['consultation_account_contacts','consultation_account_events','consultation_contact_nonces','consultation_account_stepups'].map(async table=>(await fixture.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n));}
try{
 await test('unauthenticated review does not reveal validation details',async()=>{const r=await review(input);assert.equal(r.status,401);assert.equal(r.data.code,'REVIEW_AUTH_REQUIRED');});
 const login=await fixture.handler(new Request(origin+'/api/consultation/qy/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'qy-local-test',password})}));assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrfToken;
 await test('ambiguous international contact fails precise format validation',async()=>{const before=await counts(),r=await review({...input,contact:'447700900101'});assert.equal(r.status,400);assert.equal(r.data.code,'REVIEW_CONTACT_FORMAT');assert.deepEqual(await counts(),before);assert.ok(!JSON.stringify(r.data).includes(input.contact));});
 await test('correctly formatted independent review succeeds',async()=>{const r=await review(input);assert.equal(r.status,200);assert.equal(r.data.code,'REVIEW_RECORDED');assert.deepEqual(await counts(),[1,1,1,0]);});
 const original=await fixture.db.prepare('SELECT id,ciphertext,evidence_reference FROM consultation_account_contacts').first();
 await test('duplicate submission rejects and rolls back all side effects',async()=>{const before=await counts();for(const contact of ['0120000101','60120000101','+60120000101']){const r=await review({...input,contact});assert.equal(r.status,409);assert.equal(r.data.code,'REVIEW_REJECTED');assert.deepEqual(await counts(),before);assert.deepEqual(await fixture.db.prepare('SELECT id,ciphertext,evidence_reference FROM consultation_account_contacts').first(),original);}});
 await test('missing independent attestation fails',async()=>{const r=await review({...input,customerId:2,contact:'+'+input.contact,independentlyVerified:false});assert.equal(r.status,409);assert.equal(r.data.code,'REVIEW_REJECTED');assert.deepEqual(await counts(),[1,1,1,0]);});
 await test('missing evidence fails without persistence',async()=>{const r=await review({...input,customerId:2,contact:'+'+input.contact,evidenceReference:''});assert.equal(r.status,409);assert.deepEqual(await counts(),[1,1,1,0]);});
 await test('missing CSRF fails before review',async()=>{const r=await review({...input,contact:'+'+input.contact},{'x-qy-consultation-csrf':''});assert.equal(r.status,401);assert.equal(r.data.code,'REVIEW_AUTH_REQUIRED');});
 await test('foreign Origin remains blocked',async()=>assert.equal((await review(input,{origin:'https://foreign.invalid'})).status,403));
 await test('review does not automatically create customer verification proof',async()=>assert.equal((await fixture.db.prepare('SELECT COUNT(*) n FROM consultation_account_stepups').first()).n,0));
 await test('local integrity remains valid',async()=>{assert.equal((await fixture.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.equal(Object.values(await fixture.db.prepare('PRAGMA quick_check').first())[0],'ok');});
}finally{fixture.dispose();}
console.log(`RESULT ${passed} passed, 0 failed; synthetic review only`);
