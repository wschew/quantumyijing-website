// Internal U2-A service only. No reservations, offers, financial writes or providers.
import {identifier} from './foundation.js';
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
const reject=()=>{throw Error('Appointment preference operation rejected');};
const stmt=(db,sql,values=[])=>db.prepare(sql).bind(...values);
export function validatePreferenceStarts(starts,now){
 if(!Array.isArray(starts)||starts.length<1||starts.length>3||new Set(starts).size!==starts.length)reject();
 for(const value of starts)if(!Number.isSafeInteger(value)||value<=now||value>253402300799999-5400000)reject();
 return [...starts];
}
export function createAppointmentPreferences({db,origin,stepup}){
 const guards=createWorkflowGuards({db,origin});
 async function read(request,id,{qy=false}={}){
  identifier(id);const a=qy?await guards.qy(request):await stepup.requireStepup(request);
  const row=await stmt(db,`SELECT b.id,b.row_version,b.state,b.current_offer_id,EXISTS(SELECT 1 FROM consultation_offers WHERE booking_id=b.id) AS offer_issued,p.revision,p.start_1,p.start_2,p.start_3 FROM consultation_bookings b LEFT JOIN consultation_appointment_preferences p ON p.booking_id=b.id AND p.revision=(SELECT MAX(revision) FROM consultation_appointment_preferences WHERE booking_id=b.id) WHERE b.id=? AND EXISTS(${a.sql}) ${qy?'':'AND b.customer_id=?'}`,[id,...a.values,...(qy?[]:[a.principal.customerId])]).first();
  if(!row)reject();return {id:row.id,bookingVersion:row.row_version,revision:row.revision||0,editable:['Submitted','UnderReview'].includes(row.state)&&row.current_offer_id===null&&!row.offer_issued,starts:[row.start_1,row.start_2,row.start_3].filter(v=>v!==null&&v!==undefined)};
 }
 async function save(request,input){
  if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='commandId,expectedRevision,expectedVersion,id,starts')reject();
  identifier(input.id);identifier(input.commandId);
  for(const v of [input.expectedRevision,input.expectedVersion])if(!Number.isSafeInteger(v)||v<0)reject();
  const a=await stepup.requireStepup(request,true),time=(await stmt(db,`SELECT ${DB_NOW} n`).first()).n;
  const starts=validatePreferenceStarts(input.starts,time),revision=input.expectedRevision+1;
  await db.batch([
   stmt(db,`UPDATE consultation_bookings SET row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND customer_id=? AND row_version=? AND current_offer_id IS NULL AND NOT EXISTS(SELECT 1 FROM consultation_offers WHERE booking_id=consultation_bookings.id) AND state IN ('Submitted','UnderReview') AND EXISTS(${a.sql}) AND (SELECT COALESCE(MAX(revision),0) FROM consultation_appointment_preferences WHERE booking_id=?)=? AND ? > ${DB_NOW} AND (? IS NULL OR ?>${DB_NOW}) AND (? IS NULL OR ?>${DB_NOW})`,[input.id,a.principal.customerId,input.expectedVersion,...a.values,input.id,input.expectedRevision,starts[0],starts[1]??null,starts[1]??null,starts[2]??null,starts[2]??null]),
   stmt(db,`INSERT INTO consultation_appointment_preferences(id,booking_id,customer_id,revision,booking_version,command_id,start_1,start_2,start_3,actor_context_id,occurred_at) VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,?,?,?,?,${DB_NOW})`,[crypto.randomUUID(),input.id,a.principal.customerId,revision,input.expectedVersion+1,input.commandId,starts[0],starts[1]??null,starts[2]??null,a.principal.contextId])
  ]);
  return {id:input.id,revision,bookingVersion:input.expectedVersion+1,starts};
 }
 return Object.freeze({read,save});
}