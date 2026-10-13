// Consultation-only, read-only canonical customer search. No CRM/intake serialization.
import {createWorkflowGuards} from './workflow-guards.js';
const reject=()=>{throw Error('Customer search rejected');};
export function createCustomerSearch({db,origin}){
 const guards=createWorkflowGuards({db,origin});
 return Object.freeze({async search(request,input){
  if(!input||Array.isArray(input)||Object.keys(input).length!==1||typeof input.query!=='string')reject();
  const query=input.query.trim();if(!query||query.length>120||/[\x00-\x1f\x7f]/.test(query)||(query.length<2&&!/^\d$/.test(query)))reject();
  const auth=await guards.qy(request,true);
  const escape=s=>s.replace(/[\\%_]/g,c=>'\\'+c);
  const like='%'+escape(query)+'%',digits=query.replace(/[+ ()-]/g,'');
  const id=/^\d{1,15}$/.test(query)?Number(query):-1;
  const result=await db.prepare(`SELECT c.id,c.display_name,c.email,c.phone FROM customers c WHERE c.status='Active' AND EXISTS(${auth.sql}) AND (c.id=? OR c.display_name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR (?<>'' AND replace(replace(replace(replace(replace(c.phone,' ',''),'+',''),'-',''),'(',''),')','') LIKE ? ESCAPE '\\')) ORDER BY c.id LIMIT 20`).bind(...auth.values,id,like,like,/^\d{2,}$/.test(digits)?digits:'','%'+escape(digits)+'%').all();
  const records=result.results.map(c=>({id:c.id,name:c.display_name,maskedEmail:c.email?(c.email.slice(0,1)+'***@***'):'',maskedPhone:c.phone?(c.phone.replace(/\D/g,'').length>4?'•••• '+c.phone.replace(/\D/g,'').slice(-4):'••••'):''}));
  return Object.freeze({records,limit:20});
 }});
}
