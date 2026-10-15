// Local-only synthetic public-key cost investigation. No credential enrollment or providers.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {cpuUsage,hrtime} from 'node:process';
import {from64,to64,derToRaw,runSynthetic} from './consultation-passkey-bench-fixture.mjs';
const require=createRequire(import.meta.url),directory=resolve(process.argv[2]||'.local-c1-package-step2c-passkey');
mkdirSync(directory);
const encoder=new TextEncoder();
const rpId='c1-bazi-consultation-development.qy-c1-consultation-preview.pages.dev',origin='https://'+rpId;
const challenge=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
// Ephemeral mathematical test key, never registered with a browser/device/account.
const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',key.publicKey);
const clientBytes=encoder.encode(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false}));
const auth=new Uint8Array(37);auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(rpId))));auth[32]=5;auth[36]=1;
const signed=new Uint8Array(69);signed.set(auth);signed.set(new Uint8Array(await crypto.subtle.digest('SHA-256',clientBytes)),37);
const rawSignature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.privateKey,signed));
function rawToDer(raw){
 const parts=[raw.slice(0,32),raw.slice(32)].map(part=>{while(part.length>1&&part[0]===0)part=part.slice(1);if(part[0]&128)part=Uint8Array.of(0,...part);return Uint8Array.of(2,part.length,...part);});
 return Uint8Array.of(0x30,parts[0].length+parts[1].length,...parts[0],...parts[1]);
}
assert.deepEqual(derToRaw(rawToDer(rawSignature)),rawSignature);
const fixture={expected:{challenge,origin,rpId},publicKey,clientData:to64(clientBytes),authData:to64(auth),signature:to64(rawToDer(rawSignature))};
const alteredClient=patch=>({...fixture,clientData:to64(encoder.encode(JSON.stringify({...JSON.parse(new TextDecoder().decode(clientBytes)),...patch})))});
const alteredAuth=(index,value)=>{const a=auth.slice();a[index]=value;return {...fixture,authData:to64(a)};};
const tampered=from64(fixture.signature);tampered[tampered.length-1]^=1;
const cases=[['valid',fixture,true],['wrong challenge',alteredClient({challenge:challenge+'x'}),false],['wrong origin',alteredClient({origin:'https://other.invalid'}),false],['parent origin',alteredClient({origin:'https://qy-c1-consultation-preview.pages.dev'}),false],['wrong type',alteredClient({type:'webauthn.create'}),false],['cross origin',alteredClient({crossOrigin:true}),false],['missing UV',alteredAuth(32,1),false],['missing UP',alteredAuth(32,4),false],['RP hash mismatch',alteredAuth(0,auth[0]^1),false],['BS without BE',alteredAuth(32,0x15),false],['signature tampering',{...fixture,signature:to64(tampered)},false],['DER truncation',{...fixture,signature:to64(from64(fixture.signature).slice(0,-1))},false],['DER trailing',{...fixture,signature:to64(Uint8Array.of(...from64(fixture.signature),0))},false],['oversized input',{...fixture,clientData:'x'.repeat(4097)},false],['invalid public key',{...fixture,publicKey:{...publicKey,x:'AAAA'}},false]];
const {Miniflare,convertV4MiniflareOptions}=require(process.env.QY_MINIFLARE_PATH);
const entry=`import {runSynthetic} from './fixture.mjs';globalThis.fetch=async()=>{throw Error('Outbound disabled')};export default{async fetch(request){const input=await request.json();let result=true;for(let i=0;i<input.batch;i++)result=(await runSynthetic(input.fixture,input.operation))&&result;return Response.json({ok:result});}}`;
const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'entry.mjs',contents:entry},{type:'ESModule',path:'fixture.mjs',contents:readFileSync(new URL('./consultation-passkey-bench-fixture.mjs',import.meta.url),'utf8')}],compatibilityDate:'2026-10-07',cf:false,telemetry:{enabled:false}}));
const samples=[],checks=[];
try{
 for(const runtime of ['Node','workerd']){
  const invoke=async(f,operation='assertion-subset',batch=1)=>{
   if(runtime==='Node'){let ok=true;for(let j=0;j<batch;j++)ok=(await runSynthetic(f,operation))&&ok;return ok;}
   const response=await mf.dispatchFetch('http://localhost/synthetic',{method:'POST',body:JSON.stringify({fixture:f,operation,batch})});
   assert.equal(response.status,200);return (await response.json()).ok;
  };
  for(const [name,f,expected] of cases){assert.equal(await invoke(f),expected,runtime+' '+name);checks.push({runtime,name,ok:true});}
  for(const operation of ['public-key-import','assertion-subset','assertion-and-session-crypto'])for(const batch of [1,100]){
   const n=batch===1?200:30;
   for(let i=0;i<n;i++){
    const cpu=cpuUsage(),start=hrtime.bigint();const ok=await invoke(fixture,operation,batch);
    const wallMs=Number(hrtime.bigint()-start)/1e6,delta=cpuUsage(cpu);assert.equal(ok,true);
    samples.push({runtime,operation,batch,cpuMs:runtime==='Node'?(delta.user+delta.system)/1000:null,wallMs});
   }
   console.log(runtime+' '+operation+' batch='+batch+' samples='+n+' PASS');
  }
 }
}finally{await mf.dispose();}
const percentile=values=>{values=values.filter(v=>v!==null).sort((a,b)=>a-b);return Object.fromEntries([['p50',.5],['p95',.95],['max',1]].map(([k,q])=>[k,values.length?values[Math.ceil(q*values.length)-1]:null]));};
const groups=new Map();for(const s of samples){const name=s.runtime+' '+s.operation+' batch='+s.batch;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(s);}
const summary=[...groups].map(([name,rows])=>({name,n:rows.length,cpuMs:percentile(rows.map(s=>s.cpuMs)),wallMs:percentile(rows.map(s=>s.wallMs)),meanCpuMsPerOperation:rows[0].runtime==='Node'?rows.reduce((n,s)=>n+s.cpuMs,0)/rows.length/rows[0].batch:null,meanWallMsPerOperation:rows.reduce((n,s)=>n+s.wallMs,0)/rows.length/rows[0].batch}));
const versions=Object.fromEntries(['miniflare','workerd'].map(name=>[name,JSON.parse(readFileSync(require.resolve(name+'/package.json',{paths:[require.resolve(process.env.QY_MINIFLARE_PATH)]}))).version]));
const evidence={status:'UNKNOWN: microbenchmarks do not qualify a complete WebAuthn route or deployed Free CPU',method:'Serial tests; fresh P-256 public-key import each operation. Synthetic DER signature conversion, JSON/binary parsing, two SHA-256 hashes, RP/origin/challenge/UP/UV subset checks and ES256 verify. Session-crypto case adds two random tokens and SHA-256 hashes, no sessions or D1. Node process user+system CPU is quantized on Windows. workerd CPU and all deployed timings unavailable. Host wall time includes JSON dispatch/body consumption for workerd. Batches contain 100 serial operations; divided means are not per-request percentiles. No browser, real credential, CBOR registration, replay store, authorization or full WebAuthn validation.',node:process.version,platform:process.platform,versions,compatibilityDate:'2026-10-07',securityChecks:checks.length,summary,checks,samples};
writeFileSync(resolve(directory,'measurements.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
writeFileSync('consultation-pages/U3-B2B-STEP2C-MEASUREMENTS.json',JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log('RESULT '+checks.length+' passed, 0 failed; synthetic subset only; Free qualification UNKNOWN');
