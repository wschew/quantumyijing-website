import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {reviewedMigrationUnits,splitMigrationSQL} from './consultation-preview-migration-plan.mjs';
import {verifyApplied} from './consultation-migration-verifier.mjs';
import {PREVIEW_ORIGIN,PAGES_PROJECT,PREVIEW_BRANCH} from '../functions/lib/consultation/pages-boundary.js';
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const attestation={databaseId:'11111111-2222-4333-8444-555555555555',expectedDatabaseId:'11111111-2222-4333-8444-555555555555',origin:PREVIEW_ORIGIN,project:PAGES_PROJECT,databaseName:'qy-c1-consultation-preview-db',branch:PREVIEW_BRANCH,slot:'preview',freshDatabase:true,ownerApprovedHostname:true,independentlyVerifiedUuid:true};
const plan=reviewedMigrationUnits(attestation);
for(const change of [{project:'quantumyijing-website'},{slot:'production'},{freshDatabase:false},{independentlyVerifiedUuid:false},{ownerApprovedHostname:false},{databaseId:'20c7c0f8-64e5-4f7a-80b2-445ba36077ff',expectedDatabaseId:'20c7c0f8-64e5-4f7a-80b2-445ba36077ff'},{origin:'https://qy-c1-consultation-preview.pages.dev'},{databaseName:'academy'}])await test('attestation rejects '+Object.keys(change).join(','),()=>assert.throws(()=>reviewedMigrationUnits({...attestation,...change})));
await test('SQL lexer preserves nested CASE, comments and quoted semicolons',()=>{const sql="CREATE TABLE x(a TEXT); CREATE TRIGGER t BEFORE INSERT ON x BEGIN SELECT CASE WHEN NEW.a='x;y' THEN RAISE(ABORT,'bad;value') END; -- ;\n SELECT 1; END;";assert.equal(splitMigrationSQL(sql).length,2);assert.throws(()=>splitMigrationSQL('CREATE TRIGGER t BEFORE INSERT ON x BEGIN SELECT 1;'));});
function sqlite(raw){return {prepare(sql){let v=[];return {bind(...values){v=values;return this;},async all(){return {results:raw.prepare(sql).all(...v)};},async run(){const p=raw.prepare(sql);return p.columns().length?{results:p.all(...v)}:{meta:{changes:Number(p.run(...v).changes)}};}};},async batch(statements){raw.exec('BEGIN IMMEDIATE');try{const r=[];for(const p of statements)r.push(await p.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
async function checks(db,label){
 const state=async()=>JSON.stringify((await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results);
 for(const unit of plan.units){
  const statements=()=>unit.statements.map(sql=>db.prepare(sql));
  const ledger=()=>db.prepare(unit.ledger.sql).bind(...unit.ledger.values,Date.now());
  const before=await state();
  for(const phase of unit.ordinal?['before-ledger','after-ledger']:['prerequisites'])await test(label+' rollback '+unit.ordinal+' '+phase,async()=>{
   const batch=statements(),failure=db.prepare("SELECT json('SYNTHETIC_INVALID_JSON')");
   if(unit.ordinal&&phase==='after-ledger')batch.push(ledger());
   batch.push(failure);if(unit.ordinal&&phase==='before-ledger')batch.push(ledger());
   await assert.rejects(db.batch(batch));assert.equal(await state(),before);
   if(unit.ordinal>1)assert.equal((await db.prepare('SELECT * FROM consultation_migration_ledger').all()).results.length,unit.ordinal-1);
  });
  await test(label+' apply '+unit.ordinal+' atomically',async()=>{await db.batch([...statements(),...(unit.ordinal?[ledger()]:[])]);});
 }
 await test(label+' exact ledger and object inventory',async()=>assert.equal(verifyApplied(plan.manifest,(await db.prepare('SELECT * FROM consultation_migration_ledger ORDER BY ordinal').all()).results,(await db.prepare('SELECT type,name FROM sqlite_master').all()).results).pending.length,0));
 await test(label+' integrity and foreign keys',async()=>{assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.equal(Object.values((await db.prepare('PRAGMA quick_check').all()).results[0])[0],'ok');});
 await test(label+' no marker administrator or financial seed',async()=>{for(const table of ['consultation_preview_environment','consultation_auth_account','orders','payments'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).all()).results[0].n,0);});
 await test(label+' trigger survives and enforces immutable ledger',()=>assert.rejects(db.prepare('UPDATE consultation_migration_ledger SET applied_at=1').run()));
}
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');try{await checks(sqlite(raw),'SQLite');}finally{raw.close();}
const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default{fetch(){throw Error("No HTTP")}}',compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-step2a-migrations'},d1Persist:false,cf:false,telemetry:{enabled:false}}));
try{await checks(await mf.getD1Database('DB'),'workerd/D1');}finally{await mf.dispose();}
console.log('RESULT '+passed+' passed, 0 failed; no remote executor or credentials');
