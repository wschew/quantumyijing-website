// Private owner-run management client. No application import or public endpoint.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {reviewedMigrationUnits} from './consultation-preview-migration-plan.mjs';
import {sha,verifyApplied} from './consultation-migration-verifier.mjs';
import {provisionOffline} from './provision-consultation-preview-offline.mjs';
import {PAGES_PROJECT,PREVIEW_BRANCH,PREVIEW_ORIGIN} from '../functions/lib/consultation/pages-boundary.js';

const fail=()=>{throw Error('Preview initialization rejected; inspect target and sanitized database state. No automatic retry.');};
const schemaSQL="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA' ORDER BY type,name";
const normalized=rows=>JSON.stringify(rows.map(r=>({type:r.type,name:r.name,tbl_name:r.tbl_name,sql:r.sql?.trim()})));
const markerSQL='SELECT * FROM consultation_preview_environment WHERE id=1';
export function prepareTarget(target){
 if(!target||!['initialize','administrator','verify'].includes(target.action)||
  !/^[a-f0-9]{32}$/.test(target.accountId)||target.accountId!==target.expectedAccountId||
  typeof target.projectId!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(target.projectId)||
  target.project!==PAGES_PROJECT||target.branch!==PREVIEW_BRANCH||target.slot!=='preview'||
  target.origin!==PREVIEW_ORIGIN||target.productionBranch!=='c1-production-disabled'||
  target.databaseName!=='qy-c1-consultation-preview-db'||target.ownerApproved!==true||
  target.freshDatabase!==true||target.ownerApprovedHostname!==true||target.independentlyVerifiedUuid!==true)fail();
 const plan=reviewedMigrationUnits(target),mirror=new DatabaseSync(':memory:');
 const states=[];
 try{
  for(const unit of plan.units){
   mirror.exec('BEGIN');try{for(const sql of unit.statements)mirror.exec(sql);if(unit.ledger)mirror.prepare(unit.ledger.sql).run(...unit.ledger.values,1);mirror.exec('COMMIT');}catch{mirror.exec('ROLLBACK');fail();}
   states.push(normalized(mirror.prepare(schemaSQL).all()));
  }
  const manifestSha256=sha(JSON.stringify(plan.manifest));
  if(target.manifestSha256!==manifestSha256)fail();
  return {plan,states,manifestSha256};
 }finally{mirror.close();}
}

