// Local-only workerd + persistent disposable D1. Never installs or uses Wrangler.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {authenticator,response} from './webauthn-synthetic-fixtures.mjs';
import {b64,hash} from './webauthn-synthetic-validation.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(process.env.QY_MINIFLARE_PATH);
const evidence=mkdtempSync(resolve('.local-c1-package-step2db2a-'));
const persist=resolve(evidence,'d1'),id='22222222-3333-4444-8555-666666666666';
// Freeze only the admission window, so contention never straddles a minute.
// Expiry/cleanup still use real database time; pristine checks use all real SQL.
const rateWindow=Math.floor(Date.now()/60000);
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
const config=(instrument=true,pristine=false)=>{
 const modules=['webauthn-d1-worker.mjs','webauthn-synthetic-validation.mjs','consultation-passkey-bench-fixture.mjs'].map(name=>{
  let contents=readFileSync(new URL(name,import.meta.url),'utf8');
  if(!pristine&&name==='webauthn-d1-worker.mjs')contents=contents.replace('VALUES(?,CAST(${dbNow}/60000 AS INTEGER),1)',`VALUES(?,${rateWindow},1)`);
  if(instrument&&name==='webauthn-d1-worker.mjs'){
   contents=contents.replace('const s=new D1Passkeys(env.SYNTHETIC_PASSKEY_DB);','const s=new D1Passkeys(env.SYNTHETIC_PASSKEY_DB);s.testControl=env.LOCAL_TEST_CONTROL;');
   for(const [marker,stage]of [['LOCAL_TEST_QUERY_BOUNDARY','query'],['LOCAL_TEST_ATOMIC_BOUNDARY','atomic']]){
    const target=new RegExp('// '+marker+':[^\\n]*');assert.equal((contents.match(target)||[]).length,1);
    contents=contents.replace(target,`if(!(await this.testControl.fetch('http://test-control/',{method:'POST',body:JSON.stringify({stage:'${stage}'})})).ok)throw Error('synthetic D1 failure');`);
   }
  }
  if(!pristine&&name==='webauthn-d1-worker.mjs')contents=contents.replace('result:null}', 'result:null,metrics:s.stats}').replace('result},{status}', 'result,metrics:s.stats},{status}');
  if(!pristine&&name==='webauthn-d1-worker.mjs')contents=contents.replace("   case '/begin':", "   case '/local-cleanup':result=await s.cleanup();break;\n   case '/local-reset':await s.ownerReset(x.hash);result=true;break;\n   case '/begin':");
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
const clearRates=()=>sql('DELETE FROM rate_bucket');
const maintenance=()=>ok('/local-cleanup',{},'cleanup');
try{
 for(const statement of readFileSync(new URL('webauthn-d1-schema.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await sql(statement);
 await sql('INSERT INTO account(id,epoch,handle,bootstrap_hash) VALUES(1,1,?,?)',handle,await digest(bootstrap));
 for(const key of [a,b]){const c=await begin('create',bootstrap);await finish(c,await response(key,c));}
 await test('admission contention: exactly remaining get allowance wins',async()=>{
  await clearRates();await sql("INSERT INTO rate_bucket VALUES('get',?,55)",rateWindow);
  const out=await Promise.all(Array.from({length:24},()=>call('/begin',{kind:'get'},'rate contention')));
  assert.equal(out.filter(r=>r.status===200).length,5);assert.equal((await one("SELECT hits FROM rate_bucket WHERE scope='get'")).hits,60);
  await clearRates();
 });
 await test('all five fixed scopes count failures and cap atomically',async()=>{
  for(const [scope,path,x,limit] of [['get','/begin',{kind:'get'},60],['create','/begin',{kind:'create',authority:'wrong'},20],['finish','/finish',{challenge:'wrong',response:{}},120],['control','/logout',{session:'wrong'},30],['session','/session',{session:'wrong'},120]]){
   await clearRates();await sql('INSERT INTO rate_bucket VALUES(?,?,?)',scope,rateWindow,limit-1);
   await call(path,x);const out=await call(path,x,'rate rejected '+scope);assert.equal(out.status,400);assert.equal(out.metrics.statements,1);assert.equal(out.result,null);
   assert.equal((await one('SELECT hits FROM rate_bucket WHERE scope=?',scope)).hits,limit);
   await sql('UPDATE rate_bucket SET window=window-1');await call(path,x);assert.equal((await one('SELECT hits FROM rate_bucket WHERE scope=?',scope)).hits,1);
  }await clearRates();
 });
 await test('all five backward admission windows fail closed and preserve buckets',async()=>{
  for(const [scope,path,x,limit] of [['get','/begin',{kind:'get'},60],['create','/begin',{kind:'create',authority:'wrong'},20],['finish','/finish',{challenge:'wrong',response:{}},120],['control','/logout',{session:'wrong'},30],['session','/session',{session:'wrong'},120]]){
   for(const hits of [0,limit]){
    await clearRates();await sql('INSERT INTO rate_bucket VALUES(?,?,?)',scope,rateWindow+10,hits);
    const before=await one('SELECT * FROM rate_bucket WHERE scope=?',scope);
    const out=await call(path,x,'backward window '+scope);assert.equal(out.status,400);assert.equal(out.metrics.statements,1);
    assert.deepEqual(await one('SELECT * FROM rate_bucket WHERE scope=?',scope),before);
   }
  }await clearRates();
 });
 await test('shared account exhaustion cannot be escaped with caller-controlled authority',async()=>{
  await clearRates();await sql("INSERT INTO rate_bucket VALUES('get',?,59)",rateWindow);
  await begin();await bad('/begin',{kind:'get',authority:'different-synthetic-caller'});
  assert.equal((await one("SELECT hits FROM rate_bucket WHERE scope='get'")).hits,60);
  assert.equal((await one('SELECT count(*) n FROM rate_bucket')).n,1);await clearRates();
 });
 await test('revoke-all persists across restart rejecting old sessions and unused challenges',async()=>{
  const s=await login(),c=await begin(),r=await response(a,c,{count:++count});
  await ok('/revoke-all',{session:s});await mf.dispose();mf=new Miniflare(config());db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');
  await bad('/session',{session:s});await reject(c,r);
  assert.equal((await one('SELECT used FROM challenge WHERE hash=?',await digest(c.challenge))).used,0);
  await login();await clearRates();
 });
 await test('forced authentication-first then revoke invalidates issued session',async()=>{
  const s=await login(),c=await begin(),r=await response(a,c,{count:++count}),g=arm(1),pending=call('/finish',{challenge:c.challenge,response:r},'forced auth first');
  try{await reached(g);g.release();const out=await pending;assert.equal(out.status,200);await ok('/revoke-all',{session:s});await bad('/session',{session:out.result});}finally{g.release();}
 });
 await test('forced revoke-first ordering at post-verification barrier',async()=>{
  const s=await login(),c=await begin(),r=await response(a,c,{count:++count}),g=arm(1),pending=call('/finish',{challenge:c.challenge,response:r},'forced stale auth');
  try{await reached(g);
   // Independent trusted D1 transaction represents the same revoke mutation
   // while authentication is suspended immediately before its batch.
   await db.batch([db.prepare('UPDATE account SET epoch=epoch+1 WHERE id=1'),db.prepare("INSERT INTO security_event(at,kind,epoch) SELECT unixepoch('subsec')*1000,'revoke-all',epoch FROM account")]);
   g.release();assert.equal((await pending).status,400);await bad('/session',{session:s});
  }finally{g.release();}
 });
 await test('multiple concurrent revoke-all: one authorized winner, one event',async()=>{
  const sizeProbe=await sql('SELECT count(*) n FROM session');
  const seeded={sessions:sizeProbe.results[0].n,challenges:(await one('SELECT count(*) n FROM challenge')).n,databaseMetadata:sizeProbe.meta};
  const s=await login(),before=await one('SELECT epoch FROM account'),events=await one('SELECT count(*) n FROM security_event'),g=arm(8);
  const pending=Array.from({length:8},()=>call('/revoke-all',{session:s},'concurrent revoke'));
  try{await reached(g);}finally{g.release();}
  const out=await Promise.all(pending);assert.equal(out.filter(r=>r.status===200).length,1);assert.equal((await one('SELECT epoch FROM account')).epoch,before.epoch+1);assert.equal((await one('SELECT count(*) n FROM security_event')).n,events.n+1);
 });
 await clearRates();
 await test('authentication racing cleanup retains live challenge and creates valid session',async()=>{
  const c=await begin(),r=await response(a,c,{count:++count}),g=arm(1),pending=call('/finish',{challenge:c.challenge,response:r},'auth cleanup');
  try{await reached(g);await maintenance();}finally{g.release();}
  const out=await pending;assert.equal(out.status,200);await ok('/session',{session:out.result});
 });
 await test('logout and expiry invalidate sessions and pending enrollment authority',async()=>{
  const s=await login(),c=await begin('create',s);await ok('/logout',{session:s});await bad('/session',{session:s});await reject(c,await response(await authenticator(),c));
  const t=await login();await sql('UPDATE session SET expires=0 WHERE hash=?',await digest(t));await bad('/session',{session:t});
 });
 await test('audit failure rolls back revoke epoch and leaves session usable',async()=>{
  const s=await login(),before=await one('SELECT epoch FROM account');await sql("CREATE TRIGGER fail_event BEFORE INSERT ON security_event BEGIN SELECT RAISE(ABORT,'injected'); END");
  try{await bad('/revoke-all',{session:s});assert.equal((await one('SELECT epoch FROM account')).epoch,before.epoch);await ok('/session',{session:s});}finally{await sql('DROP TRIGGER fail_event');}
 });
 await test('database admission failure fails closed before challenge creation',async()=>{
  await clearRates();const before=await one('SELECT count(*) n FROM challenge');
  await sql("CREATE TRIGGER fail_rate BEFORE INSERT ON rate_bucket BEGIN SELECT RAISE(ABORT,'quota-like'); END");
  try{const out=await call('/begin',{kind:'get'},'admission DB failure');assert.equal(out.status,400);assert.equal(out.metrics.metadataComplete,false);assert.equal((await one('SELECT count(*) n FROM challenge')).n,before.n);}finally{await sql('DROP TRIGGER fail_rate');}
 });
 await test('offline reset audit failure rolls back epoch key generation and bootstrap',async()=>{
  const before=await one('SELECT * FROM account');await sql("CREATE TRIGGER fail_event BEFORE INSERT ON security_event BEGIN SELECT RAISE(ABORT,'injected'); END");
  try{await bad('/local-reset',{hash:await digest('replacement')});assert.deepEqual(await one('SELECT * FROM account'),before);}finally{await sql('DROP TRIGGER fail_event');}
 });
 await test('cleanup bound, holds, grace, concurrent cleanup and resume after rollback',async()=>{
  for(const [table,key] of [['challenge','hash'],['session','hash']]){
   await sql(`INSERT INTO ${table} SELECT 'protected-'||hash,${table==='challenge'?"kind,":""}expires,epoch,${table==='challenge'?"used,authority,bootstrap":"revoked"} FROM ${table} WHERE expires>CAST(unixepoch('subsec')*1000 AS INTEGER) AND ${table==='challenge'?'used':'revoked'}=0 ORDER BY expires DESC LIMIT 1`);
  }
  await sql("INSERT INTO challenge VALUES('grace','get',CAST(unixepoch('subsec')*1000 AS INTEGER)-1000,1,0,NULL,0)");
  await sql("INSERT INTO session VALUES('grace',CAST(unixepoch('subsec')*1000 AS INTEGER)-1000,1,0)");
  await sql("INSERT INTO security_event(at,kind,epoch,hold) VALUES(0,'held',1,1)");
  await sql("INSERT INTO security_event(at,kind,epoch) VALUES(CAST(unixepoch('subsec')*1000 AS INTEGER),'recent',1)");
  for(let i=0;i<250;i++)await sql("INSERT INTO security_event(at,kind,epoch) VALUES(0,'old',1)");
  await sql("CREATE TRIGGER fail_cleanup BEFORE DELETE ON security_event WHEN OLD.kind='old' BEGIN SELECT RAISE(ABORT,'interrupted'); END");
  await sql("INSERT INTO challenge VALUES('cleanup-old','get',0,0,0,NULL,0)");await sql("INSERT INTO session VALUES('cleanup-old',0,0,0)");
  const before=await one('SELECT count(*) n FROM security_event');
  try{await bad('/local-cleanup',{});assert.equal((await one('SELECT count(*) n FROM security_event')).n,before.n);assert.ok(await one("SELECT 1 FROM challenge WHERE hash='cleanup-old'"));assert.ok(await one("SELECT 1 FROM session WHERE hash='cleanup-old'"));}finally{await sql('DROP TRIGGER fail_cleanup');}
  await Promise.all([maintenance(),maintenance()]);assert.equal((await one("SELECT count(*) n FROM security_event WHERE kind='old'")).n,50);
  await mf.dispose();mf=new Miniflare(config());db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');
  await maintenance();assert.equal((await one("SELECT count(*) n FROM security_event WHERE kind='old'")).n,0);
  const after=await one('SELECT count(*) n FROM security_event');await maintenance();assert.equal((await one('SELECT count(*) n FROM security_event')).n,after.n);
  assert.equal((await one("SELECT count(*) n FROM security_event WHERE kind IN ('held','recent')")).n,2);
  for(const table of ['session','challenge']){assert.ok(await one(`SELECT 1 FROM ${table} WHERE hash='grace'`));assert.ok(await one(`SELECT 1 FROM ${table} WHERE hash LIKE 'protected-%'`));}
  assert.equal((await one('SELECT count(*) n FROM atomic_guard')).n,0);
 });
 // Reopen without test barrier for serial growth measurements. Maintenance routes
 // and metrics remain harness-only wrappers around the unchanged methods.
 await mf.dispose();mf=new Miniflare(config(false));db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');
 await clearRates();
 for(let i=0;i<10;i++){
  const c=await ok('/begin',{kind:'get'},'limited login begin');
  const session=await finish(c,await response(a,c,{count:++count}),'limited login finish');
  await ok('/session',{session},'limited session read');await ok('/logout',{session},'limited logout');
 }
 const growth=[];
 for(const n of [100,1000,10000]){
  await clearRates();
  for(const table of ['challenge','session']){
   // Bulk setup excluded from request measurements.
   await sql(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO ${table} SELECT 'growth-${n}-'||x,${table==='challenge'?"'get',":""}0,0,${table==='challenge'?"0,NULL,0":"0"} FROM n`,n);
  }
  const sizeProbe=await sql('SELECT count(*) n FROM session');
  const seeded={sessions:sizeProbe.results[0].n,challenges:(await one('SELECT count(*) n FROM challenge')).n,databaseMetadata:sizeProbe.meta};
  const s=await login(),before=(await sql('SELECT hash,revoked FROM session ORDER BY hash')).results,cbefore=(await sql('SELECT hash,used FROM challenge ORDER BY hash')).results;
  await ok('/revoke-all',{session:s},'growth revoke '+n);
  assert.deepEqual((await sql('SELECT hash,revoked FROM session ORDER BY hash')).results,before);assert.deepEqual((await sql('SELECT hash,used FROM challenge ORDER BY hash')).results,cbefore);
  for(let i=0;i<10;i++)await ok('/local-cleanup',{},'growth cleanup '+n);
  growth.push({insertedPerTable:n,seeded,sessions:(await one('SELECT count(*) n FROM session')).n,challenges:(await one('SELECT count(*) n FROM challenge')).n});
 }
 await test('credential revocation rejects racing authentication sessions and pending challenges',async()=>{
  await mf.dispose();mf=new Miniflare(config());db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');
  await clearRates();const s=await login(),c=await begin(),r=await response(a,c,{count:++count}),g=arm(1);
  const pending=call('/finish',{challenge:c.challenge,response:r},'credential revoke racing auth');
  try{
   await reached(g);
   // The authentication retains its captured hold; let the real revocation
   // dispatcher commit without joining that already-reached barrier.
   gate=null;await ok('/revoke-credential',{session:s,id:a.id});g.release();
   assert.equal((await pending).status,400);
  }finally{g.release();}
  await bad('/session',{session:s});await reject(c,r);await bad('/begin',{kind:'get'});
 });
 await test('offline reset is constant-size, rotates key epoch, and needs two fresh keys',async()=>{
  const capability=tokenForTest(),c=await one('SELECT key_epoch FROM account');
  const before=(await sql('SELECT * FROM credential ORDER BY id')).results;
  await ok('/local-reset',{hash:await digest(capability)},'offline reset growth');assert.deepEqual((await sql('SELECT * FROM credential ORDER BY id')).results,before);assert.equal((await one('SELECT key_epoch FROM account')).key_epoch,c.key_epoch+1);
  for(const key of [await authenticator(),await authenticator()]){const o=await begin('create',capability);await finish(o,await response(key,o));}
  const o=await begin();await reject(o,await response(a,o,{count:++count}));
 });
 await test('pristine dispatcher exposes no maintenance/recovery routes or SQL metadata',async()=>{
  await mf.dispose();mf=new Miniflare(config(false,true));db=await mf.getD1Database('SYNTHETIC_PASSKEY_DB');
  for(const path of ['/local-reset','/local-cleanup','/recover','/reset']){const r=await mf.dispatchFetch('https://synthetic.invalid'+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,404);assert.deepEqual(await r.json(),{result:null});}
  for(const session of ['unknown','']){const r=await mf.dispatchFetch('https://synthetic.invalid/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session})});assert.equal(r.status,400);assert.deepEqual(await r.json(),{result:null});}
 });
 const pct=v=>{v.sort((a,b)=>a-b);return Object.fromEntries([['p50',.5],['p95',.95],['max',1]].map(([k,p])=>[k,v[Math.ceil(v.length*p)-1]]));};
 const summary=[...new Set(samples.map(s=>s.operation))].map(operation=>{const rows=samples.filter(s=>s.operation===operation);return {operation,n:rows.length,...Object.fromEntries(['wallMs','hostDriverCpuMs','statements','rowsRead','rowsWritten','d1DurationMs'].map(k=>[k,pct(rows.map(s=>s[k]))]))};});
 const versions=Object.fromEntries(['miniflare','workerd'].map(n=>[n,JSON.parse(readFileSync(require.resolve(n+'/package.json',{paths:[require.resolve(process.env.QY_MINIFLARE_PATH)]}))).version]));
 const result={passed,checks,evidence,node:process.version,versions,growth,summary,samples,method:'Local workerd/D1 only. Barrier tests include harness overhead; growth profiling has no barrier. Metrics/maintenance dispatcher routes injected only in harness. Setup, fixture signing and inspections excluded. Statements are application submission attempts; failed batches have incomplete returned metadata. Node host CPU excludes workerd and is Windows-quantized. No deployed CPU or billing evidence.'};
 writeFileSync(resolve(evidence,'results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});writeFileSync(process.argv[2]||'docs/quantum-yijing-c1-step2db2a-measurements.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed,evidence,summary}));console.log(`RESULT: ${passed} passed, 0 failed`);
}finally{await mf.dispose();}
function tokenForTest(){return b64(crypto.getRandomValues(new Uint8Array(32)));}
