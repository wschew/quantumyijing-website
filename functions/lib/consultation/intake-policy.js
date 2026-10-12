// Intake-specific policy; never reuse the legacy 24-month booking helper.
import {instant,mytDate,mytDayStart,dateParts,addCalendarDays,strictBoolean,identifier} from './foundation.js';
export const PURPOSES = Object.freeze(['consultation_privacy','future_calculations','marketing']);
export function intakeRetention({status,completedAt=null,terminalAt=null}) {
 if (status === 'Completed' && terminalAt === null) {
  instant(completedAt);
  const {y,m,d} = dateParts(mytDate(completedAt));
  const year = y + 5;
  const day = Math.min(d,new Date(Date.UTC(year,m,0)).getUTCDate());
  const anniversary = [year,String(m).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
  return mytDayStart(addCalendarDays(anniversary,1))-1;
 }
 if (['FinalExpired','FinalDeclined','FinalCancelled'].includes(status) && completedAt === null) {
  instant(terminalAt);
  return mytDayStart(addCalendarDays(mytDate(terminalAt),91))-1;
 }
 if (status === 'Pending' && completedAt === null && terminalAt === null) return null;
 throw Error('Invalid intake retention basis');
}
export function retentionReview({retentionUntil,lawfulHold=false,deletionRequested=false},now,days=30) {
 instant(now); strictBoolean(lawfulHold,'lawfulHold'); strictBoolean(deletionRequested,'deletionRequested');
 if (!Number.isSafeInteger(days) || days < 0 || days > 365) throw Error('Invalid review window');
 if (lawfulHold) return 'Held';
 if (deletionRequested) return 'ManualReview';
 if (retentionUntil === null) return 'NotScheduled';
 instant(retentionUntil);
 if (now > retentionUntil) return 'DueForReview';
 return now+days*86400000 >= retentionUntil ? 'Approaching' : 'Retain';
}
const sources = new WeakMap();
const LATEST = `SELECT * FROM consultation_intake_consents
 WHERE intake_id=? AND customer_id=? AND purpose=? ORDER BY sequence DESC LIMIT 1`;
export function validConsentEvidence(event) {
 try {
  if (!event || !PURPOSES.includes(event.purpose) ||
      !Number.isSafeInteger(event.customer_id) || event.customer_id < 1 ||
      !Number.isSafeInteger(event.sequence) || event.sequence < 1 ||
      !['Granted','Declined','Withdrawn'].includes(event.state) ||
      typeof event.policy_version !== 'string' || event.policy_version.trim().length < 1 || event.policy_version.length > 128 ||
      !/^[a-f0-9]{64}$/.test(event.policy_hash)) return false;
  identifier(event.id); identifier(event.intake_id); instant(event.occurred_at);
  return true;
 } catch { return false; }
}
// The caller must authenticate and authorize BEFORE resolving these DB-owned snapshots.
export function createConsentReader(db) {
 return Object.freeze({async latest({intakeId,customerId,purpose}) {
  identifier(intakeId);
  if (!Number.isSafeInteger(customerId) || customerId < 1 || !PURPOSES.includes(purpose)) throw Error('Consent lookup rejected');
  const row = await db.prepare(LATEST).bind(intakeId,customerId,purpose).first();
  if (!validConsentEvidence(row)) return null;
  const snapshot = Object.freeze({...row});
  sources.set(snapshot,{db,intakeId,customerId,purpose});
  return snapshot;
 }});
}
export function isTrustedConsentSnapshot(event) { return sources.has(event) && validConsentEvidence(event); }
export async function consentAllows(event,purpose,policy) {
 try {
  const source = sources.get(event);
  if (!source || !validConsentEvidence(event) || source.purpose !== purpose || event.purpose !== purpose ||
      event.state !== 'Granted' || typeof policy?.version !== 'string' || policy.version.trim().length < 1 ||
      policy.version.length > 128 || !/^[a-f0-9]{64}$/.test(policy.hash) ||
      event.policy_version !== policy.version || event.policy_hash !== policy.hash) return false;
  // Re-read: a previously trusted snapshot is NOT proof that the grant is still current.
  const current = await source.db.prepare(LATEST).bind(source.intakeId,source.customerId,purpose).first();
  return validConsentEvidence(current) && current.id === event.id && current.sequence === event.sequence &&
   current.state === 'Granted' && current.policy_version === policy.version && current.policy_hash === policy.hash;
 } catch { return false; }
}
