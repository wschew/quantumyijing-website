// Local read-only review. Never invokes Wrangler, network, SQL or activation.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha} from './consultation-migration-verifier.mjs';
import {PAGES_PROJECT} from '../functions/lib/consultation/pages-boundary.js';
export function reviewConfiguration(config){
 if(Object.keys(config).sort().join(',')!==['name','pages_build_output_dir','compatibility_date','d1_databases','vars','env'].sort().join(','))throw Error('Unexpected deployment configuration field');
 if(config.name!==PAGES_PROJECT||config.pages_build_output_dir!=='./public'||config.compatibility_date!=='2026-10-07')throw Error('Wrong isolated project configuration');
 const permitted=['CONSULTATION_DEPLOYMENT_SLOT','CONSULTATION_CONFIG','CONSULTATION_PREVIEW_ENABLED','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED','SUBSCRIPTION_AUTOMATION_ENABLED'];
 for(const [name,slot] of [['default',config],['production',config.env?.production],['preview',config.env?.preview]]){
  if(!slot||!slot.vars||Object.keys(slot.vars).sort().join(',')!==[...permitted].sort().join(','))throw Error('Unexpected configuration variable');
  if(name!=='default'&&Object.keys(slot).sort().join(',')!=='d1_databases,vars')throw Error('Unexpected slot binding');
  for(const gate of permitted.filter(p=>p.endsWith('_ENABLED')))if(slot.vars[gate]!=='false')throw Error('Preparation gates must stay disabled');
  if(slot.vars.CONSULTATION_CONFIG!=='{}'||slot.vars.CONSULTATION_DEPLOYMENT_SLOT!==(name==='preview'?'preview':'disabled'))throw Error('Unsafe preparation slot');
  if(name!=='preview'&&JSON.stringify(slot.d1_databases)!=='[]')throw Error('Production/default D1 binding prohibited');
 }
 const bindings=config.env.preview.d1_databases;
 if(bindings?.length!==1||bindings[0].binding!=='CONSULTATION_DB'||bindings[0].database_name!=='qy-c1-consultation-preview-db'||bindings[0].database_id!=='OWNER_ATTESTED_NEW_DATABASE_UUID_REQUIRED')throw Error('Unattested or shared D1 configuration');
 if(Object.keys(bindings[0]).sort().join(',')!=='binding,database_id,database_name')throw Error('Unexpected D1 binding field');
 if(Object.keys(config.env).sort().join(',')!=='preview,production')throw Error('Unexpected deployment slot');
 return {mode:'DISABLED REVIEW ONLY',remoteReady:false,blockers:['Owner-approved and verified hostname','Independent account/project/UUID attestation','Private administrator transfer','Free CPU compatibility','Separate migration/deployment/activation authorization']};
}
export function reviewPackage(directory){
 const inventory=JSON.parse(readFileSync(resolve(directory,'package-inventory.json'),'utf8'));
 for(const [path,hash] of Object.entries(inventory.files)){
  const full=resolve(directory,path),rel=relative(resolve(directory),full);
  if(isAbsolute(rel)||rel.startsWith('..')||sha(readFileSync(full))!==hash)throw Error('Package inventory mismatch');
 }
 const publicFiles=readdirSync(resolve(directory,'public')).sort();
 if(publicFiles.join(',')!==['_routes.json','_worker.js','academy-logo.png','customer.html','qy.html','workflow-ui.js','workflow.css'].sort().join(','))throw Error('Unexpected public file');
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.template.jsonc'),'utf8').replace(/^\/\/.*$/gm,''));
 return {...reviewConfiguration(config),files:Object.keys(inventory.files).length,workerSha256:inventory.workerSha256,manifestSha256:inventory.manifestSha256};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==3)throw Error();console.log(JSON.stringify(reviewPackage(resolve(process.argv[2])),null,2));}
 catch{console.error('Local Preview package review rejected; no remote operation.');process.exitCode=1;}
}
