import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildPackage} from './build-consultation-pages.mjs';
import {sha,canonical,verifyManifest} from './consultation-migration-verifier.mjs';
import {newPasswordRecord,randomSecret} from '../functions/lib/consultation/auth-crypto.js';
const output=resolve('.local-c1-package-preview-guest-mvp-'+Date.now());
const packageInfo=await buildPackage(output,process.env.QY_ESBUILD_PATH);
const manifest=verifyManifest(packageInfo.manifest),publicPath=packageInfo.publicPath,offline=packageInfo.offline;
const origin='https://c1-bazi-consultation-develop.qy-c1-consultation-preview.pages.dev',databaseId='11111111-2222-4333-8444-555555555555';
const config={environment:'preview',syntheticOnly:true,origin,databaseId,expectedDatabaseId:databaseId,manifestSha256:sha(JSON.stringify(manifest)),productId:1,practitionerId:1,countryCodes:['MY'],isolatedPreviewProject:'qy-c1-consultation-preview',previewBranch:'c1-bazi-consultation-development',policies:Object.fromEntries(['consultation_privacy','future_calculations','marketing','booking'].map(p=>[p,{version:'synthetic-v1',text:'Synthetic '+p,hash:sha('Synthetic '+p)}]))};
const ring=Object.fromEntries(['intake','contact','lookup','challenge','meeting','mockDelivery'].map(p=>[p,{active:p+'-synthetic-v1',keys:{[p+'-synthetic-v1']:randomSecret()}}]));
const settings={CONSULTATION_DEPLOYMENT_SLOT:'preview',CONSULTATION_CONFIG:JSON.stringify(config),CONSULTATION_PREVIEW_ENABLED:'true',CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED:'true',CONSULTATION_MOCK_DELIVERY_ENABLED:'true',CONSULTATION_KEYRING:JSON.stringify(ring),CF_PAGES:'1',CF_PAGES_BRANCH:'c1-bazi-consultation-development',CF_PAGES_COMMIT_SHA:'synthetic',CF_PAGES_URL:origin};
const password=randomSecret();settings.CONSULTATION_ADMIN_SECRET=password;
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const split=s=>s.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|INSERT|ALTER|$)/).map(s=>s.trim()).filter(Boolean);
function sqlite(raw){return {prepare(sql){let v=[];return {bind(...x){v=x;return this;},async first(){return raw.prepare(sql).get(...v)??null;},async all(){return {results:raw.prepare(sql).all(...v)};},async run(){const s=raw.prepare(sql);if(s.columns().length)return {results:s.all(...v),meta:{changes:Number(raw.prepare('SELECT changes() n').get().n)}};return {meta:{changes:Number(s.run(...v).changes)}};}};},async batch(plans){raw.exec('BEGIN');try{const r=[];for(const p of plans)r.push(await p.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
async function schema(db){
 for(const s of split(readFileSync(resolve(offline,'000-isolated-prerequisites.sql'),'utf8')))await db.prepare(s).run();
 for(const m of manifest.migrations){
  const sql=readFileSync(resolve(offline,String(m.ordinal).padStart(3,'0')+'-'+m.path.split('/').at(-1)),'utf8');
  assert.equal(sha(canonical(sql)),m.sha256);
  await db.batch([...split(sql).map(s=>db.prepare(s)),db.prepare('INSERT INTO consultation_migration_ledger VALUES(?,?,?,?)').bind(m.ordinal,m.path,m.sha256,Date.now())]);
 }
 await db.prepare('INSERT INTO consultation_preview_environment VALUES(1,?,?,?,1,0)').bind(databaseId,origin,config.manifestSha256).run();
 await db.prepare("INSERT INTO customers(id,customer_reference,display_name,email,status) VALUES(1,'SYNTHETIC-001','Synthetic One','one@example.invalid','Active')").run();
 await db.prepare('INSERT INTO consultation_preview_synthetic_customers VALUES(1,1)').run();
 await db.prepare("INSERT INTO products(id,sku,slug,product_type,name_en,status,price,currency) VALUES(1,'CONSULT-BAZI','synthetic','consultation','Synthetic','Draft',1300,'MYR')").run();
 await db.prepare("INSERT INTO coaches(id,coach_code,full_name,email,status) VALUES(1,'SYNTHETIC','Synthetic','qy@example.invalid','Approved')").run();
}
const worker=(await import(pathToFileURL(resolve(publicPath,'_worker.js')).href)).default;
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
let assertions=0;const check=(value,message)=>{assert.ok(value,message);assertions++;};
try{
 const db=sqlite(raw);await schema(db);raw.exec('BEGIN;'+readFileSync('database/additive/c1-consultation-guest.sql','utf8')+';COMMIT;');
 const credential=await newPasswordRecord(password);
 await db.prepare("INSERT INTO consultation_auth_account VALUES(1,'qyadmin',1,'PBKDF2-SHA256',600000,?,?,1,?)").bind(credential.salt,credential.hash,Date.now()).run();
 await db.prepare('UPDATE consultation_preview_environment SET enabled=1').run();
 const env={...settings,CONSULTATION_DB:db,ASSETS:{fetch:async()=>new Response('synthetic asset')}};
 const request=(path,body,who={},foreign=false)=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin:foreign?'https://foreign.invalid':origin,'content-type':'application/json','sec-fetch-site':'same-origin',cookie:who.cookie||'','x-qy-consultation-csrf':who.csrf||''},...(body===undefined?{}:{body:JSON.stringify(body)})});
 async function client(who,path,body,foreign=false){const r=await worker.fetch(request('/api/consultation/'+path,body,who,foreign),env);const cookie=r.headers.get('set-cookie');if(cookie)who.cookie=cookie.split(';')[0];const data=await r.json();if(data.csrfToken)who.csrf=data.csrfToken;return {status:r.status,data};}
 await test('guest calendar, encrypted submission, QY review, private offer and PaymentPending',async()=>{
  const guest={},qy={};check((await client(qy,'qy/login',{username:'qyadmin',password})).status===200,'admin login');
  const day=new Date(Date.now()+5*86400000+8*3600000).toISOString().slice(0,10),dayStart=Date.parse(day+'T00:00:00+08:00');
  check((await client(qy,'qy/availability',{action:'Create',expectedRevision:0,commandId:crypto.randomUUID(),startAt:dayStart+9*3600000,endAt:dayStart+18*3600000})).status===200,'availability');
  const calendar=await client(guest,'guest/calendar',{date:day});check(calendar.status===200&&calendar.data.slots.length>0,'public calendar');
  const start=calendar.data.slots[0];check(Object.keys(calendar.data).sort().join(',')==='ok,slots,timezone','calendar privacy');
  const intake={fullName:'Synthetic Guest Adult',calculationGender:'male',birthDate:'2000-02-29',birthTimePrecision:'unknown',birthTime:null,birthCity:'Synthetic City',birthCountry:'MY',questions:'Synthetic confidential question',reportChannel:'email',selfBooking:true,adultAcknowledged:true,privacyAcknowledgement:{accepted:true,version:'synthetic-v1'}};
  const input={commandId:crypto.randomUUID(),intake,contact:'guest@example.invalid',preferredStart:start};
  check((await client(guest,'guest/requests',input,true)).status===403,'foreign origin');
  check((await client(guest,'guest/requests',{...input,commandId:crypto.randomUUID(),preferredStart:Date.now()+3600000})).status!==200,'lead time');
  check((await client(guest,'guest/requests',{...input,commandId:crypto.randomUUID(),intake:{...intake,birthDate:'2020-01-01'}})).status!==200,'underage');
  const submitted=await client(guest,'guest/requests',input);check(submitted.status===200,'guest submission');check(submitted.data.state==='Submitted'&&submitted.data.reference.startsWith('BAZI-'),'reference');
  check(Object.keys(submitted.data).sort().join(',')==='ok,reference,state','public response privacy');
  check((await client(guest,'guest/requests',input)).data.duplicate===true,'idempotent submission');
  check((await client(guest,'bookings')).status!==200,'no public private directory');check((await client(guest,'qy/bookings')).status!==200,'admin required');
  const second=await client(guest,'guest/requests',{...input,commandId:crypto.randomUUID()});check(second.status===200,'second unreserved preference');
  const list=await client(qy,'qy/bookings');check(list.status===200,'admin list');const b=list.data.records.find(r=>r.reference===submitted.data.reference);check(b.guest_request===1&&b.preferred_start===start,'admin preference');
  const g=raw.prepare('SELECT * FROM consultation_guest_intakes WHERE booking_id=?').get(b.id);check(g.contact_verified===0,'unverified contact');check(raw.prepare('SELECT COUNT(*) n FROM consultation_verified_contacts').get().n===0,'no invented proof');check(raw.prepare('SELECT COUNT(*) n FROM academy_portal_sessions').get().n===0,'no portal session');
  const privateRead=await client(qy,'qy/private?id='+b.id);check(privateRead.status===200&&privateRead.data.privateIntake.contact.verified===false,'authorized decryption');
  const stored=raw.prepare('SELECT ciphertext FROM consultation_customer_intakes WHERE id=?').get(g.intake_id);check(!Buffer.from(stored.ciphertext).includes(Buffer.from(intake.questions)),'encrypted at rest');
  check((await client(guest,'qy/private?id='+b.id)).status!==200,'private intake denied');
  const review=await client(qy,'qy/status',{id:b.id,to:'UnderReview',expectedVersion:0,commandId:crypto.randomUUID()});check(review.status===200,'QY review');
  const proposal=await client(qy,'qy/offer',{id:b.id,startAt:start,expectedVersion:1,commandId:crypto.randomUUID()});check(proposal.status===200,'QY offer');check(proposal.data.offer.expiresAt-proposal.data.offer.issuedAt===48*3600000,'48-hour offer');
  const other=list.data.records.find(r=>r.reference===second.data.reference);check((await client(qy,'qy/status',{id:other.id,to:'UnderReview',expectedVersion:0,commandId:crypto.randomUUID()})).status===200,'second review');
  check((await client(qy,'qy/offer',{id:other.id,startAt:start,expectedVersion:1,commandId:crypto.randomUUID()})).status!==200,'conflicting offer blocked');
  check(raw.prepare('SELECT COUNT(*) n FROM consultation_offers WHERE booking_id=?').get(other.id).n===0,'conflict rolled back');
  check(!(await client(guest,'guest/calendar',{date:day})).data.slots.includes(start),'held slot excluded');
  check((await client({...qy,csrf:''},'qy/guest/link',{id:b.id})).status!==200,'link requires CSRF');
  const link=await client(qy,'qy/guest/link',{id:b.id});check(link.status===200,'private link');let token=new URL(link.data.url).hash.slice(7);
  check(!JSON.stringify(raw.prepare('SELECT * FROM consultation_guest_offer_links').all()).includes(token),'token hash only');
  check((await client(guest,'guest/offer',{token:'0'.repeat(64)})).status!==200,'invalid token');
  const replaced=await client(qy,'qy/guest/link',{id:b.id});check(replaced.status===200,'link replacement');check((await client(guest,'guest/offer',{token})).status!==200,'replaced link invalid');token=new URL(replaced.data.url).hash.slice(7);
  const offer=await client(guest,'guest/offer',{token});check(offer.status===200,'scoped offer read');check(!JSON.stringify(offer.data).includes('guest@example.invalid')&&!JSON.stringify(offer.data).includes(intake.questions),'offer privacy');
  check((await client(guest,'guest/offer/accept',{token,acknowledged:false,snapshotHash:offer.data.snapshotHash,policyHash:offer.data.policyHash})).status!==200,'consent required');
  const accept={token,acknowledged:true,snapshotHash:offer.data.snapshotHash,policyHash:offer.data.policyHash};
  raw.exec("CREATE TRIGGER guest_accept_failure BEFORE INSERT ON consultation_workflow_events WHEN NEW.event='Accepted' BEGIN SELECT RAISE(ABORT,'synthetic acceptance failure'); END;");
  check((await client(guest,'guest/offer/accept',accept)).status!==200,'acceptance failure');check(raw.prepare('SELECT state FROM consultation_offers WHERE id=?').get(proposal.data.offer.id).state==='Issued','acceptance rollback');raw.exec('DROP TRIGGER guest_accept_failure');
  const accepted=await client(guest,'guest/offer/accept',accept);check(accepted.status===200&&accepted.data.state==='PaymentPending','payment pending');
  check((await client(guest,'guest/offer/accept',accept)).data.duplicate===true,'duplicate acceptance');
  check((await client(qy,'qy/status',{id:b.id,to:'Confirmed',expectedVersion:3,commandId:crypto.randomUUID()})).status!==200,'no unsupported paid declaration');
  check((await client(qy,'qy/payment/reconcile',{id:b.id,expectedVersion:3,commandId:crypto.randomUUID()})).status!==200,'no trusted adapter');
  check(raw.prepare('SELECT state FROM consultation_bookings WHERE id=?').get(b.id).state==='PaymentPending','no confirmation');
  raw.prepare('UPDATE consultation_guest_offer_links SET expires_at=0').run();check((await client(guest,'guest/offer',{token})).status!==200,'expired link denied');
  const before=raw.prepare('SELECT COUNT(*) n FROM consultation_bookings').get().n;
  raw.exec("CREATE TRIGGER guest_test_failure BEFORE INSERT ON consultation_guest_intakes BEGIN SELECT RAISE(ABORT,'synthetic forced failure'); END;");
  const alternate=(await client(guest,'guest/calendar',{date:day})).data.slots.at(-1);
  check((await client(guest,'guest/requests',{...input,commandId:crypto.randomUUID(),preferredStart:alternate})).status!==200,'failed transaction');check(raw.prepare('SELECT COUNT(*) n FROM consultation_bookings').get().n===before,'rollback');raw.exec('DROP TRIGGER guest_test_failure');
  raw.prepare('UPDATE consultation_guest_admission SET attempts=20,window_started_at=?').run(Date.now());check((await client(guest,'guest/requests',{...input,commandId:crypto.randomUUID()})).status!==200,'bounded admission');check((await client(qy,'qy/bookings')).status===200,'admin unaffected by guest exhaustion');
  check(raw.prepare('SELECT COUNT(*) n FROM consultation_migration_ledger').get().n===15,'15 pins retained');check(raw.prepare('SELECT password_hash FROM consultation_auth_account').get().password_hash===credential.hash,'admin hash unchanged');
  check(raw.prepare('PRAGMA foreign_key_check').all().length===0,'foreign keys');
 });
 console.log(JSON.stringify({result:'PASS',assertions,package:output,environment:'local packaged Worker/Node SQLite; synthetic only; no remote operations; deployed Free CPU not established'}));
}finally{raw.close();}
