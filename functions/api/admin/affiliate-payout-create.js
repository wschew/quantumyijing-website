function tok(req){
  const h=req.headers.get('authorization')||'';
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});

  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  try{
    const b=await request.json().catch(()=>({}));
    const affiliateId=Number(b.affiliate_id||0);
    const period=clean(b.payout_period,7);

    if(!affiliateId || !/^\d{4}-\d{2}$/.test(period)){
      return Response.json(
        {error:'affiliate_id and payout_period are required.'},
        {status:400}
      );
    }

    const affiliate=await db.prepare(`
      SELECT
        id,
        affiliate_code,
        full_name,
        bank_name,
        bank_account_name,
        bank_account_number
      FROM affiliates
      WHERE id=?
    `).bind(affiliateId).first();

    if(!affiliate){
      return Response.json({error:'Affiliate not found.'},{status:404});
    }

    const rows=await db.prepare(`
      SELECT
        ac.id,
        ac.gross_sale,
        ac.commission_amount,
        ac.currency
      FROM affiliate_commissions ac
      LEFT JOIN affiliate_payout_items api
        ON api.commission_id=ac.id
      WHERE ac.affiliate_id=?
        AND substr(ac.created_at,1,7)=?
        AND ac.status IN ('Approved','Payable')
        AND api.id IS NULL
      ORDER BY ac.id
    `).bind(affiliateId,period).all();

    const items=rows.results||[];

    if(!items.length){
      return Response.json(
        {error:'No eligible commissions for this period.'},
        {status:409}
      );
    }

    const currency=items[0]?.currency||'MYR';
    const totalSales=items.reduce(
      (sum,item)=>sum+Number(item.gross_sale||0),0
    );
    const totalCommission=items.reduce(
      (sum,item)=>sum+Number(item.commission_amount||0),0
    );

    const payoutReference=
      `AFFPAY-${period.replace('-','')}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;

    const bankLast4=
      String(affiliate.bank_account_number||'').slice(-4);

    // D1 does not support SQL BEGIN/COMMIT from the Worker API.
    // Create the payout header first, obtain its generated ID,
    // then use db.batch() for the dependent writes.
    const insertResult=await db.prepare(`
      INSERT INTO affiliate_payouts (
        payout_reference,
        affiliate_id,
        payout_period,
        currency,
        eligible_sales_count,
        total_sales,
        total_commission,
        status,
        bank_name,
        bank_account_name,
        bank_account_last4,
        notes
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      payoutReference,
      affiliateId,
      period,
      currency,
      items.length,
      totalSales,
      totalCommission,
      'Draft',
      clean(affiliate.bank_name,120),
      clean(affiliate.bank_account_name||affiliate.full_name,160),
      bankLast4,
      clean(b.notes,1000)
    ).run();

    const payoutId=Number(insertResult.meta?.last_row_id||0);

    if(!payoutId){
      throw new Error('Unable to obtain new payout ID.');
    }

    const batchStatements=[];

    for(const item of items){
      batchStatements.push(
        db.prepare(`
          INSERT INTO affiliate_payout_items (
            payout_id,
            commission_id
          )
          VALUES (?,?)
        `).bind(payoutId,item.id)
      );

      batchStatements.push(
        db.prepare(`
          UPDATE affiliate_commissions
          SET
            status='Payable',
            payable_at=CASE
              WHEN payable_at='' THEN CURRENT_TIMESTAMP
              ELSE payable_at
            END,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
            AND status IN ('Approved','Payable')
        `).bind(item.id)
      );
    }

    try{
      await db.batch(batchStatements);
    }catch(batchError){
      // The batch itself is atomic. If it fails, remove the payout
      // header that was created before the batch so we do not leave
      // an orphan Draft payout.
      try{
        await db.prepare(`
          DELETE FROM affiliate_payouts
          WHERE id=?
            AND status='Draft'
        `).bind(payoutId).run();
      }catch(cleanupError){
        console.error('affiliate payout cleanup failed',cleanupError);
      }
      throw batchError;
    }

    return Response.json({
      ok:true,
      payout_id:payoutId,
      payout_reference:payoutReference,
      eligible_sales_count:items.length,
      total_sales:totalSales,
      total_commission:totalCommission,
      currency,
      status:'Draft'
    });

  }catch(e){
    console.error('affiliate payout create',e);
    return Response.json(
      {
        error:'Unable to create payout batch.',
        detail:String(e?.message||e)
      },
      {status:500}
    );
  }
}
