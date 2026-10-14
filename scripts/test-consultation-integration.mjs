import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {root,canonical,sha,verifyManifest,verifyApplied} from './consultation-migration-verifier.mjs';
import {compatibilityDDL,createCompatibilityFixture} from './consultation-schema-compatibility.mjs';
import {validatePreviewContract,composePreviewServices} from '../functions/lib/consultation/preview-composition.js';
const manifest=JSON.parse(readFileSync(new URL('database/c1-migration-manifest.json',root),'utf8'));
const read=p=>canonical(readFileSync(new URL(p,root)));
const split=s=>s.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|INSERT|ALTER|$)/).map(s=>s.trim()).filter(Boolean);
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name);}
await test('all migration checksums and complete inventory',()=>verifyManifest(manifest));
await test('reordered migration rejection',()=>{const m=structuredClone(manifest);[m.migrations[1],m.migrations[2]]=[m.migrations[2],m.migrations[1]];assert.throws(()=>verifyManifest(m));});
await test('modified SQL rejection',()=>assert.throws(()=>verifyManifest(manifest,p=>read(p)+'-- drift')));
await test('missing or extra migration rejection',()=>{assert.throws(()=>verifyManifest(manifest,read,[]));assert.throws(()=>verifyManifest(manifest,read,[...manifest.migrations.map(m=>m.path),'database/migrate-c1-unapproved.sql']));});
await test('invalid UTF-8 cannot be silently normalized',()=>assert.throws(()=>canonical(Buffer.from([0xff]))));
await test('cross-platform BOM CRLF normalization',()=>assert.equal(sha(canonical(Buffer.from('\uFEFFa\r\nb'))),sha('a\nb')));
const source=createCompatibilityFixture();
await test('real schema rejects simplified product/customer/coach inserts',()=>{for(const table of ['products','customers','coaches'])assert.throws(()=>source.exec('INSERT INTO '+table+'(id) VALUES(2)'));});
source.close();
function sqlite(raw){return {prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};},async batch(plans){raw.exec('BEGIN');try{const r=[];for(const p of plans)r.push(await p.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
const hash=sha(JSON.stringify(manifest)),databaseId='11111111-2222-4333-8444-555555555555';
const config={environment:'preview',syntheticOnly:true,origin:'https://u3.synthetic.pages.dev',databaseId,expectedDatabaseId:databaseId,manifestSha256:hash,productId:1,practitionerId:1,countryCodes:['MY'],policies:Object.fromEntries(['consultation_privacy','future_calculations','marketing','booking'].map(p=>[p,{version:'synthetic-u3-v1',text:'Synthetic '+p,hash:sha('Synthetic '+p)}]))};
const keyring=Object.fromEntries(['intake','contact','lookup','challenge','meeting'].map((p,i)=>[p,{active:p+'-synthetic-v1',keys:{[p+'-synthetic-v1']:(i+1).toString(16).padStart(2,'0').repeat(32)}}]));
async function checks(db,label){
 const t=(name,fn)=>test(label+' '+name,fn);
 for(const sql of compatibilityDDL().statements)await db.prepare(sql).run();
 for(const sql of split(read(manifest.prerequisites[0].path)))await db.prepare(sql).run();
 await db.prepare("INSERT INTO customers(id,customer_reference,status) VALUES(1,'SYNTHETIC-001','Active')").run();
 await db.prepare("INSERT INTO products(id,sku,slug,product_type,name_en,status,price,currency) VALUES(1,'CONSULT-BAZI','synthetic-bazi','consultation','Synthetic','Draft',1300,'MYR')").run();
 await db.prepare("INSERT INTO coaches(id,coach_code,full_name,email,status) VALUES(1,'SYNTHETIC','Synthetic','qy@example.invalid','Approved')").run();
 await t('empty ledger/schema requires all migrations',async()=>assert.equal(verifyApplied(manifest,[],(await db.prepare('SELECT type,name FROM sqlite_master').all()).results).pending.length,15));
 for(const m of manifest.migrations){
  const statements=split(read(m.path)).map(sql=>db.prepare(sql));
  statements.push(db.prepare('INSERT INTO consultation_migration_ledger VALUES(?,?,?,?)').bind(m.ordinal,m.path,m.sha256,Date.now()));
  await db.batch(statements);
 }
 const ledger=()=>db.prepare('SELECT * FROM consultation_migration_ledger ORDER BY ordinal').all();
 const schema=()=>db.prepare('SELECT type,name FROM sqlite_master').all();
 await t('all fifteen migrations atomically recorded on real schema',async()=>assert.equal(verifyApplied(manifest,(await ledger()).results,(await schema()).results).pending.length,0));
 await t('previously applied migrations never scheduled again',async()=>assert.equal(verifyApplied(manifest,(await ledger()).results,(await schema()).results).applied.length,15));
 await t('unledgered schema and missing schema rejection',async()=>{const rows=(await ledger()).results,s=(await schema()).results;assert.throws(()=>verifyApplied(manifest,rows.slice(0,1),s));assert.throws(()=>verifyApplied(manifest,rows,s.filter(o=>o.name!=='consultation_bookings')));});
 await t('modified applied ledger rejection',async()=>{const r=(await ledger()).results;r[1].canonical_sha256='0'.repeat(64);assert.throws(()=>verifyApplied(manifest,r,(/* no async */[])));});
 await t('ledger REPLACE primary and unique paths rejected',async()=>{for(const verb of ['INSERT OR REPLACE','REPLACE']){await assert.rejects(db.prepare(verb+' INTO consultation_migration_ledger VALUES(?,?,?,?)').bind(1,manifest.migrations[0].path,manifest.migrations[0].sha256,1).run());await assert.rejects(db.prepare(verb+' INTO consultation_migration_ledger VALUES(?,?,?,?)').bind(16,manifest.migrations[0].path,manifest.migrations[0].sha256,1).run());}assert.equal((await ledger()).results.length,15);});
 await t('later statement failure rolls back ledger side effects',async()=>{await assert.rejects(db.batch([db.prepare("INSERT INTO consultation_migration_ledger VALUES(16,'synthetic-rejected',?,1)").bind('a'.repeat(64)),db.prepare('INSERT INTO consultation_migration_ledger VALUES(18,?,?,1)').bind('synthetic-failure','a'.repeat(64))]));assert.equal((await ledger()).results.length,15);});
 await db.prepare('INSERT INTO consultation_preview_environment VALUES(1,?,?,?,1,1)').bind(databaseId,config.origin,hash).run();
 await db.prepare("INSERT INTO consultation_auth_account VALUES(1,'synthetic',1,'PBKDF2-SHA256',600000,?,?,1,?)").bind('a'.repeat(64),'b'.repeat(64),Date.now()).run();
 const env={CONSULTATION_DB:db,CONSULTATION_PREVIEW_ENABLED:'true',CONSULTATION_KEYRING:JSON.stringify(keyring)};
 await t('valid dedicated binding and all five purpose keys',async()=>assert.equal(Object.keys((await validatePreviewContract(env,config,manifest)).keys).length,5));
 for(const [name,e,c] of [
 ['missing gate',{...env,CONSULTATION_PREVIEW_ENABLED:undefined},config],
 ['production environment',env,{...config,environment:'production'}],
 ['non synthetic mode',env,{...config,syntheticOnly:false}],
 ['missing dedicated binding',{...env,CONSULTATION_DB:undefined},config],
 ['generic binding alias',{...env,DB:db},config],
 ['wrong database marker',env,{...config,databaseId:'22222222-2222-4333-8444-555555555555',expectedDatabaseId:'22222222-2222-4333-8444-555555555555'}],
 ['production database',env,{...config,databaseId:'20c7c0f8-64e5-4f7a-80b2-445ba36077ff',expectedDatabaseId:'20c7c0f8-64e5-4f7a-80b2-445ba36077ff'}],
 ['production origin',env,{...config,origin:'https://quantumyijing.com'}],
 ['notifications enabled',{...env,SUBSCRIPTION_AUTOMATION_ENABLED:'true'},config],
 ['missing meeting key',{...env,CONSULTATION_KEYRING:JSON.stringify(Object.fromEntries(Object.entries(keyring).filter(([p])=>p!=='meeting')))},config],
 ['reused key material',{...env,CONSULTATION_KEYRING:JSON.stringify({...keyring,meeting:{active:'meeting-v2',keys:{'meeting-v2':keyring.intake.keys[keyring.intake.active]}}})},config],
 ['mismatched policy hash',env,{...config,policies:{...config.policies,booking:{...config.policies.booking,hash:'a'.repeat(64)}}}],
 ['wrong product',env,{...config,productId:2}],
 ['wrong practitioner',env,{...config,practitionerId:2}]
 ])await t(name+' rejected',()=>assert.rejects(validatePreviewContract(e,c,manifest)));
 await t('unconfigured memory-only delivery cannot compose',()=>assert.rejects(composePreviewServices(env,config,manifest)));
 const runtime=await composePreviewServices(env,config,manifest,{mockDelivery:{kind:'EncryptedPersistentSyntheticMock',databaseId,send:async()=>{throw Error('Synthetic test transport not implemented');}}});
 await t('composition exposes internal services only, no public handler',()=>{assert.equal(typeof runtime.services.workflow.submit,'function');assert.equal(runtime.fetch,undefined);assert.equal(runtime.handler,undefined);});
 await t('feature disable observed without new Worker instance',async()=>{await db.prepare('UPDATE consultation_preview_environment SET enabled=0 WHERE id=1').run();await assert.rejects(runtime.assertEnabled());await db.prepare('UPDATE consultation_preview_environment SET enabled=1 WHERE id=1').run();await runtime.assertEnabled();});
 await t('database marker cannot be replaced',()=>assert.rejects(db.prepare('REPLACE INTO consultation_preview_environment VALUES(1,?,?,?,1,1)').bind(databaseId,config.origin,hash).run()));
 await t('foreign keys and integrity',async()=>{assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.equal(Object.values(await db.prepare(label==='D1'?'PRAGMA quick_check':'PRAGMA integrity_check').first())[0],'ok');});
}
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');try{await checks(sqlite(raw),'SQLite');}finally{raw.close();}
if(!process.env.QY_MINIFLARE_PATH)throw Error('Local D1 emulator required');
const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default{fetch(){throw Error("No HTTP")}}',compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-u3-integration'},d1Persist:false,cf:false,telemetry:{enabled:false}}));
try{await checks(await mf.getD1Database('DB'),'D1');}finally{await mf.dispose();}
// Compile the actual transitive composition imports inside workerd, not only Node.
const modules=new Map();
function collect(path){
 if(modules.has(path))return;
 const contents=read(path);modules.set(path,{type:'ESModule',path,contents});
 for(const m of contents.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const target=new URL(m[1],new URL(path,root));
  collect(target.pathname.slice(root.pathname.length));
 }
}
collect('functions/lib/consultation/preview-composition.js');
const smoke=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'entry.js',contents:"import {validatePreviewContract} from './functions/lib/consultation/preview-composition.js'; export default{async fetch(){try{await validatePreviewContract({}, {}, {});return new Response('unexpected',{status:500});}catch{return new Response('fail-closed');}}}"},...modules.values()],compatibilityDate:'2026-10-07',cf:false,telemetry:{enabled:false}}));
try{await test('actual composition imports compile and fail closed in workerd',async()=>{const response=await smoke.dispatchFetch('http://localhost');assert.equal(response.status,200);assert.equal(await response.text(),'fail-closed');});}finally{await smoke.dispose();}
console.log('RESULT '+passed+' passed, 0 failed; local synthetic SQLite/D1 only');
