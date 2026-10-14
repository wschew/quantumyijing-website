// Internal consultation meeting service. No Zoom API, financial writes or secret logging.
import {identifier} from './foundation.js';
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
import {encryptMeeting,decryptMeeting} from './meeting-crypto.js';
const fail=()=>{throw Error('Meeting operation unavailable or conflicted');};
const stmt=(db,sql,v=[])=>db.prepare(sql).bind(...v);
const FROM=`FROM consultation_bookings b LEFT JOIN consultation_offers o ON o.id=b.current_offer_id LEFT JOIN consultation_workflow_appointments a ON a.booking_id=b.id AND a.state='Active'`;
const KIND="CASE WHEN a.id IS NULL THEN 'Offer' ELSE 'Replacement' END";
const MATCH=`p.customer_id=b.customer_id AND p.appointment_kind=${KIND} AND p.appointment_id=COALESCE(a.id,o.id) AND p.appointment_version=COALESCE(a.sequence,o.revision) AND p.start_at=COALESCE(a.start_at,o.start_at) AND p.end_at=COALESCE(a.end_at,o.end_at)`;
function envelope(row){return {id:row.id,bookingId:row.booking_id,customerId:row.customer_id,revision:row.revision,appointmentKind:row.appointment_kind,appointmentId:row.appointment_id,appointmentVersion:row.appointment_version,startAt:row.start_at,endAt:row.end_at,keyId:row.key_id,nonce:new Uint8Array(row.nonce),ciphertext:new Uint8Array(row.ciphertext)};}
export function createMeetingManagement({db,origin,keys,stepup}){
 if(!keys?.meeting?.activeKeyId||typeof keys.meeting.provider!=='function'||!stepup?.requireStepup)fail();
 const guards=createWorkflowGuards({db,origin});
 async function booking(id,auth){identifier(id);const row=await stmt(db,`SELECT b.id,b.customer_id,b.state,b.row_version,${KIND} appointment_kind,COALESCE(a.id,o.id) appointment_id,COALESCE(a.sequence,o.revision) appointment_version,COALESCE(a.start_at,o.start_at) start_at,COALESCE(a.end_at,o.end_at) end_at ${FROM} WHERE b.id=? AND EXISTS(${auth.sql})`,[id,...auth.values]).first();if(!row)fail();return row;}
 async function status(request,id){
  const auth=await guards.qy(request),b=await booking(id,auth);
  const rows=(await stmt(db,`SELECT p.id,p.revision,p.state,p.appointment_kind,p.appointment_id,p.appointment_version,p.start_at,p.end_at,p.created_at,EXISTS(SELECT 1 FROM consultation_meeting_secrets WHERE publication_id=p.id) secrets_present FROM consultation_meeting_publications p WHERE p.booking_id=? AND EXISTS(${auth.sql}) ORDER BY p.revision DESC LIMIT 101`,[id,...auth.values]).all()).results;
  return {id,bookingVersion:b.row_version,canPublish:b.state==='Confirmed',appointment:{kind:b.appointment_kind,id:b.appointment_id,version:b.appointment_version,startAt:b.start_at,endAt:b.end_at},hasMore:rows.length>100,publications:rows.slice(0,100).map(p=>({id:p.id,revision:p.revision,state:p.state,secretsPresent:!!p.secrets_present,current:b.state==='Confirmed'&&p.state==='Published'&&p.appointment_kind===b.appointment_kind&&p.appointment_id===b.appointment_id&&p.appointment_version===b.appointment_version&&p.start_at===b.start_at&&p.end_at===b.end_at,createdAt:p.created_at}))};
 }
 function audit(auth,publicationId,event,commandId){return stmt(db,`INSERT INTO consultation_meeting_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,'QY',?,${DB_NOW})`,[crypto.randomUUID(),publicationId,event,commandId,auth.principal.sessionId]);}
 async function save(request,input){
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['id','expectedVersion','commandId','action','publicationId','details'].includes(k)))fail();
  identifier(input.id);identifier(input.commandId);if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||input.expectedVersion>=Number.MAX_SAFE_INTEGER||!['Publish','Revoke','Delete'].includes(input.action))fail();
  const auth=await guards.qy(request,true),b=await booking(input.id,auth);if(b.row_version!==input.expectedVersion)fail();
  const publishing=input.action==='Publish';if(publishing&&input.publicationId!==undefined||!publishing&&input.details!==undefined)fail();
  let target=null,e=null,id=input.publicationId,revision=null,previous=null;
  if(publishing){
   if(b.state!=='Confirmed')fail();previous=await stmt(db,"SELECT id FROM consultation_meeting_publications WHERE booking_id=? AND state='Published'",[b.id]).first();
   revision=(await stmt(db,'SELECT COALESCE(MAX(revision),0)+1 n FROM consultation_meeting_publications WHERE booking_id=?',[b.id]).first()).n;id=crypto.randomUUID();
   e=await encryptMeeting(input.details,{id,bookingId:b.id,customerId:b.customer_id,revision,appointmentKind:b.appointment_kind,appointmentId:b.appointment_id,appointmentVersion:b.appointment_version,startAt:b.start_at,endAt:b.end_at,keyId:keys.meeting.activeKeyId},keys.meeting.provider);
  }else{identifier(id);target=await stmt(db,'SELECT state FROM consultation_meeting_publications WHERE id=? AND booking_id=?',[id,b.id]).first();if(!target||target.state==='Deleted'||input.action==='Revoke'&&target.state!=='Published')fail();}
  const plan=[];
  // Any subsequent CAS, publication, ciphertext or audit failure rolls this revocation back.
  if(publishing)plan.push(stmt(db,"UPDATE consultation_meeting_publications SET state='Revoked' WHERE booking_id=? AND state='Published'",[b.id]));
  const snapshot=publishing?`AND state='Confirmed' AND EXISTS(SELECT 1 ${FROM} WHERE b.id=? AND ${KIND}=? AND COALESCE(a.id,o.id)=? AND COALESCE(a.sequence,o.revision)=? AND COALESCE(a.start_at,o.start_at)=? AND COALESCE(a.end_at,o.end_at)=?)`:'';
  plan.push(stmt(db,`UPDATE consultation_bookings SET row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND row_version=? AND EXISTS(${auth.sql}) ${snapshot}`,[b.id,b.row_version,...auth.values,...(publishing?[b.id,b.appointment_kind,b.appointment_id,b.appointment_version,b.start_at,b.end_at]:[])]));
  if(publishing){
   plan.push(stmt(db,`INSERT INTO consultation_meeting_publications(id,booking_id,customer_id,revision,appointment_kind,appointment_id,appointment_version,start_at,end_at,state,key_id,nonce,created_at,created_by) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,?,?,?,'Published',?,?,${DB_NOW},?)`,[id,b.id,b.customer_id,revision,b.appointment_kind,b.appointment_id,b.appointment_version,b.start_at,b.end_at,e.keyId,e.nonce,auth.principal.sessionId]),stmt(db,'INSERT INTO consultation_meeting_secrets VALUES(?,?,?,?)',[id,e.keyId,e.nonce,e.ciphertext]),audit(auth,id,previous?'Replaced':'Published',input.commandId));
  }else{
   plan.push(stmt(db,`UPDATE consultation_meeting_publications SET state=? WHERE id=? AND booking_id=? AND state=? AND changes()=1`,[input.action==='Delete'?'Deleted':'Revoked',id,b.id,target.state]));
   if(input.action==='Delete')plan.push(stmt(db,'DELETE FROM consultation_meeting_secrets WHERE publication_id=? AND changes()=1',[id]));
   plan.push(audit(auth,id,input.action==='Delete'?'Deleted':'Revoked',input.commandId));
  }
  await db.batch(plan);return {id:b.id,publicationId:id,bookingVersion:b.row_version+1};
 }
 async function customer(request,id){
  identifier(id);const auth=await stepup.requireStepup(request);
  const where=`b.id=? AND b.customer_id=? AND b.state='Confirmed' AND p.state='Published' AND ${MATCH} AND EXISTS(${auth.sql})`;
  const values=[id,auth.principal.customerId,...auth.values];
  const join=`${FROM} JOIN consultation_meeting_publications p ON p.booking_id=b.id JOIN consultation_meeting_secrets s ON s.publication_id=p.id`;
  const result=await db.batch([
   stmt(db,`SELECT p.*,s.ciphertext ${join} WHERE ${where}`,values),
   stmt(db,`INSERT INTO consultation_meeting_events SELECT ?,p.id,'CustomerViewed',NULL,'Customer',?,${DB_NOW} ${join} WHERE ${where} AND NOT EXISTS(SELECT 1 FROM consultation_meeting_events WHERE publication_id=p.id AND event='CustomerViewed' AND actor_reference=?)`,[crypto.randomUUID(),auth.principal.contextId,...values,auth.principal.contextId])
  ]);
  const row=result[0].results?.[0];if(!row)fail();const details=await decryptMeeting(envelope(row),keys.meeting.provider);
  return {appointment:{startAt:row.start_at,endAt:row.end_at,version:row.appointment_version},meeting:details};
 }
 return Object.freeze({status,save,customer});
}