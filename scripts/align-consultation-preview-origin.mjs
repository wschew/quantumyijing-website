// One-time private management operation. Never imported into the application.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,prepareTarget,initializePreview} from './initialize-consultation-preview.mjs';
import {readLocalCredentialInput} from './setup-consultation-account-local.mjs';

const oldOrigin='https://c1-bazi-consultation-development.qy-c1-consultation-preview.pages.dev';
const newOrigin='https://c1-bazi-consultation-develop.qy-c1-consultation-preview.pages.dev';
const schemaSQL="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_METADATA','_cf_KV') ORDER BY type,name";
const normalized=rows=>JSON.stringify(rows.map(r=>({type:r.type,name:r.name,tbl_name:r.tbl_name,sql:r.sql?.trim()})));
const fail=()=>{throw Error('Origin alignment rejected');};

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const diagnostics={stage:'origin-alignment-input',request:'none',httpStatus:null};
 try{
  if(process.argv.length!==4||process.argv[2]!=='--execute-approved-preview')fail();
  const target=JSON.parse(readFileSync(process.argv[3],'utf8').replace(/^\uFEFF/,''));
  if(target.action!=='verify'||target.originAlignmentApproved!==true||target.origin!==newOrigin||target.accountId!=='f87d6f0679c6fe4c1c08af320850b52c'||target.databaseId!=='734455fd-cdec-4e14-ad6f-96f80f22f3e7')fail();
  const {plan,states}=prepareTarget(target);
  const input=await readLocalCredentialInput(process.stdin);
  const api=cloudflareClient(input.token,globalThis.fetch,diagnostics);input.token=null;
  const base='/accounts/'+target.accountId,dbPath=base+'/d1/database/'+target.databaseId;
  const batch=async statements=>{const r=await api(dbPath+'/query',{batch:statements});if(!Array.isArray(r)||r.length!==statements.length||r.some(x=>x.success!==true||!Array.isArray(x.results)))fail();return r.map(x=>x.results);};
  const read=async(sql,params=[])=> (await batch([{sql,params}]))[0];
  async function identity(){
   diagnostics.stage='origin-alignment-identity';
   const a=await api(base),d=await api(dbPath),p=await api(base+'/pages/projects/'+target.project);
   if(a.id!==target.accountId||d.uuid!==target.databaseId||d.name!==target.databaseName||p.name!==target.project||p.production_branch!==target.productionBranch)fail();
   const preview=p.deployment_configs?.preview,production=p.deployment_configs?.production;
   if(preview?.d1_databases?.CONSULTATION_DB?.id!==target.databaseId||Object.keys(preview.d1_databases).length!==1||Object.keys(production?.d1_databases||{}).length)fail();
   for(const env of [preview,production]){if(!env)fail();for(const n of ['CONSULTATION_PREVIEW_ENABLED','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED','SUBSCRIPTION_AUTOMATION_ENABLED'])if(env.env_vars?.[n]?.value!=='false')fail();}
   if(preview.env_vars?.CONSULTATION_DEPLOYMENT_SLOT?.value!=='preview'||production.env_vars?.CONSULTATION_DEPLOYMENT_SLOT?.value!=='disabled')fail();
  }
  await identity();diagnostics.stage='origin-alignment-precheck';
  const before=await read(schemaSQL);if(normalized(before)!==states[15])fail();
  const ledger=await read('SELECT ordinal,path,canonical_sha256,applied_at FROM consultation_migration_ledger ORDER BY ordinal');
  if(ledger.length!==15||ledger.some((r,i)=>r.ordinal!==i+1||r.path!==plan.manifest.migrations[i].path||r.canonical_sha256!==plan.manifest.migrations[i].sha256||!Number.isSafeInteger(r.applied_at)||r.applied_at<1))fail();
  const markers=await read('SELECT * FROM consultation_preview_environment');const m=markers[0];
  if(markers.length!==1||m.id!==1||m.enabled!==0||m.synthetic_only!==1||m.database_id!==target.databaseId||m.manifest_sha256!==target.manifestSha256||![oldOrigin,newOrigin].includes(m.origin))fail();
  if((await read("SELECT COUNT(*) n FROM consultation_auth_account WHERE id=1 AND username='qyadmin' AND enabled=1"))[0].n!==1||(await read('SELECT COUNT(*) n FROM consultation_preview_assertions'))[0].n!==0)fail();
  if(m.origin===oldOrigin){
   diagnostics.stage='origin-alignment-rollback-probe';let rejected=false;
   try{await batch([{sql:'CREATE TABLE c1_origin_alignment_probe(value TEXT NOT NULL)',params:[]},{sql:'INSERT INTO c1_origin_alignment_probe VALUES(NULL)',params:[]}]);}catch{rejected=true;}
   if(!rejected||normalized(await read(schemaSQL))!==normalized(before))fail();
   await identity();diagnostics.stage='origin-alignment-write';
   const restore=plan.units[1].statements.find(sql=>/^CREATE TRIGGER consultation_environment_identity\s/.test(sql));if(!restore)fail();
   const guard="SELECT 1 FROM consultation_preview_environment WHERE id=1 AND database_id=? AND origin=? AND manifest_sha256=? AND synthetic_only=1 AND enabled=0";
   const assertion='origin-alignment-'+crypto.randomUUID();
   // ONE atomic management batch: no other connection can observe the temporary
   // trigger removal. Failure restores the old marker and original trigger.
   await batch([
    {sql:`INSERT INTO consultation_preview_assertions VALUES(?,CASE WHEN EXISTS(${guard}) AND (SELECT COUNT(*) FROM consultation_migration_ledger)=15 THEN 1 ELSE NULL END)`,params:[assertion,target.databaseId,oldOrigin,target.manifestSha256]},
    {sql:'DROP TRIGGER consultation_environment_identity',params:[]},
    {sql:`UPDATE consultation_preview_environment SET origin=? WHERE id=1 AND database_id=? AND origin=? AND manifest_sha256=? AND synthetic_only=1 AND enabled=0`,params:[newOrigin,target.databaseId,oldOrigin,target.manifestSha256]},
    {sql:'INSERT INTO consultation_preview_assertions VALUES(?,CASE WHEN changes()=1 THEN 1 ELSE NULL END)',params:[assertion+'-changed']},
    {sql:restore,params:[]},
    {sql:'DELETE FROM consultation_preview_assertions WHERE id IN (?,?)',params:[assertion,assertion+'-changed']}
   ]);
  }
  diagnostics.stage='origin-alignment-postcheck';
  if(JSON.stringify(await read('SELECT ordinal,path,canonical_sha256,applied_at FROM consultation_migration_ledger ORDER BY ordinal'))!==JSON.stringify(ledger))fail();
  const result=await initializePreview(target,api,{diagnostics});
  console.log(JSON.stringify({...result,originAligned:true}));
 }catch{
  const label=x=>/^[a-z][a-z0-9-]{0,63}$/.test(x)?x:'unknown';
  const http=Number.isInteger(diagnostics.httpStatus)&&diagnostics.httpStatus>=100&&diagnostics.httpStatus<=599?diagnostics.httpStatus:'none';
  console.error(`C1_INIT_FAILURE stage=${label(diagnostics.stage)} request=${label(diagnostics.request)} http=${http}`);process.exitCode=1;
 }
}
