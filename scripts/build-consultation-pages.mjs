// Offline build only. No Cloudflare CLI, downloads, deployment or credentials.
import {readFileSync,mkdirSync,writeFileSync,copyFileSync,existsSync,mkdtempSync,unlinkSync,rmdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {root,canonical,sha,verifyManifest} from './consultation-migration-verifier.mjs';
import {compatibilityDDL} from './consultation-schema-compatibility.mjs';
export async function buildPackage(output,esbuildPath){
 if(existsSync(output))throw Error('New output directory required; existing packages are never overwritten');
 const manifest=verifyManifest(JSON.parse(readFileSync(new URL('database/c1-migration-manifest.json',root),'utf8')));
 // Native CLI with inherited handles also works in Windows environments where
 // Node cannot create anonymous child-process pipes. No shell or download.
 const require=createRequire(import.meta.url),entry=require.resolve(esbuildPath);
 const binary=require.resolve('@esbuild/'+(process.platform==='win32'?'win32-x64/esbuild.exe':process.platform+'-'+process.arch+'/bin/esbuild'),{paths:[entry]});
 const temporary=mkdtempSync(resolve(tmpdir(),'c1-bundle-')),compiled=resolve(temporary,'worker.js'),meta=resolve(temporary,'meta.json');
 let bundle;
 try{
  const result=spawnSync(binary,['consultation-pages/worker.js','--bundle','--format=esm','--platform=browser','--target=es2022','--outfile='+compiled,'--metafile='+meta,'--log-level=silent'],{cwd:fileURLToPath(root),stdio:'inherit',windowsHide:true});
  if(result.status!==0)throw Error('Offline compilation failed');
  bundle={metafile:JSON.parse(readFileSync(meta,'utf8')),outputFiles:[{contents:readFileSync(compiled)}]};
 }finally{for(const file of [compiled,meta])if(existsSync(file))unlinkSync(file);rmdirSync(temporary);}
 if(Object.keys(bundle.metafile.inputs).some(p=>!p.replaceAll('\\','/').match(/(?:consultation-pages\/worker\.js|functions\/lib\/consultation\/[^/]+\.js|database\/c1-migration-manifest\.json)$/)))throw Error('Unexpected Worker dependency');
 const publicPath=resolve(output,'public'),offline=resolve(output,'offline');
 mkdirSync(publicPath,{recursive:true});mkdirSync(offline);
 writeFileSync(resolve(publicPath,'_worker.js'),bundle.outputFiles[0].contents);
 for(const name of ['customer.html','qy.html','workflow-ui.js','workflow.css','academy-logo.png']){
  if(name.endsWith('.html')){
   let html=readFileSync(new URL('consultation-preview/'+name,root),'utf8').replace('data-page=','data-deployment="preview" data-page=');
   html=html.replace(/<button id="local-customer-login"[^>]*>.*?<\/button>/,'');
   writeFileSync(resolve(publicPath,name),html);
  }else copyFileSync(new URL('consultation-preview/'+name,root),resolve(publicPath,name));
 }
 writeFileSync(resolve(publicPath,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:[]},null,2)+'\n');
 // Schema/manifest material is NEVER put in the public asset directory.
 const projection=compatibilityDDL();
 writeFileSync(resolve(offline,'000-isolated-prerequisites.sql'),projection.statements.join('\n')+'\n'+canonical(readFileSync(new URL(manifest.prerequisites[0].path,root))));
 for(const m of manifest.migrations)writeFileSync(resolve(offline,String(m.ordinal).padStart(3,'0')+'-'+m.path.split('/').at(-1)),canonical(readFileSync(new URL(m.path,root))));
 writeFileSync(resolve(offline,'migration-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 writeFileSync(resolve(offline,'schema-provenance.json'),JSON.stringify(projection.provenance,null,2)+'\n');
 copyFileSync(new URL('consultation-pages/config.template.json',root),resolve(offline,'config.template.json'));
 copyFileSync(new URL('consultation-pages/wrangler.template.jsonc',root),resolve(output,'wrangler.template.jsonc'));
 writeFileSync(resolve(offline,'migration-plan.json'),JSON.stringify({mode:'REVIEW ONLY; no executor',freshDatabaseOnly:true,prerequisite:'000-isolated-prerequisites.sql',migrations:manifest.migrations.map(m=>({ordinal:m.ordinal,file:String(m.ordinal).padStart(3,'0')+'-'+m.path.split('/').at(-1),sha256:m.sha256,ledger:{sql:'INSERT INTO consultation_migration_ledger(ordinal,path,canonical_sha256,applied_at) VALUES(?,?,?,?)',values:[m.ordinal,m.path,m.sha256,'OPERATOR_REVIEWED_TIMESTAMP_MS']},atomic:'Execute migration and ledger insertion in the SAME transaction; stop on any mismatch'}))},null,2)+'\n');
 const files=Object.fromEntries(['wrangler.template.jsonc',...readdirSync(publicPath).map(p=>'public/'+p),...readdirSync(offline).map(p=>'offline/'+p)].sort().map(p=>[p,sha(readFileSync(resolve(output,p)))]));
 writeFileSync(resolve(output,'package-inventory.json'),JSON.stringify({mode:'LOCAL PREPARATION ONLY',manifestSha256:sha(JSON.stringify(manifest)),workerSha256:sha(bundle.outputFiles[0].contents),migrations:15,workerInputs:Object.keys(bundle.metafile.inputs),files},null,2)+'\n');
 return {publicPath,offline,manifest};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==3||!process.env.QY_ESBUILD_PATH)throw Error();await buildPackage(resolve(process.argv[2]),process.env.QY_ESBUILD_PATH);console.log('LOCAL C1 PACKAGE PREPARED. No deployment or database operation.');}
 catch{console.error('Local package preparation failed. Use a new output directory and an existing offline esbuild installation.');process.exitCode=1;}
}
