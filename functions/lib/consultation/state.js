// Pure domain transitions; no persistence or external side effects.
// REQUIRED PERSISTENCE CONTRACT BEFORE C1-C2:
// Authenticate roles/assignment and customer/contact ownership from trusted server evidence.
// Re-read booking + current offer + reservation + pending requests in the unit of work.
// Commit booking CAS, offer state/evidence, slot release/reservation, request decision,
// retention deadlines and sanitized audit event together. Never partially commit them.
// UPDATE ... WHERE id=? AND row_version=? must change exactly one row. Zero rows means
// conflict, not success; ensure the whole D1 batch aborts (e.g. a guarded audit INSERT
// whose required NOT NULL version result fails when CAS changed zero rows). Test the
// chosen D1-compatible mechanism locally before adding any adapter. No raw BEGIN in D1.
// command_id is globally unique. Store canonical command fingerprint + result in audit
// metadata: same ID + same payload returns original result; different payload rejects.
// Reserve slots through SQL overlap triggers. A reschedule releases old reservation,
// supersedes old offer, creates a new immutable offer/reservation and updates the booking
// atomically. Never mutate a previous offer snapshot to implement a reschedule.
// Return success only after commit; provider delivery/payment calls remain outside this
// transaction, with verified evidence/outbox deduplication at future integration boundaries.
import {instant,SESSION,strictBoolean,reportDeadline,retentionDeadline,noShowAllowed} from './foundation.js';
const terminal = new Set(['Declined','OfferExpired','CancelledForfeited','NoShowForfeited']);
const transitions = {
 Submitted:['UnderReview','Declined'],
 UnderReview:['Offered','Declined','OwnerReview'],
 Offered:['PaymentPending','OfferExpired','OwnerReview'],
 PaymentPending:['Confirmed','OfferExpired','ExceptionReview','OwnerReview'],
 Confirmed:['Completed','CancelledForfeited','NoShowForfeited','ProviderRemedyPending','OwnerReview'],
 Completed:['ReportReady'], ReportReady:['ReportDelivered'],
 ExceptionReview:['OwnerReview','Confirmed'], OwnerReview:[], ProviderRemedyPending:[]
};
export function paymentDecision(offer,evidence) {
 if (evidence?.authoritative !== true || evidence.verificationStatus !== 'Verified' ||
     evidence.currency !== 'MYR' || evidence.amountSen !== offer.sellingPriceSen ||
     evidence.offerId !== offer.id || evidence.bookingId !== offer.bookingId ||
     !Number.isSafeInteger(evidence.orderId) || evidence.orderId < 1 || evidence.orderId !== offer.orderId) {
  return 'ExceptionReview';
 }
 try { instant(evidence.capturedAt); } catch { return 'ExceptionReview'; }
 if (!['Accepted','PaymentReceived'].includes(offer.state) || !Number.isSafeInteger(offer.acceptedAt) ||
     offer.acceptanceCustomerId !== offer.customerId || offer.acceptancePolicyHash !== offer.policyHash ||
     offer.acceptanceSnapshotHash !== offer.snapshotHash || !offer.acceptancePolicyHash || !offer.acceptanceSnapshotHash ||
     evidence.capturedAt < offer.acceptedAt || evidence.capturedAt >= offer.expiresAt) {
  return 'ExceptionReview';
 }
 return 'Eligible';
}
function matchingOffer(booking,offer,current) {
 if (!offer || offer.bookingId !== booking.id || (current && booking.currentOfferId !== offer.id)) {
  throw Error('Current matching offer required');
 }
 if (current && (booking.practitionerId !== offer.practitionerId ||
     booking.currentStartAt !== offer.startAt || booking.currentEndAt !== offer.endAt)) {
  throw Error('Offer assignment/schedule mismatch');
 }
}
export function transition(booking,to,{
 now,expectedVersion,actorRole,actorId=null,offer=null,payment=null,slotReserved=false,
 pendingRequests=[],reportReviewed=false,deliveryProven=false,lawfulException=false
}={}) {
 instant(now);
 for (const [label,value] of Object.entries({slotReserved,reportReviewed,deliveryProven,lawfulException})) {
  strictBoolean(value,label);
 }
 if (!Number.isSafeInteger(booking.rowVersion) || booking.rowVersion < 0 || booking.rowVersion !== expectedVersion) {
  throw Error('Stale booking version');
 }
 if (!['owner','booking_admin','practitioner'].includes(actorRole)) throw Error('Unauthorized transition');
 if (actorRole === 'practitioner' && (actorId == null || actorId !== booking.practitionerId)) {
  throw Error('Assigned practitioner required');
 }
 if (actorRole === 'booking_admin' && to === 'ReportReady') throw Error('Private report review denied');
 if (actorRole === 'practitioner' && !['Completed','ReportReady'].includes(to)) throw Error('Practitioner transition denied');
 if (!(transitions[booking.state] || []).includes(to)) throw Error('Illegal transition');
 if (['Offered','PaymentPending','Confirmed','OfferExpired'].includes(to)) matchingOffer(booking,offer,to !== 'Offered');
 if (to === 'Offered' && (offer.state !== 'Issued' || now < offer.issuedAt || now >= offer.expiresAt || !slotReserved)) {
  throw Error('Reserved offer required');
 }
 if (to === 'PaymentPending' && (offer.state !== 'Accepted' || !Number.isSafeInteger(offer.acceptedAt) ||
     now < offer.acceptedAt || now >= offer.expiresAt)) throw Error('Accepted offer required');
 if (booking.state === 'ExceptionReview' && to === 'Confirmed' && actorRole !== 'owner') throw Error('Owner payment review required');
 if (to === 'Confirmed' && (paymentDecision(offer,payment) !== 'Eligible' || !slotReserved ||
     now < payment.capturedAt || now >= offer.startAt)) {
  throw Error('Verified payment and available future appointment required');
 }
 if (to === 'OfferExpired' && now < offer.expiresAt) throw Error('Offer not expired');
 if (to === 'NoShowForfeited' && !noShowAllowed({now,startAt:booking.currentStartAt,pendingRequests})) {
  throw Error('No-show protected or session incomplete');
 }
 if (to === 'CancelledForfeited' && lawfulException) throw Error('Lawful exception requires owner review');
 if (to === 'ReportReady' && !reportReviewed) throw Error('Reviewed report required');
 if (to === 'ReportDelivered' && !deliveryProven) throw Error('Delivery proof required');
 const next = {...booking,state:to,rowVersion:booking.rowVersion+1,updatedAt:now};
 if (to === 'Offered') {
  next.currentOfferId=offer.id;
  next.practitionerId=offer.practitionerId;
  next.currentStartAt=offer.startAt;
  next.currentEndAt=offer.endAt;
 }
 if (to === 'Confirmed') next.originalStartAt=booking.originalStartAt ?? offer.startAt;
 if (to === 'Completed') {
  instant(booking.currentStartAt);
  instant(booking.currentEndAt);
  if (booking.currentEndAt !== booking.currentStartAt+SESSION || now < booking.currentEndAt) {
   throw Error('90-minute session has not ended');
  }
  next.completedAt=now;
  next.reportDueAt=reportDeadline(now);
  next.privateRetentionUntil=retentionDeadline({completedAt:now});
 }
 if (terminal.has(to)) {
  next.terminalAt=now;
  next.privateRetentionUntil=retentionDeadline({terminalAt:now});
 }
 return Object.freeze(next);
}
