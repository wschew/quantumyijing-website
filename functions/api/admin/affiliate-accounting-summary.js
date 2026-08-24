function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}

async function affiliateCountryColumn(db){
  try{
    const r=await db.prepare(`PRAGMA table_info(affiliates)`).all();
    const names=new Set((r.results||[]).map(x=>String(x.name||'').toLowerCase()));
    if(names.has('country')) return 'country';
    if(names.has('nationality')) return 'nationality';
  }catch{}
  return '';
}

const ELIGIBILITY_DATE=`COALESCE(NULLIF(py.accounting_eligible_at,''),NULLIF(py.verified_at,''),NULLIF(py.paid_at,''),ac.created_at)`;
const ELIGIBLE=`
  py.status='Paid'
  AND py.verification_status='Verified'
  AND COALESCE(py.accounting_eligible,0)=1
  AND o.payment_status='Paid'
`;

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const liabilityRows=await db.prepare(`
    SELECT ac.id,ac.affiliate_id,ac.currency,ac.commission_amount,
      COALESCE((SELECT SUM(aa.adjustment_amount)
        FROM affiliate_commission_adjustments aa
        WHERE aa.commission_id=ac.id
          AND aa.recovery_mode='PrePayout'
          AND aa.status!='Cancelled'),0) AS pre_adjustment
    FROM affiliate_commissions ac
    JOIN orders o ON o.id=ac.order_id
    JOIN payments py ON py.id=(
      SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1
    )
    LEFT JOIN affiliate_payout_items api ON api.commission_id=ac.id
    LEFT JOIN affiliate_payouts ap ON ap.id=api.payout_id
    WHERE ac.status IN ('Approved','Payable')
      AND ${ELIGIBLE}
      AND COALESCE(ap.status,'') <> 'Paid'
  `).all();
  const liabilityItems=liabilityRows.results||[];
  const liabilityCurrency=liabilityItems[0]?.currency||'MYR';
  const grossLiability=liabilityItems.reduce((sum,x)=>sum+Math.max(Number(x.commission_amount||0),0),0);
  const prePayoutAdjustments=liabilityItems.reduce((sum,x)=>sum+Number(x.pre_adjustment||0),0);
  const positiveLiability=liabilityItems.reduce((sum,x)=>sum+Math.max(Number(x.commission_amount||0)+Number(x.pre_adjustment||0),0),0);
  const carry=await db.prepare(`
    SELECT COALESCE(SUM(
      aa.adjustment_amount-COALESCE((
        SELECT SUM(pa.applied_amount)
        FROM affiliate_payout_adjustments pa
        JOIN affiliate_payouts ap2 ON ap2.id=pa.payout_id
        WHERE pa.adjustment_id=aa.id AND ap2.status IN ('Draft','Approved','Paid')
      ),0)
    ),0) AS amount
    FROM affiliate_commission_adjustments aa
    WHERE aa.recovery_mode='CarryForward' AND aa.status='Open'
  `).first();
  const carryForwardBalance=Number(carry?.amount||0);
  const netLiability=Math.max(positiveLiability+carryForwardBalance,0);
  const liability={
    commission_count:liabilityItems.filter(x=>Number(x.commission_amount||0)+Number(x.pre_adjustment||0)>0.005).length,
    gross_amount:grossLiability,
    pre_payout_adjustments:prePayoutAdjustments,
    amount:netLiability,
    currency:liabilityCurrency
  };

  const batches=await db.prepare(`
    SELECT
      COUNT(*) AS total_batches,
      SUM(CASE WHEN status='Draft' THEN 1 ELSE 0 END) AS draft_batches,
      SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) AS approved_batches,
      SUM(CASE WHEN status='Paid' THEN 1 ELSE 0 END) AS paid_batches,
      COALESCE(SUM(CASE WHEN status='Paid' THEN total_commission ELSE 0 END),0) AS paid_total,
      COALESCE(MAX(currency),'MYR') AS currency
    FROM affiliate_payouts
  `).first();

  const monthly=await db.prepare(`
    SELECT payout_period,
      COUNT(*) AS batches,
      COALESCE(SUM(total_sales),0) AS total_sales,
      COALESCE(SUM(total_commission),0) AS total_commission,
      COALESCE(SUM(CASE WHEN status='Paid' THEN total_commission ELSE 0 END),0) AS paid_commission,
      COALESCE(SUM(CASE WHEN status IN ('Draft','Approved') THEN total_commission ELSE 0 END),0) AS open_commission,
      COALESCE(MAX(currency),'MYR') AS currency
    FROM affiliate_payouts
    GROUP BY payout_period
    ORDER BY payout_period DESC
    LIMIT 18
  `).all();

  const paid=await db.prepare(`
    SELECT ap.id,ap.payout_reference,ap.payout_period,ap.currency,ap.total_sales,ap.total_commission,
           ap.payment_date,ap.payment_reference,a.affiliate_code,a.full_name,a.email
    FROM affiliate_payouts ap
    JOIN affiliates a ON a.id=ap.affiliate_id
    WHERE ap.status='Paid'
    ORDER BY COALESCE(ap.payment_date,ap.updated_at) DESC,ap.id DESC
    LIMIT 100
  `).all();

  const channels=await db.prepare(`
    SELECT COALESCE(NULLIF(o.sales_channel,''),'Unknown') AS sales_channel,
      COUNT(*) AS commission_count,
      COALESCE(SUM(ac.gross_sale),0) AS total_sales,
      COALESCE(SUM(ac.commission_amount),0) AS total_commission,
      COALESCE(MAX(ac.currency),'MYR') AS currency
    FROM affiliate_commissions ac
    JOIN orders o ON o.id=ac.order_id
    JOIN payments py ON py.id=(
      SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1
    )
    WHERE ac.status IN ('Approved','Payable','Paid')
      AND ${ELIGIBLE}
    GROUP BY COALESCE(NULLIF(o.sales_channel,''),'Unknown')
    ORDER BY total_commission DESC, sales_channel
  `).all();

  const ledger=await db.prepare(`
    SELECT
      ac.id,ac.created_at,ac.order_reference,ac.customer_name,ac.product_name,
      ac.gross_sale,ac.currency,ac.commission_rate,ac.commission_amount,
      ac.status AS commission_status,
      a.affiliate_code,a.full_name,a.email,
      ${ELIGIBILITY_DATE} AS eligibility_date,
      ap.payout_reference,ap.payout_period,ap.status AS payout_status,
      ap.payment_date,ap.payment_reference
    FROM affiliate_commissions ac
    JOIN affiliates a ON a.id=ac.affiliate_id
    JOIN orders o ON o.id=ac.order_id
    JOIN payments py ON py.id=(
      SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1
    )
    LEFT JOIN affiliate_payout_items api ON api.commission_id=ac.id
    LEFT JOIN affiliate_payouts ap ON ap.id=api.payout_id
    WHERE ac.status IN ('Approved','Payable','Paid')
      AND ${ELIGIBLE}
    ORDER BY ${ELIGIBILITY_DATE} DESC,ac.id DESC
    LIMIT 250
  `).all();

  const countryCol=await affiliateCountryColumn(db);
  let countries=[];
  if(countryCol){
    const sql=`
      SELECT COALESCE(NULLIF(a.${countryCol},''),'Unknown') AS country,
        COUNT(*) AS payout_count,
        COALESCE(SUM(ap.total_sales),0) AS total_sales,
        COALESCE(SUM(ap.total_commission),0) AS total_commission,
        COALESCE(SUM(CASE WHEN ap.status='Paid' THEN ap.total_commission ELSE 0 END),0) AS paid_commission,
        COALESCE(MAX(ap.currency),'MYR') AS currency
      FROM affiliate_payouts ap
      JOIN affiliates a ON a.id=ap.affiliate_id
      GROUP BY COALESCE(NULLIF(a.${countryCol},''),'Unknown')
      ORDER BY total_commission DESC, country
    `;
    try{countries=(await db.prepare(sql).all()).results||[]}catch{countries=[]}
  }

  return Response.json({
    liability:{
      commission_count:Number(liability?.commission_count||0),
      gross_amount:Number(liability?.gross_amount||0),
      pre_payout_adjustments:Number(liability?.pre_payout_adjustments||0),
      amount:Number(liability?.amount||0),
      currency:liability?.currency||'MYR'
    },
    batches:{
      total:Number(batches?.total_batches||0),draft:Number(batches?.draft_batches||0),
      approved:Number(batches?.approved_batches||0),paid:Number(batches?.paid_batches||0),
      paid_total:Number(batches?.paid_total||0),currency:batches?.currency||'MYR'
    },
    monthly:monthly.results||[],
    paid_history:paid.results||[],
    channels:channels.results||[],
    ledger:ledger.results||[],
    countries,
    country_source:countryCol||null,
    carry_forward_balance:carryForwardBalance,
    accounting_rule:'Paid + Verified + Accounting Eligible = YES'
  },{headers:{'cache-control':'no-store'}});
}
