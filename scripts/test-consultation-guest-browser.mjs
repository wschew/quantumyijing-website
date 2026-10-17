import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildPackage} from './build-consultation-pages.mjs';
import {sha,canonical,verifyManifest} from './consultation-migration-verifier.mjs';
import {newPasswordRecord,randomSecret} from '../functions/lib/consultation/auth-crypto.js';
const output=resolve('.local-c1-package-preview-guest-language-'+Date.now());
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
// Browser interaction through the actual packaged Worker asset route, not a DOM stub.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,openSync,closeSync} from 'node:fs';
const worker=(await import(pathToFileURL(resolve(publicPath,'_worker.js')).href)).default;
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
let server,chrome,ws;const pending=new Map(),errors=[],requests=[];let sequence=0;
const evidence={assetRoute:'NOT RUN',browser:'NOT RUN',package:output};
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser JavaScript exception');return r.result.value;}
async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await cdp('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
try{
 const db=sqlite(raw);await schema(db);raw.exec(readFileSync('database/additive/c1-consultation-guest.sql','utf8'));
 await db.prepare("INSERT INTO consultation_auth_account VALUES(1,'qyadmin',1,'PBKDF2-SHA256',600000,?,?,1,?)").bind('a'.repeat(64),'b'.repeat(64),Date.now()).run();await db.prepare('UPDATE consultation_preview_environment SET enabled=1').run();
 const env={...settings,CONSULTATION_DB:db,ASSETS:{fetch:async request=>{let name=new URL(request.url).pathname.slice(1);if(['customer','qy'].includes(name))name+='.html';return new Response(readFileSync(resolve(publicPath,name)),{headers:{'content-type':name.endsWith('.js')?'application/javascript; charset=utf-8':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'image/png'}});}}};
 const asset=await worker.fetch(new Request(origin+'/guest-booking-ui.js'),env);assert.equal(asset.status,200);assert.ok(asset.headers.get('content-type').includes('javascript'));assert.ok(Buffer.from(await asset.arrayBuffer()).equals(readFileSync(resolve(publicPath,'guest-booking-ui.js'))),'exact script bytes');evidence.assetRoute='PASS';console.log('PASS: packaged Worker serves exact guest script with JavaScript MIME');
 server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const response=await worker.fetch(new Request(origin+req.url,{headers:req.headers}),env);requests.push({path,status:response.status});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Local test failure');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+server.address().port;
 const log=openSync(resolve(output,'chrome.log'),'wx');try{chrome=spawn(process.env.QY_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+resolve(output,'browser-profile'),'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1','about:blank'],{stdio:['ignore',log,log],windowsHide:true});}finally{closeSync(log);}
 let launchError=null;chrome.on('error',e=>{launchError=e.code||'launch failed';});const active=resolve(output,'browser-profile','DevToolsActivePort');
 for(let i=0;!existsSync(active)&&!launchError&&chrome.exitCode===null&&i<100;i++)await new Promise(r=>setTimeout(r,100));
 if(launchError||!existsSync(active))throw Error('BLOCKED: Chrome cannot start in this environment'+(launchError?' ('+launchError+')':''));
 const port=Number(readFileSync(active,'utf8').split('\n')[0]);const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('CDP command rejected')):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push('JavaScript exception');};
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Page.navigate',{url:local+'/customer.html'});
 for(let i=0;i<100;i++){if(await evaluate('document.querySelector("#status")?.textContent.includes("Synthetic Preview only")'))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(errors.length,0);assert.ok(requests.some(r=>r.path==='/guest-booking-ui.js'&&r.status===200));
 await evaluate(`document.querySelector('[name="fullName"]').value='Synthetic retained name';document.querySelector('[name="questions"]').value='Synthetic retained questions';document.querySelector('[name="reportChannel"]').value='whatsapp';document.querySelector('[name="selfBooking"]').checked=true;`);
 const values=()=>evaluate(`JSON.stringify([...document.querySelectorAll('input,select,textarea')].map(e=>[e.name,e.value,e.checked]))`);const before=await values();
 await click('[data-language="zh-CN"]');assert.equal(await evaluate('document.documentElement.lang'),'zh-CN');assert.equal(await evaluate('document.querySelector("#load-times").textContent'),'\u67e5\u770b\u53ef\u7528\u65f6\u6bb5');assert.ok((await evaluate('document.querySelector("[name=fullName]").parentElement.textContent')).includes('\u59d3\u540d'));assert.equal(await values(),before);
 await click('[data-language="en"]');assert.equal(await evaluate('document.documentElement.lang'),'en');assert.equal(await evaluate('document.querySelector("#load-times").textContent'),'Show available times');assert.ok((await evaluate('document.querySelector("[name=fullName]").parentElement.textContent')).includes('Full name'));assert.equal(await values(),before);assert.equal(errors.length,0);
 evidence.browser='PASS';evidence.result='PASS';evidence.checks=['script HTTP 200/JavaScript MIME','actual Chinese click changes visible form label','actual English click restores label','entered values and checkbox/select preserved','no browser JavaScript exceptions'];console.log('PASS: real Chromium Chinese/English clicks through packaged Worker; visible labels change and all entered values preserved');
}catch(e){evidence.browser=String(e.message).startsWith('BLOCKED:')?'BLOCKED':'FAIL';evidence.result=evidence.browser;evidence.reason=e.message;console.log(evidence.browser+': '+e.message);process.exitCode=1;}
finally{if(ws?.readyState===1){try{await cdp('Browser.close');}catch{}ws.close();}chrome?.kill();if(server)await new Promise(r=>server.close(r));raw.close();writeFileSync(resolve(output,'guest-browser-result.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));}
