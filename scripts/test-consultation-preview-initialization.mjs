// All API calls below are in-process fakes backed by disposable local databases.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {initializePreview,prepareTarget,cloudflareClient} from './initialize-consultation-preview.mjs';
import {sha} from './consultation-migration-verifier.mjs';
import {readFileSync} from 'node:fs';
import {passwordHash} from '../functions/lib/consultation/auth-crypto.js';
const manifest=JSON.parse(readFileSync(new URL('../database/c1-migration-manifest.json',import.meta.url)));
const target={action:'initialize',accountId:'a'.repeat(32),expectedAccountId:'a'.repeat(32),projectId:'11111111-1111-4111-8111-111111111111',databaseId:'22222222-2222-4222-8222-222222222222',expectedDatabaseId:'22222222-2222-4222-8222-222222222222',project:'qy-c1-consultation-preview',productionBranch:'c1-production-disabled',branch:'c1-bazi-consultation-development',slot:'preview',origin:'https://c1-bazi-consultation-development.qy-c1-consultation-preview.pages.dev',databaseName:'qy-c1-consultation-preview-db',freshDatabase:true,ownerApproved:true,ownerApprovedHostname:true,independentlyVerifiedUuid:true,manifestSha256:sha(JSON.stringify(manifest))};
let passed=0;async function test(name,run){await run();passed++;console.log('PASS '+name);}
function sqlite(raw){return {prepare(sql){let params=[];return {bind(...p){params=p;return this;},async run(){const p=raw.prepare(sql);return p.columns().length?{success:true,results:p.all(...params)}:{success:true,results:[],meta:{changes:Number(p.run(...params).changes)}};}};},async batch(p){raw.exec('BEGIN');try{const results=[];for(const s of p)results.push(await s.run());raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
async function checks(db,label){
 const t=(n,fn)=>test(label+' '+n,fn);
 const env=slot=>({env_vars:Object.fromEntries(['CONSULTATION_PREVIEW_ENABLED','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED','SUBSCRIPTION_AUTOMATION_ENABLED'].map(n=>[n,{value:'false',type:'plain_text'}]).concat([['CONSULTATION_DEPLOYMENT_SLOT',{value:slot}]])),d1_databases:slot==='preview'?{CONSULTATION_DB:{id:target.databaseId}}:{}});
 const metadata={account:{id:target.accountId},database:{uuid:target.databaseId,name:target.databaseName},project:{id:target.projectId,name:target.project,production_branch:target.productionBranch,deployment_configs:{preview:env('preview'),production:env('disabled')}}};
 let writes=0,inject=null,dropResponse=false;const calls=[],statementsSeen=[];
 const api=async(path,body)=>{
  calls.push(path);assert(path.startsWith('/accounts/'+target.accountId));
  if(path.endsWith('/query')){
   statementsSeen.push(...body.batch.map(s=>s.sql));
   assert(path.includes('/'+target.databaseId+'/'));if(body.batch.some(s=>!/^\s*(SELECT|PRAGMA)/.test(s.sql)))writes++;
   let statements=body.batch.map(s=>db.prepare(s.sql).bind(...(s.params||[])));
   if(inject&&body.batch.some(s=>s.sql.includes(inject))){inject=null;statements.push(db.prepare("SELECT json('SYNTHETIC_FAILURE')"));}
   const r=await db.batch(statements);if(dropResponse){dropResponse=false;throw Error('lost response');}return r.map(v=>({...v,success:true,results:v.results||[]}));
  }
  if(path.includes('/pages/'))return structuredClone(metadata.project);
  if(path.includes('/d1/'))return structuredClone(metadata.database);
  return structuredClone(metadata.account);
 };
 const read=async(sql)=>{const r=await db.batch([db.prepare(sql)]);return r[0].results;};
 if(label==='SQLite')await db.batch([db.prepare('CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value TEXT)'),db.prepare("INSERT INTO _cf_KV VALUES('synthetic-platform-row','preserve')")]);
 else await t('D1 security rejects direct creation of reserved platform tables',()=>assert.rejects(db.batch([db.prepare('CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value TEXT)')])));
 await t('unknown object still blocks initialization',async()=>{const name=label==='SQLite'?'_cf_unapproved':'synthetic_unapproved';await db.batch([db.prepare('CREATE TABLE '+name+'(id INTEGER)')]);const n=writes;await assert.rejects(initializePreview(target,api));assert.equal(writes,n);await db.batch([db.prepare('DROP TABLE '+name)]);});
 await t('invalid target refuses before any API call',async()=>{const n=calls.length;await assert.rejects(initializePreview({...target,slot:'production'},api));assert.equal(calls.length,n);});
 for(const [name,object,field,bad]of [['account',metadata.account,'id','b'.repeat(32)],['database',metadata.database,'uuid','33333333-3333-4333-8333-333333333333'],['project',metadata.project,'id','33333333-3333-4333-8333-333333333333']])await t(name+' mismatch makes zero SQL writes',async()=>{const old=object[field],n=writes;object[field]=bad;await assert.rejects(initializePreview(target,api));object[field]=old;assert.equal(writes,n);});
 await t('enabled Preview or shared binding refuses before writes',async()=>{for(const change of ['gate','binding']){const old=structuredClone(metadata.project),n=writes;if(change==='gate')metadata.project.deployment_configs.preview.env_vars.CONSULTATION_PREVIEW_ENABLED.value='true';else metadata.project.deployment_configs.preview.d1_databases.CONSULTATION_DB.id='33333333-3333-4333-8333-333333333333';await assert.rejects(initializePreview(target,api));metadata.project=old;assert.equal(writes,n);}});
 await t('failed prerequisite batch leaves no application schema',async()=>{inject='enquiries (';await assert.rejects(initializePreview(target,api));assert.equal((await read("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_METADATA','_cf_KV')")).length,0);});
 await t('failed migration rolls back its entire DDL and ledger',async()=>{inject='CREATE TABLE consultation_auth_account';await assert.rejects(initializePreview(target,api));assert.equal((await read('SELECT count(*) n FROM consultation_migration_ledger'))[0].n,1);assert.equal((await read("SELECT name FROM sqlite_schema WHERE name='consultation_auth_account'")).length,0);});
 await t('explicit rerun resumes exact prefix and remains disabled',async()=>{const r=await initializePreview(target,api);assert.equal(r.migrations,15);assert.equal(r.disabled,true);assert.equal(r.administrators,0);});
 await t('completed initialization rerun preserves exact ledger and marker',async()=>{const before=JSON.stringify(await read('SELECT * FROM consultation_migration_ledger'));await initializePreview(target,api);assert.equal(JSON.stringify(await read('SELECT * FROM consultation_migration_ledger')),before);assert.equal((await read('SELECT enabled FROM consultation_preview_environment'))[0].enabled,0);});
 await t('schema drift is refused without adoption',async()=>{await db.batch([db.prepare('CREATE TABLE synthetic_drift(id INTEGER)')]);const n=writes;await assert.rejects(initializePreview({...target,action:'verify'},api));assert.equal(writes,n);await db.batch([db.prepare('DROP TABLE synthetic_drift')]);});
 await t('invalid password cannot provision administrator',async()=>{await assert.rejects(initializePreview({...target,action:'administrator'},api,{credentials:{username:'synthetic-admin',password:'weak',confirmation:'weak'}}));assert.equal((await read('SELECT count(*) n FROM consultation_auth_account'))[0].n,0);});
 const password='Synthetic-Private-Administrator-Only-123!';
 await t('marker activation during provisioning aborts account and audit together',async()=>{const race=async(path,body)=>{if(body?.batch.some(s=>s.sql.startsWith('INSERT INTO consultation_auth_account SELECT')))await db.batch([db.prepare('UPDATE consultation_preview_environment SET enabled=1 WHERE id=1')]);return api(path,body);};await assert.rejects(initializePreview({...target,action:'administrator'},race,{credentials:{username:'synthetic-admin',password,confirmation:password}}));assert.equal((await read('SELECT count(*) n FROM consultation_auth_account'))[0].n,0);assert.equal((await read('SELECT count(*) n FROM consultation_auth_audit'))[0].n,0);await db.batch([db.prepare('UPDATE consultation_preview_environment SET enabled=0 WHERE id=1')]);});
 await t('audit failure rolls back administrator record',async()=>{inject='INSERT INTO consultation_auth_account SELECT';await assert.rejects(initializePreview({...target,action:'administrator'},api,{credentials:{username:'synthetic-admin',password,confirmation:password}}));assert.equal((await read('SELECT count(*) n FROM consultation_auth_account'))[0].n,0);assert.equal((await read('SELECT count(*) n FROM consultation_auth_audit'))[0].n,0);});
 await t('lost provisioning response stops without retry; verify discovers one account',async()=>{
  const original=api;let lost=false;const lose=async(path,body)=>{const r=await original(path,body);if(body?.batch.some(s=>s.sql.startsWith('INSERT INTO consultation_auth_account SELECT'))&&!lost){lost=true;throw Error('SYNTHETIC response loss');}return r;};
  await assert.rejects(initializePreview({...target,action:'administrator'},lose,{credentials:{username:'synthetic-admin',password,confirmation:password}}));const r=await initializePreview({...target,action:'verify'},api);assert.equal(r.administrators,1);assert.equal(r.disabled,true);
 });
 await t('existing administrator is never replaced and uses unchanged password policy',async()=>{const row=(await read('SELECT * FROM consultation_auth_account'))[0];assert.equal(row.password_iterations,600000);assert.equal(row.password_algorithm,'PBKDF2-SHA256');assert.equal(await passwordHash(password,row.password_salt),row.password_hash);await assert.rejects(initializePreview({...target,action:'administrator'},api,{credentials:{username:'synthetic-admin',password,confirmation:password}}));assert.deepEqual((await read('SELECT * FROM consultation_auth_account'))[0],row);assert.equal((await read("SELECT count(*) n FROM consultation_auth_audit WHERE event='provisioned'"))[0].n,1);});
 await t('no financial rows or endpoint deployment and only attested UUID queried',async()=>{assert.equal((await read('SELECT count(*) n FROM orders'))[0].n,0);assert.equal((await read('SELECT count(*) n FROM payments'))[0].n,0);assert(calls.every(p=>p.includes(target.accountId)));});
 if(label==='SQLite')await t('known _cf_KV platform table and contents remain untouched',async()=>assert.deepEqual((await read('SELECT * FROM _cf_KV')).map(r=>({...r})),[{key:'synthetic-platform-row',value:'preserve'}]));
 else await t('initializer never submits DDL or writes against reserved platform tables',()=>assert(statementsSeen.every(sql=>!/(?:CREATE TABLE|INSERT INTO|UPDATE|DROP TABLE)\s+_cf_/i.test(sql))));
}
for(const patch of [{expectedAccountId:'b'.repeat(32)},{databaseId:'20c7c0f8-64e5-4f7a-80b2-445ba36077ff',expectedDatabaseId:'20c7c0f8-64e5-4f7a-80b2-445ba36077ff'},{project:'quantumyijing-website'},{ownerApproved:false},{origin:'https://qy-c1-consultation-preview.pages.dev'},{manifestSha256:'0'.repeat(64)}])await test('target rejection '+Object.keys(patch).join(','),()=>assert.throws(()=>prepareTarget({...target,...patch})));
await test('transport errors suppress token SQL and API error body and never retry',async()=>{let n=0;const client=cloudflareClient('synthetic-secret-token-never-log',async()=>{n++;return new Response(JSON.stringify({success:false,errors:[{message:'SENSITIVE SQL HASH TOKEN'}]}),{status:400});});await assert.rejects(client('/accounts/'+target.accountId+'/d1/database/'+target.databaseId+'/query',{batch:[]}),e=>!e.message.includes('SENSITIVE'));assert.equal(n,1);});
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');try{await checks(sqlite(raw),'SQLite');}finally{raw.close();}
const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default{fetch(){throw Error("No HTTP")}}',compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-private-initializer'},d1Persist:false,cf:false,telemetry:{enabled:false}}));
try{await checks(await mf.getD1Database('DB'),'workerd/D1');}finally{await mf.dispose();}
console.log(`RESULT ${passed} passed, 0 failed; local synthetic transport only; no remote calls`);
