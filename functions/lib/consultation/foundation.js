// Pure C1-C1 domain rules. No DB, environment bindings, network or provider actions.
export const POLICY_VERSION='bazi-c1-draft-1'; // Not customer-published policy approval.
export const HOUR=3600000, DAY=24*HOUR, SESSION=90*60000;
const MYT=8*HOUR;
export function identifier(value) {
 if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
  throw Error('Invalid identifier');
 }
 return value;
}
export function strictBoolean(value, label) {
 if (typeof value !== 'boolean') throw Error('Invalid boolean: ' + label);
 return value;
}
export function databaseBoolean(value) {
 if (value === true || value === 1) return true;
 if (value === false || value === 0) return false;
 throw Error('Invalid database boolean');
}
export function normalizeRescheduleRequest(row) {
 if (!row || !['Pending','Approved','Declined','Withdrawn','OwnerReview'].includes(row.state)) {
  throw Error('Invalid reschedule request');
 }
 const hasDomain = Object.hasOwn(row, 'eligible');
 const hasDatabase = Object.hasOwn(row, 'eligibility');
 if (!hasDomain && !hasDatabase) throw Error('Missing reschedule eligibility');
 const eligible = hasDomain ? strictBoolean(row.eligible, 'eligible') : databaseBoolean(row.eligibility);
 if (hasDatabase && eligible !== databaseBoolean(row.eligibility)) throw Error('Conflicting eligibility');
 return Object.freeze({...row, eligible});
}
export function instant(value) {
 if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) throw Error('Invalid UTC instant');
 return value;
}
export function dateParts(date) {
 if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Invalid calendar date');
 const [y,m,d]=date.split('-').map(Number);
 const t=Date.UTC(y,m-1,d);
 if (y < 1900 || y > 9999 || new Date(t).toISOString().slice(0,10) !== date) throw Error('Invalid calendar date');
 return {y,m,d,t};
}
export function mytDate(value) {
 return new Date(instant(value)+MYT).toISOString().slice(0,10);
}
export function mytDayStart(date) {
 return dateParts(date).t-MYT;
}
export function addCalendarDays(date,days) {
 if (!Number.isSafeInteger(days)) throw Error('Invalid days');
 return new Date(dateParts(date).t+days*DAY).toISOString().slice(0,10);
}
export function calendarMonthsLater(value,months) {
 instant(value);
 if (!Number.isSafeInteger(months) || months < 0) throw Error('Invalid months');
 const local=new Date(value+MYT);
 const day=local.getUTCDate();
 local.setUTCDate(1);
 local.setUTCMonth(local.getUTCMonth()+months);
 const max=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,0)).getUTCDate();
 local.setUTCDate(Math.min(day,max));
 return instant(local.getTime()-MYT);
}
export function reportDeadline(completedAt) {
 return mytDayStart(addCalendarDays(mytDate(completedAt),4))-1;
}
export function replacementDeadline(originalStart) {
 return mytDayStart(addCalendarDays(mytDate(originalStart),31))-1;
}
export function retentionDeadline({completedAt=null,terminalAt=null}) {
 if (completedAt !== null) return calendarMonthsLater(completedAt,24);
 if (terminalAt !== null) return instant(instant(terminalAt)+90*DAY);
 return null; // Pending cases must not be silently assigned a terminal retention date.
}
export function isAdult(birthDate,asOf) {
 const birth=dateParts(birthDate);
 const today=dateParts(mytDate(asOf));
 const beforeBirthday=today.m < birth.m || (today.m === birth.m && today.d < birth.d);
 return today.y-birth.y-(beforeBirthday ? 1 : 0) >= 18;
}
function text(value,min,max,label) {
 if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw Error('Invalid '+label);
 return value.trim();
}
export function validateIntake(input,{asOf,verifiedContact}) {
 instant(asOf);
 if (input.selfBooking !== true || input.consultationConsent !== true) throw Error('Adult self-booking and consultation consent required');
 if (!isAdult(input.birthDate,asOf)) throw Error('Adults only');
 if (!['male','female'].includes(input.calculationGender)) throw Error('Invalid calculation gender');
 if (!['exact','approximate','unknown'].includes(input.birthTimePrecision)) throw Error('Invalid birth time precision');
 if (input.birthTimePrecision === 'unknown') {
  if (input.birthTime) throw Error('Unknown time must not assert a time');
 } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.birthTime || '')) throw Error('Invalid birth time');
 const birthplace=text(input.birthplace,2,200,'birthplace');
 const questions=text(input.questions,1,2000,'questions');
 const fullName=text(input.fullName,2,120,'name');
 if (!['email','whatsapp'].includes(input.reportChannel)) throw Error('Invalid report channel');
 // Trusted server evidence only: future API must bind the verification reference to
 // the authenticated booking customer and require the approved consent version.
 if (!verifiedContact || verifiedContact.verified !== true || verifiedContact.channel !== input.reportChannel ||
     !verifiedContact.reference) throw Error('Verified delivery contact required');
 const consentVersion=text(input.consentVersion,1,80,'consent version');
 return Object.freeze({fullName,calculationGender:input.calculationGender,birthDate:input.birthDate,
  birthTime:input.birthTimePrecision === 'unknown' ? null : input.birthTime,
  birthTimePrecision:input.birthTimePrecision,birthplace,questions,reportChannel:input.reportChannel,
  consentVersion,consentedAt:asOf,verifiedContactReference:verifiedContact.reference,selfBooking:true});
}
export function priceAt({issuedAt,promotion=null}) {
 instant(issuedAt);
 const regularPriceSen=130000;
 let sellingPriceSen=regularPriceSen,promotionId=null,promotionVersion=null;
 if (promotion?.state === 'Active') {
  if (typeof promotion.approvedBy !== 'string' || !promotion.approvedBy.trim() ||
      !Number.isSafeInteger(promotion.approvedAt) || promotion.approvedAt > issuedAt ||
      promotion.sku !== 'CONSULT-BAZI' || promotion.currency !== 'MYR' || promotion.timezone !== 'Asia/Kuala_Lumpur') {
   throw Error('Invalid approved promotion');
  }
  identifier(promotion.id);
  const start=mytDayStart(promotion.startsOn);
  const end=mytDayStart(addCalendarDays(promotion.endsOn,1));
  if (end <= start) throw Error('Invalid promotion interval');
  if (!Number.isSafeInteger(promotion.sellingPriceSen) || promotion.sellingPriceSen <= 0 ||
      promotion.sellingPriceSen > regularPriceSen || !Number.isSafeInteger(promotion.version) || promotion.version < 1) {
   throw Error('Invalid selling price');
  }
  if (issuedAt >= start && issuedAt < end) {
   sellingPriceSen=promotion.sellingPriceSen;
   promotionId=promotion.id;
   promotionVersion=promotion.version;
  }
 }
 return Object.freeze({regularPriceSen,sellingPriceSen,currency:'MYR',promotionId,promotionVersion});
}
export async function issueOffer({id,bookingId,customerId,practitionerId,startAt,issuedAt,policyVersion,policyHash,promotion=null}) {
 instant(startAt);
 instant(issuedAt);
 if (startAt-issuedAt < 72*HOUR) throw Error('72-hour lead time required');
 identifier(id);
 identifier(bookingId);
 if (!Number.isSafeInteger(customerId) || customerId < 1 || !Number.isSafeInteger(practitionerId) || practitionerId < 1 ||
     typeof policyHash !== 'string' || !/^[a-f0-9]{64}$/.test(policyHash)) throw Error('Invalid offer identity/policy');
 policyVersion=text(policyVersion,1,80,'policy version');
 const snapshot={id,bookingId,customerId,practitionerId,startAt,endAt:instant(startAt+SESSION),
  issuedAt,expiresAt:instant(issuedAt+48*HOUR),policyVersion,policyHash,...priceAt({issuedAt,promotion})};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
 const snapshotHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 return Object.freeze({...snapshot,snapshotHash,state:'Issued'});
}
export function offerOpen(offer,now) {
 instant(now);
 instant(offer.issuedAt);
 instant(offer.expiresAt);
 return now >= offer.issuedAt && now < offer.expiresAt;
}
export function acceptOffer(offer,{now,customerId,policyHash,snapshotHash,acknowledged}) {
 // offer MUST be a server-issued or immutable database-loaded snapshot, never a
 // client-supplied object. Future adapter recomputes the canonical hash on load.
 strictBoolean(acknowledged,'acknowledged');
 if (offer.state !== 'Issued' || !offerOpen(offer,now) || customerId !== offer.customerId || acknowledged !== true ||
     policyHash !== offer.policyHash || snapshotHash !== offer.snapshotHash || !policyHash || !snapshotHash) {
  throw Error('Offer acceptance rejected');
 }
 return Object.freeze({...offer,state:'Accepted',acceptedAt:now,acceptanceCustomerId:customerId,
  acceptancePolicyHash:policyHash,acceptanceSnapshotHash:snapshotHash});
}
export function rescheduleEligibility({requestedAt,startAt,freeRescheduleUsed}) {
 instant(requestedAt);
 instant(startAt);
 strictBoolean(freeRescheduleUsed, 'freeRescheduleUsed');
 if (requestedAt > startAt - 24*HOUR) return 'Late';
 return freeRescheduleUsed ? 'OwnerReview' : 'FreeEligible';
}
export function replacementAllowed({originalStart,replacementStart,now}) {
 instant(now);
 instant(replacementStart);
 return replacementStart > now && replacementStart <= replacementDeadline(originalStart);
}
export function noShowAllowed({now,startAt,pendingRequests=[]}) {
 instant(now);
 instant(startAt);
 if (!Array.isArray(pendingRequests)) throw Error('Invalid pending requests');
 // Invalid/missing evidence throws; callers must not interpret this as permission to forfeit.
 const requests = pendingRequests.map(normalizeRescheduleRequest);
 return now >= startAt + SESSION && !requests.some(r => ['Pending','OwnerReview'].includes(r.state) && r.eligible);
}
export function privateAccess({role,actorId,assignedPractitionerId}) {
 return role === 'owner' || (role === 'practitioner' && actorId != null && actorId === assignedPractitionerId);
}
export function approveReschedule(booking,request,{
 now,replacementStart=null,slotAvailable=false,ownerApproved=false,expectedVersion,
 actorRole,actorId=null
}) {
 instant(now);
 strictBoolean(slotAvailable, 'slotAvailable');
 strictBoolean(ownerApproved, 'ownerApproved');
 if (!['owner','booking_admin','practitioner'].includes(actorRole)) throw Error('Unauthorized reschedule');
 if (actorRole === 'practitioner' && (actorId == null || actorId !== booking.practitionerId)) {
  throw Error('Assigned practitioner required');
 }
 if (ownerApproved && actorRole !== 'owner') throw Error('Owner approval required');
 if (!Number.isSafeInteger(booking.rowVersion) || booking.rowVersion !== expectedVersion) {
  throw Error('Stale booking version');
 }
 if (booking.state !== 'Confirmed' || request.state !== 'Pending') throw Error('Pending confirmed-booking request required');
 if (request.bookingId !== booking.id || request.appointmentStartSnapshot !== booking.currentStartAt ||
     request.originalStartSnapshot !== booking.originalStartAt || request.requestedAt > now) {
  throw Error('Stale reschedule request');
 }
 const eligibility = rescheduleEligibility({
  requestedAt:request.requestedAt,startAt:request.appointmentStartSnapshot,
  freeRescheduleUsed:booking.freeRescheduleUsed
 });
 if (eligibility !== 'FreeEligible' && !ownerApproved) return Object.freeze({decision:'OwnerReview',booking});
 if (!slotAvailable || replacementStart === null ||
     !replacementAllowed({originalStart:booking.originalStartAt,replacementStart,now})) {
  // Provisional scheduling exception: never extend, refund or forfeit automatically.
  return Object.freeze({decision:'OwnerReview',booking});
 }
 return Object.freeze({
  decision:'Approved',
  request:Object.freeze({...request,state:'Approved',replacementStart,decidedAt:now}),
  booking:Object.freeze({...booking,currentStartAt:replacementStart,currentEndAt:replacementStart+SESSION,
   freeRescheduleUsed:eligibility === 'FreeEligible' ? true : booking.freeRescheduleUsed,
   rowVersion:booking.rowVersion+1,updatedAt:now})
 });
}

export function retentionEligible({retentionUntil,lawfulHold=false,deletedAt=null},now){
 instant(now);
 if(typeof lawfulHold!=='boolean')throw Error('Invalid lawful hold');
 return !lawfulHold&&deletedAt===null&&retentionUntil!==null&&retentionUntil!==undefined&&instant(retentionUntil)<=now;
}
