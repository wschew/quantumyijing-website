import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildPackage} from './build-consultation-pages.mjs';
import {sha,canonical,verifyManifest} from './consultation-migration-verifier.mjs';
import {newPasswordRecord,randomSecret} from '../functions/lib/consultation/auth-crypto.js';
const output=resolve('.local-c1-package-preview-guest-calendar-'+Date.now());
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
import {page} from './test-consultation-guest-ui.mjs';
const worker=(await import(pathToFileURL(resolve(publicPath,'_worker.js')).href)).default;
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');let assertions=0;
const check=(value,message)=>{assert.ok(value,message);assertions++;};
try{
 const native=sqlite(raw);await schema(native);raw.exec(readFileSync('database/additive/c1-consultation-guest.sql','utf8'));
 await native.prepare("INSERT INTO consultation_auth_account VALUES(1,'qyadmin',1,'PBKDF2-SHA256',600000,?,?,1,?)").bind('a'.repeat(64),'b'.repeat(64),Date.now()).run();await native.prepare('UPDATE consultation_preview_environment SET enabled=1').run();
 let fail=false;
 const db={...native,prepare(sql){if(fail&&sql.includes('WITH RECURSIVE slots'))throw Error('Synthetic D1 calendar read failure');return native.prepare(sql);}};
 const env={...settings,CONSULTATION_DB:db,ASSETS:{fetch:async request=>{let name=new URL(request.url).pathname.slice(1);if(['customer','qy'].includes(name))name+='.html';return new Response(readFileSync(resolve(publicPath,name)),{headers:{'content-type':name.endsWith('.js')?'application/javascript':name.endsWith('.html')?'text/html':'text/css'}});}}};
 const transport=(path,options={})=>worker.fetch(new Request(origin+path,options.method==='POST'?{method:'POST',headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin'},body:options.body}:{}),env);
 check((await transport('/guest-booking-ui.js')).status===200,'guest script asset route');check((await transport('/customer.html')).status===200,'customer page');
 const ui=page('',transport);await ui.ready;ui.field('fullName').value='Synthetic retained name';ui.field('questions').value='Synthetic retained questions';ui.field('reportChannel').value='email';ui.field('selfBooking').checked=true;
 const snapshot=()=>JSON.stringify(ui.all.filter(n=>['INPUT','SELECT','TEXTAREA'].includes(n.tagName)&&n.name!=='preferredStart').map(n=>[n.name,n.value,n.checked]));
 const day=new Date(Date.now()+5*86400000+8*3600000).toISOString().slice(0,10),dayStart=Date.parse(day+'T00:00:00+08:00');ui.elements.get('preferred-date').value=day;
 const before=snapshot();
 // No windows configured: genuine empty result, visible next to calendar and in dropdown.
 await ui.click('load-times');check(ui.elements.get('calendar-status').textContent==='No available times on this date. Choose another date.','empty explanation adjacent');check(ui.elements.get('preferred-start').options.length===1&&ui.elements.get('preferred-start').options[0].value==='','empty non-bookable placeholder');
 await ui.language('zh-CN');check(ui.elements.get('calendar-status').textContent.startsWith('\u8be5\u65e5\u671f'),'Chinese empty explanation');check(ui.elements.get('preferred-start').options[0].textContent.startsWith('\u8be5\u65e5\u671f'),'Chinese empty dropdown');await ui.language('en');
 // Disposable local QY window only; the production SQL calendar generates actual slots.
 await native.prepare("INSERT INTO consultation_availability_windows VALUES('synthetic-window',1,?,?,'Active',1,?,?)").bind(dayStart+9*3600000,dayStart+12*3600000,Date.now(),Date.now()).run();
 const api=await transport('/api/consultation/guest/calendar',{method:'POST',body:JSON.stringify({date:day})});const result=await api.json();check(api.status===200&&result.slots.length===4,'actual calendar route slots');
 await ui.click('load-times');const options=ui.elements.get('preferred-start').options;check(JSON.stringify(options.map(o=>Number(o.value)))===JSON.stringify(result.slots),'all API slots rendered unchanged');check(options.every(o=>o.textContent.includes('MYT')),'English time labels');check(result.slots.every(s=>s>=Date.now()+72*3600000&&s+5400000<=dayStart+12*3600000),'lead time and duration preserved');
 await ui.language('zh-CN');check(options.every(o=>o.textContent.includes('\u9a6c\u6765\u897f\u4e9a')),'Chinese time labels');
 // Actual packaged Worker error response from a failing calendar D1 read.
 fail=true;const failure=await transport('/api/consultation/guest/calendar',{method:'POST',body:JSON.stringify({date:day})});check(failure.status!==200,'API failure fails closed');await ui.click('load-times');
 check(ui.elements.get('calendar-status').textContent.startsWith('\u65e0\u6cd5\u8bfb\u53d6\u65e5\u5386'),'Chinese error adjacent');check(ui.elements.get('preferred-start').options[0].value==='','failed request leaves no bookable slot');await ui.language('en');check(ui.elements.get('calendar-status').textContent==='Calendar unavailable. Check the date and try again manually.','English error adjacent');check(ui.elements.get('preferred-start').options[0].textContent.startsWith('Calendar unavailable.'),'English error dropdown');check(ui.elements.get('load-times').disabled===false,'manual retry available');check(snapshot()===before,'customer data preserved');
 console.log(JSON.stringify({result:'PASS',assertions,package:output,method:'Packaged Worker and transactional local SQLite with actual guest UI handlers in synthetic DOM; slots, no slots and D1/API failure; no remote changes'}));
}finally{raw.close();}
