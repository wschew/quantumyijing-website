// Internal consultation lifecycle only. No providers, financial writes or automatic jobs.
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
import {identifier,instant,databaseBoolean,strictBoolean,rescheduleEligibility,approveReschedule,SESSION} from './foundation.js';
import {transition} from './state.js';
import {intakeRetention} from './intake-policy.js';
const reject=()=>{throw Error('Consultation lifecycle rejected or conflicted');};
const stmt=(db,sql,values=[])=>db.prepare(sql).bind(...values);
function inputOnly(input,allowed){if(!input||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))reject();identifier(input.id);identifier(input.commandId);if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)reject();}
export function createWorkflowLifecycle({db,origin,keys,stepup}){
 const guards=createWorkflowGuards({db,origin});
 async function load(input){
  const row=await stmt(db,`SELECT b.*,a.id AS schedule_id,a.sequence AS schedule_sequence,
   COALESCE(a.start_at,b.current_start_at) AS effective_start,COALESCE(a.end_at,b.current_end_at) AS effective_end
   FROM consultation_bookings b LEFT JOIN consultation_workflow_appointments a ON a.booking_id=b.id AND a.state='Active' WHERE b.id=?`,[input.id]).first();
  if(!row||row.row_version!==input.expectedVersion)reject();return row;
 }
 async function time(){return (await stmt(db,`SELECT ${DB_NOW} n`).first()).n;}
 function domain(row){return {id:row.id,state:row.state,rowVersion:row.row_version,currentOfferId:row.current_offer_id,
  practitionerId:row.practitioner_id,currentStartAt:row.effective_start,currentEndAt:row.effective_end,
  originalStartAt:row.original_start_at,freeRescheduleUsed:databaseBoolean(row.free_reschedule_used)};}
 function audit(id,event,auth,kind='QY',evidence=null){return stmt(db,`INSERT INTO consultation_workflow_lifecycle_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,${DB_NOW})`,[crypto.randomUUID(),id,event,kind,kind==='QY'?auth.principal.sessionId:auth.principal.contextId,evidence]);}
 async function command(input){
  const key=await keys.lookup.provider(keys.lookup.activeKeyId);
  const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['qy-workflow-lifecycle-v1',input])));
  const fingerprint=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  return stmt(db,`INSERT INTO consultation_workflow_commands VALUES(?,?,?,?,${DB_NOW})`,[input.commandId,input.id,keys.lookup.activeKeyId,fingerprint]);
 }
 function version(row,auth,extra='',values=[],changes={}){
  return stmt(db,`UPDATE consultation_bookings SET row_version=row_version+1,updated_at=${DB_NOW}${changes.state?',state=?':''}${changes.freeUsed!==undefined?',free_reschedule_used=?':''}${changes.terminalAt!==undefined?',terminal_at=?':''}
   WHERE id=? AND row_version=? AND state=? AND EXISTS(${auth.sql}) ${extra}`,
   [...(changes.state?[changes.state]:[]),...(changes.freeUsed!==undefined?[changes.freeUsed?1:0]:[]),...(changes.terminalAt!==undefined?[changes.terminalAt]:[]),row.id,row.row_version,row.state,...auth.values,...values]);
 }
 async function retention(plan,row,auth,basis,terminalAt){
  const current=await stmt(db,'SELECT i.id,i.revision FROM consultation_customer_intakes i JOIN consultation_workflow_intakes w ON w.intake_id=i.id WHERE w.booking_id=?',[row.id]).first();if(!current)reject();
  const deadline=intakeRetention({status:basis,terminalAt});
  plan.push(stmt(db,`UPDATE consultation_customer_intakes SET revision=revision+1,retention_basis=?,retention_until=?,terminal_at=?,updated_at=? WHERE id=? AND revision=? AND completed_at IS NULL`,[basis,deadline,terminalAt,terminalAt,current.id,current.revision]),audit(row.id,'RetentionUpdated',auth));
 }
 async function requestReschedule(request,input){
  try{
   inputOnly(input,['id','expectedVersion','commandId']);const auth=await stepup.requireStepup(request,true),row=await load(input),now=await time();
   if(row.customer_id!==auth.principal.customerId||row.state!=='Confirmed')reject();
   const eligibility=rescheduleEligibility({requestedAt:now,startAt:row.effective_start,freeRescheduleUsed:databaseBoolean(row.free_reschedule_used)});
   const id=crypto.randomUUID(),type=eligibility==='FreeEligible'?'Free':eligibility==='Late'?'Late':'Additional';
   await db.batch([version(row,auth),audit(row.id,'RescheduleRequested',auth,'Customer'),
    stmt(db,`INSERT INTO consultation_reschedule_requests(id,booking_id,requested_at,appointment_start_snapshot,original_start_snapshot,request_type,state,eligibility)
     VALUES(?,?,?,?,?,?,'Pending',?)`,[id,row.id,now,row.effective_start,row.original_start_at,type,eligibility==='FreeEligible'?1:0]),await command(input)]);
   return Object.freeze({id:row.id,requestId:id,decision:'Pending',eligibility,rowVersion:row.row_version+1});
  }catch{reject();}
 }
 async function decideReschedule(request,input){
  try{
   inputOnly(input,['id','requestId','expectedVersion','commandId','replacementStart','ownerApproved']);identifier(input.requestId);strictBoolean(input.ownerApproved,'ownerApproved');
   const auth=await guards.qy(request,true),row=await load(input),now=await time();
   const pending=await stmt(db,"SELECT * FROM consultation_reschedule_requests WHERE id=? AND booking_id=? AND state IN ('Pending','OwnerReview')",[input.requestId,row.id]).first();if(!pending)reject();
   if(input.replacementStart!==null)instant(input.replacementStart);
   const overlap=input.replacementStart===null?true:!!await stmt(db,`SELECT 1 FROM consultation_slot_reservations WHERE booking_id<>? AND practitioner_id=? AND state IN ('Held','Confirmed') AND start_at<? AND end_at>?
    UNION ALL SELECT 1 FROM consultation_workflow_appointments WHERE booking_id<>? AND practitioner_id=? AND state='Active' AND start_at<? AND end_at>? LIMIT 1`,[row.id,row.practitioner_id,input.replacementStart+SESSION,input.replacementStart,row.id,row.practitioner_id,input.replacementStart+SESSION,input.replacementStart]).first();
   const result=approveReschedule(domain(row),{id:pending.id,bookingId:row.id,state:'Pending',requestedAt:pending.requested_at,appointmentStartSnapshot:pending.appointment_start_snapshot,originalStartSnapshot:pending.original_start_snapshot},{now,replacementStart:input.replacementStart,slotAvailable:!overlap,ownerApproved:input.ownerApproved,expectedVersion:input.expectedVersion,actorRole:'owner'});
   const plan=[version(row,auth,'AND EXISTS(SELECT 1 FROM consultation_reschedule_requests WHERE id=? AND state=?)',[pending.id,pending.state],result.decision==='Approved'?{freeUsed:result.booking.freeRescheduleUsed}:{}),audit(row.id,result.decision==='Approved'?'RescheduleApproved':'OwnerReview',auth)];
   plan.push(stmt(db,`UPDATE consultation_reschedule_requests SET state=?,replacement_start_at=?,decided_by=?,decided_at=?,exception_reason=? WHERE id=? AND state=?`,[result.decision==='Approved'?'Approved':'OwnerReview',result.decision==='Approved'?input.replacementStart:null,auth.principal.sessionId,now,result.decision==='Approved'?null:'SchedulingOwnerReview',pending.id,pending.state]),audit(row.id,result.decision==='Approved'?'RescheduleApproved':'OwnerReview',auth));
   if(result.decision==='Approved'){
    if(row.schedule_id)plan.push(stmt(db,"UPDATE consultation_workflow_appointments SET state='Released' WHERE id=? AND state='Active'",[row.schedule_id]),audit(row.id,'RescheduleApproved',auth));
    else plan.push(stmt(db,"UPDATE consultation_slot_reservations SET state='Released' WHERE booking_id=? AND state='Confirmed'",[row.id]),audit(row.id,'RescheduleApproved',auth));
    const sequence=(await stmt(db,'SELECT COALESCE(MAX(sequence),0)+1 n FROM consultation_workflow_appointments WHERE booking_id=?',[row.id]).first()).n;
    plan.push(stmt(db,`INSERT INTO consultation_workflow_appointments VALUES(?,?,?,?,?,?,'Active',?,?)`,[crypto.randomUUID(),row.id,sequence,row.practitioner_id,input.replacementStart,input.replacementStart+SESSION,pending.id,now]));
   }
   plan.push(await command(input));await db.batch(plan);
   return Object.freeze({id:row.id,requestId:pending.id,decision:result.decision,rowVersion:row.row_version+1});
  }catch{reject();}
 }
 async function reschedules(request,id,{qy=false}={}){
  try{identifier(id);const auth=qy?await guards.qy(request):await stepup.requireStepup(request);
   return (await stmt(db,`SELECT r.id,r.requested_at,r.request_type,r.state,r.eligibility,r.replacement_start_at FROM consultation_reschedule_requests r JOIN consultation_bookings b ON b.id=r.booking_id
    WHERE b.id=? AND EXISTS(${auth.sql}) ${qy?'':'AND b.customer_id=?'} ORDER BY r.requested_at`,[id,...auth.values,...(qy?[]:[auth.principal.customerId])]).all()).results;
  }catch{reject();}
 }
 async function expireOffer(request,input){
  try{
   inputOnly(input,['id','expectedVersion','commandId']);const auth=await guards.qy(request,true),row=await load(input),now=await time();
   if(!['Offered','PaymentPending'].includes(row.state))reject();
   const offer=await stmt(db,'SELECT * FROM consultation_offers WHERE id=? AND booking_id=?',[row.current_offer_id,row.id]).first();if(!offer||now<offer.expires_at)reject();
   const target=row.state==='Offered'?'OfferExpired':'ExceptionReview';
   const plan=[version(row,auth,`AND EXISTS(SELECT 1 FROM consultation_offers WHERE id=? AND expires_at<=${DB_NOW} AND state=?)`,[offer.id,row.state==='Offered'?'Issued':'Accepted'],{state:target,...(target==='OfferExpired'?{terminalAt:now}:{})}),audit(row.id,target,auth)];
   if(target==='OfferExpired'){
    plan.push(stmt(db,"UPDATE consultation_offers SET state='Expired' WHERE id=? AND state='Issued'",[offer.id]),audit(row.id,target,auth),stmt(db,"UPDATE consultation_slot_reservations SET state='Released' WHERE offer_id=? AND state='Held'",[offer.id]),audit(row.id,target,auth));
    await retention(plan,row,auth,'FinalExpired',now);
   }
   plan.push(await command(input));await db.batch(plan);return Object.freeze({id:row.id,state:target,rowVersion:row.row_version+1});
  }catch{reject();}
 }
 async function forfeit(request,input){
  try{
   inputOnly(input,['id','expectedVersion','commandId','reason','lawfulException']);strictBoolean(input.lawfulException,'lawfulException');
   if(!['CancelledForfeited','NoShowForfeited','ProviderRemedyPending'].includes(input.reason))reject();
   const auth=await guards.qy(request,true),row=await load(input),now=await time();
   const pending=(await stmt(db,"SELECT * FROM consultation_reschedule_requests WHERE booking_id=? AND state IN ('Pending','OwnerReview')",[row.id]).all()).results;
   const target=input.lawfulException?'ProviderRemedyPending':input.reason;
   if(target==='CancelledForfeited'&&pending.some(r=>databaseBoolean(r.eligibility)))reject();
   transition(domain(row),target,{now,expectedVersion:row.row_version,actorRole:'owner',pendingRequests:pending});
   const hold=`AND NOT EXISTS(SELECT 1 FROM consultation_reschedule_requests WHERE booking_id=? AND state IN ('Pending','OwnerReview') AND eligibility=1)`;
   const elapsed=`AND COALESCE((SELECT end_at FROM consultation_workflow_appointments WHERE booking_id=consultation_bookings.id AND state='Active'),current_end_at)<=${DB_NOW}`;
   const plan=[version(row,auth,target==='NoShowForfeited'?hold+' '+elapsed:target==='CancelledForfeited'?hold:'',target==='ProviderRemedyPending'?[]:[row.id],{state:target,...(target==='ProviderRemedyPending'?{}:{terminalAt:now})}),audit(row.id,target,auth)];
   if(target!=='ProviderRemedyPending'){
    // Release any held current schedule; immutable historical records remain.
    if(row.schedule_id)plan.push(stmt(db,"UPDATE consultation_workflow_appointments SET state='Released' WHERE id=? AND state='Active'",[row.schedule_id]),audit(row.id,target,auth));
    else plan.push(stmt(db,"UPDATE consultation_slot_reservations SET state='Released' WHERE booking_id=? AND state='Confirmed'",[row.id]),audit(row.id,target,auth));
    await retention(plan,row,auth,'FinalCancelled',now);
   }
   plan.push(await command(input));await db.batch(plan);return Object.freeze({id:row.id,state:target,rowVersion:row.row_version+1});
  }catch{reject();}
 }
 async function reportStatus(request,input){
  try{
   inputOnly(input,['id','expectedVersion','commandId','action','evidenceReference']);if(!['Unknown','FollowUp','Deleted'].includes(input.action))reject();
   const auth=await guards.qy(request,true),row=await load(input),now=await time();
   const report=await stmt(db,'SELECT * FROM consultation_manual_reports WHERE booking_id=?',[row.id]).first();if(!report)reject();
   if(input.action==='Deleted'){
    identifier(input.evidenceReference);if(row.state!=='ReportDelivered'||report.state!=='Delivered'||report.delivered_at===null)reject();
   }else if(row.state!=='ReportReady'||!['Prepared','Unknown','FollowUp'].includes(report.state))reject();
   const label=input.action==='Unknown'?'ReportUnknown':input.action==='FollowUp'?'ReportFollowUp':'ReportDeleted';
   await db.batch([version(row,auth),audit(row.id,label,auth,'QY',input.action==='Deleted'?input.evidenceReference:null),
    stmt(db,`UPDATE consultation_manual_reports SET revision=revision+1,state=?,deleted_at=? WHERE booking_id=? AND revision=? AND state=?`,[input.action,input.action==='Deleted'?now:null,row.id,report.revision,report.state]),audit(row.id,label,auth,'QY',input.action==='Deleted'?input.evidenceReference:null),await command(input)]);
   return Object.freeze({id:row.id,state:row.state,reportState:input.action,rowVersion:row.row_version+1});
  }catch{reject();}
 }
 return Object.freeze({requestReschedule,decideReschedule,reschedules,expireOffer,forfeit,reportStatus});
}
