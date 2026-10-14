// Consultation-only dated windows. No recurring schedules, buffers or financial operations.
import {identifier} from './foundation.js';
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
const reject=()=>{throw Error('Availability operation rejected');};
const stmt=(db,sql,v=[])=>db.prepare(sql).bind(...v);
export function validateAvailabilityRange(start,end,now){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=now||end-start<5400000||end>253402300799999)reject();
}
export function createAvailability({db,origin,practitionerId}){
 if(!Number.isSafeInteger(practitionerId)||practitionerId<1)reject();
 const guards=createWorkflowGuards({db,origin});
 async function list(request){
  const a=await guards.qy(request);
  const records=(await stmt(db,`SELECT id,start_at,end_at,state,revision FROM consultation_availability_windows WHERE practitioner_id=? AND end_at>${DB_NOW} AND EXISTS(${a.sql}) ORDER BY start_at,id LIMIT 201`,[practitionerId,...a.values]).all()).results;
  const reservations=(await stmt(db,`SELECT start_at,end_at,state FROM consultation_slot_reservations WHERE practitioner_id=? AND state IN ('Held','Confirmed') AND end_at>${DB_NOW} AND EXISTS(${a.sql}) UNION ALL SELECT start_at,end_at,'Confirmed' AS state FROM consultation_workflow_appointments WHERE practitioner_id=? AND state='Active' AND end_at>${DB_NOW} AND EXISTS(${a.sql}) ORDER BY start_at LIMIT 201`,[practitionerId,...a.values,practitionerId,...a.values]).all()).results;
  return {records:records.slice(0,200),reservations:reservations.slice(0,200),hasMore:records.length>200||reservations.length>200};
 }
 async function save(request,input){
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['id','expectedRevision','commandId','action','startAt','endAt'].includes(k)))reject();
  identifier(input.commandId);if(!['Create','Modify','Withdraw'].includes(input.action))reject();
  const create=input.action==='Create';if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER||create&&input.expectedRevision!==0)reject();
  if(create&&input.id!==undefined)reject();if(!create)identifier(input.id);
  const a=await guards.qy(request,true),time=(await stmt(db,`SELECT ${DB_NOW} n`).first()).n;
  if(input.action==='Withdraw'){if(input.startAt!==undefined||input.endAt!==undefined)reject();}
  else validateAvailabilityRange(input.startAt,input.endAt,time);
  const id=create?crypto.randomUUID():input.id,revision=input.expectedRevision+1;
  const mutation=create?stmt(db,`INSERT INTO consultation_availability_windows SELECT ?,?,?,?,'Active',1,${DB_NOW},${DB_NOW} WHERE EXISTS(${a.sql}) AND ?>${DB_NOW}`,[id,practitionerId,input.startAt,input.endAt,...a.values,input.startAt]):stmt(db,`UPDATE consultation_availability_windows SET start_at=CASE WHEN ?='Withdraw' THEN start_at ELSE ? END,end_at=CASE WHEN ?='Withdraw' THEN end_at ELSE ? END,state=?,revision=revision+1,updated_at=${DB_NOW} WHERE id=? AND practitioner_id=? AND state='Active' AND revision=? AND start_at>${DB_NOW} AND EXISTS(${a.sql})`,[input.action,input.startAt??null,input.action,input.endAt??null,input.action==='Withdraw'?'Withdrawn':'Active',id,practitionerId,input.expectedRevision,...a.values]);
  await db.batch([mutation,stmt(db,`INSERT INTO consultation_availability_events SELECT CASE WHEN changes()=1 THEN ? ELSE NULL END,id,revision,?,?,?,start_at,end_at,state,updated_at FROM consultation_availability_windows WHERE id=? UNION ALL SELECT NULL,?,? ,?,?,?,0,0,'Active',${DB_NOW} WHERE NOT EXISTS(SELECT 1 FROM consultation_availability_windows WHERE id=?)`,[crypto.randomUUID(),input.commandId,create?'Created':input.action==='Modify'?'Modified':'Withdrawn',a.principal.sessionId,id,id,revision,input.commandId,'Created',a.principal.sessionId,id])]);
  return {id,revision};
 }
 return Object.freeze({list,save});
}