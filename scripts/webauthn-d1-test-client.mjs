// PRIVATE synthetic harness adapter. Never imported by a Worker or C1 runtime.
import assert from 'node:assert/strict';
export class SyntheticClient {
 constructor(dispatch,sign,approve=async()=>{}){this.dispatch=dispatch;this.sign=sign;this.approve=approve;this.sessions=new Map();}
 headers(raw,origin='https://synthetic.invalid'){
  const saved=this.sessions.get(raw);return {'content-type':'application/json',origin,'sec-fetch-site':'same-origin',...(saved?{cookie:saved.cookie,'x-qy-consultation-csrf':saved.csrf}:{})};
 }
 async prepare(path,input){
  const x={...input};let route=path;
  if(path==='/begin'&&x.kind==='create')route='/local-enroll-begin';
  if(path==='/finish'&&x.response?.response?.attestationObject!==undefined)route='/local-enroll-finish';
  if(['/revoke-all','/revoke-credential','/suspend'].includes(path)&&!Object.hasOwn(x,'proof')){
   const r=await this.dispatch('https://synthetic.invalid/control-options',{method:'POST',headers:this.headers(x.session),body:JSON.stringify({session:x.session,action:path.slice(1),id:x.id})}),b=await r.json();
   if(r.status===200){x.ticket=b.result.ticket;x.proof=await this.sign(b.result);}
  }
  return {route,x,headers:this.headers(x.session)};
 }
 async remember(path,x,r,body){
  if(r.status===200&&typeof body.result==='string'&&body.csrfToken){const cookies=r.headers.getSetCookie();assert.equal(cookies.length,2);this.sessions.set(body.result,{csrf:body.csrfToken,cookie:cookies.map(c=>c.split(';')[0]).join('; ')});}
  if(r.status===200&&path==='/local-enroll-finish')await this.approve(x.response.id);
 }
}
export function instrumentEnrollment(source){
 return source.replace("   case '/begin':", "   case '/local-enroll-begin':result=await s.begin(x.kind,x.authority);break;\n   case '/local-enroll-finish':result=await s.finish(x.challenge,x.response);break;\n   case '/begin':");
}
export function instrumentMetrics(source){return source.replace('Response.json({result,csrfToken:', 'Response.json({result,metrics:s.stats,csrfToken:').replace('Response.json({result:null},{status:404})','Response.json({result:null,metrics:s.stats},{status:404})');}
