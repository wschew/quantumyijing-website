import {requireAffiliate} from '../auth/_auth.js';

export async function onRequestGet({request,env}){
  const auth=await requireAffiliate(request,env);
  if(auth.error) return auth.error;

  const {db,affiliate:a}=auth;

  const summary=await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN o.payment_status='Paid' AND ac.status NOT IN ('Reversed','Cancelled')
        THEN ac.gross_sale ELSE 0 END),0) total_sales,
      COALESCE(SUM(CASE WHEN ac.status NOT IN ('Reversed','Cancelled')
        THEN ac.commission_amount ELSE 0 END),0) commission_earned,
      COALESCE(SUM(CASE WHEN ac.status IN ('Pending','Approved','Payable')
        THEN ac.commission_amount ELSE 0 END),0) commission_pending,
      COALESCE(SUM(CASE WHEN ac.status='Paid'
        THEN ac.commission_amount ELSE 0 END),0) commission_paid
    FROM affiliate_commissions ac
    LEFT JOIN orders o ON o.id=ac.order_id
    WHERE ac.affiliate_id=?
  `).bind(a.affiliate_id).first();

  return Response.json({
    affiliate:{
      id:a.affiliate_id,
      affiliate_code:a.affiliate_code,
      full_name:a.full_name,
      display_name:a.display_name,
      email:a.email,
      phone:a.phone,
      country:a.country,
      status:a.status,
      membership_started_at:a.membership_started_at,
      membership_expires_at:a.membership_expires_at,
      renewal_status:a.renewal_status
    },
    summary
  },{
    headers:{'cache-control':'no-store'}
  });
}
