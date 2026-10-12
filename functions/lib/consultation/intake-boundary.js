// Unwired server-side boundaries, not customer authentication or public endpoints.
import {identifier,instant,strictBoolean} from './foundation.js';
import {decryptIntake} from './intake-crypto.js';
import {isWithdrawalEvent} from './intake-validation.js';
export function createIntakeBoundary({verifyCustomer=null,verifyContact=null,qyAuth=null,clock=Date.now}={}) {
 const proofs = new WeakSet();
 async function customer(request,channel) {
  try {
  if (typeof verifyCustomer !== 'function' || typeof verifyContact !== 'function') throw Error('Customer verification unavailable');
  const now = clock(), identity = await verifyCustomer(request);
  if (identity?.authenticated !== true || !Number.isSafeInteger(identity.customerId) || identity.customerId < 1 ||
      !Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= now) throw Error('Customer authorization denied');
  const contact = await verifyContact(request,identity.customerId,channel);
  if (contact?.verified !== true || contact.customerId !== identity.customerId || contact.channel !== channel ||
      !Number.isSafeInteger(contact.expiresAt) || contact.expiresAt <= now) throw Error('Contact ownership denied');
  const proof = Object.freeze({customerId:identity.customerId,expiresAt:Math.min(identity.expiresAt,contact.expiresAt),contact:Object.freeze({...contact})});
  proofs.add(proof); return proof;
  } catch { throw Error('Customer authorization denied'); }
 }
 function requireOwner(proof,record) {
  if (!proofs.has(proof) || proof.expiresAt <= clock() || record.customerId !== proof.customerId) throw Error('Private intake access denied');
  return true;
 }
 async function administrative(request) {
  if (!qyAuth?.requirePrivateAccess) throw Error('Consultation authentication unavailable');
  const result = await qyAuth.requirePrivateAccess(request,{stateChanging:false});
  if (result.error || result.principal?.scope !== 'qy-consultation') throw Error('Private intake access denied');
  return Object.freeze({accountId:result.principal.accountId,sessionId:result.principal.sessionId});
 }
 return Object.freeze({customer,requireOwner,administrative});
}
export function operationalReceipt(record) { return Object.freeze({id:record.id,revision:record.revision}); }
function commandArgs({commandId,fingerprintKeyId,fingerprint,now,expectedRevision}) {
 identifier(commandId); identifier(fingerprintKeyId); instant(now);
 if (!/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw Error('Invalid intake command');
}
function identity(id,customerId) {
 identifier(id);
 if (!Number.isSafeInteger(customerId) || customerId < 1) throw Error('Invalid intake identity');
}
function receipt(id,customerId,operation,args) {
 return {sql:`INSERT INTO consultation_intake_commands(customer_id,command_id,intake_id,operation,fingerprint_key_id,fingerprint,result_revision,occurred_at)
  VALUES(?,?,?,?,?,?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?)`,
  values:[customerId,args.commandId,id,operation,args.fingerprintKeyId,args.fingerprint,args.expectedRevision+1,args.now]};
}
function audit(id,customerId,event,now) {
 return {sql:`INSERT INTO consultation_intake_access_audit(id,intake_id,customer_id,event,actor_kind,actor_reference,occurred_at) VALUES(?,?,?,?,?,?,?)`,
  values:[crypto.randomUUID(),id,customerId,event,'Customer','customer-'+customerId,now]};
}
// All builders require prior trusted authorization. Execute each complete plan in ONE batch.
export async function intakeUpdatePlan(db,record,args,keyProvider) {
 commandArgs(args); identity(record.id,record.customerId);
 const current = await db.prepare('SELECT revision,payload_version FROM consultation_customer_intakes WHERE id=? AND customer_id=?').bind(record.id,record.customerId).first();
 if (!current || current.revision !== args.expectedRevision || current.payload_version !== args.expectedPayloadVersion ||
     record.payloadVersion !== current.payload_version+1) throw Error('Intake version conflict');
 // A stale ciphertext relabelled with a new version cannot pass authentication here.
 const checked = {...record,nonce:new Uint8Array(record.nonce),ciphertext:new Uint8Array(record.ciphertext)};
 await decryptIntake(checked,keyProvider);
 return [
  {sql:`UPDATE consultation_customer_intakes SET revision=revision+1,payload_version=?,schema_version=?,key_id=?,nonce=?,ciphertext=?,updated_at=?
   WHERE id=? AND customer_id=? AND revision=? AND payload_version=?`,
   values:[checked.payloadVersion,checked.schemaVersion,checked.keyId,checked.nonce,checked.ciphertext,args.now,checked.id,checked.customerId,args.expectedRevision,args.expectedPayloadVersion]},
  receipt(record.id,record.customerId,'Submit',args),audit(record.id,record.customerId,'Submitted',args.now)
 ];
}
export function intakeMetadataPlan({id,customerId},args,{lawfulHold,holdReference=null,reviewReason=null}) {
 identity(id,customerId); commandArgs(args); strictBoolean(lawfulHold,'lawfulHold');
 if (lawfulHold) identifier(holdReference);
 else if (holdReference !== null) throw Error('Invalid hold reference');
 if (reviewReason !== null && !['RetentionApproaching','DeletionRequest'].includes(reviewReason)) throw Error('Invalid review reason');
 const plan = [
  {sql:'UPDATE consultation_customer_intakes SET revision=revision+1,lawful_hold=?,hold_reference=?,updated_at=? WHERE id=? AND customer_id=? AND revision=?',
   values:[lawfulHold?1:0,holdReference,args.now,id,customerId,args.expectedRevision]},
  receipt(id,customerId,'Metadata',args)
 ];
 if (reviewReason !== null) plan.push({sql:'INSERT INTO consultation_intake_reviews(id,intake_id,customer_id,reason,requested_at) VALUES(?,?,?,?,?)',values:[crypto.randomUUID(),id,customerId,reviewReason,args.now]});
 return plan;
}
export function withdrawalPlan(event,args) {
 commandArgs(args);
 if (!isWithdrawalEvent(event) || args.now !== event.occurred_at) throw Error('Invalid withdrawal command');
 const plan = [
  {sql:`UPDATE consultation_customer_intakes SET revision=revision+1,updated_at=?
   WHERE id=? AND customer_id=? AND revision=? AND EXISTS (
    SELECT 1 FROM consultation_intake_consents c WHERE c.id=? AND c.intake_id=? AND c.customer_id=? AND c.purpose=?
    AND c.sequence=? AND c.state='Granted' AND c.occurred_at<=?
    AND c.sequence=(SELECT MAX(sequence) FROM consultation_intake_consents WHERE intake_id=? AND customer_id=? AND purpose=?))`,
   values:[args.now,event.intake_id,event.customer_id,args.expectedRevision,event.previous_id,event.intake_id,event.customer_id,event.purpose,event.previous_sequence,args.now,event.intake_id,event.customer_id,event.purpose]},
  receipt(event.intake_id,event.customer_id,'Withdraw',args),
  {sql:'INSERT INTO consultation_intake_consents(id,intake_id,customer_id,purpose,sequence,policy_version,policy_hash,state,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)',
   values:[event.id,event.intake_id,event.customer_id,event.purpose,event.sequence,event.policy_version,event.policy_hash,event.state,event.occurred_at]},
  audit(event.intake_id,event.customer_id,'ConsentWithdrawn',args.now)
 ];
 if (event.purpose === 'consultation_privacy') plan.push({sql:"INSERT INTO consultation_intake_reviews(id,intake_id,customer_id,reason,requested_at) VALUES(?,?,?,'PrivacyWithdrawal',?)",values:[crypto.randomUUID(),event.intake_id,event.customer_id,args.now]});
 return plan;
}
export async function readPersistedEnvelope(db,{id,customerId}) {
 identity(id,customerId);
 const row = await db.prepare('SELECT id,customer_id,payload_version,schema_version,key_id,nonce,ciphertext FROM consultation_customer_intakes WHERE id=? AND customer_id=?').bind(id,customerId).first();
 if (!row) throw Error('Private intake access denied');
 return {id:row.id,customerId:row.customer_id,payloadVersion:row.payload_version,schemaVersion:row.schema_version,keyId:row.key_id,
  nonce:new Uint8Array(row.nonce),ciphertext:new Uint8Array(row.ciphertext)};
}
