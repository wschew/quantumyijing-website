import {requireAffiliate} from '../auth/_auth.js';

export async function onRequestGet({request,env}){
  const auth=await requireAffiliate(request,env);
  if(auth.error) return auth.error;

  const {db,affiliate:a}=auth;

  const rows=await db.prepare(`
    SELECT ac.id,ac.created_at,ac.order_reference,ac.customer_name,
           ac.product_name,ac.gross_sale,ac.currency,
           ac.commission_rate,ac.commission_amount,
           ac.status,ac.paid_at
    FROM affiliate_commissions ac
    WHERE ac.affiliate_id=?
    ORDER BY ac.id DESC
    LIMIT 500
  `).bind(a.affiliate_id).all();

  const payouts=await db.prepare(`
    SELECT id,payout_reference,payout_period,currency,total_sales,
           total_commission,status,payment_reference,payment_date,
           statement_number
    FROM affiliate_payouts
    WHERE affiliate_id=?
    ORDER BY id DESC
    LIMIT 100
  `).bind(a.affiliate_id).all();

  return Response.json({
    commissions:rows.results||[],
    payouts:payouts.results||[]
  },{
    headers:{'cache-control':'no-store'}
  });
}
