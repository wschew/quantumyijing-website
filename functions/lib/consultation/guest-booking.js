import {appointmentConflictSql,appointmentConflictValues,appointmentError} from './appointment-availability.js';
﻿// Isolated synthetic Preview guest requests. No accounts, OTPs, providers or financial writes.
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
import {normalizeContact} from './contact-policy.js';
import {validateGuestIntake} from './intake-validation.js';
import {encryptIntake} from './intake-crypto.js';
import {randomSecret,tokenHash} from './auth-crypto.js';
import {identifier,mytDayStart,mytDate,acceptOffer} from './foundation.js';
const HOUR=3600000,DURATION=5400000;
const fail=()=>{throw Error('Guest operation unavailable');};
const closed=(x,names)=>{if(!x||Array.isArray(x)||Object.keys(x).some(k=>!names.includes(k)))fail();};
export function createGuestBooking({db,origin,keys,config,policies}){
 const guards=createWorkflowGuards({db,origin}),s=(sql,v=[])=>db.prepare(sql).bind(...v);
 const now=async()=>(await s(`SELECT ${DB_NOW} n`).first()).n;
 // The anonymous admission budget is separate from administrator security controls.
 async function admit(){const r=await s(`UPDATE consultation_guest_admission SET attempts=CASE WHEN ${DB_NOW}>=window_started_at+3600000 THEN 1 ELSE attempts+1 END,window_started_at=CASE WHEN ${DB_NOW}>=window_started_at+3600000 THEN ${DB_NOW} ELSE window_started_at END WHERE id=1 AND ${DB_NOW}>=window_started_at AND (${DB_NOW}>=window_started_at+3600000 OR attempts<20) RETURNING id`).first();if(!r)fail();}
 const available=`EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.practitioner_id=? AND w.state='Active' AND w.start_at<=? AND w.end_at>=?) AND NOT EXISTS(SELECT 1 FROM consultation_slot_reservations r WHERE r.practitioner_id=? AND r.state IN ('Held','Confirmed') AND r.start_at<? AND r.end_at>?) AND NOT EXISTS(SELECT 1 FROM consultation_workflow_appointments r WHERE r.practitioner_id=? AND r.state='Active' AND r.start_at<? AND r.end_at>?)`;
 const slotValues=start=>[config.practitionerId,start,start+DURATION,config.practitionerId,start+DURATION,start,config.practitionerId,start+DURATION,start];
 async function calendar(input){
  closed(input,['date']);const time=await now(),day=mytDayStart(input.date);
  if(day<mytDayStart(mytDate(time))||day>time+31*24*HOUR)fail();
  // At most 48 half-hour candidates; no reservation or customer metadata is returned.
  // Bind each row through one bounded SQL statement, using correlated slots.t below.
  const rows=await s(`WITH RECURSIVE slots(t) AS (SELECT ? UNION ALL SELECT t+1800000 FROM slots WHERE t+1800000<?) SELECT t FROM slots WHERE t>=${DB_NOW}+259200000 AND EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.practitioner_id=? AND w.state='Active' AND w.start_at<=t AND w.end_at>=t+5400000) AND NOT EXISTS(SELECT 1 FROM consultation_slot_reservations r WHERE r.practitioner_id=? AND r.state IN ('Held','Confirmed') AND r.start_at<t+5400000 AND r.end_at>t) AND NOT EXISTS(SELECT 1 FROM consultation_workflow_appointments r WHERE r.practitioner_id=? AND r.state='Active' AND r.start_at<t+5400000 AND r.end_at>t) ORDER BY t LIMIT 48`,[day,day+24*HOUR,config.practitionerId,config.practitionerId,config.practitionerId]).all();
  return {slots:rows.results.map(r=>r.t),timezone:'Asia/Kuala_Lumpur'};
 }
 async function submissionFingerprint(input,acceptance=null,keyId=keys.lookup.activeKeyId){
  const contact=normalizeContact(input.intake?.reportChannel,input.contact),key=await keys.lookup.provider(keyId);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([input.intake,contact,input.preferredStart,...(acceptance?[acceptance]:[])])))),b=>b.toString(16).padStart(2,'0')).join('');
 }
 async function prepareSubmission(input,acceptance=null,{underReview=false}={}){
  closed(input,['commandId','intake','contact','preferredStart']);identifier(input.commandId);
  await admit();const time=await now();
  const start=input.preferredStart;
  if(!Number.isSafeInteger(start)||start<time+72*HOUR||start>time+31*24*HOUR||start%1800000!==0)fail();
  const contact={channel:input.intake?.reportChannel,value:normalizeContact(input.intake?.reportChannel,input.contact),verified:false,reference:'unverified-guest'};
  const validated=validateGuestIntake(input.intake,{now:time,contact,policies,countryCodes:config.countryCodes});
  const privateData={...validated.privateData,preferredStart:start,contact:{...validated.privateData.contact,verified:false}};
  const fingerprint=await submissionFingerprint(input,acceptance);
  const prior=await s('SELECT g.fingerprint,b.reference FROM consultation_guest_intakes g JOIN consultation_bookings b ON b.id=g.booking_id WHERE g.command_id=?',[input.commandId]).first();
  if(prior){if(prior.fingerprint!==fingerprint)fail();return {reference:prior.reference,state:'Submitted',duplicate:true};}
  if((await s('SELECT COUNT(*) n FROM consultation_guest_intakes').first()).n>=200)fail();
  // Opaque canonical record only, not a portal account; contact and name stay encrypted.
  const customerId=parseInt(randomSecret().slice(0,12),16)+1,id=crypto.randomUUID(),intakeId=crypto.randomUUID();
  const envelope=await encryptIntake(privateData,{id:intakeId,customerId,payloadVersion:1,schemaVersion:1,keyId:keys.intake.activeKeyId},keys.intake.provider);
  const reference='BAZI-'+id;
  const plan=[
   s(`INSERT INTO customers(id,customer_reference,display_name,status) SELECT ?,?,'Guest request','Active' WHERE ? >= ${DB_NOW}+259200000 AND (SELECT COUNT(*) FROM consultation_guest_intakes)<200 ${underReview?'':'AND '+available}`,[customerId,'SYNTHETIC-GUEST-'+id,start,...(underReview?[]:slotValues(start))]),
   s('INSERT INTO consultation_preview_synthetic_customers VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,1)',[customerId]),
   s(`INSERT INTO consultation_bookings(id,reference,product_id,customer_id,state,report_channel,created_at,updated_at) VALUES(?,?,?,?,?,?,${DB_NOW},${DB_NOW})`,[id,reference,config.productId,customerId,underReview?'UnderReview':'Submitted',contact.channel]),
   s('INSERT INTO consultation_customer_intakes(id,customer_id,revision,payload_version,schema_version,key_id,nonce,ciphertext,created_at,updated_at) VALUES(?,?,1,1,1,?,?,?,?,?)',[intakeId,customerId,envelope.keyId,envelope.nonce,envelope.ciphertext,time,time]),
   s('INSERT INTO consultation_guest_intakes VALUES(?,?,?,?,?,?,0)',[id,intakeId,customerId,start,input.commandId,fingerprint]),
   s(`INSERT INTO consultation_guest_events VALUES(?,?,'Submitted',?,${DB_NOW})`,[crypto.randomUUID(),id,id])];
  for(const c of validated.consents)plan.push(s('INSERT INTO consultation_intake_consents VALUES(?,?,?,?,1,?,?,?,?)',[crypto.randomUUID(),intakeId,customerId,c.purpose,c.policy_version,c.policy_hash,c.state,time]));
  return {plan,id,intakeId,customerId,reference,start,time,fingerprint};
 }
 async function submit(input){const prepared=await prepareSubmission(input);if(prepared.duplicate)return prepared;await db.batch(prepared.plan);return {reference:prepared.reference,state:'Submitted'};
 }
 async function submitForReview(input){
  closed(input,['commandId','intake','contact','preferredStart','bookingAcknowledgement']);identifier(input.commandId);
  const ack=input.bookingAcknowledgement;closed(ack,['accepted','version','hash']);if(ack?.accepted!==true)fail();
  const payload={commandId:input.commandId,intake:input.intake,contact:input.contact,preferredStart:input.preferredStart};
  async function replay(){const row=await s('SELECT g.fingerprint,b.reference,b.state,t.fingerprint_key_id,t.policy_version,t.policy_hash FROM consultation_guest_intakes g JOIN consultation_bookings b ON b.id=g.booking_id JOIN consultation_guest_request_terms t ON t.booking_id=b.id WHERE g.command_id=?',[input.commandId]).first();if(!row)return null;if(row.policy_version!==ack.version||row.policy_hash!==ack.hash||row.fingerprint!==await submissionFingerprint(payload,ack,row.fingerprint_key_id))fail();return {reference:row.reference,state:row.state,duplicate:true};}
  const prior=await replay();if(prior)return prior;
  if(ack.version!==config.policies.booking.version||ack.hash!==config.policies.booking.hash)fail();
  const p=await prepareSubmission(payload,ack,{underReview:true});if(p.duplicate)fail();
  try{await db.batch([...p.plan,s('INSERT INTO consultation_guest_request_terms VALUES(?,?,?,?,?)',[p.id,ack.version,ack.hash,keys.lookup.activeKeyId,p.time]),s(`INSERT INTO consultation_workflow_events VALUES(?,?,'UnderReview','Customer',?,${DB_NOW})`,[crypto.randomUUID(),p.id,p.id])]);}catch(error){const raced=await replay();if(raced)return raced;throw error;}
  return {reference:p.reference,state:'UnderReview'};
 }
 async function issueLink(request,input){
  closed(input,['id']);identifier(input.id);const a=await guards.qy(request,true),token=randomSecret(),hash=await tokenHash(token);
  const row=await s(`SELECT o.id,o.expires_at FROM consultation_guest_intakes g JOIN consultation_bookings b ON b.id=g.booking_id JOIN consultation_offers o ON o.id=b.current_offer_id WHERE b.id=? AND b.state='Offered' AND o.state='Issued' AND o.expires_at>${DB_NOW} AND EXISTS(${a.sql})`,[input.id,...a.values]).first();if(!row)fail();
  await db.batch([
   s(`INSERT INTO consultation_guest_offer_links(offer_id,token_hash,expires_at,issued_by) SELECT o.id,?,o.expires_at,? FROM consultation_offers o JOIN consultation_bookings b ON b.current_offer_id=o.id WHERE o.id=? AND b.id=? AND b.state='Offered' AND o.state='Issued' AND o.expires_at>${DB_NOW} AND EXISTS(${a.sql}) ON CONFLICT(offer_id) DO UPDATE SET token_hash=excluded.token_hash,issued_by=excluded.issued_by WHERE consultation_guest_offer_links.used_at IS NULL`,[hash,a.principal.sessionId,row.id,input.id,...a.values]),
   s(`INSERT INTO consultation_guest_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'LinkIssued',?,${DB_NOW})`,[crypto.randomUUID(),input.id,a.principal.sessionId])]);
  return {url:origin+'/customer.html#offer='+token,expiresAt:row.expires_at};
 }
 async function linked(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw appointmentError('OFFER_CHANGED_OR_EXPIRED');
  const hash=await tokenHash(token);
  const row=await s(`SELECT o.*,b.state booking_state,b.row_version,b.customer_id,b.reference,l.used_at,EXISTS(SELECT 1 FROM consultation_individual_offer_prices p WHERE p.offer_id=o.id) individual_offer FROM consultation_guest_offer_links l JOIN consultation_offers o ON o.id=l.offer_id JOIN consultation_bookings b ON b.current_offer_id=o.id JOIN customers c ON c.id=b.customer_id WHERE l.token_hash=? AND l.expires_at=o.expires_at AND l.expires_at>${DB_NOW} AND o.issued_at<=${DB_NOW} AND c.status='Active' AND b.state IN ('Offered','PaymentPending') AND o.state IN ('Issued','Accepted')`,[hash]).first();if(!row)throw appointmentError('OFFER_CHANGED_OR_EXPIRED');return {...row,hash};
 }
 async function view(input){closed(input,['token']);const r=await linked(input.token);const individual=await s('SELECT regular_price_sen,base_price_sen,final_price_sen,description discount_description,policy_text FROM consultation_individual_offer_prices WHERE offer_id=?',[r.id]).first();const breakdown=individual?{regular_price_sen:individual.regular_price_sen,base_price_sen:individual.base_price_sen,final_price_sen:individual.final_price_sen,discount_description:individual.discount_description}:await s('SELECT regular_price_sen,base_price_sen,final_price_sen,discount_description FROM consultation_offer_prices WHERE offer_id=?',[r.id]).first();return {breakdown,reference:r.reference,state:r.booking_state,startAt:r.start_at,endAt:r.end_at,expiresAt:r.expires_at,sellingPriceSen:r.selling_price_sen,currency:r.currency,snapshotHash:r.snapshot_hash,policyHash:r.policy_hash,policyVersion:r.policy_version,policyText:individual?.policy_text??config.policies.booking.text};}
 async function accept(input){
  closed(input,['token','acknowledged','snapshotHash','policyHash']);const r=await linked(input.token);
  if(input.acknowledged!==true||input.snapshotHash!==r.snapshot_hash||input.policyHash!==r.policy_hash)throw appointmentError('OFFER_CHANGED_OR_EXPIRED');
  if(r.booking_state==='PaymentPending'&&r.state==='Accepted'&&r.used_at!==null)return {state:'PaymentPending',duplicate:true};
  acceptOffer({id:r.id,bookingId:r.booking_id,customerId:r.customer_id,practitionerId:r.practitioner_id,startAt:r.start_at,endAt:r.end_at,issuedAt:r.issued_at,expiresAt:r.expires_at,state:r.state,sellingPriceSen:r.selling_price_sen,regularPriceSen:r.regular_price_sen,currency:r.currency,policyHash:r.policy_hash,policyVersion:r.policy_version,snapshotHash:r.snapshot_hash},{now:await now(),customerId:r.customer_id,acknowledged:input.acknowledged,snapshotHash:input.snapshotHash,policyHash:input.policyHash});
  const acceptanceAvailable=available+' AND '+appointmentConflictSql,acceptanceValues=[...slotValues(r.start_at),...appointmentConflictValues(r.practitioner_id,r.start_at,r.end_at)];
  if(r.individual_offer&&!(await s(`SELECT 1 ok WHERE ?>=${DB_NOW}+259200000 AND ${acceptanceAvailable}`,[r.start_at,...acceptanceValues]).first()))throw appointmentError('APPOINTMENT_UNAVAILABLE');
  const proof=`EXISTS(SELECT 1 FROM consultation_guest_offer_links l WHERE l.offer_id=? AND l.token_hash=? AND l.used_at IS NULL AND l.expires_at>${DB_NOW})`;
  try{await db.batch([
   s(`UPDATE consultation_offers SET state='Accepted',accepted_at=${DB_NOW},acceptance_customer_id=?,acceptance_policy_hash=policy_hash,acceptance_snapshot_hash=snapshot_hash WHERE id=? AND state='Issued' AND expires_at>${DB_NOW} ${r.individual_offer?'AND ?>='+DB_NOW+'+259200000 AND '+acceptanceAvailable:''} AND ${proof} AND EXISTS(SELECT 1 FROM consultation_bookings b JOIN customers c ON c.id=b.customer_id WHERE b.current_offer_id=consultation_offers.id AND b.state='Offered' AND b.row_version=? AND c.status='Active')`,[r.customer_id,r.id,...(r.individual_offer?[r.start_at,...acceptanceValues]:[]),r.id,r.hash,r.row_version]),
   s(`INSERT INTO consultation_guest_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'Accepted',?,${DB_NOW})`,[crypto.randomUUID(),r.booking_id,r.booking_id]),
   ...(r.individual_offer?[s('INSERT INTO consultation_slot_reservations VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),r.booking_id,r.id,r.practitioner_id,r.start_at,r.end_at,'Held',r.expires_at])]:[]),
   s(`UPDATE consultation_bookings SET state='PaymentPending',row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND state='Offered' AND row_version=? AND current_offer_id=?`,[r.booking_id,r.row_version,r.id]),
   s(`INSERT INTO consultation_workflow_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'Accepted','Customer',?,${DB_NOW})`,[crypto.randomUUID(),r.booking_id,r.booking_id]),
   s(`UPDATE consultation_guest_offer_links SET used_at=${DB_NOW} WHERE offer_id=? AND token_hash=? AND used_at IS NULL`,[r.id,r.hash])]);}catch(error){const current=await linked(input.token);if(current.id===r.id&&current.booking_state==='PaymentPending'&&current.state==='Accepted'&&current.used_at!==null)return {state:'PaymentPending',duplicate:true};if(r.individual_offer&&!(await s(`SELECT 1 ok WHERE ${acceptanceAvailable}`,acceptanceValues).first()))throw appointmentError('APPOINTMENT_UNAVAILABLE');throw error;}
  return {state:'PaymentPending'};
 }
 return Object.freeze({calendar,submit,submitForReview,issueLink,view,accept,prepareSubmission,submissionFingerprint});
}
