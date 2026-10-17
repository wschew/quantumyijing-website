// Stage A only: immutable quoted terms + accepted offer, no checkout provider or paid state.
import {DB_NOW} from './workflow-guards.js';
import {issueOffer,acceptOffer,identifier,mytDate} from './foundation.js';
import {currentPricing,pricingGuard,invitationPriceMatches} from './pricing-admin.js';
import {tokenHash} from './auth-crypto.js';
import {intakeRetention} from './intake-policy.js';
const encoder=new TextEncoder(),fail=()=>{throw Error('Self-service quote, slot or terms changed');};
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const unhex=value=>Uint8Array.from(value.match(/../g),b=>parseInt(b,16));
export function createSelfService({db,origin,keys,config,guest}){
 const s=(sql,v=[])=>db.prepare(sql).bind(...v),now=async()=>(await s(`SELECT ${DB_NOW} n`).first()).n;
 const keyId=keys.lookup.activeKeyId;
 async function mac(value,id=keyId){return hex(await crypto.subtle.sign('HMAC',await keys.lookup.provider(id),encoder.encode(JSON.stringify(value))));}
 const pricing=time=>currentPricing(db,config.productId,time);
 async function discount(id,time,price){
  if(id===null||id===undefined)return null;
  if(typeof id!=='string'||id.length>128)fail();
  const d=await s('SELECT d.id,d.description,d.final_price_sen,d.expires_at,i.discount_id invitation_id,i.base_price_sen,i.promotion_id,i.promotion_version FROM consultation_discount_codes d LEFT JOIN consultation_price_invitations i ON i.discount_id=d.id WHERE d.id=? AND d.product_id=? AND d.revoked_at IS NULL AND d.redeemed_at IS NULL AND d.created_at<=? AND d.expires_at>? AND d.final_price_sen<=?',[id,config.productId,time,time,price.sellingPriceSen]).first();if(!d||(d.invitation_id&&!invitationPriceMatches(d,price)))fail();return d;
 }
 async function resolveInvitation(token,time,price){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail();
  const row=await s('SELECT d.id FROM consultation_discount_codes d JOIN consultation_price_invitations i ON i.discount_id=d.id WHERE d.verifier=?',[await tokenHash(token)]).first();if(!row)fail();
  return discount(row.id,time,price);
 }
 async function invitation(input){
  if(!input||Object.keys(input).join(',')!=='token'||typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))fail();
  const time=await now(),{price}=await pricing(time),d=await resolveInvitation(input.token,time,price);
  return {regularPrice:price.regularPriceSen,basePrice:price.sellingPriceSen,promotionId:price.promotionId,price:d.final_price_sen,currency:'MYR',description:d.description,expiresAt:d.expires_at,paymentAvailable:false};
 }
 // Lazy maintenance: at most two unlinked Stage A unpaid holds per request.
 // Any order/payment evidence leaves the hold for the existing QY exception process.
 async function expire(limit=2){
  if(![1,2].includes(limit))fail();
  const safe=`b.state='PaymentPending' AND o.state='Accepted' AND o.expires_at<=${DB_NOW} AND o.issued_at<=${DB_NOW} AND o.order_id IS NULL AND NOT EXISTS(SELECT 1 FROM consultation_capture_reviews c WHERE c.offer_id=o.id) AND EXISTS(SELECT 1 FROM consultation_slot_reservations r WHERE r.offer_id=o.id AND r.state='Held')`;
  const rows=(await s(`SELECT b.id,b.row_version,o.id offer_id,g.intake_id FROM consultation_selfservice_bookings x JOIN consultation_bookings b ON b.id=x.booking_id JOIN consultation_offers o ON o.id=x.offer_id AND b.current_offer_id=o.id JOIN consultation_guest_intakes g ON g.booking_id=b.id WHERE ${safe} ORDER BY o.expires_at LIMIT ?`,[limit]).all()).results;
  for(const r of rows){
   const time=await now(),retention=intakeRetention({status:'FinalExpired',terminalAt:time});
   await db.batch([
    s(`UPDATE consultation_bookings SET state='OfferExpired',terminal_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND row_version=? AND EXISTS(SELECT 1 FROM consultation_bookings b JOIN consultation_offers o ON o.id=b.current_offer_id JOIN consultation_selfservice_bookings x ON x.booking_id=b.id AND x.offer_id=o.id WHERE b.id=? AND ${safe})`,[time,time,r.id,r.row_version,r.id]),
    s(`INSERT INTO consultation_workflow_lifecycle_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'OfferExpired','Customer','C1-selfservice-expiry',NULL,${DB_NOW})`,[crypto.randomUUID(),r.id]),
    s("UPDATE consultation_offers SET state='Expired' WHERE id=? AND state='Accepted'",[r.offer_id]),
    s("UPDATE consultation_slot_reservations SET state='Released' WHERE offer_id=? AND state='Held'",[r.offer_id]),
    s("UPDATE consultation_customer_intakes SET retention_basis='FinalExpired',retention_until=?,terminal_at=?,updated_at=?,revision=revision+1 WHERE id=? AND completed_at IS NULL",[retention,time,time,r.intake_id])]);
  }
 }
 async function quote(input){
  if(!input||Object.keys(input).some(k=>!['preferredStart','discountCode','invitationToken'].includes(k))||!Number.isSafeInteger(input.preferredStart))fail();
  await expire();const time=await now(),start=input.preferredStart;
  if(!(await guest.calendar({date:mytDate(start)})).slots.includes(start))fail();
  const {price}=await pricing(time),policy=config.policies.booking;
  if(input.invitationToken!==undefined&&input.discountCode!==undefined)fail();
  let d=null;if(input.discountCode!==undefined&&input.discountCode!==''){
   if(typeof input.discountCode!=='string'||!/^[a-f0-9]{64}$/.test(input.discountCode))fail();
   const row=await s('SELECT id FROM consultation_discount_codes WHERE verifier=?',[await tokenHash(input.discountCode)]).first();if(!row)fail();d=await discount(row.id,time,price);if(d.invitation_id)fail();
  }
  if(input.invitationToken!==undefined)d=await resolveInvitation(input.invitationToken,time,price);
  const finalPriceSen=d?.final_price_sen??price.sellingPriceSen;
  const value={purpose:'C1-selfservice-quote-v1',origin,productId:config.productId,practitionerId:config.practitionerId,startAt:start,...price,finalPriceSen,discountId:d?.id??null,policyVersion:policy.version,policyHash:policy.hash,issuedAt:time,expiresAt:Math.min(time+300000,d?.expires_at??Infinity),keyId};
  return {quote:{value,signature:await mac(value)},price:finalPriceSen,currency:price.currency,regularPrice:price.regularPriceSen,basePrice:price.sellingPriceSen,promotionId:price.promotionId,individualDiscount:price.sellingPriceSen-finalPriceSen,discountDescription:d?.description??null,policyText:policy.text,policyVersion:policy.version,policyHash:policy.hash,quoteExpiresAt:value.expiresAt,paymentAvailable:false};
 }
 async function accessToken(bookingId,commandId,id){return mac(['C1-selfservice-private-link-v1',origin,bookingId,commandId],id);}
 async function replay(input){
  identifier(input.commandId);const r=await s('SELECT g.*,b.reference,b.state,x.token_key_id FROM consultation_guest_intakes g JOIN consultation_bookings b ON b.id=g.booking_id JOIN consultation_selfservice_bookings x ON x.booking_id=b.id WHERE g.command_id=?',[input.commandId]).first();if(!r)return null;
  if(r.fingerprint!==await guest.submissionFingerprint(input,input.acceptance,r.token_key_id))fail();
  return {reference:r.reference,state:r.state,privateUrl:origin+'/customer.html#offer='+await accessToken(r.booking_id,input.commandId,r.token_key_id),paymentAvailable:false,duplicate:true};
 }
 async function checkout(input,{replayOnly=false}={}){
  if(!input||Object.keys(input).some(k=>!['commandId','intake','contact','preferredStart','acceptance'].includes(k)))fail();
  const prior=await replay(input);if(prior)return prior;
  if(replayOnly)fail();
  const a=input.acceptance,q=a?.quote,v=q?.value;
  if(a?.accepted!==true||!v||typeof q.signature!=='string'||!/^[a-f0-9]{64}$/.test(q.signature)||typeof v.keyId!=='string')fail();
  if(!await crypto.subtle.verify('HMAC',await keys.lookup.provider(v.keyId),unhex(q.signature),encoder.encode(JSON.stringify(v))))fail();
  // Leave query headroom for redemption and immutable breakdown validation.
  await expire(1);const time=await now(),policy=config.policies.booking,{p,promotion,price}=await pricing(time);
  if(v.purpose!=='C1-selfservice-quote-v1'||v.origin!==origin||v.productId!==config.productId||v.practitionerId!==config.practitionerId||v.startAt!==input.preferredStart||v.issuedAt>time||v.expiresAt<=time||v.policyHash!==policy.hash||v.policyVersion!==policy.version||Object.keys(price).some(k=>price[k]!==v[k]))fail();
  const d=await discount(v.discountId,time,price);if(v.finalPriceSen!==(d?.final_price_sen??price.sellingPriceSen)||v.expiresAt!==Math.min(v.issuedAt+300000,d?.expires_at??Infinity))fail();
  const payload={commandId:input.commandId,intake:input.intake,contact:input.contact,preferredStart:input.preferredStart};
  const prepared=await guest.prepareSubmission(payload,a);if(prepared.duplicate)fail();
  const {id,customerId,reference,start}=prepared,offerId=crypto.randomUUID();
  const offer=await issueOffer({id:offerId,bookingId:id,customerId,practitionerId:config.practitionerId,startAt:start,issuedAt:time,policyVersion:policy.version,policyHash:policy.hash,promotion,finalPriceSen:v.finalPriceSen});
  acceptOffer(offer,{now:time,customerId,acknowledged:true,policyHash:policy.hash,snapshotHash:offer.snapshotHash});
  const guard=pricingGuard(p,config.productId),token=await accessToken(id,input.commandId,keyId);
  const plan=[...prepared.plan,
   s(`INSERT INTO consultation_offers(id,booking_id,revision,state,practitioner_id,start_at,end_at,issued_at,expires_at,regular_price_sen,selling_price_sen,currency,promotion_id,promotion_version,policy_version,policy_hash,snapshot_hash,issued_by,accepted_at,acceptance_customer_id,acceptance_policy_hash,acceptance_snapshot_hash) SELECT ?,?,1,'Accepted',?,?,?,?,?,?,?,?,?,?,?,?,?,'C1-selfservice',?,?,?,? WHERE ${guard.sql} AND ?>=${DB_NOW}+259200000 AND ${DB_NOW}<? AND ${DB_NOW}>=?`,[offerId,id,config.practitionerId,start,offer.endAt,time,offer.expiresAt,offer.regularPriceSen,offer.sellingPriceSen,offer.currency,offer.promotionId,offer.promotionVersion,policy.version,policy.hash,offer.snapshotHash,time,customerId,policy.hash,offer.snapshotHash,...guard.values,start,v.expiresAt,v.issuedAt]),
   s(`INSERT INTO consultation_workflow_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'Accepted','Customer',?,${DB_NOW})`,[crypto.randomUUID(),id,id]),
   s('INSERT INTO consultation_slot_reservations VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),id,offerId,config.practitionerId,start,offer.endAt,'Held',offer.expiresAt]),
   s(`UPDATE consultation_bookings SET state='PaymentPending',current_offer_id=?,practitioner_id=?,current_start_at=?,current_end_at=?,row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND state='Submitted'`,[offerId,config.practitionerId,start,offer.endAt,id]),
   s(`INSERT INTO consultation_guest_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,'Accepted',?,${DB_NOW})`,[crypto.randomUUID(),id,id]),
   s('INSERT INTO consultation_guest_offer_links VALUES(?,?,?,?,?)',[offerId,await tokenHash(token),offer.expiresAt,'C1-selfservice',time]),
   s('INSERT INTO consultation_selfservice_bookings VALUES(?,?,?,?)',[id,offerId,keyId,time]),
   ...(d?[s(`UPDATE consultation_discount_codes SET redeemed_booking_id=?,redeemed_at=${DB_NOW} WHERE id=? AND product_id=? AND final_price_sen=? AND revoked_at IS NULL AND redeemed_at IS NULL AND created_at<=${DB_NOW} AND expires_at>${DB_NOW}`,[id,d.id,config.productId,v.finalPriceSen])]:[]),
   // The mandatory consistency trigger rejects a zero-row redemption and rolls
   // back the entire batch. No separate assertion writes are needed.
   s('INSERT INTO consultation_offer_prices VALUES(?,?,?,?,?,?)',[offerId,price.regularPriceSen,price.sellingPriceSen,d?.id??null,d?.description??null,v.finalPriceSen])];
  try{await db.batch(plan);}catch(error){const raced=await replay(input);if(raced)return raced;throw error;}
  return {reference,state:'PaymentPending',privateUrl:origin+'/customer.html#offer='+token,price:offer.sellingPriceSen,currency:'MYR',paymentAvailable:false};
 }
 return Object.freeze({quote,checkout,expire,invitation});
}
