// Synthetic, local-only regression tests. No credentials, customer records or provider calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {validatePrivateIntake,withdrawConsent} from '../functions/lib/consultation/intake-validation.js';
import {encryptIntake,decryptIntake} from '../functions/lib/consultation/intake-crypto.js';
import {createIntakeBoundary,operationalReceipt,intakeUpdatePlan,intakeMetadataPlan,withdrawalPlan,readPersistedEnvelope} from '../functions/lib/consultation/intake-boundary.js';
import {intakeRetention,retentionReview,consentAllows,createConsentReader,PURPOSES} from '../functions/lib/consultation/intake-policy.js';
import {createConsultationAuth,COOKIE_NAME} from '../functions/lib/consultation/auth.js';
import {tokenHash,randomSecret} from '../functions/lib/consultation/auth-crypto.js';
let passed=0;
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const now=Date.parse('2026-10-12T00:00:00Z');
const hash='a'.repeat(64);
const policies=Object.fromEntries(PURPOSES.map(p=>[p,{version:'v1',hash}]));
const contact={customerId:1,verified:true,expiresAt:now+100000,channel:'email',reference:'synthetic-contact',value:'synthetic@example.invalid'};
const input={fullName:'Synthetic Person',calculationGender:'female',birthDate:'2000-02-29',birthTimePrecision:'exact',birthTime:'12:30',birthCity:'Synthetic City',birthCountry:'MY',questions:'Synthetic private question',reportChannel:'email',selfBooking:true,adultAcknowledged:true,privacyAcknowledgement:{accepted:true,version:'v1'}};
const options={now,customerId:1,contact,policies,countryCodes:['MY','SG']};
const validate=(patch={})=>validatePrivateIntake({...input,...patch},options);
const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
const provider=async id=>{if(id!=='key-1')throw Error('unsupported');return key};
const context={id:'intake-1',customerId:1,payloadVersion:1,schemaVersion:1,keyId:'key-1'};
const privateData=validate().privateData;
await test('valid adult self-booking',()=>assert.equal(privateData.birthDate,input.birthDate));
for(const [name,patch] of [
 ['underage',{birthDate:'2010-01-01'}],['third party',{selfBooking:false}],['truthy self',{selfBooking:'true'}],
 ['no adult acknowledgement',{adultAcknowledged:false}],['forged owner',{customerId:1}],['forged contact',{verified:true}],
 ['missing privacy',{privacyAcknowledgement:null}],['wrong policy',{privacyAcknowledgement:{accepted:true,version:'v0'}}],
 ['truthy consent',{privacyAcknowledgement:{accepted:'true',version:'v1'}}],['bad leap day',{birthDate:'2001-02-29'}],
 ['invalid location',{birthCountry:'XX'}],['empty city',{birthCity:''}],['oversize questions',{questions:'x'.repeat(2001)}],
 ['invalid time',{birthTime:'24:00'}],['unknown time with value',{birthTimePrecision:'unknown'}],['invalid gender',{calculationGender:'other'}],
 ['contact channel mismatch',{reportChannel:'whatsapp'}]
])await test(name,()=>assert.throws(()=>validate(patch)));
await test('adult MYT birthday boundary',()=>assert.doesNotThrow(()=>validate({birthDate:'2008-10-12'})));
await test('before adult birthday',()=>assert.throws(()=>validate({birthDate:'2008-10-13'})));
await test('leap birthday before March 1',()=>assert.throws(()=>validatePrivateIntake({...input,birthDate:'2008-02-29'},{...options,now:Date.parse('2026-02-28T01:00:00Z')})));
await test('leap birthday March 1 adult',()=>assert.doesNotThrow(()=>validatePrivateIntake({...input,birthDate:'2008-02-29'},{...options,now:Date.parse('2026-03-01T01:00:00Z')})));
await test('approximate time',()=>assert.equal(validate({birthTimePrecision:'approximate'}).privateData.birthTime,'12:30'));
await test('unknown time null',()=>assert.equal(validate({birthTimePrecision:'unknown',birthTime:null}).privateData.birthTime,null));
await test('verified WhatsApp preference',()=>assert.equal(validatePrivateIntake({...input,reportChannel:'whatsapp'},{...options,contact:{...contact,channel:'whatsapp',value:'+60000000000'}}).privateData.reportChannel,'whatsapp'));
await test('unverified contact denied',()=>assert.throws(()=>validatePrivateIntake(input,{...options,contact:{...contact,verified:false}})));
await test('expired contact denied',()=>assert.throws(()=>validatePrivateIntake(input,{...options,contact:{...contact,expiresAt:now}})));
for(const value of [false,0,'',null,'true',[]])await test('invalid optional consent '+JSON.stringify(value),()=>assert.throws(()=>validate({futureCalculationsConsent:value})));
await test('optional consents default declined',()=>assert.deepEqual(validate().consents.slice(1).map(x=>x.state),['Declined','Declined']));
await test('empty server policy rejected',()=>assert.throws(()=>validatePrivateIntake(input,{...options,policies:{...policies,consultation_privacy:{version:'',hash}}})));
const encrypted=await encryptIntake(privateData,context,provider);
await test('encryption round trip',async()=>assert.deepEqual(await decryptIntake(encrypted,provider),privateData));
await test('ciphertext no plaintext',()=>assert.equal(Buffer.from(encrypted.ciphertext).includes(Buffer.from(input.questions)),false));
await test('envelope explicit fields only',()=>assert.deepEqual(Object.keys(encrypted),['id','customerId','payloadVersion','schemaVersion','keyId','nonce','ciphertext']));
await test('fresh random nonce',async()=>assert.notDeepEqual((await encryptIntake(privateData,context,provider)).nonce,encrypted.nonce));
for(const [name,patch] of [['owner',{customerId:2}],['id',{id:'other'}],['payload version',{payloadVersion:2}],['key',{keyId:'key-2'}],['schema',{schemaVersion:2}],['nonce',{nonce:new Uint8Array(12)}],['ciphertext',{ciphertext:Uint8Array.from(encrypted.ciphertext,x=>x^1)}]])
 await test('tamper '+name,()=>assert.rejects(decryptIntake({...encrypted,...patch},provider),/^Error: Private intake cryptography rejected$/));
