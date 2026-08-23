
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);

const ELIGIBLE_PAYMENT_JOIN = `
 JOIN payments py ON py.id=(
   SELECT p2.id FROM payments p2
   WHERE p2.order_id=ac.order_id
   ORDER BY p2.id DESC LIMIT 1
 )
 JOIN orders o ON o.id=ac.order_id
 LEFT JOIN products pr ON pr.id=ac.product_id
`;

const ELIGIBLE_PAYMENT_WHERE = `
 py.status='Paid'
 AND py.verification_status='Verified'
 AND COALESCE(py.accounting_eligible,0)=1
 AND o.payment_status='Paid'
 AND (
   lower(COALESCE(pr.product_type,'')) NOT IN ('course','live course','live_course')
   OR COALESCE(NULLIF(pr.starts_on,''),'')=''
   OR date(pr.starts_on) <= date('now')
 )
`;

const ELIGIBILITY_DATE = `
CASE
  WHEN lower(COALESCE(pr.product_type,'')) IN ('course','live course','live_course')
       AND COALESCE(NULLIF(pr.starts_on,''),'')<>''
    THEN pr.starts_on
  ELSE COALESCE(
    NULLIF(py.accounting_eligible_at,''),
    NULLIF(py.verified_at,''),
    NULLIF(py.paid_at,''),
    ac.created_at
  )
END
`;

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const u=new URL(request.url);
  const affiliateId=Number(u.searchParams.get('affiliate_id')||0);
  const period=clean(u.searchParams.get('period')||'',7);

  if(!affiliateId||!/^\d{4}-\d{2}$/.test(period))
    return Response.json({error:'affiliate_id and period are required.'},{status:400});

  const a=await db.prepare(`
    SELECT id,affiliate_code,full_name,email,bank_name,bank_account_name,bank_account_number
    FROM affiliates WHERE id=? LIMIT 1
  `).bind(affiliateId).first();

  if(!a) return Response.json({error:'Affiliate not found.'},{status:404});

  const rows=await db.prepare(`
    SELECT
      ac.id,ac.order_id,ac.product_id,ac.order_reference,ac.customer_name,ac.product_name,
      ac.gross_sale,ac.currency,ac.commission_rate,ac.commission_amount,ac.status,ac.created_at,
      py.id AS payment_id,
      py.accounting_eligible_at,
      py.verified_at,
      py.paid_at,
      ${ELIGIBILITY_DATE} AS eligibility_date
    FROM affiliate_commissions ac
    ${ELIGIBLE_PAYMENT_JOIN}
    LEFT JOIN affiliate_payout_items api ON api.commission_id=ac.id
    WHERE ac.affiliate_id=?
      AND substr(${ELIGIBILITY_DATE},1,7)=?
      AND ac.status IN ('Approved','Payable')
      AND api.id IS NULL
      AND ${ELIGIBLE_PAYMENT_WHERE}
    ORDER BY eligibility_date,ac.id
  `).bind(affiliateId,period).all();

  const items=rows.results||[];
  const total_sales=items.reduce((s,x)=>s+Number(x.gross_sale||0),0);
  const total_commission=items.reduce((s,x)=>s+Number(x.commission_amount||0),0);

  const blocked=await db.prepare(`
    SELECT COUNT(*) AS count
    FROM affiliate_commissions ac
    LEFT JOIN affiliate_payout_items api ON api.commission_id=ac.id
    LEFT JOIN payments py ON py.id=(
      SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1
    )
    LEFT JOIN orders o ON o.id=ac.order_id
    WHERE ac.affiliate_id=?
      AND substr(COALESCE(NULLIF(py.accounting_eligible_at,''),NULLIF(py.verified_at,''),NULLIF(py.paid_at,''),ac.created_at),1,7)=?
      AND ac.status IN ('Approved','Payable')
      AND api.id IS NULL
      AND NOT(
        COALESCE(py.status,'')='Paid'
        AND COALESCE(py.verification_status,'')='Verified'
        AND COALESCE(py.accounting_eligible,0)=1
        AND COALESCE(o.payment_status,'')='Paid'
      )
  `).bind(affiliateId,period).first();

  return Response.json({
    affiliate:{
      id:a.id,
      affiliate_code:a.affiliate_code,
      full_name:a.full_name,
      email:a.email,
      bank_name:a.bank_name||'',
      bank_account_name:a.bank_account_name||a.full_name||'',
      bank_account_last4:String(a.bank_account_number||'').slice(-4)
    },
    period,
    items,
    summary:{
      eligible_sales_count:items.length,
      blocked_count:Number(blocked?.count||0),
      total_sales,
      total_commission,
      currency:items[0]?.currency||'MYR'
    },
    accounting_rule:'Paid + Verified + Accounting Eligible = YES'
  },{headers:{'cache-control':'no-store'}});
}
