// Local-only Chromium CDP virtual-authenticator integration; no installed npm browser driver.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,existsSync,openSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {b64,hash} from './webauthn-synthetic-validation.mjs';
import {hexToken} from './webauthn-d1-policy.mjs';
import {instrumentEnrollment,instrumentMetrics} from './webauthn-d1-test-client.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(process.env.QY_MINIFLARE_PATH);
const evidence=mkdtempSync(resolve('.local-c1-package-step2db4b1-browser-'));
const checks=[],samples=[],browserSamples=[],ceremonySamples=[],failures=[];let mf,db,chrome,ws,server,origin,authA,setupError;
const digest=async s=>b64(await hash(new TextEncoder().encode(s)));
const bootstrap=b64(crypto.getRandomValues(new Uint8Array(32))),handle=b64(crypto.getRandomValues(new Uint8Array(32)));
const controlKey=hexToken();
const sql=async(q,...v)=>db.prepare(q).bind(...v).all();
const one=async(q,...v)=>(await sql(q,...v)).results[0];
const test=async(name,fn)=>{try{await fn();checks.push(name);console.log('PASS '+name);}catch(e){failures.push({name,error:String(e)});throw e;}};
function config(){
 const modules=['webauthn-d1-worker.mjs','webauthn-d1-policy.mjs','webauthn-synthetic-validation.mjs','consultation-passkey-bench-fixture.mjs'].map(name=>{
  let contents=readFileSync(new URL(name,import.meta.url),'utf8');
  if(name==='webauthn-d1-worker.mjs'){
   // Only RP configuration and observability differ; parser, crypto, admission and SQL remain real.
   contents=contents.replaceAll("'synthetic.invalid'","'localhost'").replaceAll("'https://synthetic.invalid'",JSON.stringify(origin));
   contents=instrumentMetrics(instrumentEnrollment(contents));
  }
  return {type:'ESModule',path:name,contents};
 });
 return convertV4MiniflareOptions({modules,scriptPath:'webauthn-d1-worker.mjs',compatibilityDate:'2026-10-07',bindings:{SYNTHETIC_CONTROL_KEY:controlKey},d1Databases:{SYNTHETIC_PASSKEY_DB:'bbbbbbbb-2222-4444-8888-222222222222'},resourcePersistencePath:resolve(evidence,'d1'),cf:false,telemetry:{enabled:false}});
}
async function restart(){if(mf)await mf.dispose();mf=new Miniflare(config());db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');}
let seq=0;const pending=new Map();
async function connect(url){ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};}
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function call(path,x){
 if(path==='/begin'&&x.kind==='create'||path==='/finish'&&x.response?.response?.attestationObject!==undefined){
  // Trusted Node-only enrollment. These routes are NOT forwarded by HTTP adapter.
  const route=path==='/begin'?'/local-enroll-begin':'/local-enroll-finish',r=await mf.dispatchFetch(origin+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(x)}),body=await r.json();
  if(r.status===200&&path==='/finish')await sql('INSERT OR IGNORE INTO credential_custody VALUES(?,?)',x.response.id,'virtual-'+x.response.id);
  return{...body,status:r.status};
 }
 if(['/revoke-all','/revoke-credential','/suspend'].includes(path)&&!x.proof){const o=await ok('/control-options',{session:x.session,action:path.slice(1),id:x.id});x={...x,ticket:o.ticket,proof:await ceremony(o)};}
 const r=await evaluate(`request(${JSON.stringify(path)},${JSON.stringify(x)})`);browserSamples.push({operation:path,status:r.status,browserRequestMs:r.browserRequestMs});return r;
}
async function ok(path,x){const r=await call(path,x);assert.equal(r.status,200,path+' '+JSON.stringify(r));return r.result;}
async function bad(path,x){assert.equal((await call(path,x)).status,400,path);}
const begin=(kind='get',authority)=>ok('/begin',{kind,authority});
const finish=(o,response)=>ok('/finish',{challenge:o.challenge,response});
const reject=(o,response)=>bad('/finish',{challenge:o.challenge,response});
async function ceremony(o,extra={}){
 if(o.kind==='get'&&!extra.allowCredentials)extra={allowCredentials:(await sql('SELECT id FROM credential WHERE revoked=0')).results.map(r=>({type:'public-key',id:r.id})),...extra};
 const start=performance.now();const r=await evaluate(`ceremony(${JSON.stringify(o)},${JSON.stringify(extra)})`);ceremonySamples.push({kind:o.kind,hostCeremonyWallMs:performance.now()-start});return r;
}
async function login(){const o=await begin();return finish(o,await ceremony(o));}
const mutate=(r,field,fn)=>{r=structuredClone(r);const bytes=Buffer.from(r.response[field],'base64url');fn(bytes);r.response[field]=bytes.toString('base64url');return r;};
const page=`<!doctype html><meta charset="utf-8"><title>Isolated C1 virtual WebAuthn test</title><p>Disposable local synthetic test.</p><script>
const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
let csrf;
async function request(path,x){const start=performance.now(),r=await fetch(path,{method:'POST',headers:{'content-type':'application/json',...(csrf?{'x-qy-consultation-csrf':csrf}:{})},body:JSON.stringify(x)}),body=await r.json();if(body.csrfToken)csrf=body.csrfToken;return {...body,status:r.status,browserRequestMs:performance.now()-start};}
async function ceremony(o,extra){const publicKey={challenge:decode(o.challenge),timeout:5000,userVerification:'required',...extra};
 if(o.kind==='create')Object.assign(publicKey,{rp:{id:o.rpId,name:'Synthetic only'},user:{id:decode(o.userHandle),name:'synthetic',displayName:'Synthetic'},pubKeyCredParams:o.pubKeyCredParams,attestation:'none',authenticatorSelection:{userVerification:'required',residentKey:'discouraged'}});
 else {publicKey.rpId=o.rpId;if(publicKey.allowCredentials)publicKey.allowCredentials=publicKey.allowCredentials.map(c=>({...c,id:decode(c.id)}));}
 const c=await navigator.credentials[o.kind==='create'?'create':'get']({publicKey});
 const response={clientDataJSON:encode(c.response.clientDataJSON)};
 if(o.kind==='create')response.attestationObject=encode(c.response.attestationObject);
 else Object.assign(response,{authenticatorData:encode(c.response.authenticatorData),signature:encode(c.response.signature),userHandle:c.response.userHandle===null?null:encode(c.response.userHandle)});
 return {id:c.id,rawId:encode(c.rawId),type:c.type,clientExtensionResults:c.getClientExtensionResults(),response};
}
</script>`;
let versions={};
try{
 server=createServer(async(req,res)=>{
  try{
   if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end();return;}
   if(req.method==='GET'&&req.url==='/'){res.setHeader('content-type','text/html');res.end(page);return;}
   if(req.method!=='POST'||!['/begin','/finish','/session','/logout','/revoke-all','/revoke-credential','/control-options','/suspend'].includes(req.url)){res.writeHead(404);res.end();return;}
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>20000)throw Error('body bound');chunks.push(c);}
   const start=performance.now(),cpu=process.cpuUsage();
   const forwarded=Object.fromEntries(['content-type','origin','cookie','x-qy-consultation-csrf','sec-fetch-site'].filter(k=>req.headers[k]!==undefined).map(k=>[k,req.headers[k]]));
   const r=await mf.dispatchFetch(origin+req.url,{method:'POST',headers:forwarded,body:Buffer.concat(chunks)}),body=await r.json(),used=process.cpuUsage(cpu);
   samples.push({operation:req.url,status:r.status,hostWallMs:performance.now()-start,hostDriverCpuMs:(used.user+used.system)/1000,...body.metrics});
   res.writeHead(r.status,{'content-type':'application/json','cache-control':'no-store',...(r.headers.getSetCookie().length?{'set-cookie':r.headers.getSetCookie()}:{})});res.end(JSON.stringify(body));
  }catch{res.writeHead(500);res.end('{}');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://localhost:'+server.address().port;
 await restart();
 for(const statement of readFileSync(new URL('webauthn-d1-schema.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await sql(statement);
 await sql('INSERT INTO account(id,epoch,handle,bootstrap_hash) VALUES(1,1,?,?)',handle,await digest(bootstrap));
 const profile=resolve(evidence,'chrome-profile');
 const chromeLog=openSync(resolve(evidence,'chrome.log'),'wx');
 try{chrome=spawn(process.env.QY_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1','about:blank'],{stdio:['ignore',chromeLog,chromeLog],windowsHide:true});}finally{closeSync(chromeLog);}
 const active=resolve(profile,'DevToolsActivePort');
 for(let i=0;!existsSync(active)&&i<100;i++)await new Promise(r=>setTimeout(r,100));
 if(!existsSync(active))throw Error('BLOCKED: Chrome DevTools port unavailable');
 const port=Number(readFileSync(active,'utf8').split('\n')[0]);
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();await connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 versions=await cdp('Browser.getVersion');await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Page.navigate',{url:origin});
 for(let i=0;i<100;i++){if(await evaluate('typeof ceremony')==='function')break;await new Promise(r=>setTimeout(r,50));}
 await cdp('WebAuthn.enable',{enableUI:false});
 const add=async()=> (await cdp('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',ctap2Version:'ctap2_1',transport:'usb',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}})).authenticatorId;
 authA=await add();
 await test('localhost is a browser secure context',async()=>assert.equal(await evaluate('isSecureContext'),true));
 let a,b;
 await test('browser ES256 none registration persists credential ID and EC public key',async()=>{const o=await begin('create',bootstrap);a=await ceremony(o);await finish(o,a);const row=await one('SELECT * FROM credential WHERE id=?',a.id);assert.equal(JSON.parse(row.key).crv,'P-256');assert.equal(row.id,a.rawId);});
 await test('browser registration challenge replay rejected',async()=>{const row=await one('SELECT * FROM challenge WHERE used=1');assert.ok(row);await bad('/finish',{challenge:JSON.parse(Buffer.from(a.response.clientDataJSON,'base64url')).challenge,response:a});});
 await test('second distinct virtual authenticator enrollment',async()=>{await cdp('WebAuthn.setAutomaticPresenceSimulation',{authenticatorId:authA,enabled:false});const id=await add(),o=await begin('create',bootstrap);b=await ceremony(o);await finish(o,b);await cdp('WebAuthn.removeVirtualAuthenticator',{authenticatorId:id});await cdp('WebAuthn.setAutomaticPresenceSimulation',{authenticatorId:authA,enabled:true});assert.equal((await one('SELECT count(*) n FROM credential')).n,2);assert.notEqual(a.id,b.id);});
 let session;
 await test('browser signature verifies and creates usable session',async()=>{session=await login();await ok('/session',{session});assert.equal((await one('SELECT count FROM credential WHERE id=?',a.id)).count>0,true);});
 await test('authentication and session survive Worker restart',async()=>{await restart();await ok('/session',{session});session=await login();});
 await test('browser assertion replay rejected',async()=>{const o=await begin(),r=await ceremony(o);await finish(o,r);await reject(o,r);});
 await test('browser challenge mismatch rejected',async()=>{const o=await begin(),other=await begin();await reject(other,await ceremony(o));});
 await test('expired browser challenge rejected',async()=>{const o=await begin(),r=await ceremony(o);await sql('UPDATE challenge SET expires=0 WHERE hash=?',await digest(o.challenge));await reject(o,r);});
 await test('browser-derived invalid origin rejected',async()=>{const o=await begin(),r=await ceremony(o),c=JSON.parse(Buffer.from(r.response.clientDataJSON,'base64url'));c.origin='https://wrong.invalid';r.response.clientDataJSON=Buffer.from(JSON.stringify(c)).toString('base64url');await reject(o,r);});
 await test('browser-derived invalid RP hash rejected',async()=>{const o=await begin();await reject(o,mutate(await ceremony(o),'authenticatorData',d=>d[0]^=1));});
 await test('browser-derived missing UP rejected',async()=>{const o=await begin();await reject(o,mutate(await ceremony(o),'authenticatorData',d=>d[32]&=~1));});
 await test('virtual authenticator signed missing UV rejected',async()=>{await cdp('WebAuthn.setResponseOverrideBits',{authenticatorId:authA,isBadUV:true});try{const o=await begin();await reject(o,await ceremony(o));}finally{await cdp('WebAuthn.setResponseOverrideBits',{authenticatorId:authA,isBadUV:false});}});
 await test('browser signature tampering rejected',async()=>{const o=await begin();await reject(o,mutate(await ceremony(o),'signature',d=>d[d.length-1]^=1));});
 await test('virtual authenticator counter rollback rejected',async()=>{const {credentials}=await cdp('WebAuthn.getCredentials',{authenticatorId:authA});assert.equal(credentials.length,1);const key=credentials[0];await cdp('WebAuthn.removeCredential',{authenticatorId:authA,credentialId:key.credentialId});await cdp('WebAuthn.addCredential',{authenticatorId:authA,credential:{...key,signCount:0}});const o=await begin();await reject(o,await ceremony(o));await cdp('WebAuthn.removeCredential',{authenticatorId:authA,credentialId:key.credentialId});await cdp('WebAuthn.addCredential',{authenticatorId:authA,credential:{...key,signCount:key.signCount+10}});});
 await test('logout rejects old session',async()=>{session=await login();await ok('/logout',{session});await bad('/session',{session});});
 await test('revoke-all restart rejects old sessions and pending browser challenges',async()=>{session=await login();const o=await begin(),r=await ceremony(o);await ok('/revoke-all',{session});await restart();await bad('/session',{session});await reject(o,r);session=await login();});
 await test('shared-account get allowance exhaustion across callers',async()=>{const window=Math.floor(Date.now()/60000);await sql("INSERT INTO rate_bucket VALUES('get',?,59) ON CONFLICT(scope) DO UPDATE SET window=excluded.window,hits=59",window);await begin();await bad('/begin',{kind:'get',authority:'different-caller'});assert.equal((await one("SELECT hits FROM rate_bucket WHERE scope='get'")).hits,60);});
 await test('rate window rollover admits and resets count',async()=>{await sql("UPDATE rate_bucket SET window=CAST(unixepoch('subsec')/60 AS INTEGER)-1,hits=60 WHERE scope='get'");await begin();assert.equal((await one("SELECT hits FROM rate_bucket WHERE scope='get'")).hits,1);});
 await test('backward rate window fails closed without changing bucket',async()=>{await sql("UPDATE rate_bucket SET window=CAST(unixepoch('subsec')/60 AS INTEGER)+10,hits=60 WHERE scope='get'");const before=await one("SELECT * FROM rate_bucket WHERE scope='get'");await bad('/begin',{kind:'get'});assert.deepEqual(await one("SELECT * FROM rate_bucket WHERE scope='get'"),before);await sql("DELETE FROM rate_bucket WHERE scope='get'");});
 await test('credential revocation rejects sessions pending assertions and two-key gate',async()=>{session=await login();const o=await begin(),r=await ceremony(o);await ok('/revoke-credential',{session,id:b.id});await bad('/session',{session});await reject(o,r);await bad('/begin',{kind:'get'});});
 const size=await sql('SELECT count(*) n FROM challenge');
 versions.localDependencies=Object.fromEntries(['miniflare','workerd'].map(n=>[n,JSON.parse(readFileSync(require.resolve(n+'/package.json',{paths:[require.resolve(process.env.QY_MINIFLARE_PATH)]}))).version]));
 versions.databaseMetadata=size.meta;
 console.log('RESULT '+checks.length+' passed, 0 failed');
}catch(e){if(!failures.length)setupError=String(e);console.error(e);process.exitCode=1;}finally{
 writeFileSync(resolve(evidence,'result.json'),JSON.stringify({origin,node:process.version,versions,checks,failures,setupError,samples,browserSamples,ceremonySamples,blocked:['physical security key','platform authenticator','Firefox','WebKit','deployed Worker CPU / Free qualification'],cpuCaveat:'hostDriverCpuMs covers Node driver only; neither browser latency nor host wall time is deployed Worker CPU'},null,2));
 console.log('EVIDENCE '+evidence);
 try{if(ws?.readyState===1)await cdp('Browser.close');}catch{}ws?.close();chrome?.kill();if(server)await new Promise(r=>server.close(r));if(mf)await mf.dispose();
}
