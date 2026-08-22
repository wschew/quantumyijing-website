
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
`;

const ELIGIBLE_PAYMENT_WHERE = `
 py.status='Paid'
 AND py.verification_status='Verified'
 AND COALESCE(py.accounting_eligible,0)=1
 AND o.payment_status='Paid'
`;

const ELIGIBILITY_DATE = `
 COALESCE(
   NULLIF(py.accounting_eligible_at,''),
   NULLIF(py.verified_at,''),
   NULLIF(py.paid_at,''),
   ac.created_at
 )
`;

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const b=await request.json().catch(()=>({}));
  const affiliateId=Number(b.affiliate_id||0);
  const period=clean(b.payout_period,7);

  if(!affiliateId||!/^\d{4}-\d{2}$/.test(period))
    return Response.json({error:'affiliate_id and payout_period are required.'},{status:400});

  const a=await db.prepare(`
    SELECT id,affiliate_code,full_name,bank_name,bank_account_name,bank_account_number
    FROM affiliates WHERE id=? LIMIT 1
  `).bind(affiliateId).first();

  if(!a) return Response.json({error:'Affiliate not found.'},{status:404});

  const rows=await db.prepare(`
    SELECT
      ac.id,ac.gross_sale,ac.commission_amount,ac.currency,
      py.id AS payment_id,
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
  if(!items.length)
    return Response.json({error:'No accounting-eligible commissions for this period.'},{status:409});

  const currency=items[0]?.currency||'MYR';
  const totalSales=items.reduce((s,x)=>s+Number(x.gross_sale||0),0);
  const totalCommission=items.reduce((s,x)=>s+Number(x.commission_amount||0),0);
  const payoutReference=`AFFPAY-${period.replace('-','')}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
  const bankLast4=String(a.bank_account_number||'').slice(-4);

  await db.prepare('BEGIN').run();
  try{
    const ins=await db.prepare(`
      INSERT INTO affiliate_payouts(
        payout_reference,affiliate_id,payout_period,currency,
        eligible_sales_count,total_sales,total_commission,status,
        bank_name,bank_account_name,bank_account_last4,notes
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      payoutReference,affiliateId,period,currency,
      items.length,totalSales,totalCommission,'Draft',
      clean(a.bank_name,120),clean(a.bank_account_name||a.full_name,160),
      bankLast4,clean(b.notes,1000)
    ).run();

    const payoutId=Number(ins.meta?.last_row_id||0);
    if(!payoutId) throw new Error('Unable to create payout.');

    for(const item of items){
      await db.prepare(`
        INSERT INTO affiliate_payout_items(payout_id,commission_id)
        VALUES(?,?)
      `).bind(payoutId,item.id).run();

      await db.prepare(`
        UPDATE affiliate_commissions
        SET status='Payable',
            payable_at=CASE WHEN COALESCE(payable_at,'')='' THEN CURRENT_TIMESTAMP ELSE payable_at END,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(item.id).run();
    }

    await db.prepare('COMMIT').run();

    return Response.json({
      ok:true,payout_id:payoutId,payout_reference:payoutReference,
      eligible_sales_count:items.length,total_sales:totalSales,
      total_commission:totalCommission,currency,status:'Draft'
    });
  }catch(e){
    try{await db.prepare('ROLLBACK').run()}catch{}
    console.error(e);
    return Response.json({error:'Unable to create payout batch.'},{status:500});
  }
}
