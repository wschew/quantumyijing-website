// Local-only workerd + persistent disposable D1. Never installs or uses Wrangler.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {authenticator,response} from './webauthn-synthetic-fixtures.mjs';
import {b64,hash} from './webauthn-synthetic-validation.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(process.env.QY_MINIFLARE_PATH);
const evidence=mkdtempSync(resolve('.local-c1-package-step2db1-'));
const persist=resolve(evidence,'d1'),id='22222222-3333-4444-8555-666666666666';
let gate=null,fault=null;
const control=async req=>{
 const {stage}=await req.json();
 if(fault===stage){fault=null;return new Response('synthetic quota-like failure',{status:503});}
 if(gate&&stage==='atomic'){
  const current=gate;current.arrived++;if(current.arrived===current.expected)current.ready();await current.hold;
 }
 return new Response('ok');
};
function arm(expected){
 assert.equal(gate,null);let ready,release;const arrived=new Promise(r=>ready=r),hold=new Promise(r=>release=r);
 gate={expected,arrived:0,ready,hold};return {arrived,release:()=>{gate=null;release();}};
}
async function reached(g){let timer;try{await Promise.race([g.arrived,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('BLOCKED: verification barrier timeout')),15000))]);}finally{clearTimeout(timer);}}
const config=(instrument=true)=>{
 const modules=['webauthn-d1-worker.mjs','webauthn-synthetic-validation.mjs','consultation-passkey-bench-fixture.mjs'].map(name=>{
  let contents=readFileSync(new URL(name,import.meta.url),'utf8');
  if(instrument&&name==='webauthn-d1-worker.mjs'){
   contents=contents.replace('const s=new D1Passkeys(env.SYNTHETIC_PASSKEY_DB);','const s=new D1Passkeys(env.SYNTHETIC_PASSKEY_DB);s.testControl=env.LOCAL_TEST_CONTROL;');
   for(const [marker,stage]of [['LOCAL_TEST_QUERY_BOUNDARY','query'],['LOCAL_TEST_ATOMIC_BOUNDARY','atomic']]){
    const target=new RegExp('// '+marker+':[^\\n]*');assert.equal((contents.match(target)||[]).length,1);
    contents=contents.replace(target,`if(!(await this.testControl.fetch('http://test-control/',{method:'POST',body:JSON.stringify({stage:'${stage}'})})).ok)throw Error('synthetic D1 failure');`);
   }
  }
  if(name==='webauthn-d1-worker.mjs')contents=contents.replace('result:null}', 'result:null,metrics:s.stats}').replace('result},{status}', 'result,metrics:s.stats},{status}').replace('if(scope)await s.admit(scope);','// Admission independently tested by test-webauthn-d1-management.mjs');
  return {type:'ESModule',path:name,contents};
 });
 return convertV4MiniflareOptions({modules,scriptPath:'webauthn-d1-worker.mjs',compatibilityDate:'2026-10-07',d1Databases:{SYNTHETIC_PASSKEY_DB:id},resourcePersistencePath:persist,serviceBindings:instrument?{LOCAL_TEST_CONTROL:control}:{},cf:false,telemetry:{enabled:false}});
};
let mf=new Miniflare(config()),db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');
let passed=0;const checks=[],samples=[];
const test=async(name,fn)=>{await fn();passed++;checks.push(name);console.log('PASS '+name);};
const digest=async s=>b64(await hash(new TextEncoder().encode(s)));
const bootstrap=b64(crypto.getRandomValues(new Uint8Array(32))),handle=b64(crypto.getRandomValues(new Uint8Array(32)));
const sql=async(q,...v)=>db.prepare(q).bind(...v).all();
const one=async(q,...v)=>(await sql(q,...v)).results[0];
async function call(path,x,label){
 const cpu=process.cpuUsage(),start=process.hrtime.bigint();const r=await mf.dispatchFetch('https://synthetic.invalid'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(x)});const body=await r.json(),elapsed=process.cpuUsage(cpu);
 const sample={operation:label??path,status:r.status,wallMs:Number(process.hrtime.bigint()-start)/1e6,hostDriverCpuMs:(elapsed.user+elapsed.system)/1000,...body.metrics};if(label)samples.push(sample);
 return {...body,status:r.status,sample};
}
async function ok(path,x,label){const r=await call(path,x,label);assert.equal(r.status,200,path);return r.result;}
async function bad(path,x){assert.equal((await call(path,x)).status,400,path);}
const begin=(kind='get',authority)=>ok('/begin',{kind,authority});
const finish=(o,r,label)=>ok('/finish',{challenge:o.challenge,response:r},label);
const reject=(o,r)=>bad('/finish',{challenge:o.challenge,response:r});
const a=await authenticator(),b=await authenticator();let count=1;
async function login(label){const o=await begin();return finish(o,await response(a,o,{count:++count}),label);}
const snapshot=async()=>{
 const result={};for(const table of ['account','credential','challenge','session','atomic_guard','security_event'])result[table]=(await sql(`SELECT * FROM ${table} ORDER BY 1`)).results;return result;
};
const authState=async c=>({used:(await one('SELECT used FROM challenge WHERE hash=?',await digest(c.challenge))).used,count:(await one('SELECT count FROM credential WHERE id=?',a.id)).count,sessions:(await one('SELECT count(*) n FROM session')).n});
const resetPlans=async capability=>[
 db.prepare('UPDATE account SET epoch=epoch+1,key_epoch=key_epoch+1,closed=0,bootstrap_hash=? WHERE id=1').bind(await digest(capability)),
 db.prepare("INSERT INTO security_event(at,kind,epoch) SELECT 0,'owner-reset',epoch FROM account WHERE id=1")
];
async function measuredReset(capability,label){
 const plans=await resetPlans(capability),start=process.hrtime.bigint(),cpu=process.cpuUsage();let results=[],success=true;
 try{results=await db.batch(plans);}catch{success=false;}
 const d=process.cpuUsage(cpu);samples.push({operation:label,status:success?200:400,wallMs:Number(process.hrtime.bigint()-start)/1e6,hostDriverCpuMs:(d.user+d.system)/1000,statements:plans.length,metadataComplete:success,rowsRead:results.reduce((n,r)=>n+r.meta.rows_read,0),rowsWritten:results.reduce((n,r)=>n+r.meta.rows_written,0),d1DurationMs:results.reduce((n,r)=>n+r.meta.duration,0)});return success;
}
try{
 for(const statement of readFileSync(new URL('webauthn-d1-schema.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await sql(statement);
 await sql('INSERT INTO account(id,epoch,handle,bootstrap_hash) VALUES(1,1,?,?)',handle,await digest(bootstrap));
 await test('only isolated binding and persistent schema',async()=>assert.equal((await one('SELECT count(*) n FROM sqlite_master WHERE type=\'table\' AND name IN (\'account\',\'credential\',\'challenge\',\'session\',\'atomic_guard\')')).n,5));
 await test('bootstrap required',()=>bad('/begin',{kind:'create',authority:'wrong'}));
 await test('two credentials required before login',()=>bad('/begin',{kind:'get'}));
 const pending=await begin('create',bootstrap),o=await begin('create',bootstrap);
 for(const [name,patch] of [['UV',{flags:65}],['UP',{flags:68}],['origin',{client:{origin:'https://wrong.invalid'}}],['RP',{authPatch:d=>d[0]^=1}],['challenge',{client:{challenge:'wrong'}}],['algorithm',{cosePatch:c=>c.set(3,-257)}],['crossOrigin',{client:{crossOrigin:'false'}}],['duplicate JSON',{clientDataBytes:new TextEncoder().encode('{"type":"wrong","type":"webauthn.create","challenge":"'+o.challenge+'","origin":"'+o.origin+'"}')}]] )await test('registration rejects '+name,async()=>reject(o,await response(a,o,patch)));
 await test('first enrollment',async()=>{await finish(o,await response(a,o),'registration finish');assert.equal((await one('SELECT count(*) n FROM credential')).n,1);});
 await test('registration replay',async()=>reject(o,await response(a,o)));
 await test('one key blocks login',()=>bad('/begin',{kind:'get'}));
 await test('distinct public keys required and failed insert rolls back challenge',async()=>{const c=await begin('create',bootstrap);await reject(c,await response({...a,id:b.id},c));assert.equal((await one('SELECT used FROM challenge WHERE hash=?',await digest(c.challenge))).used,0);});
 await test('concurrent second enrollments have one winner and close persisted bootstrap',async()=>{
  const cs=await Promise.all(Array.from({length:8},()=>begin('create',bootstrap))),keys=await Promise.all(Array.from({length:8},()=>authenticator()));
  const rs=await Promise.all(cs.map((c,i)=>response(keys[i],c))),out=await Promise.all(cs.map((c,i)=>call('/finish',{challenge:c.challenge,response:rs[i]})));
  assert.equal(out.filter(r=>r.status===200).length,1);assert.equal((await one('SELECT count(*) n FROM credential')).n,2);assert.equal((await one('SELECT closed FROM account')).closed,1);
 });
 await test('pending bootstrap cannot enroll third key',async()=>reject(pending,await response(await authenticator(),pending)));
 await test('bootstrap closed at begin',()=>bad('/begin',{kind:'create',authority:bootstrap}));
 await test('state survives workerd disposal and reopen',async()=>{await mf.dispose();mf=new Miniflare(config());db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');assert.equal((await one('SELECT closed FROM account')).closed,1);assert.equal((await one('SELECT count(*) n FROM credential')).n,2);await bad('/begin',{kind:'create',authority:bootstrap});});
 const auth=await begin();
 for(const [name,patch] of [['UV',{flags:1}],['RP',{authPatch:d=>d[0]^=1}],['origin',{client:{origin:'https://wrong.invalid'}}],['user handle',{userHandle:'wrong'}],['zero counter',{count:0}],['equal counter',{count:1}],['typed crossOrigin',{client:{crossOrigin:null}}],['topOrigin',{client:{topOrigin:null}}],['tokenBinding',{client:{tokenBinding:null}}]])await test('login rejects '+name,async()=>reject(auth,await response(a,auth,{count:2,...patch})));
 await test('signature tampering',async()=>{const r=await response(a,auth,{count:2});r.response.signature=r.response.signature.slice(0,-3)+'AAA';await reject(auth,r);});
 let session;
 await test('valid ES256 login creates hashed session',async()=>{session=await finish(auth,await response(a,auth,{count:++count}),'login finish');assert.equal((await one('SELECT hash FROM session')).hash,await digest(session));await ok('/session',{session});});
 await test('sessions counters and pending challenges survive runtime reopen',async()=>{
  const pending=await begin();await mf.dispose();mf=new Miniflare(config());db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');await ok('/session',{session});
  assert.equal((await one('SELECT count FROM credential WHERE id=?',a.id)).count,count);await finish(pending,await response(a,pending,{count:++count}));
 });
 await test('challenge replay denied',async()=>reject(auth,await response(a,auth,{count:++count})));
 await test('challenge expiry',async()=>{const c=await begin();await sql('UPDATE challenge SET expires=0 WHERE hash=?',await digest(c.challenge));await reject(c,await response(a,c,{count:++count}));});
 await test('concurrent identical assertion exactly one winner',async()=>{const c=await begin(),r=await response(a,c,{count:++count});const results=await Promise.all(Array.from({length:12},()=>call('/finish',{challenge:c.challenge,response:r},'concurrent replay')));assert.equal(results.filter(r=>r.status===200).length,1);});
 await test('concurrent distinct challenges same counter exactly one winner',async()=>{const cs=await Promise.all(Array.from({length:8},()=>begin()));const n=++count,rs=await Promise.all(cs.map(c=>response(a,c,{count:n})));const out=await Promise.all(cs.map((c,i)=>call('/finish',{challenge:c.challenge,response:rs[i]},'concurrent counter')));assert.equal(out.filter(r=>r.status===200).length,1);});
 await test('batch rollback after session insert SQL failure',async()=>{
  const c=await begin(),r=await response(a,c,{count:++count}),before=await one('SELECT count FROM credential WHERE id=?',a.id);
  await sql("CREATE TRIGGER fail_session BEFORE INSERT ON session BEGIN SELECT RAISE(ABORT,'synthetic injected failure'); END");
  await reject(c,r);assert.equal((await one('SELECT used FROM challenge WHERE hash=?',await digest(c.challenge))).used,0);assert.equal((await one('SELECT count FROM credential WHERE id=?',a.id)).count,before.count);
  await sql('DROP TRIGGER fail_session');await finish(c,r);
 });
 await test('session-authorized additional enrollment',async()=>{const c=await begin('create',session);await finish(c,await response(await authenticator(),c));});
 await test('logout invalidates pending enrollment authority',async()=>{const c=await begin('create',session);await ok('/logout',{session});await bad('/session',{session});await reject(c,await response(await authenticator(),c));});
 await test('session expiry',async()=>{const s=await login();await sql('UPDATE session SET expires=0 WHERE hash=?',await digest(s));await bad('/session',{session:s});await bad('/begin',{kind:'create',authority:s});});
 await test('enrollment authority expiry rechecked at completion',async()=>{const s=await login(),c=await begin('create',s);await sql('UPDATE session SET expires=0 WHERE hash=?',await digest(s));await reject(c,await response(await authenticator(),c));});
 await test('revoke-all invalidates sessions and pending challenges',async()=>{const s=await login(),s2=await login(),c=await begin(),reg=await begin('create',s);await ok('/revoke-all',{session:s});await bad('/session',{session:s});await bad('/session',{session:s2});await reject(c,await response(a,c,{count:++count}));await reject(reg,await response(await authenticator(),reg));});
 await test('unauthenticated revoke-all denied',()=>bad('/revoke-all',{session:'wrong'}));
 await test('concurrent login and revoke-all leave no usable old-epoch session',async()=>{
  const s=await login(),cs=await Promise.all(Array.from({length:8},()=>begin())),n=++count,rs=await Promise.all(cs.map(c=>response(a,c,{count:n})));
  const out=await Promise.all([call('/revoke-all',{session:s}),...cs.map((c,i)=>call('/finish',{challenge:c.challenge,response:rs[i]}))]);assert.equal(out[0].status,200);
  for(const r of out.slice(1))if(r.status===200)await bad('/session',{session:r.result});
  assert.equal((await one('SELECT count(*) n FROM session s,account a WHERE s.epoch=a.epoch AND s.revoked=0')).n,0);
 });
 await test('no recovery or reset HTTP surface',async()=>{for(const path of ['/recover','/reset','/bootstrap'])assert.equal((await call(path,{})).status,404);});
 await test('guard rows do not persist',async()=>assert.equal((await one('SELECT count(*) n FROM atomic_guard')).n,0));
 for(const distinct of [false,true])await test('deterministic post-verification '+(distinct?'counter CAS':'identical replay')+' races (25 rounds of four)',async()=>{
  for(let round=0;round<25;round++){
   const cs=distinct?await Promise.all(Array.from({length:4},()=>begin())):Array(4).fill(await begin()),n=++count;
   const rs=await Promise.all(cs.map(c=>response(a,c,{count:n}))),before=await authState(cs[0]),g=arm(4);
   const pending=cs.map((c,i)=>call('/finish',{challenge:c.challenge,response:rs[i]},distinct?'barrier counter':'barrier replay'));
   try{await reached(g);assert.equal(gate.arrived,4);assert.deepEqual(await authState(cs[0]),before);}finally{g.release();}
   const results=await Promise.all(pending);assert.equal(results.filter(r=>r.status===200).length,1);
   for(const r of results){assert.equal(r.metrics.statements,7);assert.equal(r.metrics.metadataComplete,r.status===200);}
   const after=await authState(cs[0]);assert.equal(after.count,n);assert.equal(after.sessions,before.sessions+1);
   const uses=await Promise.all(cs.map(async c=>(await authState(c)).used));assert.equal(uses.reduce((n,v)=>n+v,0),distinct?1:4);
   assert.equal((await one('SELECT count(*) n FROM atomic_guard')).n,0);
  }
 });
 for(const change of ['expiry','credential revocation','epoch'])await test('post-verification '+change+' fails without partial authentication state',async()=>{
  const c=await begin(),r=await response(a,c,{count:++count}),g=arm(1),pending=call('/finish',{challenge:c.challenge,response:r},'boundary '+change);
  try{
   await reached(g);
   if(change==='expiry')await sql('UPDATE challenge SET expires=0 WHERE hash=?',await digest(c.challenge));
   if(change==='credential revocation')await sql('UPDATE credential SET revoked=1 WHERE id=?',a.id);
   if(change==='epoch')await sql('UPDATE account SET epoch=epoch+1 WHERE id=1');
   const before=await snapshot();g.release();const out=await pending;assert.equal(out.status,400);assert.equal(out.metrics.statements,7);assert.equal(out.metrics.metadataComplete,false);assert.deepEqual(await snapshot(),before);
  }finally{g.release();if(change==='credential revocation')await sql('UPDATE credential SET revoked=0 WHERE id=?',a.id);}
 });
 for(const stage of ['query','atomic'])await test('quota-like '+stage+' failure has incomplete metadata and safe explicit retry',async()=>{
  const c=await begin(),r=await response(a,c,{count:++count}),before=await snapshot();fault=stage;
  const failed=await call('/finish',{challenge:c.challenge,response:r},'injected '+stage+' failure');assert.equal(failed.status,400);assert.equal(failed.metrics.metadataComplete,false);assert.deepEqual(await snapshot(),before);
  await finish(c,r,'explicit retry after '+stage+' failure');await reject(c,r);
 });
 await test('real D1 standalone query error reports incomplete metadata',async()=>{
  await sql('ALTER TABLE challenge RENAME TO challenge_unavailable');
  try{const out=await call('/finish',{challenge:'synthetic',response:{}},'real query error');assert.equal(out.status,400);assert.equal(out.metrics.metadataComplete,false);assert.equal(out.metrics.statements,1);}finally{await sql('ALTER TABLE challenge_unavailable RENAME TO challenge');}
 });
 await test('public input cannot activate the test barrier or reset routes',async()=>{
  assert.equal(gate,null);const s=await login();await ok('/session',{session:s,barrier:true,LOCAL_TEST_CONTROL:true});assert.equal(gate,null);
  for(const path of ['/test-control','/barrier','/reset'])assert.equal((await call(path,{release:true})).status,404);
 });
 await test('enrollment session expiry after verification prevents writes',async()=>{
  const s=await login(),c=await begin('create',s),r=await response(await authenticator(),c),g=arm(1),pending=call('/finish',{challenge:c.challenge,response:r},'boundary enrollment session expiry');
  try{await reached(g);await sql('UPDATE session SET expires=0 WHERE hash=?',await digest(s));const before=await snapshot();g.release();assert.equal((await pending).status,400);assert.deepEqual(await snapshot(),before);}finally{g.release();}
 });
 await test('bounded reader cancels chunked input early and enforces UTF-8 byte limits in workerd',async()=>{
  const probe=`import {readBoundedJSON} from './webauthn-d1-worker.mjs';export default {async fetch(){const results=[];
   for(const mode of ['chunked','lying-length','declared-large','exact','utf8']){
    let pulls=0,cancelled=false;const chunks=mode==='exact'?[new TextEncoder().encode('{}'+' '.repeat(19998))]:mode==='utf8'?[new TextEncoder().encode('"'+'é'.repeat(10000)+'"')]:[new Uint8Array(19999).fill(32),new Uint8Array(2).fill(32),new Uint8Array(100000)];
    const stream=new ReadableStream({pull(c){pulls++;if(pulls<=chunks.length)c.enqueue(chunks[pulls-1]);else c.close();},cancel(){cancelled=true;}},{highWaterMark:0});
    const headers=mode==='lying-length'?{'content-length':'1'}:mode==='declared-large'?{'content-length':'20001'}:{};
    let accepted=true;try{await readBoundedJSON(new Request('https://synthetic.invalid/',{method:'POST',body:stream,headers}));}catch{accepted=false;}
    results.push({mode,pulls,cancelled,accepted});
   }return Response.json(results);}}`;
  const probeModules=[{type:'ESModule',path:'reader-probe.mjs',contents:probe},...['webauthn-d1-worker.mjs','webauthn-synthetic-validation.mjs','consultation-passkey-bench-fixture.mjs'].map(name=>({type:'ESModule',path:name,contents:readFileSync(new URL(name,import.meta.url),'utf8')}))];
  const runtime=new Miniflare(convertV4MiniflareOptions({modules:probeModules,scriptPath:'reader-probe.mjs',compatibilityDate:'2026-10-07',cf:false,telemetry:{enabled:false}}));
  try{const result=await (await runtime.dispatchFetch('https://synthetic.invalid/')).json();
   for(const r of result){assert.equal(r.accepted,r.mode==='exact');if(['chunked','lying-length'].includes(r.mode)){assert.equal(r.pulls,2);assert.equal(r.cancelled,true);}if(r.mode==='declared-large')assert.equal(r.pulls,0);}
  }finally{await runtime.dispose();}
 });
 // Reopen the SAME persistent database without test-control barriers: all serial
 // profiling below excludes test-control RPC and barrier overhead.
 await mf.dispose();mf=new Miniflare(config(false));db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');
 await test('regression wrapper has no test-control binding and authenticates normally',async()=>{const s=await login();await ok('/session',{session:s});});
 // Complete begin/finish HTTP timings; signing is client work, excluded. Each
 // finish still includes parsing, crypto, challenge/counter checks and D1 batch.
 for(let i=0;i<100;i++){
  const s=await login('login finish');
  const br=await call('/begin',{kind:'create',authority:s},'registration begin'),c=br.result;assert.equal(br.status,200);
  const r=await response(await authenticator(),c);
  const f=await call('/finish',{challenge:c.challenge,response:r},'registration finish');assert.equal(f.status,200);
  samples.push({operation:'registration begin + finish',status:200,...Object.fromEntries(['wallMs','hostDriverCpuMs','statements','rowsRead','rowsWritten','d1DurationMs'].map(k=>[k,br.sample[k]+f.sample[k]]))});
 }
 for(let i=0;i<100;i++){
  const c=await call('/begin',{kind:'get'},'login begin'),r=await response(a,c.result,{count:++count});
  const f=await call('/finish',{challenge:c.result.challenge,response:r},'login finish');assert.equal(f.status,200);
  samples.push({operation:'login begin + finish',status:200,...Object.fromEntries(['wallMs','hostDriverCpuMs','statements','rowsRead','rowsWritten','d1DurationMs'].map(k=>[k,c.sample[k]+f.sample[k]]))});
 }
 // Hardened JSON validation with correctly signed adversarial bytes in the
 // actual Worker, using the same outstanding challenge for invalid requests.
 const c=await begin();
 for(const [name,clientDataBytes] of [['valid',undefined],['duplicate',new TextEncoder().encode('{"type":"webauthn.get","type":"webauthn.get","challenge":"'+c.challenge+'","origin":"'+c.origin+'"}')],['bounded nested',new TextEncoder().encode(JSON.stringify({type:'webauthn.get',challenge:c.challenge,origin:c.origin,future:Array.from({length:180},(_,i)=>i)}))]]){
  for(let i=0;i<100;i++){
   const fresh=name==='duplicate'?c:await begin(),r=await response(a,fresh,{count:++count,clientDataBytes:name==='bounded nested'?new TextEncoder().encode(JSON.stringify({type:'webauthn.get',challenge:fresh.challenge,origin:fresh.origin,future:Array.from({length:180},(_,i)=>i)})):clientDataBytes});
   const out=await call('/finish',{challenge:fresh.challenge,response:r},'JSON '+name);assert.equal(out.status,name==='duplicate'?400:200);
  }
 }
 await test('streaming HTTP size limit rejects oversized and malformed requests before D1',async()=>{
  for(const body of [' '.repeat(20001),'"'+'\u00e9'.repeat(10000)+'"']){
   const res=await mf.dispatchFetch('https://synthetic.invalid/begin',{method:'POST',headers:{'content-type':'application/json'},body});assert.equal(res.status,400);assert.equal((await res.json()).metrics.statements,0);
  }
  const body='{"session":"wrong"}';const exact=body+' '.repeat(20000-Buffer.byteLength(body));const out=await mf.dispatchFetch('https://synthetic.invalid/session',{method:'POST',headers:{'content-type':'application/json'},body:exact});assert.equal(out.status,400);assert.equal((await out.json()).metrics.statements,1);
  for(const body of ['{',Uint8Array.of(0xff)]){const out=await mf.dispatchFetch('https://synthetic.invalid/begin',{method:'POST',headers:{'content-type':'application/json'},body});assert.equal(out.status,400);assert.equal((await out.json()).metrics.statements,0);}
 });
 await test('profile failed signature and SQL rollback paths with safe retries (100 each)',async()=>{
  for(let i=0;i<100;i++){
   const c=await begin(),r=await response(a,c,{count:++count}),bad=structuredClone(r);bad.response.signature=bad.response.signature.slice(0,-3)+'AAA';
   const state=await authState(c);assert.equal((await call('/finish',{challenge:c.challenge,response:bad},'invalid signature')).status,400);assert.deepEqual(await authState(c),state);
   await sql("CREATE TRIGGER fail_session BEFORE INSERT ON session BEGIN SELECT RAISE(ABORT,'synthetic session failure'); END");
   try{const out=await call('/finish',{challenge:c.challenge,response:r},'session insert rollback');assert.equal(out.status,400);assert.equal(out.metrics.metadataComplete,false);assert.deepEqual(await authState(c),state);}finally{await sql('DROP TRIGGER fail_session');}
   await finish(c,r,'retry after session rollback');
  }
 });
 await test('profile logout and revoke-all including growing retained history (100 each)',async()=>{
  for(let i=0;i<100;i++){const s=await login();await ok('/logout',{session:s},'logout');await bad('/session',{session:s});}
  for(let i=0;i<100;i++){const s=await login();await begin();await ok('/revoke-all',{session:s},'revoke-all');await bad('/session',{session:s});}
 });
 const growthBefore=await snapshot();
 await test('offline reset failure rolls back every table (100 profiled failures)',async()=>{
  await sql("CREATE TRIGGER fail_reset BEFORE UPDATE ON account BEGIN SELECT RAISE(ABORT,'synthetic reset failure'); END");
  try{for(let i=0;i<100;i++){assert.equal(await measuredReset('synthetic-unused-reset-capability','offline reset rollback'),false);assert.deepEqual(await snapshot(),growthBefore);}}finally{await sql('DROP TRIGGER fail_reset');}
 });
 // Trusted offline owner simulation through the harness's direct database
 // handle. This is deliberately absent from the Worker dispatcher and exports.
 const oldSession=await login(),oldChallenge=await begin(),replacementBootstrap=b64(crypto.getRandomValues(new Uint8Array(32)));
 await test('offline owner reset atomically revokes old keys sessions challenges and bootstrap',async()=>{
  await db.batch([
   db.prepare('UPDATE account SET epoch=epoch+1,key_epoch=key_epoch+1,closed=0,bootstrap_hash=? WHERE id=1').bind(await digest(replacementBootstrap)),
   db.prepare("INSERT INTO security_event(at,kind,epoch) SELECT 0,'owner-reset',epoch FROM account WHERE id=1")
  ]);
  await bad('/session',{session:oldSession});await reject(oldChallenge,await response(a,oldChallenge,{count:++count}));await bad('/begin',{kind:'create',authority:bootstrap});await bad('/begin',{kind:'get'});
 });
 const replacementA=await authenticator(),replacementB=await authenticator();
 await test('recovery still requires two fresh credentials',async()=>{
  const c=await begin('create',replacementBootstrap);await finish(c,await response(replacementA,c));await bad('/begin',{kind:'get'});
  const d=await begin('create',replacementBootstrap);await finish(d,await response(replacementB,d));await bad('/begin',{kind:'create',authority:replacementBootstrap});
 });
 await test('old credentials fail after recovery and fresh UV key can login',async()=>{
  const c=await begin();await reject(c,await response(a,c,{count:++count}));const s=await finish(c,await response(replacementA,c,{count:2}));await ok('/session',{session:s});
 });
 const resetGrowth={credentials:(await one('SELECT count(*) n FROM credential')).n,sessions:(await one('SELECT count(*) n FROM session')).n,challenges:(await one('SELECT count(*) n FROM challenge')).n};
 await test('profile successful offline resets over retained history (100 operations)',async()=>{for(let i=0;i<100;i++)assert.equal(await measuredReset('synthetic-offline-profile-capability','offline reset success'),true);});
 const pct=values=>{const v=values.sort((a,b)=>a-b);return Object.fromEntries([['p50',.5],['p95',.95],['max',1]].map(([k,p])=>[k,v[Math.ceil(v.length*p)-1]]));};
 const summary=[...new Set(samples.map(s=>s.operation))].map(operation=>{const rows=samples.filter(s=>s.operation===operation);return {operation,n:rows.length,...Object.fromEntries(['wallMs','hostDriverCpuMs','statements','rowsRead','rowsWritten','d1DurationMs'].map(k=>[k,pct(rows.map(s=>s[k]))]))};});
 const versions=Object.fromEntries(['miniflare','workerd'].map(n=>[n,JSON.parse(readFileSync(require.resolve(n+'/package.json',{paths:[require.resolve(process.env.QY_MINIFLARE_PATH)]}))).version]));
 const result={passed,checks,node:process.version,versions,evidence,resetGrowth,method:'Actual local workerd; dedicated on-disk Miniflare D1. Barrier/boundary/injected groups use harness-only source instrumentation and Node service binding, so include test-control/wait overhead. Admission is independently tested in the management suite. Serial profiling reopens a regression wrapper with admission disabled and metrics restored, with NO test-control binding. Host wall includes dispatch and body consumption; combined begin+finish excludes synthetic signing. Nearest rank; no discarded warmup. statements counts submitted application SQL plans, NOT actual execution or internal transactions/retries/rollbacks. Offline resets use direct D1 driver binding with two plans; hashing/preparation excluded. D1 metadata is returned local rows/duration, not deployed billing or CPU. Failed batches/queries have metadataComplete=false and unavailable failed-operation metadata; only prior successful metadata retained. No automatic application retries; explicit retries are separate samples. hostDriverCpuMs is Node process user+system CPU, Windows quantized, excludes workerd subprocess; overlapping concurrent CPU is not additive. Workerd and deployed CPU unavailable. JSON groups measure full finish path, not isolated parser CPU.',summary,samples};
 writeFileSync(resolve(evidence,'results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 const output=process.argv[2]?resolve(process.argv[2]):new URL('../docs/quantum-yijing-c1-step2db1-measurements.json',import.meta.url);
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({passed,evidence,summary},null,2));console.log(`RESULT: ${passed} passed, 0 failed`);
}finally{await mf.dispose();}
