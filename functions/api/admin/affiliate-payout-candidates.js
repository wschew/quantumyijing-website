function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);
const r2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const ELIGIBLE_PAYMENT_JOIN=` JOIN payments py ON py.id=(SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1) JOIN orders o ON o.id=ac.order_id `;
const ELIGIBLE_PAYMENT_WHERE=` py.status='Paid' AND py.verification_status='Verified' AND COALESCE(py.accounting_eligible,0)=1 AND o.payment_status='Paid' `;
const ELIGIBILITY_DATE=` COALESCE(NULLIF(py.accounting_eligible_at,''),NULLIF(py.verified_at,''),NULLIF(py.paid_at,''),ac.created_at) `;

async function carryBalance(db,affiliateId){
  const r=await db.prepare(`
    SELECT aa.id,aa.adjustment_amount,
      COALESCE((SELECT SUM(pa.applied_amount) FROM affiliate_payout_adjustments pa JOIN affiliate_payouts ap ON ap.id=pa.payout_id WHERE pa.adjustment_id=aa.id AND ap.status IN ('Draft','Approved','Paid')),0) reserved
    FROM affiliate_commission_adjustments aa
    WHERE aa.affiliate_id=? AND aa.recovery_mode='CarryForward' AND aa.status='Open'
    ORDER BY aa.effective_date,aa.id`).bind(affiliateId).all();
  return r2((r.results||[]).reduce((s,x)=>s+(Number(x.adjustment_amount||0)-Number(x.reserved||0)),0));
}

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const u=new URL(request.url),affiliateId=Number(u.searchParams.get('affiliate_id')||0),period=clean(u.searchParams.get('period')||'',7);
  if(!affiliateId||!/^\d{4}-\d{2}$/.test(period)) return Response.json({error:'affiliate_id and period are required.'},{status:400});
  const a=await db.prepare(`SELECT id,affiliate_code,full_name,email,bank_name,bank_account_name,bank_account_number FROM affiliates WHERE id=? LIMIT 1`).bind(affiliateId).first();
  if(!a) return Response.json({error:'Affiliate not found.'},{status:404});

  const rows=await db.prepare(`
    SELECT ac.id,ac.order_id,ac.product_id,ac.order_reference,ac.customer_name,ac.product_name,
      ac.gross_sale,ac.currency,ac.commission_rate,ac.commission_amount,ac.status,ac.created_at,
      py.id payment_id,py.accounting_eligible_at,py.verified_at,py.paid_at,${ELIGIBILITY_DATE} eligibility_date,
      COALESCE((SELECT SUM(aa.adjustment_amount) FROM affiliate_commission_adjustments aa WHERE aa.commission_id=ac.id AND aa.recovery_mode='PrePayout' AND aa.status!='Cancelled'),0) AS pre_payout_adjustment
    FROM affiliate_commissions ac ${ELIGIBLE_PAYMENT_JOIN}
    LEFT JOIN affiliate_payout_items api ON api.commission_id=ac.id
    WHERE ac.affiliate_id=? AND substr(${ELIGIBILITY_DATE},1,7)=?
      AND ac.status IN ('Approved','Payable') AND api.id IS NULL AND ${ELIGIBLE_PAYMENT_WHERE}
    ORDER BY eligibility_date,ac.id`).bind(affiliateId,period).all();

  const items=(rows.results||[]).map(x=>({...x,net_commission_amount:r2(Math.max(Number(x.commission_amount||0)+Number(x.pre_payout_adjustment||0),0))})).filter(x=>x.net_commission_amount>0.005);
  const total_sales=r2(items.reduce((s,x)=>s+Number(x.gross_sale||0),0));
  const original_commission=r2(items.reduce((s,x)=>s+Number(x.commission_amount||0),0));
  const pre_adjustment=r2(items.reduce((s,x)=>s+Number(x.pre_payout_adjustment||0),0));
  const item_net=r2(items.reduce((s,x)=>s+Number(x.net_commission_amount||0),0));
  const carry=await carryBalance(db,affiliateId);
  const carry_applied=r2(Math.max(carry,-item_net));
  const net_payout=r2(Math.max(item_net+carry_applied,0));

  const blocked=await db.prepare(`SELECT COUNT(*) count FROM affiliate_commissions ac LEFT JOIN affiliate_payout_items api ON api.commission_id=ac.id LEFT JOIN payments py ON py.id=(SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1) LEFT JOIN orders o ON o.id=ac.order_id WHERE ac.affiliate_id=? AND substr(COALESCE(NULLIF(py.accounting_eligible_at,''),NULLIF(py.verified_at,''),NULLIF(py.paid_at,''),ac.created_at),1,7)=? AND ac.status IN ('Approved','Payable') AND api.id IS NULL AND NOT(COALESCE(py.status,'')='Paid' AND COALESCE(py.verification_status,'')='Verified' AND COALESCE(py.accounting_eligible,0)=1 AND COALESCE(o.payment_status,'')='Paid')`).bind(affiliateId,period).first();
  const fullyReversed=await db.prepare(`SELECT COUNT(*) count FROM affiliate_commissions ac ${ELIGIBLE_PAYMENT_JOIN} LEFT JOIN affiliate_payout_items api ON api.commission_id=ac.id WHERE ac.affiliate_id=? AND substr(${ELIGIBILITY_DATE},1,7)=? AND ac.status IN ('Approved','Payable') AND api.id IS NULL AND ${ELIGIBLE_PAYMENT_WHERE} AND (ac.commission_amount+COALESCE((SELECT SUM(aa.adjustment_amount) FROM affiliate_commission_adjustments aa WHERE aa.commission_id=ac.id AND aa.recovery_mode='PrePayout' AND aa.status!='Cancelled'),0))<=0.005`).bind(affiliateId,period).first();

  return Response.json({affiliate:{id:a.id,affiliate_code:a.affiliate_code,full_name:a.full_name,email:a.email,bank_name:a.bank_name,bank_account_name:a.bank_account_name,bank_account_last4:String(a.bank_account_number||'').slice(-4)},items,summary:{eligible_sales_count:items.length,total_sales,original_commission,pre_payout_adjustment:pre_adjustment,carry_forward_balance:carry,carry_forward_applied:carry_applied,total_commission:net_payout,currency:items[0]?.currency||'MYR',blocked_count:Number(blocked?.count||0),fully_reversed_count:Number(fullyReversed?.count||0)}},{headers:{'cache-control':'no-store'}});
}
