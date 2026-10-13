// Read-only frozen finance interfaces plus consultation-only evidence annotations.
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
import {identifier,instant} from './foundation.js';
const rejected=()=>{throw Error('Consultation capture review rejected or conflicted');};
const stmt=(db,sql,values=[])=>db.prepare(sql).bind(...values);
const own=`SELECT 1 FROM orders o JOIN customer_enquiry_links ce ON ce.enquiry_id=o.enquiry_id
 JOIN customers c ON c.id=ce.customer_id WHERE o.id=? AND ce.customer_id=? AND c.status='Active'
 AND o.currency='MYR' AND ABS(o.total*100-?)<0.000001
 AND (SELECT COUNT(*) FROM order_items WHERE order_id=o.id)=1
 AND EXISTS(SELECT 1 FROM order_items WHERE order_id=o.id AND product_id=? AND quantity=1 AND ABS(unit_price*100-?)<0.000001 AND ABS(line_total*100-?)<0.000001)`;
const financiallyVerified=`SELECT 1 FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=? AND p.order_id=?
 AND p.id=(SELECT MAX(id) FROM payments WHERE order_id=o.id) AND o.payment_status='Paid' AND p.status='Paid'
 AND p.verification_status='Verified' AND p.accounting_eligible=1 AND p.currency='MYR' AND ABS(p.amount*100-?)<0.000001`;
