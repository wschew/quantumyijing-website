function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const u=new URL(request.url), affiliateId=Number(u.searchParams.get('affiliate_id')||0);
  if(!Number.isInteger(affiliateId)||affiliateId<1) return Response.json({error:'Affiliate ID required.'},{status:400});

  const affiliate=await db.prepare(`SELECT id,affiliate_code,full_name,email FROM affiliates WHERE id=? LIMIT 1`).bind(affiliateId).first();
  if(!affiliate) return Response.json({error:'Affiliate not found.'},{status:404});

  const r=await db.prepare(`
    SELECT
      ac.id AS commission_id,
      ac.affiliate_id,
      ac.order_id,
      ac.order_reference,
      ac.customer_name,
      ac.product_name,
      ac.gross_sale,
      ac.commission_rate,
      ac.commission_amount,
      ac.currency,
      ac.status AS commission_status,
      ac.created_at,
      COALESCE((
        SELECT ap.status
        FROM affiliate_payout_items pi
        JOIN affiliate_payouts ap ON ap.id=pi.payout_id
        WHERE pi.commission_id=ac.id
        ORDER BY ap.id DESC LIMIT 1
      ),'') AS payout_status,
      COALESCE((
        SELECT ap.payout_reference
        FROM affiliate_payout_items pi
        JOIN affiliate_payouts ap ON ap.id=pi.payout_id
        WHERE pi.commission_id=ac.id
        ORDER BY ap.id DESC LIMIT 1
      ),'') AS payout_reference,
      COALESCE((
        SELECT ap.payment_date
        FROM affiliate_payout_items pi
        JOIN affiliate_payouts ap ON ap.id=pi.payout_id
        WHERE pi.commission_id=ac.id
        ORDER BY ap.id DESC LIMIT 1
      ),'') AS payment_date,
      COALESCE((
        SELECT SUM(aa.refund_amount)
        FROM affiliate_commission_adjustments aa
        WHERE aa.commission_id=ac.id AND aa.status!='Cancelled'
      ),0) AS refunded_sale,
      COALESCE((
        SELECT SUM(aa.adjustment_amount)
        FROM affiliate_commission_adjustments aa
        WHERE aa.commission_id=ac.id AND aa.status!='Cancelled'
      ),0) AS commission_adjustment
    FROM affiliate_commissions ac
    WHERE ac.affiliate_id=?
    ORDER BY ac.id DESC
    LIMIT 500
  `).bind(affiliateId).all();

  return Response.json({affiliate,commissions:r.results||[]},{headers:{'cache-control':'no-store'}});
}