for(const extra of [{birthDate:input.birthDate},{questions:input.questions},{nested:{birthDate:input.birthDate}},{revision:1}])
 await test('unknown context '+Object.keys(extra)[0],()=>assert.rejects(encryptIntake(privateData,{...context,...extra},provider),/^Error: Private intake cryptography rejected$/));
await test('unknown envelope rejected',()=>assert.rejects(decryptIntake({...encrypted,questions:input.questions},provider)));
await test('object key ID rejected',()=>assert.rejects(encryptIntake(privateData,{...context,keyId:{value:'key-1'}},provider)));
await test('malformed key ID rejected',()=>assert.rejects(encryptIntake(privateData,{...context,keyId:'bad/key'},provider)));
await test('missing key denied',()=>assert.rejects(decryptIntake(encrypted,async()=>null)));
await test('extractable key rejected',async()=>{const k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);await assert.rejects(encryptIntake(privateData,context,async()=>k));});
await test('short AES key rejected',async()=>{const k=await crypto.subtle.generateKey({name:'AES-GCM',length:128},false,['encrypt','decrypt']);await assert.rejects(encryptIntake(privateData,context,async()=>k));});
await test('generic error no private details',async()=>{await assert.rejects(decryptIntake({...encrypted,ciphertext:new Uint8Array(16)},provider),e=>e.message==='Private intake cryptography rejected'&&!e.message.includes(input.questions));});
const boundary=createIntakeBoundary({clock:()=>now,verifyCustomer:async()=>({authenticated:true,customerId:1,expiresAt:now+10000}),verifyContact:async()=>contact});
const proof=await boundary.customer(new Request('https://synthetic.invalid'),'email');
await test('verified owner allowed',()=>assert.equal(boundary.requireOwner(proof,encrypted),true));
await test('cross customer denied',()=>assert.throws(()=>boundary.requireOwner(proof,{...encrypted,customerId:2})));
await test('forged proof denied',()=>assert.throws(()=>boundary.requireOwner({...proof},encrypted)));
await test('unwired access denied',()=>assert.rejects(createIntakeBoundary().customer(new Request('https://synthetic.invalid'),'email')));
await test('expired verified identity denied',()=>assert.rejects(createIntakeBoundary({clock:()=>now,verifyCustomer:async()=>({authenticated:true,customerId:1,expiresAt:now}),verifyContact:async()=>contact}).customer(new Request('https://synthetic.invalid'),'email')));
await test('verifier failure sanitized',()=>assert.rejects(createIntakeBoundary({clock:()=>now,verifyCustomer:async()=>{throw Error(input.questions)},verifyContact:async()=>contact}).customer(new Request('https://synthetic.invalid'),'email'),e=>e.message==='Customer authorization denied'));
await test('operational receipt excludes private data',()=>assert.deepEqual(Object.keys(operationalReceipt({...encrypted,revision:1,privateData})),['id','revision']));
await test('five calendar years leap clamp',()=>assert.equal(intakeRetention({status:'Completed',completedAt:Date.parse('2024-02-29T01:00:00Z')}),Date.parse('2029-02-28T15:59:59.999Z')));
await test('MYT date crosses UTC midnight',()=>assert.equal(intakeRetention({status:'Completed',completedAt:Date.parse('2026-12-31T17:00:00Z')}),Date.parse('2032-01-01T15:59:59.999Z')));
for(const status of ['FinalExpired','FinalDeclined','FinalCancelled'])await test(status+' 90 days',()=>assert.equal(intakeRetention({status,terminalAt:Date.parse('2026-01-01T01:00:00Z')}),Date.parse('2026-04-01T15:59:59.999Z')));
await test('legal hold preserves overdue',()=>assert.equal(retentionReview({retentionUntil:now-1,lawfulHold:true},now),'Held'));
await test('deletion request only manual review',()=>assert.equal(retentionReview({retentionUntil:now+100,deletionRequested:true},now),'ManualReview'));
await test('retention approaching',()=>assert.equal(retentionReview({retentionUntil:now+86400000},now),'Approaching'));
await test('expiry exact instant not deletion',()=>assert.equal(retentionReview({retentionUntil:now},now),'Approaching'));
await test('one ms after expiry review eligible',()=>assert.equal(retentionReview({retentionUntil:now-1},now),'DueForReview'));
await test('future consent no retention extension',()=>assert.equal(intakeRetention({status:'Completed',completedAt:now,futureCalculationsConsent:true}),intakeRetention({status:'Completed',completedAt:now})));
await test('pending not terminal',()=>assert.equal(intakeRetention({status:'Pending'}),null));
await test('contradictory retention rejected',()=>assert.throws(()=>intakeRetention({status:'Completed',completedAt:now,terminalAt:now})));
function sqliteBinding(raw) {
 return {prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return raw.prepare(sql).get(...values)??null},async all(){return {results:raw.prepare(sql).all(...values)}},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...values).changes)}}}}},
 async batch(plan){raw.exec('BEGIN');try{const result=[];for(const p of plan)result.push(await p.run());raw.exec('COMMIT');return result}catch(e){raw.exec('ROLLBACK');throw e}}};
}
const sql=readFileSync(new URL('../database/migrate-c1-consultation-customer-intake.sql',import.meta.url),'utf8');
function statements(source){return source.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|INSERT|$)/).map(x=>x.trim()).filter(Boolean)}
async function schema(db){await db.prepare('CREATE TABLE customers(id INTEGER PRIMARY KEY)').run();await db.prepare('INSERT INTO customers VALUES(1),(2)').run();for(const s of statements(sql))await db.prepare(s).run();}
async function execute(db,plan){return db.batch(plan.map(p=>db.prepare(p.sql).bind(...p.values)));}
function command(commandId,revision,time=now+10){return {commandId,expectedRevision:revision,fingerprintKeyId:'hmac-1',fingerprint:'b'.repeat(64),now:time};}
async function persistenceChecks(db,label) {
 const t=(name,fn)=>test(label+' '+name,fn);
 await schema(db);
 await t('replacement guards demonstrated with recursive triggers off',async()=>assert.equal((await db.prepare('PRAGMA recursive_triggers').first()).recursive_triggers,0));
 await db.prepare('INSERT INTO consultation_customer_intakes(id,customer_id,revision,payload_version,schema_version,key_id,nonce,ciphertext,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(encrypted.id,1,1,1,1,encrypted.keyId,encrypted.nonce,encrypted.ciphertext,now,now).run();
 const consentSQL='INSERT INTO consultation_intake_consents(id,intake_id,customer_id,purpose,sequence,policy_version,policy_hash,state,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)';
 for(const purpose of PURPOSES)await db.prepare(consentSQL).bind('grant-'+purpose,encrypted.id,1,purpose,1,'v1',hash,'Granted',now).run();
 const reader=createConsentReader(db);
 const scope=purpose=>({intakeId:encrypted.id,customerId:1,purpose});
 const grant=await reader.latest(scope('future_calculations'));
 await t('trusted current grant allowed',async()=>assert.equal(await consentAllows(grant,'future_calculations',policies.future_calculations),true));
 await t('untrusted forged grant rejected',async()=>assert.equal(await consentAllows({...grant},'future_calculations',policies.future_calculations),false));
 await t('incomplete grant rejected',async()=>assert.equal(await consentAllows({purpose:'future_calculations',state:'Granted'},'future_calculations',{}),false));
 for(const policy of [{},{version:'v1'},{hash},{version:'',hash},{version:'v1',hash:'invalid'}])await t('malformed policy '+JSON.stringify(Object.keys(policy)),async()=>assert.equal(await consentAllows(grant,'future_calculations',policy),false));
 for(const field of ['purpose','policy_version','policy_hash','id','customer_id','occurred_at'])await t('malformed persisted evidence '+field,async()=>{const malformed={...grant};delete malformed[field];const invalidReader=createConsentReader({prepare(){return {bind(){return this},async first(){return malformed}}}});assert.equal(await invalidReader.latest(scope('future_calculations')),null)});
 await t('purpose mismatch rejected',async()=>assert.equal(await consentAllows(grant,'marketing',policies.marketing),false));
 await t('forged withdrawal snapshot rejected',()=>assert.throws(()=>withdrawConsent({...grant},now+1)));
 await t('backdated withdrawal rejected',()=>assert.throws(()=>withdrawConsent(grant,now-1)));
 const withdrawal=withdrawConsent(grant,now+1,{eventId:'withdraw-1'});
 await t('new withdrawal identity and sequence',()=>{assert.notEqual(withdrawal.id,grant.id);assert.equal(withdrawal.sequence,2);assert.equal(withdrawal.customer_id,1)});
 const stalePlan=withdrawalPlan(withdrawConsent(grant,now+2,{eventId:'withdraw-race'}),command('withdraw-race',1,now+2));
 await t('withdrawal persisted atomically',async()=>{await execute(db,withdrawalPlan(withdrawal,command('withdraw-1',1,now+1)));assert.equal((await reader.latest(scope('future_calculations'))).state,'Withdrawn');assert.equal((await db.prepare('SELECT state FROM consultation_intake_consents WHERE id=?').bind(grant.id).first()).state,'Granted')});
 await t('old grant denied after withdrawal',async()=>assert.equal(await consentAllows(grant,'future_calculations',policies.future_calculations),false));
 await t('withdrawn current consent denied',async()=>assert.equal(await consentAllows(await reader.latest(scope('future_calculations')),'future_calculations',policies.future_calculations),false));
 const counts=async()=>JSON.stringify((await db.prepare('SELECT revision,payload_version FROM consultation_customer_intakes').first()))+JSON.stringify((await db.prepare('SELECT count(*) n FROM consultation_intake_commands').first()))+JSON.stringify((await db.prepare('SELECT count(*) n FROM consultation_intake_access_audit').first()));
 await t('concurrent stale withdrawal all effects rollback',async()=>{const before=await counts();await assert.rejects(execute(db,stalePlan));assert.equal(await counts(),before)});
 await t('stale grant with fresh metadata revision rejected',async()=>{const before=await counts();await assert.rejects(execute(db,withdrawalPlan(withdrawConsent(grant,now+3),command('stale-grant',2,now+3))));assert.equal(await counts(),before)});
 await t('duplicate withdrawal command rejected',async()=>{const before=await counts();await assert.rejects(execute(db,withdrawalPlan(withdrawal,command('withdraw-1',2,now+1))));assert.equal(await counts(),before)});
 // Grant again with fresh evidence, then deliberately collide the existing command receipt.
 await db.prepare(consentSQL).bind('regrant',encrypted.id,1,'future_calculations',3,'v1',hash,'Granted',now+4).run();
 const regrant=await reader.latest(scope('future_calculations'));
 await t('fresh acknowledgement can regrant',async()=>assert.equal(await consentAllows(regrant,'future_calculations',policies.future_calculations),true));
 await t('command collision rolls back new withdrawal',async()=>{const before=await counts();await assert.rejects(execute(db,withdrawalPlan(withdrawConsent(regrant,now+5),command('withdraw-1',2,now+5))),/command append rejected/);assert.equal(await counts(),before);assert.equal((await reader.latest(scope('future_calculations'))).id,'regrant')});
 for(const verb of ['INSERT OR REPLACE','REPLACE']) {
  await t(verb+' consent PK collision blocked',async()=>{await assert.rejects(db.prepare(verb+' INTO consultation_intake_consents VALUES(?,?,?,?,?,?,?,?,?)').bind('regrant',encrypted.id,1,'future_calculations',4,'v1',hash,'Declined',now+6).run(),/consent append rejected/);assert.equal((await reader.latest(scope('future_calculations'))).id,'regrant')});
  await t(verb+' consent unique collision blocked',async()=>{await assert.rejects(db.prepare(verb+' INTO consultation_intake_consents VALUES(?,?,?,?,?,?,?,?,?)').bind('different-id',encrypted.id,1,'future_calculations',3,'v1',hash,'Declined',now+6).run(),/consent append rejected/);assert.equal((await reader.latest(scope('future_calculations'))).state,'Granted')});
  await t(verb+' command PK collision blocked',async()=>{await assert.rejects(db.prepare(verb+" INTO consultation_intake_commands VALUES(1,'withdraw-1',?,'Metadata','hmac-1',?,2,?)").bind(encrypted.id,'c'.repeat(64),now+6).run(),/command append rejected/);assert.equal((await db.prepare("SELECT operation FROM consultation_intake_commands WHERE command_id='withdraw-1'").first()).operation,'Withdraw')});
  const auditRow=await db.prepare('SELECT id,event FROM consultation_intake_access_audit LIMIT 1').first();
  await t(verb+' audit PK collision blocked',async()=>{await assert.rejects(db.prepare(verb+" INTO consultation_intake_access_audit VALUES(?,?,1,'CustomerRead','Customer','customer-1',?)").bind(auditRow.id,encrypted.id,now+6).run(),/audit append rejected/);assert.equal((await db.prepare('SELECT event FROM consultation_intake_access_audit WHERE id=?').bind(auditRow.id).first()).event,auditRow.event)});
 }
 for(const [table,message] of [['consultation_intake_commands','command evidence immutable'],['consultation_intake_access_audit','intake audit immutable']]){
  await t(table+' UPDATE rejected',()=>assert.rejects(db.prepare('UPDATE '+table+' SET occurred_at=occurred_at+1').run(),new RegExp(message)));
  await t(table+' DELETE rejected',()=>assert.rejects(db.prepare('DELETE FROM '+table).run(),new RegExp(message)));
 }
 await t('consent sequence gap rejected',()=>assert.rejects(db.prepare(consentSQL).bind('gap',encrypted.id,1,'marketing',3,'v1',hash,'Granted',now+7).run(),/consent append rejected/));
 await t('backdated append rejected',()=>assert.rejects(db.prepare(consentSQL).bind('backdated',encrypted.id,1,'marketing',2,'v1',hash,'Granted',now-1).run(),/consent append rejected/));
 await t('missing SQL policy version rejected',()=>assert.rejects(db.prepare(consentSQL).bind('null-version',encrypted.id,1,'marketing',2,null,hash,'Granted',now+7).run()));
 await t('missing SQL policy hash rejected',()=>assert.rejects(db.prepare(consentSQL).bind('null-hash',encrypted.id,1,'marketing',2,'v1',null,'Granted',now+7).run()));
 await t('metadata truthy hold rejected',()=>assert.throws(()=>intakeMetadataPlan(context,command('bad-hold',2),{lawfulHold:'true',holdReference:'hold'})));
 await t('forged withdrawal event rejected',()=>assert.throws(()=>withdrawalPlan({...withdrawal},command('forged',2,now+1))));
 await t('append evidence UPDATE rejected',()=>assert.rejects(db.prepare("UPDATE consultation_intake_consents SET state='Declined' WHERE id='regrant'").run(),/consent evidence immutable/));
 await t('append evidence DELETE rejected',()=>assert.rejects(db.prepare("DELETE FROM consultation_intake_consents WHERE id='regrant'").run(),/consent evidence immutable/));
 await t('cross customer consent rejected',()=>assert.rejects(db.prepare(consentSQL).bind('cross-owner',encrypted.id,2,'marketing',2,'v1',hash,'Granted',now+7).run()));
 await t('legal hold activation preserves ciphertext',async()=>{await execute(db,intakeMetadataPlan(context,command('hold-on',2),{lawfulHold:true,holdReference:'hold-1'}));assert.deepEqual(await decryptIntake(await readPersistedEnvelope(db,context),provider),privateData);assert.equal((await db.prepare('SELECT payload_version FROM consultation_customer_intakes').first()).payload_version,1)});
 await t('hold release preserves ciphertext',async()=>{await execute(db,intakeMetadataPlan(context,command('hold-off',3,now+11),{lawfulHold:false}));assert.deepEqual(await decryptIntake(await readPersistedEnvelope(db,context),provider),privateData)});
 await t('retention review preserves ciphertext',async()=>{await execute(db,intakeMetadataPlan(context,command('review',4,now+12),{lawfulHold:false,reviewReason:'RetentionApproaching'}));assert.deepEqual(await decryptIntake(await readPersistedEnvelope(db,context),provider),privateData);assert.equal((await db.prepare('SELECT count(*) n FROM consultation_intake_reviews').first()).n,1)});
 await t('conflicting metadata CAS rolls back',async()=>{const before=await counts();await assert.rejects(execute(db,intakeMetadataPlan(context,command('conflict',4,now+13),{lawfulHold:true,holdReference:'hold-2'})));assert.equal(await counts(),before)});
 const next=await encryptIntake({...privateData,questions:'Synthetic updated question'},{...context,payloadVersion:2},provider);
 const args={...command('payload-2',5,now+14),expectedPayloadVersion:1};
 const plan=await intakeUpdatePlan(db,next,args,provider);
 await t('new encrypted payload CAS',async()=>{await execute(db,plan);assert.equal((await db.prepare('SELECT revision,payload_version FROM consultation_customer_intakes').first()).payload_version,2);assert.equal((await decryptIntake(await readPersistedEnvelope(db,context),provider)).questions,'Synthetic updated question')});
 await t('withdrawal timestamp older than metadata rejected',async()=>{const before=await counts();await assert.rejects(execute(db,withdrawalPlan(withdrawConsent(regrant,now+5),command('backdated-record',6,now+5))),/intake identity\/version conflict/);assert.equal(await counts(),before)});
 await t('stale payload submission rejected',()=>assert.rejects(intakeUpdatePlan(db,encrypted,{...command('stale-payload',6,now+15),expectedPayloadVersion:2},provider),/Intake version conflict/));
 await t('stale ciphertext relabel rejected',()=>assert.rejects(intakeUpdatePlan(db,{...encrypted,payloadVersion:3},{...command('relabeled',6,now+15),expectedPayloadVersion:2},provider),/Private intake cryptography rejected/));
 await t('prepared plan replay zero-row rollback',async()=>{const before=await counts();await assert.rejects(execute(db,plan));assert.equal(await counts(),before)});
 await t('current envelope owner binding',()=>assert.rejects(readPersistedEnvelope(db,{id:context.id,customerId:2}),/Private intake access denied/));
 for(const verb of ['INSERT OR REPLACE','REPLACE'])await t(verb+' intake identity collision rejected',async()=>{const row=await readPersistedEnvelope(db,context);await assert.rejects(db.prepare(verb+' INTO consultation_customer_intakes(id,customer_id,revision,payload_version,schema_version,key_id,nonce,ciphertext,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(row.id,1,1,row.payloadVersion,1,row.keyId,row.nonce,row.ciphertext,now,now).run(),/intake replacement rejected/)});
 await t('SQL payload version cannot advance alone',()=>assert.rejects(db.prepare('UPDATE consultation_customer_intakes SET revision=revision+1,payload_version=payload_version+1').run(),/intake identity\/version conflict/));
 await t('SQL FK integrity',async()=>assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]));
 await t('SQL integrity',async()=>assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok'));
}
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');const sqlite=sqliteBinding(raw);
await persistenceChecks(sqlite,'SQLite');
// Configured committed authentication service, not an unconfigured mock.
raw.exec(readFileSync(new URL('../database/migrate-c1-consultation-auth.sql',import.meta.url),'utf8'));
const actualNow=Date.now(),token=randomSecret();
raw.prepare("INSERT INTO consultation_auth_account VALUES(1,'synthetic-account',1,'PBKDF2-SHA256',600000,?,?,1,?)").run('a'.repeat(64),'b'.repeat(64),actualNow-1000);
raw.prepare('INSERT INTO consultation_auth_sessions VALUES(?,1,?,?,1,?,?,NULL)').run('session-1',await tokenHash(token),await tokenHash(randomSecret()),actualNow-1000,actualNow+600000);
const authBoundary=createIntakeBoundary({qyAuth:createConsultationAuth({db:sqlite,origin:'https://synthetic.invalid'})});
await test('configured QY auth valid session positive control',async()=>assert.equal((await authBoundary.administrative(new Request('https://synthetic.invalid',{headers:{cookie:COOKIE_NAME+'='+token}}))).accountId,1));
await test('configured QY auth ADMIN_TOKEN alone denied',()=>assert.rejects(authBoundary.administrative(new Request('https://synthetic.invalid',{headers:{Authorization:'Bearer synthetic-admin'}})),/Private intake access denied/));
await test('configured QY auth revoked session denied',async()=>{raw.prepare('UPDATE consultation_auth_sessions SET revoked_at=?').run(actualNow);await assert.rejects(authBoundary.administrative(new Request('https://synthetic.invalid',{headers:{cookie:COOKIE_NAME+'='+token}})))});
raw.close();
if(!process.env.QY_MINIFLARE_PATH)throw Error('Local D1 emulator path required for acceptance');
const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){throw Error("No HTTP")}}',compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-intake-remediation'},d1Persist:false,cf:false,telemetry:{enabled:false}}));
try{await persistenceChecks(await mf.getD1Database('DB'),'D1');}finally{await mf.dispose();}
console.log(`RESULT ${passed} passed, 0 failed; local synthetic only`);
