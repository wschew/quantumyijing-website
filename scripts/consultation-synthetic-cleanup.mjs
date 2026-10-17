// Offline plan builder only. No HTTP route, database executor, network or credentials.
// Every statement MUST execute in one rollback-on-error batch, never separately.
import {DB_NOW} from '../functions/lib/consultation/workflow-guards.js';
const DATABASE='734455fd-cdec-4e14-ad6f-96f80f22f3e7';
const ORIGIN='https://c1-bazi-consultation-develop.qy-c1-consultation-preview.pages.dev';
const MANIFEST='e8231fb3ed2cd732ac26f7b8ce049c2b72ded138858874b062ad8901c5e0ac17';
const protectedReferences=new Set(['BAZI-faffbbee-4f2e-48d2-ad64-66e0337b6264','BAZI-9debad86-d2fb-49d9-b4a9-f507e807d00b']);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const reject=()=>{throw Error('Synthetic cleanup scope rejected');};
export function prepareSyntheticCleanup(scope){
 const fields=['bookingId','bookingReference','offerId','reservationId','customerId','intakeId','requestCommandId','requestFingerprint','snapshotHash','expectedVersion','startAt','runId','runStartedAt','runExpiresAt','ownerApprovalReference'];
 if(!scope||Object.keys(scope).length!==fields.length||fields.some(k=>!(k in scope)))reject();
 for(const k of ['bookingId','offerId','reservationId','intakeId','requestCommandId','runId','ownerApprovalReference'])if(!id(scope[k]))reject();
 if(scope.bookingReference!=='BAZI-'+scope.bookingId||protectedReferences.has(scope.bookingReference))reject();
 for(const k of ['requestFingerprint','snapshotHash'])if(!/^[a-f0-9]{64}$/.test(scope[k]))reject();
 for(const k of ['customerId','expectedVersion','startAt','runStartedAt','runExpiresAt'])if(!Number.isSafeInteger(scope[k])||scope[k]<0)reject();
 if(scope.customerId<1||scope.expectedVersion>Number.MAX_SAFE_INTEGER-1||scope.startAt%1800000!==0||scope.runExpiresAt<=scope.runStartedAt||scope.runExpiresAt-scope.runStartedAt>21600000)reject();
 const values=[],bind=v=>{values.push(v);return '?';};
 const predicate=`b.id=${bind(scope.bookingId)} AND b.reference=${bind(scope.bookingReference)}
 AND b.customer_id=${bind(scope.customerId)} AND b.product_id=1 AND b.practitioner_id=1 AND b.service_code='BAZI'
 AND b.state='PaymentPending' AND b.row_version=${bind(scope.expectedVersion)} AND b.current_offer_id=${bind(scope.offerId)}
 AND b.current_start_at=${bind(scope.startAt)} AND b.current_end_at=b.current_start_at+5400000
 AND b.original_start_at IS NULL AND b.completed_at IS NULL AND b.terminal_at IS NULL AND b.report_due_at IS NULL AND b.enquiry_id IS NULL
 AND b.created_at>=${bind(scope.runStartedAt)} AND b.created_at<=${DB_NOW} AND ${DB_NOW}<=${bind(scope.runExpiresAt)}
 AND EXISTS(SELECT 1 FROM consultation_preview_environment WHERE id=1 AND enabled=1 AND synthetic_only=1 AND database_id=${bind(DATABASE)} AND origin=${bind(ORIGIN)} AND manifest_sha256=${bind(MANIFEST)})
 AND EXISTS(SELECT 1 FROM customers c JOIN consultation_preview_synthetic_customers x ON x.customer_id=c.id WHERE c.id=b.customer_id AND c.customer_reference=${bind('SYNTHETIC-GUEST-'+scope.bookingId)} AND c.status='Active')
 AND EXISTS(SELECT 1 FROM consultation_guest_intakes g JOIN consultation_guest_request_terms t ON t.booking_id=g.booking_id WHERE g.booking_id=b.id AND g.customer_id=b.customer_id AND g.intake_id=${bind(scope.intakeId)} AND g.command_id=${bind(scope.requestCommandId)} AND g.fingerprint=${bind(scope.requestFingerprint)})
 AND (SELECT COUNT(*) FROM consultation_bookings WHERE customer_id=b.customer_id)=1
 AND (SELECT COUNT(*) FROM consultation_offers WHERE booking_id=b.id)=1
 AND EXISTS(SELECT 1 FROM consultation_offers o JOIN consultation_individual_offer_prices p ON p.offer_id=o.id JOIN consultation_guest_offer_links l ON l.offer_id=o.id
 WHERE o.id=b.current_offer_id AND o.booking_id=b.id AND o.state='Accepted' AND o.order_id IS NULL AND o.selling_price_sen=88000 AND p.final_price_sen=88000 AND o.currency='MYR'
 AND o.snapshot_hash=${bind(scope.snapshotHash)} AND o.acceptance_snapshot_hash=o.snapshot_hash AND o.acceptance_policy_hash=o.policy_hash AND o.acceptance_customer_id=b.customer_id AND l.used_at IS NOT NULL)
 AND (SELECT COUNT(*) FROM consultation_slot_reservations WHERE booking_id=b.id OR offer_id=b.current_offer_id)=1
 AND EXISTS(SELECT 1 FROM consultation_slot_reservations r WHERE r.id=${bind(scope.reservationId)} AND r.booking_id=b.id AND r.offer_id=b.current_offer_id AND r.state='Held' AND r.practitioner_id=1 AND r.start_at=b.current_start_at AND r.end_at=b.current_end_at)
 AND NOT EXISTS(SELECT 1 FROM consultation_offers o WHERE o.booking_id=b.id AND o.order_id IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM customer_enquiry_links WHERE customer_id=b.customer_id)
 AND NOT EXISTS(SELECT 1 FROM consultation_capture_reviews WHERE booking_id=b.id OR offer_id=b.current_offer_id)
 AND NOT EXISTS(SELECT 1 FROM consultation_capture_audit WHERE booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM consultation_workflow_appointments WHERE booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM consultation_reschedule_requests WHERE booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM consultation_reports WHERE booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM consultation_manual_reports WHERE booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM consultation_events WHERE booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM consultation_workflow_lifecycle_events WHERE booking_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM consultation_workflow_events WHERE booking_id=b.id AND event NOT IN ('UnderReview','Offered','Accepted'))`;
 // Integer overflow is a hard SQLite error, so a zero-row CAS aborts the batch.
 const assertOne={sql:'SELECT CASE WHEN changes()=1 THEN 1 ELSE abs(-9223372036854775808) END AS cleanup_guard',params:[]};
 return Object.freeze({databaseId:DATABASE,atomicBatchRequired:true,statements:[
  {sql:`UPDATE consultation_bookings AS b SET state='OwnerReview',row_version=row_version+1,updated_at=${DB_NOW} WHERE ${predicate}`,params:values},
  assertOne,
  {sql:`UPDATE consultation_slot_reservations SET state='Released' WHERE id=? AND booking_id=? AND offer_id=? AND state='Held' AND EXISTS(SELECT 1 FROM consultation_bookings WHERE id=? AND state='OwnerReview' AND row_version=? AND current_offer_id=?)`,params:[scope.reservationId,scope.bookingId,scope.offerId,scope.bookingId,scope.expectedVersion+1,scope.offerId]},
  assertOne,
  {sql:`INSERT INTO consultation_events(id,booking_id,offer_id,event_type,previous_state,new_state,actor_role,actor_reference,occurred_at,correlation_id,command_id,sanitized_metadata) VALUES(?,?,?,'SyntheticTestHoldReleased','PaymentPending','OwnerReview','owner',?,${DB_NOW},?,?,?)`,params:['cleanup-'+scope.runId,scope.bookingId,scope.offerId,scope.ownerApprovalReference,scope.runId,scope.runId,JSON.stringify({purpose:'approved-synthetic-test-cleanup',reservationReleased:true})]},
  {sql:`INSERT INTO consultation_workflow_lifecycle_events VALUES(?,?,'OwnerReview','QY',?,?,${DB_NOW})`,params:['cleanup-review-'+scope.runId,scope.bookingId,scope.ownerApprovalReference,'synthetic-cleanup-'+scope.runId]}
 ]});
}
