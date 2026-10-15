// Local synthetic workloads only; uses already-installed tooling, never Wrangler.
import assert from 'node:assert/strict';
import {mkdirSync,openSync,closeSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const tooling=Object.fromEntries([['miniflare',process.env.QY_MINIFLARE_PATH],['esbuild',process.env.QY_ESBUILD_PATH]].map(([name,path])=>{
 const entry=require.resolve(path),packagePath=require.resolve(name+'/package.json',{paths:[entry]}),pkg=JSON.parse(readFileSync(packagePath));
 return [name,{version:pkg.version,entry,packageSha256:createHash('sha256').update(readFileSync(packagePath)).digest('hex')}];
}));
const workerdPackage=require.resolve('workerd/package.json',{paths:[tooling.miniflare.entry]});
tooling.workerd={version:JSON.parse(readFileSync(workerdPackage)).version,packageSha256:createHash('sha256').update(readFileSync(workerdPackage)).digest('hex')};
const directory=resolve(process.argv[2]||'.local-c1-package-step2b-cpu');
const summarize=process.argv[3]==='--summarize';
if(!summarize)mkdirSync(directory);
const all=[];
for(let i=0;i<20;i++){
 const profile=resolve(directory,`routes-${i}.json`);
 if(!summarize){
 const log=openSync(resolve(directory,`routes-${i}.log`),'wx');
 let result;
 try{result=spawnSync(process.execPath,['--require','./scripts/consultation-local-file-stdio.cjs','scripts/test-consultation-pages.mjs'],{
  env:{...process.env,QY_C1_FREE_PROFILE:profile,...(i===0?{QY_C1_CPU_PHASES:resolve(directory,'phases.json')}:{})},
  stdio:['ignore',log,log],windowsHide:true,timeout:300000
 });}finally{closeSync(log);}
 assert.equal(result.status,0,`workload ${i} failed: see retained log`);
 }
 assert.match(readFileSync(resolve(directory,`routes-${i}.log`),'utf8'),/RESULT 83 passed, 0 failed/);
 const evidence=JSON.parse(readFileSync(profile));all.push(...evidence.samples.map(s=>({...s,run:i})));
 console.log(`CPU workload ${i+1}/20 passed (83 checks)`);
}
const percentile=values=>{values=values.filter(v=>v!==null).sort((a,b)=>a-b);return Object.fromEntries([['p50',.5],['p95',.95],['max',1]].map(([name,q])=>[name,values.length?values[Math.ceil(values.length*q)-1]:null]));};
function group(rows,key){const map=new Map();for(const row of rows){const k=key(row);if(!map.has(k))map.set(k,[]);map.get(k).push(row);}return [...map].map(([name,values])=>({name,n:values.length,cpuMs:percentile(values.map(v=>v.cpuMs)),wallMs:percentile(values.map(v=>v.wallMs)),maxStatements:Math.max(...values.map(v=>v.queries??0))}));}
// Keep success and denial/error samples separate: a cheap denial cannot mask successful work.
const routes=group(all,s=>`${s.runtime} ${s.path} status=${s.status}`);
assert.ok(all.every(s=>s.queries<=50));
for(const runtime of ['Node/SQLite','workerd/D1'])for(const path of ['POST /api/consultation/qy/login','POST /api/consultation/account/challenge','POST /api/consultation/account/confirm','POST /api/consultation/contact/challenge','POST /api/consultation/contact/confirm','POST /api/consultation/bookings','POST /api/consultation/offer/accept'])assert.ok(all.filter(s=>s.runtime===runtime&&s.path===path&&s.status===200).length>=20);
const phases=JSON.parse(readFileSync(resolve(directory,'phases.json')));
const result={method:'20 serial fresh-fixture runs; Node process CPU user+system (quantized on Windows), host wall time to response headers; workerd CPU and deployed CPU unavailable. Batches are total times for 100 operations, not individual invocation percentiles. Nearest-rank percentiles; includes cold/first calls; no concurrent benchmark requests. No credentials/bodies/headers in evidence.',node:process.version,platform:process.platform,arch:process.arch,tooling,runs:20,routeChecks:20*83,additionalSecurityChecks:phases.securityChecks,routeSamples:all.length,maxStatements:Math.max(...all.map(s=>s.queries)),routes,phases:group(phases.samples,s=>`${s.name} (batch=${s.batch})`),rawPhases:phases.samples};
writeFileSync(resolve('consultation-pages/U3-B2B-STEP2B-MEASUREMENTS.json'),JSON.stringify(result,null,2)+'\n',{flag:summarize?'w':'wx'});
console.log('RESULT CPU investigation passed; all measured invocations <=50 statements; workerd/deployed CPU unavailable');
