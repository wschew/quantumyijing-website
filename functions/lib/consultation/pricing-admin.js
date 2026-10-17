import {DB_NOW,createWorkflowGuards} from './workflow-guards.js';
import {priceAt,mytDate} from './foundation.js';
import {randomSecret,tokenHash} from './auth-crypto.js';
const fail=()=>{throw Error('Pricing operation rejected');};
export async function currentPricing(db,productId,time){
 const rows=(await db.prepare("SELECT * FROM consultation_promotions WHERE product_id=? AND state='Active' AND approved_at<=? AND starts_on<=? AND ends_on>=? LIMIT 2").bind(productId,time,mytDate(time),mytDate(time)).all()).results;
 if(rows.length>1)fail();const p=rows[0];
 const promotion=p?{id:p.id,version:p.version,state:p.state,approvedBy:p.approved_by,approvedAt:p.approved_at,sku:'CONSULT-BAZI',currency:p.currency,timezone:p.timezone,sellingPriceSen:p.selling_price_sen,startsOn:p.starts_on,endsOn:p.ends_on}:null;
 return {p,promotion,price:priceAt({issuedAt:time,promotion})};
}
export function pricingGuard(p,productId){
 const day="date('now','+8 hours')";
 if(!p)return {sql:`NOT EXISTS(SELECT 1 FROM consultation_promotions WHERE product_id=? AND state='Active' AND approved_at<=${DB_NOW} AND starts_on<=${day} AND ends_on>=${day})`,values:[productId]};
 return {sql:`EXISTS(SELECT 1 FROM consultation_promotions WHERE id=? AND product_id=? AND version=? AND state='Active' AND selling_price_sen=? AND currency='MYR' AND timezone='Asia/Kuala_Lumpur' AND starts_on=? AND ends_on=? AND approved_by=? AND approved_at=? AND approved_at<=${DB_NOW} AND starts_on<=${day} AND ends_on>=${day}) AND (SELECT COUNT(*) FROM consultation_promotions WHERE product_id=? AND state='Active' AND approved_at<=${DB_NOW} AND starts_on<=${day} AND ends_on>=${day})=1`,values:[p.id,productId,p.version,p.selling_price_sen,p.starts_on,p.ends_on,p.approved_by,p.approved_at,productId]};
}
export function invitationPriceMatches(row,price){return row.base_price_sen===price.sellingPriceSen&&row.promotion_id===price.promotionId&&row.promotion_version===price.promotionVersion;}
export function createPricingAdmin({db,origin,config}){
 const guards=createWorkflowGuards({db,origin}),s=(q,v=[])=>db.prepare(q).bind(...v);
 const now=async()=>(await s(`SELECT ${DB_NOW} n`).first()).n;
 const exact=(input,allowed)=>{if(!input||typeof input!=='object'||Object.keys(input).some(k=>!allowed.includes(k)))fail();};
 const amount=n=>{if(!Number.isSafeInteger(n)||n<=0||n>130000)fail();};
 const day=d=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)fail();};
 function audit(action,id,a){return s(`INSERT INTO consultation_pricing_events SELECT CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,${DB_NOW}`,[crypto.randomUUID(),action,id,a.principal.sessionId]);}
 async function list(request){const a=await guards.qy(request),time=await now(),{price}=await currentPricing(db,config.productId,time);return {currentPrice:price,pricingAsOf:time,promotions:(await s(`SELECT id,version,currency,selling_price_sen,starts_on,ends_on,state,approved_by,approved_at FROM consultation_promotions WHERE product_id=? AND EXISTS(${a.sql}) ORDER BY version DESC LIMIT 100`,[config.productId,...a.values]).all()).results,discounts:(await s(`SELECT id,description,final_price_sen,expires_at,revoked_at,redeemed_at FROM consultation_discount_codes WHERE product_id=? AND EXISTS(${a.sql}) ORDER BY created_at DESC LIMIT 100`,[config.productId,...a.values]).all()).results,invitations:(await s(`SELECT d.id,d.description,d.final_price_sen,d.expires_at,d.revoked_at,d.redeemed_at,i.base_price_sen,i.promotion_id,i.promotion_version FROM consultation_discount_codes d JOIN consultation_price_invitations i ON i.discount_id=d.id WHERE d.product_id=? AND EXISTS(${a.sql}) ORDER BY d.created_at DESC LIMIT 100`,[config.productId,...a.values]).all()).results.map(r=>({...r,stale:!invitationPriceMatches(r,price)}))};}
 async function promotion(request,input){
  exact(input,['action','id','priceSen','startsOn','endsOn','currency','approved']);const a=await guards.qy(request,true),time=await now();
  if(input.action==='draft'){
   amount(input.priceSen);day(input.startsOn);day(input.endsOn);if(input.currency!=='MYR'||input.startsOn<mytDate(time)||input.endsOn<input.startsOn)fail();const id=crypto.randomUUID();
   await db.batch([s(`INSERT INTO consultation_promotions SELECT ?,?,COALESCE(MAX(version),0)+1,'MYR',?,?,?,'Asia/Kuala_Lumpur','Draft',NULL,NULL FROM consultation_promotions WHERE product_id=? HAVING EXISTS(${a.sql})`,[id,config.productId,input.priceSen,input.startsOn,input.endsOn,config.productId,...a.values]),audit('PromotionDraft',id,a)]);return {id};
  }
  if(typeof input.id!=='string'||input.id.length>128)fail();
  if(input.action==='activate'&&input.approved===true){await db.batch([s(`UPDATE consultation_promotions SET state='Active',approved_by=?,approved_at=${DB_NOW} WHERE id=? AND product_id=? AND state='Draft' AND starts_on>=date('now','+8 hours') AND EXISTS(${a.sql})`,[a.principal.sessionId,input.id,config.productId,...a.values]),audit('PromotionApproved',input.id,a)]);return {};}
  if(input.action==='revoke'){await db.batch([s(`UPDATE consultation_promotions SET state='Revoked' WHERE id=? AND product_id=? AND state IN ('Draft','Active') AND EXISTS(${a.sql})`,[input.id,config.productId,...a.values]),audit('PromotionRevoked',input.id,a)]);return {};}
  fail();
 }
 async function discount(request,input,isInvitation=false){
  exact(input,['action','id','finalPriceSen','description','expiresAt']);const a=await guards.qy(request,true),time=await now();
  if(input.action==='issue'){
   const description=input.description??'';
   amount(input.finalPriceSen);if(typeof description!=='string'||description.length>160||/[\x00-\x1f\x7f]/.test(description)||!Number.isSafeInteger(input.expiresAt)||!Number.isFinite(new Date(input.expiresAt).getTime())||input.expiresAt<=time)fail();
   const {p,price}=await currentPricing(db,config.productId,time);if(input.finalPriceSen>price.sellingPriceSen)fail();
   const code=randomSecret(),id=crypto.randomUUID(),hash=await tokenHash(code);
   // The current base price is checked again inside the write transaction.
   const base=`COALESCE((SELECT selling_price_sen FROM consultation_promotions WHERE product_id=? AND state='Active' AND approved_at<=${DB_NOW} AND starts_on<=date('now','+8 hours') AND ends_on>=date('now','+8 hours')),130000)`;
   const guard=pricingGuard(p,config.productId);
   await db.batch([s(`INSERT INTO consultation_discount_codes(id,product_id,verifier,description,final_price_sen,created_at,expires_at,issued_by) SELECT ?,?,?,?,?,${DB_NOW},?,? WHERE ?>${DB_NOW} AND ?<=${base} AND EXISTS(${a.sql}) ${isInvitation?'AND '+guard.sql:''}`,[id,config.productId,hash,description,input.finalPriceSen,input.expiresAt,a.principal.sessionId,input.expiresAt,input.finalPriceSen,config.productId,...a.values,...(isInvitation?guard.values:[])]),audit('DiscountIssued',id,a),...(isInvitation?[s('INSERT INTO consultation_price_invitations VALUES(?,?,?,?)',[id,price.sellingPriceSen,price.promotionId,price.promotionVersion])]:[])]);return isInvitation?{id,url:origin+'/customer.html#invitation='+code,expiresAt:input.expiresAt}:{id,code};
  }
  if(input.action==='revoke'&&typeof input.id==='string'&&input.id.length<=128){await db.batch([s(`UPDATE consultation_discount_codes SET revoked_at=${DB_NOW} WHERE id=? AND product_id=? AND revoked_at IS NULL AND redeemed_at IS NULL ${isInvitation?'AND EXISTS(SELECT 1 FROM consultation_price_invitations i WHERE i.discount_id=consultation_discount_codes.id)':''} AND EXISTS(${a.sql})`,[input.id,config.productId,...a.values]),audit('DiscountRevoked',input.id,a)]);return {};}
  fail();
 }
 async function invitation(request,input){
  return discount(request,input,true);
 }
 return {list,promotion,discount,invitation};
}