export function createCaptureReview({db,origin,keys,readProviderCaptureEvidence=null}){
 const guards=createWorkflowGuards({db,origin});
 async function load(id){identifier(id);const row=await stmt(db,`SELECT b.id,b.customer_id,b.product_id,b.row_version,b.state,o.id offer_id,o.order_id,o.selling_price_sen,o.accepted_at,o.expires_at FROM consultation_bookings b JOIN consultation_offers o ON o.id=b.current_offer_id WHERE b.id=?`,[id]).first();if(!row)rejected();return row;}
 function ownership(row,orderId=row.order_id){return [orderId,row.customer_id,row.selling_price_sen,row.product_id,row.selling_price_sen,row.selling_price_sen];}
 function audit(row,auth,event,id=crypto.randomUUID()){return stmt(db,`INSERT INTO consultation_capture_audit VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,${DB_NOW})`,[id,row.id,event,auth.principal.sessionId]);}
 async function receipt(input){identifier(input.commandId);const fingerprint=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',await keys.lookup.provider(keys.lookup.activeKeyId),new TextEncoder().encode(JSON.stringify(['qy-capture-review-v1',input])))),v=>v.toString(16).padStart(2,'0')).join('');return stmt(db,`INSERT INTO consultation_workflow_commands VALUES(?,?,?,?,${DB_NOW})`,[input.commandId,input.id,keys.lookup.activeKeyId,fingerprint]);}
 function inputOnly(input,names){if(!input||Array.isArray(input)||Object.keys(input).some(k=>!names.includes(k)))rejected();identifier(input.id);identifier(input.commandId);if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)rejected();}
 async function linkOrder(request,input){
  try{
   inputOnly(input,['id','orderId','expectedVersion','commandId']);if(!Number.isSafeInteger(input.orderId)||input.orderId<1)rejected();
   const auth=await guards.qy(request,true),row=await load(input.id);
   if(!['PaymentPending','ExceptionReview'].includes(row.state)||row.row_version!==input.expectedVersion||row.order_id!==null)rejected();
   // Only approved pre-existing finance orders with canonical ownership and the exact product/price.
   await db.batch([stmt(db,`UPDATE consultation_bookings SET row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND row_version=? AND state=? AND EXISTS(${auth.sql}) AND EXISTS(${own})`,[row.id,row.row_version,row.state,...auth.values,...ownership(row,input.orderId)]),audit(row,auth,'OrderLinked'),
    stmt(db,"UPDATE consultation_offers SET order_id=? WHERE id=? AND order_id IS NULL AND state='Accepted'",[input.orderId,row.offer_id]),audit(row,auth,'OrderLinked'),await receipt(input)]);
   return Object.freeze({id:row.id,state:row.state,rowVersion:row.row_version+1});
  }catch{rejected();}
 }
 async function recordFinanceReview(request,input){
  try{
   inputOnly(input,['id','expectedVersion','commandId','capturedAt','supportingEvidenceReference','supportingEvidenceHash','independentlyFinanceVerified']);
   if(input.independentlyFinanceVerified!==true||!Number.isSafeInteger(input.capturedAt)||typeof input.supportingEvidenceHash!=='string'||!/^[a-f0-9]{64}$/.test(input.supportingEvidenceHash))rejected();
   instant(input.capturedAt);identifier(input.supportingEvidenceReference);
   const auth=await guards.qy(request,true),row=await load(input.id),payment=await stmt(db,'SELECT MAX(id) id FROM payments WHERE order_id=?',[row.order_id]).first();
   if(!['PaymentPending','ExceptionReview'].includes(row.state)||row.row_version!==input.expectedVersion||!Number.isSafeInteger(row.order_id)||!payment?.id)rejected();
   const auditId=crypto.randomUUID();
   const sequence=(await stmt(db,'SELECT COALESCE(MAX(sequence),0)+1 n FROM consultation_capture_reviews WHERE offer_id=?',[row.offer_id]).first()).n;
   await db.batch([stmt(db,`UPDATE consultation_bookings SET row_version=row_version+1,updated_at=${DB_NOW} WHERE id=? AND row_version=? AND state=? AND EXISTS(${auth.sql}) AND EXISTS(${own}) AND EXISTS(${financiallyVerified}) AND ?<=${DB_NOW}`, [row.id,row.row_version,row.state,...auth.values,...ownership(row),payment.id,row.order_id,row.selling_price_sen,input.capturedAt]),audit(row,auth,'IndependentFinanceReview',auditId),
    stmt(db,`INSERT INTO consultation_capture_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,(SELECT occurred_at FROM consultation_capture_audit WHERE id=?))`,[crypto.randomUUID(),row.id,row.offer_id,row.customer_id,row.order_id,payment.id,sequence,input.capturedAt,input.supportingEvidenceReference,input.supportingEvidenceHash,auth.principal.sessionId,auditId,auditId]),await receipt(input)]);
   // Deliberately no booking confirmation here. A separate authenticated reconciliation is required.
   return Object.freeze({id:row.id,state:row.state,rowVersion:row.row_version+1,reviewRecorded:true});
  }catch{rejected();}
 }
 async function readEvidence({bookingId,offerId,orderId,customerId}){
  const row=await load(bookingId);
  if(row.offer_id!==offerId||row.order_id!==orderId||row.customer_id!==customerId)return null;
  if(!await stmt(db,own,ownership(row)).first())return null;
  const payment=await stmt(db,'SELECT MAX(id) id FROM payments WHERE order_id=?',[orderId]).first();
  if(!payment?.id||!await stmt(db,financiallyVerified,[payment.id,orderId,row.selling_price_sen]).first())return null;
  const now=(await stmt(db,`SELECT ${DB_NOW} n`).first()).n;
  let provider=null;try{if(typeof readProviderCaptureEvidence==='function')provider=await readProviderCaptureEvidence({bookingId,offerId,orderId,customerId});}catch{provider=null;}
  const primary=provider?.authoritative===true&&provider.providerTimestampVerified===true&&provider.source==='ProviderVerified'&&Number.isSafeInteger(provider.capturedAt)&&provider.capturedAt<=now&&provider.bookingId===bookingId&&provider.offerId===offerId&&provider.orderId===orderId&&provider.customerId===customerId&&typeof provider.guardSql==='string'&&provider.guardSql.trim().length>0&&Array.isArray(provider.guardValues);
  const combined=(e,source)=>Object.freeze({...e,source,guardSql:`SELECT 1 WHERE EXISTS(${own}) AND EXISTS(${financiallyVerified}) AND EXISTS(${e.guardSql})`,guardValues:Object.freeze([...ownership(row),payment.id,orderId,row.selling_price_sen,...e.guardValues])});
  // A known authoritative late timestamp is retained; finance cannot override it to become timely.
  if(primary)return combined({...provider,guardValues:[...provider.guardValues]},'ProviderVerified');
  const review=await stmt(db,'SELECT * FROM consultation_capture_reviews WHERE offer_id=? AND payment_id=? ORDER BY sequence DESC LIMIT 1',[offerId,payment.id]).first();
  if(!review)return null;
  const evidence={authoritative:true,verificationStatus:'Verified',bookingId,offerId,orderId,customerId,amountSen:row.selling_price_sen,currency:'MYR',capturedAt:review.captured_at,
   guardSql:`SELECT 1 FROM consultation_capture_reviews r WHERE r.id=? AND r.booking_id=? AND r.offer_id=? AND r.order_id=? AND r.customer_id=? AND r.payment_id=? AND r.sequence=(SELECT MAX(sequence) FROM consultation_capture_reviews WHERE offer_id=r.offer_id AND payment_id=r.payment_id)`,
   guardValues:[review.id,bookingId,offerId,orderId,customerId,payment.id]};
  return combined(evidence,'FinanceVerified');
 }
 return Object.freeze({linkOrder,recordFinanceReview,readEvidence});
}
