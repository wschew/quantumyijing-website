// Local-only private-pipe + orchestration verification with actual packaged Worker/SQLite.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
export async function selfTest(input){
 if(input?.secret!=='a'.repeat(64))throw Error('Synthetic private input did not arrive');input.secret=null;
 if(process.env.QY_MINIFLARE_PATH)throw Error('Unset optional runtime variable for the SQLite-only launcher test');
 let source=fs.readFileSync(new URL('./test-consultation-individual-offers.mjs',import.meta.url),'utf8');
 const pkg=resolve('.local-c1-package-preview-individual-offers-1792227841991');
 source=source.replace("const output=resolve('.local-c1-package-preview-individual-offers-'+Date.now());\nconst packageInfo=await buildPackage(output,process.env.QY_ESBUILD_PATH);",`const output=${JSON.stringify(pkg)};const packageInfo={publicPath:resolve(output,'public'),offline:resolve(output,'offline'),manifest:JSON.parse(readFileSync(resolve(output,'offline/migration-manifest.json'),'utf8'))};`);
 source=source.replace("databaseId='11111111-2222-4333-8444-555555555555'","databaseId='734455fd-cdec-4e14-ad6f-96f80f22f3e7'");
 source='import {runPreviewAcceptance} from '+JSON.stringify(pathToFileURL(resolve('scripts/run-c1-preview-acceptance.mjs')).href)+';\n'+source;
 const hook=String.raw`
 raw.prepare('UPDATE consultation_guest_admission SET attempts=0').run();
 const prior=await createCase(Date.parse('2026-11-02T02:00:00Z'),88000);raw.prepare('UPDATE consultation_bookings SET reference=? WHERE id=?').run('BAZI-faffbbee-4f2e-48d2-ad64-66e0337b6264',prior.r.id);
 const managementCalls=[],applicationCalls=[];
 const localManagement=async(url,body)=>{managementCalls.push({url,write:!!body});const base='/accounts/f87d6f0679c6fe4c1c08af320850b52c';if(url===base)return {id:'f87d6f0679c6fe4c1c08af320850b52c'};if(url===base+'/d1/database/'+databaseId)return {uuid:databaseId,name:'qy-c1-consultation-preview-db'};if(url===base+'/pages/projects/qy-c1-consultation-preview'){const preview={d1_databases:{CONSULTATION_DB:{id:databaseId}},env_vars:Object.fromEntries(Object.entries(settings).filter(([k])=>k.startsWith('CONSULTATION_')||k==='SUBSCRIPTION_AUTOMATION_ENABLED').map(([k,v])=>[k,{value:v}]))};preview.env_vars.SUBSCRIPTION_AUTOMATION_ENABLED={value:'false'};return {name:'qy-c1-consultation-preview',production_branch:'c1-production-disabled',deployment_configs:{preview,production:{d1_databases:{},env_vars:Object.fromEntries(['CONSULTATION_PREVIEW_ENABLED','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED','SUBSCRIPTION_AUTOMATION_ENABLED'].map(k=>[k,{value:'false'}]).concat([['CONSULTATION_DEPLOYMENT_SLOT',{value:'disabled'}]]))}}};}if(url===base+'/d1/database/'+databaseId+'/query'&&Array.isArray(body?.batch)){const results=await db.batch(body.batch.map(p=>db.prepare(p.sql).bind(...p.params)));return results.map(r=>({success:true,results:r.results||[]}));}throw Error('Unexpected management path');};
 const localFetch=async(url,options)=>{applicationCalls.push({url,method:options.method});if(!url.startsWith(origin+'/api/consultation/'))throw Error('Unexpected application origin');return worker.fetch(new Request(url,options),env);};
 const beforeTests=count();const badTarget=await runPreviewAcceptance({secret:password},{management:async()=>({id:'wrong-target'}),fetcher:async()=>{throw Error('Unexpected app request');}});check(badTarget.result==='BLOCKED'&&badTarget.stoppedStage==='target-verification'&&count()===beforeTests,'launcher stops before mutations on wrong identity');
 const denied=await runPreviewAcceptance({secret:password},{management:localManagement,fetcher:async()=>Response.json({ok:false},{status:401})});check(denied.result==='BLOCKED'&&denied.stoppedStage==='administrator-login'&&count()===beforeTests,'launcher authentication preflight stage: '+denied.stoppedStage+' checks='+denied.checks);
 let rejectedSubmissions=0;const refused=await runPreviewAcceptance({secret:password},{management:localManagement,fetcher:async(url,options)=>{if(url.endsWith('/guest/review-request')){rejectedSubmissions++;return Response.json({ok:false},{status:409});}return localFetch(url,options);}});check(refused.result==='BLOCKED'&&refused.stoppedStage==='request-submission'&&refused.sessionDisposed&&rejectedSubmissions===1&&count()===beforeTests,'launcher stops and logs out on failed submission without retry');applicationCalls.length=0;
 const result=await runPreviewAcceptance({secret:password},{management:localManagement,fetcher:localFetch});check(result.result==='PASS','local launcher lifecycle stage: '+result.stoppedStage);check(result.historicalUnchanged&&result.sessionDisposed&&result.cleanup==='released; audit verified','local launcher fingerprints history and logs out');check(applicationCalls.filter(c=>c.url.endsWith('/guest/review-request')).length===1&&applicationCalls.filter(c=>c.url.endsWith('/guest/offer/accept')).length===2,'launcher submits once and repeats only successful acceptance');check(managementCalls.filter(c=>c.url.endsWith('/query')).length>0,'launcher uses exact management query transport');
 `;
 if(!source.includes(' Date.now=realNow;'))throw Error('Fixture hook changed');source=source.replace(' Date.now=realNow;',hook+'\n Date.now=realNow;');
 source=source.replace(/from '([.][^']+)'/g,(_,p)=>'from '+JSON.stringify(pathToFileURL(resolve('scripts',p)).href));
 const logs=[],previous=console.log;console.log=v=>logs.push(String(v));
 try{await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
 finally{console.log=previous;}
 const summary=JSON.parse(logs.at(-1));console.log(JSON.stringify({result:'LOCAL_SELF_TEST_PASS',assertions:summary.assertions,checks:'private stdin, exact target, normal login/cookie/CSRF, lifecycle, cleanup, history and logout; no network'}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))selfTest({secret:'a'.repeat(64)}).catch(()=>{console.log(JSON.stringify({result:'BLOCKED',stoppedStage:'local-self-test'}));process.exitCode=1;});
