import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildPackage} from './build-consultation-pages.mjs';
import {sha,canonical,verifyManifest} from './consultation-migration-verifier.mjs';
import {newPasswordRecord,randomSecret} from '../functions/lib/consultation/auth-crypto.js';
const output=resolve('.local-c1-package-preview-mvp-recovery');
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
try{
 const db=sqlite(raw);await schema(db);const credential=await newPasswordRecord(password);
 await db.prepare("INSERT INTO consultation_auth_account VALUES(1,'qyadmin',1,'PBKDF2-SHA256',600000,?,?,1,?)").bind(credential.salt,credential.hash,Date.now()).run();
 await db.prepare('UPDATE consultation_preview_environment SET enabled=1').run();
 let assetCalls=0;
 const env={...settings,CONSULTATION_DB:db,ASSETS:{fetch:async request=>{assetCalls++;assert.equal(new URL(request.url).search,'');assert.equal(request.headers.get('cookie'),null);return new Response('synthetic asset');}}};
 const request=(path,body,who={})=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin',cookie:who.cookie||'','x-qy-consultation-csrf':who.csrf||'','x-qy-consultation-customer-csrf':who.csrf||''},...(body===undefined?{}:{body:JSON.stringify(body)})});
 async function client(who,path,body){const r=await worker.fetch(request('/api/consultation/'+path,body,who),env);const cookie=r.headers.get('set-cookie');if(cookie){const pair=cookie.split(';')[0],name=pair.split('=')[0];who.cookie=(who.cookie||'').split('; ').filter(p=>p&&!p.startsWith(name+'=')).concat(pair).join('; ');}const data=await r.json();if(data.csrfToken)who.csrf=data.csrfToken;return {status:r.status,data};}
 await test('integrated Preview tracking URL, login, customer recovery, context and mocked OTP',async()=>{
  const tracking=await worker.fetch(request('/qy.html?utm_source=chatgpt.com'),env);assert.equal(tracking.status,303);assert.equal(tracking.headers.get('location'),'/qy.html');assert.equal(assetCalls,0);
  assert.equal((await worker.fetch(request('/qy.html'),env)).status,200);
  assert.equal((await worker.fetch(request('/qy.html?token=denied'),env)).status,404);
  assert.equal((await worker.fetch(request('/qy.html?utm_source=x'),{...env,CONSULTATION_PREVIEW_ENABLED:'false'})).status,503);
  assert.equal((await worker.fetch(new Request('https://other.invalid/qy.html?utm_source=x'),env)).status,403);
  const qy={},customer={};assert.equal((await client(qy,'qy/login',{username:'qyadmin',password})).status,200);
  const missing=await client(customer,'context',{});assert.equal(missing.status,401);assert.equal(missing.data.error,'Customer authorization denied.');
  const review=await client(qy,'qy/account/review',{customerId:1,channel:'whatsapp',contact:'0120000101',evidenceReference:'SYNTHETIC-REVIEW',independentlyVerified:true});assert.equal(review.status,200);
  const bootstrap=await client(qy,'preview/bootstrap',{customerId:1});assert.equal(bootstrap.status,200);
  customer.cookie=qy.cookie.split('; ').filter(p=>p.startsWith('QY_PORTAL_SESSION=')).join('; ');
  assert.equal((await client(customer,'context',{})).status,200);
  assert.equal((await client(customer,'context/resume',{})).status,200);
  const challenge=await client(customer,'account/challenge',{contactId:review.data.id});assert.equal(challenge.status,200);assert.equal(challenge.data.code,undefined);
  const otp=await client(qy,'qy/preview/outbox',{challengeId:challenge.data.id});assert.equal(otp.status,200);assert.match(otp.data.code,/^\d{8}$/);
  // Simulate an expired parent in disposable local storage; existing context must fail.
  await db.prepare("UPDATE academy_portal_sessions SET expires_at=? WHERE customer_id=1").bind(new Date(Date.now()-1000).toISOString()).run();
  assert.equal((await client(customer,'context',{})).status,401);
  assert.equal((await client(qy,'preview/bootstrap',{customerId:1})).status,200);
  customer.cookie=qy.cookie.split('; ').filter(p=>p.startsWith('QY_PORTAL_SESSION=')).join('; ');customer.csrf='';
  assert.equal((await client(customer,'context',{})).status,200);
  assert.equal((await client(customer,'account/challenge',{contactId:review.data.id})).status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM consultation_migration_ledger').first()).n,15);
  assert.equal(raw.prepare('SELECT password_hash FROM consultation_auth_account').get().password_hash,credential.hash);
 });
 console.log('RESULT: integrated local packaged Worker/SQLite workflow PASS; no remote operations or live delivery.');
}finally{raw.close();}
