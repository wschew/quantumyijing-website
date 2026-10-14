// Internal service: no public route, provider sends, PDF storage or financial writes.
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
import {identifier,issueOffer,acceptOffer} from './foundation.js';
import {transition,paymentDecision} from './state.js';
import {validatePrivateIntake} from './intake-validation.js';
import {encryptIntake,decryptIntake} from './intake-crypto.js';
import {intakeRetention} from './intake-policy.js';
const fail=()=>{throw Error('Consultation workflow unavailable or conflicted');};
const stmt=(db,sql,v=[])=>db.prepare(sql).bind(...v);
const closed=(input,names)=>{if(!input||Array.isArray(input)||Object.keys(input).some(k=>!names.includes(k)))fail();};
function booking(r){return {id:r.id,customerId:r.customer_id,state:r.state,rowVersion:r.row_version,currentOfferId:r.current_offer_id,practitionerId:r.practitioner_id,currentStartAt:r.current_start_at,currentEndAt:r.current_end_at,originalStartAt:r.original_start_at};}
function offer(r,customerId){return {id:r.id,bookingId:r.booking_id,customerId,practitionerId:r.practitioner_id,startAt:r.start_at,endAt:r.end_at,issuedAt:r.issued_at,expiresAt:r.expires_at,state:r.state,sellingPriceSen:r.selling_price_sen,regularPriceSen:r.regular_price_sen,currency:r.currency,policyHash:r.policy_hash,policyVersion:r.policy_version,snapshotHash:r.snapshot_hash,acceptedAt:r.accepted_at,acceptanceCustomerId:r.acceptance_customer_id,acceptancePolicyHash:r.acceptance_policy_hash,acceptanceSnapshotHash:r.acceptance_snapshot_hash,orderId:r.order_id};}
export function createConsultationWorkflow({db,origin,keys,stepup,contacts,productId,practitionerId,policies,countryCodes,bookingPolicy,readCaptureEvidence=null}){
 if(!Number.isSafeInteger(productId)||productId<1||!Number.isSafeInteger(practitionerId)||practitionerId<1||!stepup?.requireStepup||!contacts?.verifiedContact)fail();
 identifier(bookingPolicy.version);if(!/^[a-f0-9]{64}$/.test(bookingPolicy.hash))fail();
 const guards=createWorkflowGuards({db,origin});
 async function now(){return (await stmt(db,`SELECT ${DB_NOW} n`).first()).n;}
 function gate(id,label,a,kind='QY'){return stmt(db,`INSERT INTO consultation_workflow_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,${DB_NOW})`,[crypto.randomUUID(),id,label,kind,kind==='QY'?a.principal.sessionId:a.principal.contextId]);}
 async function receipt(id,commandId,payload){identifier(commandId);const key=await keys.lookup.provider(keys.lookup.activeKeyId);const hash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['qy-workflow-command-v1',id,payload])))),x=>x.toString(16).padStart(2,'0')).join('');return stmt(db,`INSERT INTO consultation_workflow_commands VALUES(?,?,?,?,${DB_NOW})`,[commandId,id,keys.lookup.activeKeyId,hash]);}
 async function load(id){identifier(id);const row=await stmt(db,`SELECT b.*,COALESCE(a.start_at,b.current_start_at) effective_start,COALESCE(a.end_at,b.current_end_at) effective_end FROM consultation_bookings b LEFT JOIN consultation_workflow_appointments a ON a.booking_id=b.id AND a.state='Active' WHERE b.id=?`,[id]).first();if(!row)fail();return {...row,current_start_at:row.effective_start,current_end_at:row.effective_end};}
 async function submit(request,input){
  try{closed(input,['commandId','intake']);identifier(input.commandId);const a=await stepup.requireStepup(request,true),time=await now();
   const contact=await contacts.verifiedContact(new Request(request.url,{method:"GET",headers:request.headers}),input.intake?.reportChannel);if(!contact)fail();
   const validated=validatePrivateIntake(input.intake,{now:time,customerId:a.principal.customerId,contact,policies,countryCodes});
   const id=crypto.randomUUID(),intakeId=crypto.randomUUID(),e=await encryptIntake(validated.privateData,{id:intakeId,customerId:a.principal.customerId,payloadVersion:1,schemaVersion:1,keyId:keys.intake.activeKeyId},keys.intake.provider);
   const proof=`SELECT 1 FROM consultation_verified_contacts v WHERE v.id=? AND v.customer_id=? AND v.context_id=? AND v.context_version=? AND v.channel=? AND v.revoked_at IS NULL AND v.expires_at>${DB_NOW}`;
   const plan=[stmt(db,`INSERT INTO consultation_bookings(id,reference,product_id,customer_id,state,report_channel,created_at,updated_at)
    SELECT ?,?,?,?,'Submitted',?,${DB_NOW},${DB_NOW} WHERE EXISTS(${a.sql}) AND EXISTS(${proof})`,[id,'BAZI-'+id,productId,a.principal.customerId,input.intake.reportChannel,...a.values,contact.reference,a.principal.customerId,a.principal.contextId,a.principal.version,input.intake.reportChannel]),gate(id,'Submitted',a,'Customer'),
    stmt(db,`INSERT INTO consultation_customer_intakes(id,customer_id,revision,payload_version,schema_version,key_id,nonce,ciphertext,created_at,updated_at) VALUES(?,?,1,1,1,?,?,?, ?,?)`,[intakeId,a.principal.customerId,e.keyId,e.nonce,e.ciphertext,time,time]),
    stmt(db,'INSERT INTO consultation_workflow_intakes VALUES(?,?,?,?)',[id,intakeId,a.principal.customerId,contact.reference])];
   for(const c of validated.consents)plan.push(stmt(db,'INSERT INTO consultation_intake_consents VALUES(?,?,?,?,1,?,?,?,?)',[crypto.randomUUID(),intakeId,a.principal.customerId,c.purpose,c.policy_version,c.policy_hash,c.state,time]));
   plan.push(stmt(db,'INSERT INTO consultation_intake_access_audit VALUES(?,?,?,?,?,?,?)',[crypto.randomUUID(),intakeId,a.principal.customerId,'Submitted','Customer',a.principal.contextId,time]),await receipt(id,input.commandId,input.intake));
   await db.batch(plan);return Object.freeze({id,state:'Submitted',rowVersion:0});
  }catch{fail();}
 }
 async function list(request,{qy=false}={}){
  try{const a=qy?await guards.qy(request):await stepup.requireStepup(request);return (await stmt(db,`SELECT b.id,b.reference,b.state,b.report_channel,b.row_version,${qy?'b.customer_id,':''}o.selling_price_sen,o.currency,COALESCE(s.start_at,b.current_start_at) current_start_at,COALESCE(s.end_at,b.current_end_at) current_end_at,b.report_due_at,r.state report_state,o.expires_at offer_expires_at FROM consultation_bookings b LEFT JOIN consultation_workflow_appointments s ON s.booking_id=b.id AND s.state='Active' LEFT JOIN consultation_manual_reports r ON r.booking_id=b.id LEFT JOIN consultation_offers o ON o.id=b.current_offer_id WHERE EXISTS(${a.sql}) ${qy?'':'AND b.customer_id=?'} ORDER BY b.created_at DESC LIMIT 100`,[...a.values,...(qy?[]:[a.principal.customerId])]).all()).results;}catch{fail();}
 }
 async function readPrivate(request,id){
  try{const a=await guards.qy(request),b=await load(id);const predicate=`SELECT i.* FROM consultation_workflow_intakes w JOIN consultation_customer_intakes i ON i.id=w.intake_id WHERE w.booking_id=? AND EXISTS(${a.sql}) AND EXISTS(SELECT 1 FROM consultation_intake_consents c WHERE c.intake_id=i.id AND c.purpose='consultation_privacy' AND c.state='Granted' AND c.policy_version=? AND c.policy_hash=? AND c.sequence=(SELECT MAX(sequence) FROM consultation_intake_consents WHERE intake_id=i.id AND purpose='consultation_privacy'))`;
   const values=[id,...a.values,policies.consultation_privacy.version,policies.consultation_privacy.hash];
   const rows=await db.batch([stmt(db,`INSERT INTO consultation_intake_access_audit(id,intake_id,customer_id,event,actor_kind,actor_reference,occurred_at) SELECT ?,i.id,i.customer_id,'QYRead','QY',?,${DB_NOW} FROM (${predicate}) i`,[crypto.randomUUID(),a.principal.sessionId,...values]),stmt(db,predicate,values)]);
   const r=rows[1].results?.[0];if(!r||r.customer_id!==b.customer_id)fail();return await decryptIntake({id:r.id,customerId:r.customer_id,payloadVersion:r.payload_version,schemaVersion:r.schema_version,keyId:r.key_id,nonce:new Uint8Array(r.nonce),ciphertext:new Uint8Array(r.ciphertext)},keys.intake.provider);
  }catch{fail();}
 }
 async function change(request,input){
  try{closed(input,['id','to','expectedVersion','commandId']);const a=await guards.qy(request,true),r=await load(input.id),time=await now();
   if(!['UnderReview','Declined','Completed'].includes(input.to))fail();const next=transition(booking(r),input.to,{now:time,expectedVersion:input.expectedVersion,actorRole:'owner'});
   const plan=[stmt(db,`UPDATE consultation_bookings SET state=?,row_version=row_version+1,updated_at=${DB_NOW},completed_at=?,terminal_at=?,report_due_at=? WHERE id=? AND row_version=? AND state=? AND EXISTS(${a.sql}) ${input.to==='Completed'?`AND COALESCE((SELECT end_at FROM consultation_workflow_appointments WHERE booking_id=consultation_bookings.id AND state='Active'),current_end_at)<=${DB_NOW}`:''}`,[next.state,next.completedAt??null,next.terminalAt??null,next.reportDueAt??null,r.id,r.row_version,r.state,...a.values]),gate(r.id,next.state,a)];
   if(['Completed','Declined'].includes(input.to)){
    const basis=input.to==='Completed'?'Completed':'FinalDeclined',retention=intakeRetention({status:basis,completedAt:next.completedAt??null,terminalAt:next.terminalAt??null});
    const current=await stmt(db,'SELECT i.id,i.revision FROM consultation_customer_intakes i JOIN consultation_workflow_intakes w ON w.intake_id=i.id WHERE w.booking_id=?',[r.id]).first();if(!current)fail();
    plan.push(stmt(db,`UPDATE consultation_customer_intakes SET revision=revision+1,retention_basis=?,retention_until=?,completed_at=?,terminal_at=?,updated_at=? WHERE id=? AND revision=?`,[basis,retention,next.completedAt??null,next.terminalAt??null,time,current.id,current.revision]),gate(r.id,'RetentionUpdated',a));
   }
   plan.push(await receipt(r.id,input.commandId,input));await db.batch(plan);return Object.freeze({id:r.id,state:next.state,rowVersion:next.rowVersion});
  }catch{fail();}
 }
 async function propose(request,input){
  try{closed(input,['id','startAt','expectedVersion','commandId']);const a=await guards.qy(request,true),r=await load(input.id),time=await now();if(r.state!=='UnderReview'||r.row_version!==input.expectedVersion)fail();
   const o=await issueOffer({id:crypto.randomUUID(),bookingId:r.id,customerId:r.customer_id,practitionerId,startAt:input.startAt,issuedAt:time,policyVersion:bookingPolicy.version,policyHash:bookingPolicy.hash,promotion:null});
   const revision=(await stmt(db,'SELECT COALESCE(MAX(revision),0)+1 n FROM consultation_offers WHERE booking_id=?',[r.id]).first()).n;
   await db.batch([stmt(db,`INSERT INTO consultation_offers(id,booking_id,revision,state,practitioner_id,start_at,end_at,issued_at,expires_at,regular_price_sen,selling_price_sen,currency,policy_version,policy_hash,snapshot_hash,issued_by)
    SELECT ?,?,?,'Issued',?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(${a.sql}) AND EXISTS(SELECT 1 FROM consultation_bookings WHERE id=? AND row_version=? AND state='UnderReview')`,[o.id,r.id,revision,practitionerId,o.startAt,o.endAt,time,o.expiresAt,130000,130000,'MYR',o.policyVersion,o.policyHash,o.snapshotHash,a.principal.sessionId,...a.values,r.id,r.row_version]),gate(r.id,'Offered',a),
    stmt(db,'INSERT INTO consultation_slot_reservations VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),r.id,o.id,practitionerId,o.startAt,o.endAt,'Held',o.expiresAt]),
    stmt(db,`UPDATE consultation_bookings SET state='Offered',current_offer_id=?,practitioner_id=?,current_start_at=?,current_end_at=?,row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND row_version=? AND EXISTS(${a.sql})`,[o.id,practitionerId,o.startAt,o.endAt,r.id,r.row_version,...a.values]),gate(r.id,'Offered',a),await receipt(r.id,input.commandId,input)]);
   return Object.freeze({id:r.id,state:'Offered',rowVersion:r.row_version+1,offer:o});
  }catch{fail();}
 }
 async function currentOffer(request,id){try{const a=await stepup.requireStepup(request);const r=await stmt(db,`SELECT o.*,b.customer_id FROM consultation_offers o JOIN consultation_bookings b ON b.current_offer_id=o.id WHERE b.id=? AND b.customer_id=? AND EXISTS(${a.sql})`,[id,a.principal.customerId,...a.values]).first();if(!r)fail();return offer(r,r.customer_id);}catch{fail();}}
 async function accept(request,input){
  try{closed(input,['id','expectedVersion','commandId','acknowledged','snapshotHash','policyHash']);const a=await stepup.requireStepup(request,true),r=await load(input.id);if(r.customer_id!==a.principal.customerId||r.row_version!==input.expectedVersion||r.state!=='Offered')fail();
   const raw=await stmt(db,'SELECT * FROM consultation_offers WHERE id=?',[r.current_offer_id]).first();const accepted=acceptOffer(offer(raw,r.customer_id),{now:await now(),customerId:r.customer_id,acknowledged:input.acknowledged,snapshotHash:input.snapshotHash,policyHash:input.policyHash});
   await db.batch([stmt(db,`UPDATE consultation_offers SET state='Accepted',accepted_at=${DB_NOW},acceptance_customer_id=?,acceptance_policy_hash=?,acceptance_snapshot_hash=? WHERE id=? AND state='Issued' AND expires_at>${DB_NOW} AND EXISTS(${a.sql})`,[r.customer_id,accepted.policyHash,accepted.snapshotHash,accepted.id,...a.values]),gate(r.id,'Accepted',a,'Customer'),stmt(db,`UPDATE consultation_bookings SET state='PaymentPending',row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND row_version=? AND state='Offered' AND EXISTS(${a.sql})`,[r.id,r.row_version,...a.values]),gate(r.id,'Accepted',a,'Customer'),await receipt(r.id,input.commandId,input)]);
   return Object.freeze({id:r.id,state:'PaymentPending',rowVersion:r.row_version+1});
  }catch{fail();}
 }
 // Never accepts payment evidence from request JSON. No financial-table updates.
 async function reconcilePayment(request,input){
  try{closed(input,['id','expectedVersion','commandId']);const a=await guards.qy(request,true),r=await load(input.id);if(!['PaymentPending','ExceptionReview'].includes(r.state)||r.row_version!==input.expectedVersion)fail();
   const o=offer(await stmt(db,'SELECT * FROM consultation_offers WHERE id=?',[r.current_offer_id]).first(),r.customer_id);
   const evidence=typeof readCaptureEvidence==='function'?await readCaptureEvidence({bookingId:r.id,offerId:o.id,orderId:o.orderId,customerId:r.customer_id}):null;
   // An approved adapter must supply its atomic SQL evidence predicate alongside capture data.
   const eligible=paymentDecision(o,evidence)==='Eligible'&&typeof evidence?.guardSql==='string'&&Array.isArray(evidence?.guardValues);
   const target=eligible?'Confirmed':'ExceptionReview',time=await now();
   if(eligible)transition(booking(r),target,{now:time,expectedVersion:r.row_version,actorRole:'owner',offer:o,payment:evidence,slotReserved:true});
   await db.batch([stmt(db,`UPDATE consultation_bookings SET state=?,original_start_at=CASE WHEN ?='Confirmed' THEN COALESCE(original_start_at,current_start_at) ELSE original_start_at END,row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND state=? AND row_version=? AND current_offer_id=? AND EXISTS(${a.sql}) ${eligible?`AND current_start_at>${DB_NOW} AND EXISTS(${evidence.guardSql}) AND EXISTS(SELECT 1 FROM consultation_slot_reservations WHERE offer_id=? AND state='Held')`:''}`,[target,target,r.id,r.state,r.row_version,o.id,...a.values,...(eligible?[...evidence.guardValues,o.id]:[])]),gate(r.id,target,a),...(eligible?[stmt(db,"UPDATE consultation_slot_reservations SET state='Confirmed' WHERE offer_id=? AND state='Held'",[o.id]),gate(r.id,target,a)]:[]),await receipt(r.id,input.commandId,input)]);
   return Object.freeze({id:r.id,state:target,rowVersion:r.row_version+1});
  }catch{fail();}
 }
 async function report(request,input){
  try{closed(input,['id','action','expectedVersion','commandId','evidenceReference']);const a=await guards.qy(request,true),r=await load(input.id);if(r.row_version!==input.expectedVersion||!['Prepared','Delivered'].includes(input.action))fail();const time=await now(),prepared=input.action==='Prepared';
   if(prepared&&r.state!=='Completed'||!prepared&&r.state!=='ReportReady')fail();if(!prepared)identifier(input.evidenceReference);
   const target=prepared?'ReportReady':'ReportDelivered';const plan=[stmt(db,`UPDATE consultation_bookings SET state=?,row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND row_version=? AND state=? AND EXISTS(${a.sql})`,[target,r.id,r.row_version,r.state,...a.values]),gate(r.id,target,a)];
   if(prepared)plan.push(stmt(db,"INSERT INTO consultation_manual_reports(booking_id,revision,state,channel,prepared_at) VALUES(?,1,'Prepared',?,?)",[r.id,r.report_channel,time]));
   else { const report=await stmt(db,'SELECT revision FROM consultation_manual_reports WHERE booking_id=?',[r.id]).first();if(!report)fail();plan.push(stmt(db,"UPDATE consultation_manual_reports SET revision=revision+1,state='Delivered',evidence_reference=?,delivered_at=? WHERE booking_id=? AND revision=? AND state IN ('Prepared','Unknown','FollowUp')",[input.evidenceReference,time,r.id,report.revision]),gate(r.id,target,a)); }
   plan.push(await receipt(r.id,input.commandId,input));await db.batch(plan);return Object.freeze({id:r.id,state:target,rowVersion:r.row_version+1});
  }catch{fail();}
 }
 return Object.freeze({submit,list,readPrivate,change,propose,currentOffer,accept,reconcilePayment,report});
}
