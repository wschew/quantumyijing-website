// Synthetic test instrumentation only. Never bundled or used as authorization.
import {cpuUsage,hrtime} from 'node:process';
export function meterDatabase(raw,limit=50,failure='none'){
 const stats={queries:0,rowsRead:0,rowsWritten:0};const natives=new WeakMap();
 function reserve(n,write=false){if(stats.queries+n>limit||failure==='read-quota'&&!write||failure==='write-quota'&&write||failure==='runtime')throw Error('Synthetic resource exhausted');stats.queries+=n;}
 function result(r){stats.rowsRead+=r?.meta?.rows_read||0;stats.rowsWritten+=r?.meta?.rows_written||0;return r;}
 function prepare(sql){let native=raw.prepare(sql);const write=!/^\s*(SELECT|PRAGMA)\b/i.test(sql),remember=wrapper=>natives.set(wrapper,{native,write});const wrapper={bind(...v){native=native.bind(...v);remember(wrapper);return wrapper;},async first(column){reserve(1,write);const row=result(await native.all()).results?.[0]??null;return column===undefined?row:row?.[column]??null;},async all(){reserve(1,write);return result(await native.all());},async run(){reserve(1,write);return result(await native.run());}};remember(wrapper);return wrapper;}
 return {stats,db:{prepare,async batch(plans){const values=plans.map(p=>{const n=natives.get(p);if(!n)throw Error('Foreign test statement');return n;});reserve(plans.length,values.some(v=>v.write));return (await raw.batch(values.map(v=>v.native))).map(result);}}};
}
export const samples=[];
export async function profileRequest(request,dispatch,kind){
 const cpu=cpuUsage(),start=hrtime.bigint();const response=await dispatch(request);const elapsed=cpuUsage(cpu);
 const value=response.headers.get('x-c1-test-metrics');
 if(value){const record=JSON.parse(value);samples.push({runtime:kind,path:request.method+' '+new URL(request.url).pathname,status:response.status,...record,cpuMs:kind==='Node/SQLite'?(elapsed.user+elapsed.system)/1000:null,wallMs:Number(hrtime.bigint()-start)/1e6});}
 return response;
}
export function instrumentWorkerSource(source){
 const pattern=/export\s*\{\s*(\w+) as default\s*\};?\s*$/;
 if(!pattern.test(source))throw Error('Unknown bundled Worker export');
 return source.replace(pattern,(_,name)=>`const meterDatabase=${meterDatabase.toString()}; export default {async fetch(request,env){
 const limit=Number(request.headers.get('x-c1-test-limit')||50),failure=request.headers.get('x-c1-test-failure')||'none';
 const meter=meterDatabase(env.CONSULTATION_DB,limit,failure);
 const response=await ${name}.fetch(request,{...env,CONSULTATION_DB:meter.db});
 const headers=new Headers(response.headers);headers.set('x-c1-test-metrics',JSON.stringify(meter.stats));
 return new Response(response.body,{status:response.status,headers});}};`);
}
export function summary(){
 const groups=new Map();for(const sample of samples){const key=sample.runtime+' '+sample.path;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sample);}
 const percent=values=>{values=values.filter(v=>v!==null).sort((a,b)=>a-b);const p=q=>values.length?values[Math.max(0,Math.ceil(q*values.length)-1)]:null;return {p50:p(.5),p95:p(.95),max:p(1)};};
 return [...groups].map(([route,rows])=>({route,samples:rows.length,queries:percent(rows.map(r=>r.queries)),cpuMs:percent(rows.map(r=>r.cpuMs)),wallMs:percent(rows.map(r=>r.wallMs)),maxRowsRead:Math.max(...rows.map(r=>r.rowsRead)),maxRowsWritten:Math.max(...rows.map(r=>r.rowsWritten))}));
}
