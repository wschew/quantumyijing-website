// Local only. Never installs packages, runs Wrangler, or sends remote requests.
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {SyntheticPasskeys} from './webauthn-synthetic-store.mjs';
import {authenticator,response} from './webauthn-synthetic-fixtures.mjs';
import {validate} from './webauthn-synthetic-validation.mjs';
import assert from 'node:assert/strict';
const samples=[],checks=[];
const a=await authenticator(),b=await authenticator(),s=new SyntheticPasskeys();
const record=async(runtime,operation,fn)=>{const cpu=process.cpuUsage(),start=process.hrtime.bigint();await fn();const wallMs=Number(process.hrtime.bigint()-start)/1e6,d=process.cpuUsage(cpu);samples.push({runtime,operation,cpuMs:runtime==='Node'?(d.user+d.system)/1000:null,wallMs});};
try{
 for(let i=0;i<100;i++){
  const isolated=new SyntheticPasskeys();try{const o=await isolated.begin('create',isolated.bootstrap),r=await response(a,o);await record('Node','registration finish + SQLite',()=>isolated.finish(o,r));}finally{isolated.close();}
 }
 for(const key of [a,b]){const o=await s.begin('create',s.bootstrap);await s.finish(o,await response(key,o));}
 for(let i=0;i<100;i++){const o=await s.begin('get'),r=await response(a,o,{count:i+2});await record('Node','authentication finish + SQLite + session',()=>s.finish(o,r));}
 const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(process.env.QY_MINIFLARE_PATH);
 const entry=`import {validate} from './webauthn-synthetic-validation.mjs';globalThis.fetch=async()=>{throw Error('outbound disabled')};export default{async fetch(req){try{const x=await req.json();await validate(x.response,x.expected,x.credential);return Response.json({ok:true});}catch{return Response.json({ok:false});}}}`;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'entry.mjs',contents:entry},...['webauthn-synthetic-validation.mjs','consultation-passkey-bench-fixture.mjs'].map(name=>({type:'ESModule',path:name,contents:readFileSync(new URL(name,import.meta.url),'utf8')}))],compatibilityDate:'2026-10-07',cf:false,telemetry:{enabled:false}}));
 try{
  for(const kind of ['create','get']){
   const expected={kind,challenge:'synthetic-challenge',rpId:s.rpId,origin:s.origin,userHandle:s.userHandle},credential={id:a.id,key:a.publicKey,count:1};
   const good=await response(a,expected,{count:2}),bad=await response(a,expected,{count:2,flags:kind==='create'?65:1});
   for(const [name,r,want] of [['valid',good,true],['missing UV',bad,false]]){
    const local=await validate(r,expected,credential).then(()=>true,()=>false);assert.equal(local,want);
    const res=await mf.dispatchFetch('http://localhost/verify',{method:'POST',body:JSON.stringify({response:r,expected,credential})});assert.equal((await res.json()).ok,want);checks.push({kind,name,node:true,workerd:true});
   }
   for(let i=0;i<100;i++)await record('workerd','stateless '+kind+' validation only',async()=>{const res=await mf.dispatchFetch('http://localhost/verify',{method:'POST',body:JSON.stringify({response:good,expected,credential})});assert.equal((await res.json()).ok,true);});
  }
 }finally{await mf.dispose();}
 const percentile=values=>{values=values.filter(v=>v!==null).sort((a,b)=>a-b);return Object.fromEntries([['p50',.5],['p95',.95],['max',1]].map(([k,q])=>[k,values.length?values[Math.ceil(q*values.length)-1]:null]));};
 const groups=new Map();for(const r of samples){const name=r.runtime+' '+r.operation;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}
 const summary=[...groups].map(([name,rows])=>({name,n:rows.length,cpuMs:percentile(rows.map(r=>r.cpuMs)),wallMs:percentile(rows.map(r=>r.wallMs))}));
 const versions=Object.fromEntries(['miniflare','workerd'].map(name=>[name,JSON.parse(readFileSync(require.resolve(name+'/package.json',{paths:[require.resolve(process.env.QY_MINIFLARE_PATH)]}))).version]));
 const result={node:process.version,versions,method:'100 serial samples, nearest-rank percentiles, no warmup excluded. Synthetic signing and challenge creation outside timing. Node full finish includes validation, challenge hash/atomic consumption, SQLite and session insertion for assertions. Node process user+system CPU quantized on Windows. workerd host wall includes dispatch and JSON body consumption, STATELESS validation only; no D1/replay/session measurement in workerd. No deployed CPU measurement or Cloudflare compatibility claim.',checks,summary,samples};
 writeFileSync(new URL('../docs/quantum-yijing-c1-step2da-measurements.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({checks,summary},null,2));
}finally{s.close();}
