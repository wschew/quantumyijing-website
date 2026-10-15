import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {buildPackage} from './build-consultation-pages.mjs';
import {provisionOffline} from './provision-consultation-preview-offline.mjs';
import {root,sha,canonical,verifyManifest} from './consultation-migration-verifier.mjs';
import {newPasswordRecord,randomSecret} from '../functions/lib/consultation/auth-crypto.js';
const output=resolve(mkdtempSync(resolve(tmpdir(),'c1-package-test-')),'package');
const packageInfo=await buildPackage(output,process.env.QY_ESBUILD_PATH);
const manifest=verifyManifest(packageInfo.manifest),publicPath=packageInfo.publicPath,offline=packageInfo.offline;
const origin='https://test.qy-c1-synthetic-preview.pages.dev',databaseId='11111111-2222-4333-8444-555555555555';
const config={environment:'preview',syntheticOnly:true,origin,databaseId,expectedDatabaseId:databaseId,manifestSha256:sha(JSON.stringify(manifest)),productId:1,practitionerId:1,countryCodes:['MY'],isolatedPreviewProject:'qy-c1-synthetic-preview',policies:Object.fromEntries(['consultation_privacy','future_calculations','marketing','booking'].map(p=>[p,{version:'synthetic-v1',text:'Synthetic '+p,hash:sha('Synthetic '+p)}]))};
const ring=Object.fromEntries(['intake','contact','lookup','challenge','meeting','mockDelivery'].map(p=>[p,{active:p+'-synthetic-v1',keys:{[p+'-synthetic-v1']:randomSecret()}}]));
const settings={CONSULTATION_CONFIG:JSON.stringify(config),CONSULTATION_PREVIEW_ENABLED:'true',CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED:'true',CONSULTATION_MOCK_DELIVERY_ENABLED:'true',CONSULTATION_KEYRING:JSON.stringify(ring),CF_PAGES:'1',CF_PAGES_BRANCH:'synthetic-test',CF_PAGES_COMMIT_SHA:'synthetic',CF_PAGES_URL:origin};
const password=randomSecret()+'Aa!';
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
await test('public package contains only C1 assets and advanced Worker',()=>assert.deepEqual(readdirSync(publicPath).sort(),['_routes.json','_worker.js','academy-logo.png','customer.html','qy.html','workflow-ui.js','workflow.css'].sort()));
await test('all requests route through Worker including static assets',()=>assert.deepEqual(JSON.parse(readFileSync(resolve(publicPath,'_routes.json'))),{version:1,include:['/*'],exclude:[]}));
await test('both packaged interfaces select Preview APIs and omit loopback customer login',()=>{for(const file of ['customer.html','qy.html']){const html=readFileSync(resolve(publicPath,file),'utf8');assert.ok(html.includes('data-deployment="preview"'));assert.ok(!html.includes('id="local-customer-login"'));assert.ok(html.includes('data-language="zh-CN"'));}});
await test('15 pinned migrations preserved byte canonically and kept outside public',()=>{for(const m of manifest.migrations)assert.equal(sha(canonical(readFileSync(resolve(offline,String(m.ordinal).padStart(3,'0')+'-'+m.path.split('/').at(-1))))),m.sha256);});
await test('template cannot enable a usable environment',()=>{const template=JSON.parse(readFileSync(resolve(offline,'config.template.json')));assert.equal(template.productId,null);assert.equal(template.policies.booking.text,'');assert.ok(!JSON.stringify(template).includes(password));});
await test('builder refuses to overwrite an existing package',()=>assert.rejects(buildPackage(output,process.env.QY_ESBUILD_PATH)));
const worker=(await import(pathToFileURL(resolve(publicPath,'_worker.js')).href)).default;
let assetRequests=[];
function asset(request){assetRequests.push(request);let file=new URL(request.url).pathname.slice(1);if(file.endsWith('.html'))return new Response(null,{status:308,headers:{location:'/'+file.slice(0,-5)}});if(['customer','qy'].includes(file))file+='.html';return new Response(readFileSync(resolve(publicPath,file)),{headers:{'content-type':file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png'}});}
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
try{
 const db=sqlite(raw);await schema(db);
 const input=()=>({config,username:'synthetic',password,confirmation:password,action:'initialize'});
 await test('offline tooling rejects wrong marker identity without account creation',async()=>{await assert.rejects(provisionOffline(raw,{...input(),config:{...config,databaseId:'22222222-2222-4333-8444-555555555555',expectedDatabaseId:'22222222-2222-4333-8444-555555555555'}}));assert.equal(raw.prepare('SELECT COUNT(*) n FROM consultation_auth_account').get().n,0);});
 await test('offline tooling provisions existing complete disabled database',async()=>{await provisionOffline(raw,input());const row=raw.prepare('SELECT * FROM consultation_auth_account').get();assert.equal(row.password_iterations,600000);assert.notEqual(row.password_hash,password);assert.equal(row.password_version,1);assert.equal(raw.prepare('SELECT enabled FROM consultation_preview_environment').get().enabled,0);});
 await test('offline tooling rejects weak passwords without changing credentials',async()=>{await assert.rejects(provisionOffline(raw,{...input(),password:'short',confirmation:'short',action:'rotate',expectedVersion:1}));assert.equal(raw.prepare('SELECT password_version FROM consultation_auth_account').get().password_version,1);});
 await test('offline account audit contains no credentials',()=>{const audit=JSON.stringify(raw.prepare('SELECT * FROM consultation_auth_audit').all());assert.ok(!audit.includes(password));assert.ok(!audit.includes(raw.prepare('SELECT password_hash FROM consultation_auth_account').get().password_hash));});
 await test('offline tooling rejects non-synthetic customer inventory',async()=>{await db.prepare("INSERT INTO customers(id,customer_reference,display_name,email,status) VALUES(2,'NON-SYNTHETIC','Invalid fixture','invalid@example.invalid','Active')").run();try{await assert.rejects(provisionOffline(raw,{...input(),action:'rotate',expectedVersion:1}));}finally{await db.prepare('DELETE FROM customers WHERE id=2').run();}});
 await test('duplicate offline initialization cannot replace credentials',async()=>{await assert.rejects(provisionOffline(raw,input()));assert.equal(raw.prepare('SELECT COUNT(*) n FROM consultation_auth_audit').get().n,1);});
 await test('offline rotation rejects stale version',()=>assert.rejects(provisionOffline(raw,{...input(),action:'rotate',expectedVersion:9})));
 const sessionTime=Date.now();raw.prepare('INSERT INTO consultation_auth_sessions VALUES(?,1,?,?,1,?,?,NULL)').run('synthetic-offline-session',randomSecret(),randomSecret(),sessionTime,sessionTime+3600000);
 await test('offline rotation preserves schema and increments CAS version',async()=>{await provisionOffline(raw,{...input(),action:'rotate',expectedVersion:1});assert.equal(raw.prepare('SELECT password_version FROM consultation_auth_account').get().password_version,2);assert.equal(raw.prepare('SELECT COUNT(*) n FROM consultation_migration_ledger').get().n,15);});
 await test('offline rotation revokes existing QY sessions',()=>assert.ok(raw.prepare('SELECT revoked_at FROM consultation_auth_sessions WHERE id=?').get('synthetic-offline-session').revoked_at));
 await db.prepare('UPDATE consultation_preview_environment SET enabled=1').run();
 await test('offline provisioning rejects an enabled environment',()=>assert.rejects(provisionOffline(raw,{...input(),action:'rotate',expectedVersion:2})));
 const env={...settings,CONSULTATION_DB:db,ASSETS:{fetch:asset}};
 await test('unknown provider binding fails closed before assets',async()=>assert.equal((await worker.fetch(new Request(origin+'/'),{...env,EMAIL_PROVIDER:'denied'})).status,503));
 await test('shared ADMIN_TOKEN is rejected',async()=>assert.equal((await worker.fetch(new Request(origin+'/'),{...env,ADMIN_TOKEN:'denied'})).status,503));
 await test('missing gate blocks assets',async()=>assert.equal((await worker.fetch(new Request(origin+'/'),{...env,CONSULTATION_PREVIEW_ENABLED:'false'})).status,503));
 await test('malformed server config gives sanitized failure',async()=>{const r=await worker.fetch(new Request(origin+'/'),{...env,CONSULTATION_CONFIG:'invalid'});assert.equal(r.status,503);assert.equal((await r.json()).code,'PREVIEW_UNAVAILABLE');});
 await checks(db,r=>worker.fetch(r,env),'SQLite packaged Worker');
}finally{raw.close();}
async function checks(db,dispatch,label){
 const t=(name,fn)=>test(label+' '+name,fn);
 const request=(path,body,cookie='',csrf='',extra={})=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-qy-consultation-csrf':csrf,'x-qy-consultation-customer-csrf':csrf}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const call=(path,body,cookie,csrf,extra)=>dispatch(request('/api/consultation/'+path,body,cookie,csrf,extra));
 const qy={cookie:'',csrf:''},customer={cookie:'',csrf:''};
 async function client(who,path,body){const r=await call(path,body,who.cookie,who.csrf);const c=r.headers.get('set-cookie');if(c){const part=c.split(';')[0],name=part.split('=')[0];who.cookie=who.cookie.split('; ').filter(p=>p&&!p.startsWith(name+'=')).concat(part).join('; ');}const data=await r.json();if(data.csrfToken)who.csrf=data.csrfToken;return {status:r.status,data};}
 await t('HTML root is isolated C1 with CSP and no-store',async()=>{const r=await dispatch(request('/'));assert.equal(r.status,200);assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.equal(r.headers.get('cache-control'),'no-store');assert.ok((await r.text()).includes('data-deployment="preview"'));});
 await t('Pages clean HTML and existing .html links resolve without redirect loops',async()=>{for(const path of ['/customer','/customer.html','/qy','/qy.html']){const r=await dispatch(request(path));assert.equal(r.status,200);assert.ok((await r.text()).includes('data-deployment="preview"'));}});
 await t('asset allowlist rejects repository, setup and unrelated site paths',async()=>{for(const path of ['/admin.html','/.env','/offline/migration-manifest.json','/scripts/provision-consultation-preview-offline.mjs','/_worker.js','/functions/api/admin','/qy.html?token=secret'])assert.equal((await dispatch(request(path))).status,404);});
 await t('wrong host and foreign origin are rejected',async()=>{assert.equal((await dispatch(new Request('https://other.invalid/customer.html'))).status,403);assert.equal((await call('qy/login',{username:'synthetic',password},'','',{origin:'https://foreign.invalid'})).status,403);});
 await t('HEAD serves no body and POST cannot mutate assets',async()=>{const r=await dispatch(new Request(origin+'/customer.html',{method:'HEAD'}));assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal((await dispatch(request('/customer.html',{}))).status,404);});
 await t('no public setup, local bootstrap, outbox list or payment endpoint',async()=>{for(const path of ['setup','qy/setup','local/customer-login','qy/local/outbox','qy/local/capture','qy/payment/reconcile','qy/payment/finance-review'])assert.notEqual((await call(path,{})).status,200);});
 await t('dedicated QY login uses secure HttpOnly cookie',async()=>{const r=await call('qy/login',{username:'synthetic',password});assert.equal(r.status,200);qy.cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));assert.ok(r.headers.get('set-cookie').includes('Secure'));qy.csrf=(await r.json()).csrfToken;});
 await t('bootstrap requires QY mutation CSRF',async()=>assert.notEqual((await call('preview/bootstrap',{customerId:1},qy.cookie)).status,200));
 await t('protected bootstrap establishes only registered synthetic portal identity',async()=>{const r=await call('preview/bootstrap',{customerId:1},qy.cookie,qy.csrf);assert.equal(r.status,200);customer.cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await client(customer,'context',{})).status,200);assert.equal((await client(customer,'account/options')).data.manualReviewRequired,true);});
 let contactId,challengeId,code;
 await t('independent contact review is still required',async()=>{const r=await client(qy,'qy/account/review',{customerId:1,channel:'whatsapp',contact:'0120000101',evidenceReference:'SYNTHETIC-REVIEW',independentlyVerified:true});assert.equal(r.status,200);contactId=r.data.id;});
 await t('challenge commits encrypted persistent delivery without exposing code',async()=>{const r=await client(customer,'account/challenge',{contactId});assert.equal(r.status,200);challengeId=r.data.id;assert.equal(r.data.code,undefined);const row=await db.prepare('SELECT * FROM consultation_preview_outbox WHERE challenge_id=?').bind(challengeId).first();assert.ok(row.ciphertext);});
 await t('customer cannot retrieve QY outbox',async()=>assert.notEqual((await client(customer,'qy/preview/outbox',{challengeId})).status,200));
 await t('QY reads exact challenge through protected POST then customer verifies',async()=>{const r=await client(qy,'qy/preview/outbox',{challengeId});assert.equal(r.status,200);code=r.data.code;assert.ok(/^\d{8}$/.test(code));assert.equal((await client(customer,'account/confirm',{challengeId,code})).data.verified,true);code=null;});
 await t('consumed mock OTP cannot be retrieved again',async()=>assert.notEqual((await client(qy,'qy/preview/outbox',{challengeId})).status,200));
 await t('report-contact proof remains independent',async()=>{const r=await client(customer,'contact/challenge',{channel:'whatsapp',contact:'0120000101'});assert.equal(r.status,200);const id=r.data.challengeId,info=await client(qy,'qy/contact/instructions?id='+id);assert.equal(info.status,200);assert.equal((await client(qy,'qy/contact/delivered',{challengeId:id,expectedRevision:info.data.revision})).status,200);assert.equal((await client(customer,'contact/confirm',{challengeId:id,code:info.data.code})).status,200);});
 let id,version;
 await t('booking submission and reviewed availability offer use actual API',async()=>{
  const intake={fullName:'Synthetic Adult',calculationGender:'male',birthDate:'2000-02-29',birthTimePrecision:'unknown',birthTime:null,birthCity:'Synthetic City',birthCountry:'MY',questions:'Synthetic private question',reportChannel:'whatsapp',selfBooking:true,adultAcknowledged:true,privacyAcknowledgement:{accepted:true,version:'synthetic-v1'}};
  const submitted=await client(customer,'bookings',{commandId:crypto.randomUUID(),intake});assert.equal(submitted.status,200);id=submitted.data.id;
  const review=await client(qy,'qy/status',{id,to:'UnderReview',expectedVersion:0,commandId:crypto.randomUUID()});assert.equal(review.status,200);
  assert.equal((await client(qy,'qy/availability',{action:'Create',expectedRevision:0,commandId:crypto.randomUUID(),startAt:Date.now()+3600000,endAt:Date.now()+30*86400000})).status,200);
  const proposed=await client(qy,'qy/offer',{id,startAt:Date.now()+96*3600000,expectedVersion:review.data.rowVersion,commandId:crypto.randomUUID()});assert.equal(proposed.status,200);version=proposed.data.rowVersion;
 });
 await t('offer acceptance remains PaymentPending',async()=>{const offer=(await client(customer,'offer?id='+id)).data.offer;const r=await client(customer,'offer/accept',{id,expectedVersion:version,commandId:crypto.randomUUID(),acknowledged:true,policyHash:offer.policyHash,snapshotHash:offer.snapshotHash});assert.equal(r.status,200);assert.equal(r.data.state,'PaymentPending');version=r.data.rowVersion;});
 await t('direct Confirmed transition and simulated capture cannot confirm',async()=>{for(const [path,body] of [['qy/status',{id,to:'Confirmed',expectedVersion:version,commandId:crypto.randomUUID()}],['qy/local/capture',{id,mode:'timely'}],['qy/payment/reconcile',{id,expectedVersion:version,commandId:crypto.randomUUID()}]])assert.notEqual((await client(qy,path,body)).status,200);const rows=(await client(qy,'qy/bookings')).data;assert.equal(rows.captureAdapterConfigured,false);assert.equal(rows.financeReviewConfigured,false);assert.equal(rows.records.find(r=>r.id===id).state,'PaymentPending');});
 await t('no financial records are created',async()=>{for(const table of ['orders','payments'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);});
 await t('feature marker disable prevents both private API and assets',async()=>{await db.prepare('UPDATE consultation_preview_environment SET enabled=0').run();assert.equal((await dispatch(request('/qy.html'))).status,503);assert.equal((await call('qy/bookings',undefined,qy.cookie)).status,503);await db.prepare('UPDATE consultation_preview_environment SET enabled=1').run();});
 await t('logout revokes bootstrap access',async()=>{assert.equal((await client(qy,'qy/logout',{})).status,200);assert.notEqual((await client(qy,'preview/bootstrap',{customerId:1})).status,200);});
 await t('foreign keys and supported integrity checks pass',async()=>{assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.equal(Object.values(await db.prepare('PRAGMA quick_check').first())[0],'ok');});
}
const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
const source=readFileSync(resolve(publicPath,'_worker.js'),'utf8');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"globalThis.fetch=async()=>{throw Error('Outbound disabled');};\n"+source,compatibilityDate:'2026-10-07',bindings:settings,d1Databases:{CONSULTATION_DB:'synthetic-c1-pages'},d1Persist:false,serviceBindings:{ASSETS:asset},cf:false,telemetry:{enabled:false}}));
try{
 const db=await mf.getD1Database('CONSULTATION_DB');await schema(db);const credential=await newPasswordRecord(password);
 await db.prepare("INSERT INTO consultation_auth_account VALUES(1,'synthetic',1,'PBKDF2-SHA256',600000,?,?,1,?)").bind(credential.salt,credential.hash,Date.now()).run();await db.prepare('UPDATE consultation_preview_environment SET enabled=1').run();
 await checks(db,async r=>mf.dispatchFetch(r.url,{method:r.method,headers:Object.fromEntries(r.headers),...(!['GET','HEAD'].includes(r.method)?{body:await r.arrayBuffer()}:{})}),'workerd packaged Worker/D1');
}finally{await mf.dispose();}
await test('asset service never receives cookies or authorization',()=>{for(const r of assetRequests){assert.equal(r.headers.get('cookie'),null);assert.equal(r.headers.get('authorization'),null);assert.equal(new URL(r.url).search,'');}});
console.log('RESULT '+passed+' passed, 0 failed; packaged C1 Worker, SQLite, workerd/D1; outbound fetch disabled');