// Fixed management origin, no redirects/retries/response diagnostics or SQL logging.
export function cloudflareClient(token,fetcher=globalThis.fetch){
 if(typeof token!=='string'||token.length<20||token.length>4096||/\s/.test(token))fail();
 return async(path,body)=>{
  try{
   if(!/^\/accounts\/[a-f0-9]{32}(?:$|\/(?:pages\/projects\/[a-z0-9-]+|d1\/database\/[a-f0-9-]+)(?:\/query)?$)/.test(path))fail();
   const r=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const text=await r.text();if(text.length>4000000)fail();const data=JSON.parse(text);
   if(!r.ok||data.success!==true||data.errors?.length)fail();return data.result;
  }catch{fail();}
 };
}
export async function initializePreview(target,api,{credentials=null}={}){
 const prepared=prepareTarget(target),{plan,states,manifestSha256}=prepared;
 const base='/accounts/'+target.accountId,dbPath=base+'/d1/database/'+target.databaseId;
 const query=async statements=>{
  try{
   const result=await api(dbPath+'/query',{batch:statements});
   if(!Array.isArray(result)||result.length!==statements.length||result.some(r=>r.success!==true||!Array.isArray(r.results)))fail();
   return result.map(r=>r.results);
  }catch{fail();}
 };
 const read=async(sql,params=[])=> (await query([{sql,params}]))[0];
 async function identity(){
  const account=await api(base),db=await api(dbPath),project=await api(base+'/pages/projects/'+target.project);
  if(account.id!==target.accountId||db.uuid!==target.databaseId||db.name!==target.databaseName||project.id!==target.projectId||project.name!==target.project||project.production_branch!==target.productionBranch)fail();
  const preview=project.deployment_configs?.preview,production=project.deployment_configs?.production;
  if(preview?.d1_databases?.CONSULTATION_DB?.id!==target.databaseId||Object.keys(preview.d1_databases).length!==1||Object.keys(production?.d1_databases||{}).length)fail();
  for(const env of [preview,production]){
   if(!env)fail();
   for(const name of ['CONSULTATION_PREVIEW_ENABLED','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED','SUBSCRIPTION_AUTOMATION_ENABLED'])if(env.env_vars?.[name]?.value!=='false')fail();
  }
  if(preview.env_vars?.CONSULTATION_DEPLOYMENT_SLOT?.value!=='preview'||production.env_vars?.CONSULTATION_DEPLOYMENT_SLOT?.value!=='disabled')fail();
 }
 const markerMatches=m=>m&&m.id===1&&m.enabled===0&&m.synthetic_only===1&&m.database_id===target.databaseId&&m.origin===target.origin&&m.manifest_sha256===manifestSha256;
 async function inspect(){
  const schema=await read(schemaSQL);if(!schema.length)return {prefix:-1,schema};
  const prefix=states.indexOf(normalized(schema));if(prefix<0)fail();
  if(prefix>0)verifyApplied(plan.manifest,await read('SELECT * FROM consultation_migration_ledger ORDER BY ordinal'),schema);
  if(prefix>=1){const markers=await read(markerSQL);if(markers.length&&!markerMatches(markers[0]))fail();}
  return {prefix,schema};
 }
 // Probe the actual management transport, not just local batch semantics. Deliberate
 // failure must roll back both a schema and row change; never clean up a bad probe.
 async function rollbackProbe(){
  const before=normalized(await read(schemaSQL));let denied=false;
  try{await query([{sql:'CREATE TABLE c1_private_atomic_probe(value TEXT NOT NULL)',params:[]},{sql:"INSERT INTO c1_private_atomic_probe VALUES('synthetic')",params:[]},{sql:'INSERT INTO c1_private_atomic_probe VALUES(NULL)',params:[]}]);}catch{denied=true;}
  if(!denied||normalized(await read(schemaSQL))!==before)fail();
 }
 await identity();let current=await inspect();
 if(target.action==='initialize'){
  await rollbackProbe();
  for(const unit of plan.units.filter(u=>u.ordinal>current.prefix)){
   await identity();const state=await inspect();if(state.prefix!==unit.ordinal-1)fail();
   // Each migration plus its ledger is one management batch. Never split/chunk it.
   await query([...unit.statements.map(sql=>({sql,params:[]})),...(unit.ledger?[{sql:unit.ledger.sql,params:[...unit.ledger.values,Date.now()]}]:[])]);
   current=await inspect();if(current.prefix!==unit.ordinal)fail();
  }
  await identity();
  const markers=await read(markerSQL);
  if(!markers.length)await query([{sql:'INSERT INTO consultation_preview_environment VALUES(1,?,?,?,1,0)',params:[target.databaseId,target.origin,manifestSha256]}]);
 }
 current=await inspect();if(current.prefix!==15||!markerMatches((await read(markerSQL))[0]))fail();
 if(target.action==='administrator'){
  if((await read('SELECT COUNT(*) n FROM consultation_auth_account'))[0].n!==0)fail();
  await rollbackProbe();
  // Reuse the exact existing provisioning function and password policy in a private
  // in-memory mirror. No credential SQL/file export; only bound HTTPS parameters.
  const mirror=new DatabaseSync(':memory:');let account,audit;
  try{
   for(const unit of plan.units){for(const sql of unit.statements)mirror.exec(sql);if(unit.ledger)mirror.prepare(unit.ledger.sql).run(...unit.ledger.values,1);}
   mirror.prepare('INSERT INTO consultation_preview_environment VALUES(1,?,?,?,1,0)').run(target.databaseId,target.origin,manifestSha256);
   await provisionOffline(mirror,{config:{...target,syntheticOnly:true,environment:'preview',isolatedPreviewProject:target.project},username:credentials?.username,password:credentials?.password,confirmation:credentials?.confirmation,action:'initialize'});
   account=mirror.prepare('SELECT * FROM consultation_auth_account').get();audit=mirror.prepare('SELECT * FROM consultation_auth_audit').get();
  }catch{fail();}finally{mirror.close();if(credentials){credentials.password=null;credentials.confirmation=null;}}
  await identity();await inspect();
  await query([
   {sql:`INSERT INTO consultation_auth_account SELECT 1,?,1,?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM consultation_preview_environment WHERE id=1 AND enabled=0 AND synthetic_only=1 AND database_id=? AND origin=? AND manifest_sha256=?) AND (SELECT COUNT(*) FROM consultation_migration_ledger)=15 AND NOT EXISTS(SELECT 1 FROM consultation_auth_account) AND NOT EXISTS(SELECT 1 FROM customers c LEFT JOIN consultation_preview_synthetic_customers s ON s.customer_id=c.id WHERE s.customer_id IS NULL OR c.customer_reference NOT GLOB 'SYNTHETIC-*')`,params:[account.username,account.password_algorithm,account.password_iterations,account.password_salt,account.password_hash,account.created_at,target.databaseId,target.origin,manifestSha256]},
   {sql:"INSERT INTO consultation_auth_audit VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,1,NULL,'provisioned',?)",params:[audit.id,audit.occurred_at]}
  ]);
  account=null;audit=null;
 }
 await identity();await inspect();
 if((await read('PRAGMA foreign_key_check')).length||Object.values((await read('PRAGMA quick_check'))[0]||{})[0]!=='ok')fail();
 for(const table of ['orders','payments','consultation_preview_assertions'])if((await read('SELECT COUNT(*) n FROM '+table))[0].n!==0)fail();
 const administrators=(await read('SELECT COUNT(*) n FROM consultation_auth_account'))[0].n;
 if(administrators>1||target.action==='administrator'&&administrators!==1)fail();
 return Object.freeze({ok:true,migrations:15,disabled:true,administrators});
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4||process.argv[2]!=='--execute-approved-preview')fail();
  const target=JSON.parse(readFileSync(process.argv[3],'utf8').replace(/^\uFEFF/,''));
  let bytes=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>16384)fail();text+=decoder.decode(chunk,{stream:true});}text+=decoder.decode();const privateInput=JSON.parse(text);
  const api=cloudflareClient(privateInput.token);privateInput.token=null;
  const result=await initializePreview(target,api,{credentials:privateInput});
  console.log(JSON.stringify(result));
 }catch{console.error('Preview initialization stopped. No automatic retry. Verify approved target and database state; secrets and API diagnostics are suppressed.');process.exitCode=1;}
}
