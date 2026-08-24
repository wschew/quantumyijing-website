import {requireAffiliate} from '../auth/_auth.js';

const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

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

  const adjustments=await db.prepare(`
    SELECT
      aa.id,aa.created_at,aa.adjustment_type,aa.recovery_mode,
      aa.original_sale_amount,aa.refund_amount,
      aa.original_commission_amount,aa.adjustment_amount,
      aa.currency,aa.effective_date,aa.reference,aa.reason,aa.status,
      ac.order_reference,ac.customer_name,ac.product_name,
      COALESCE((
        SELECT SUM(pa.applied_amount)
        FROM affiliate_payout_adjustments pa
        JOIN affiliate_payouts ap ON ap.id=pa.payout_id
        WHERE pa.adjustment_id=aa.id
          AND ap.status='Paid'
      ),0) AS paid_applied_amount,
      COALESCE((
        SELECT GROUP_CONCAT(ap.payout_reference, ', ')
        FROM affiliate_payout_adjustments pa
        JOIN affiliate_payouts ap ON ap.id=pa.payout_id
        WHERE pa.adjustment_id=aa.id
          AND ap.status='Paid'
      ),'') AS applied_payout_references
    FROM affiliate_commission_adjustments aa
    JOIN affiliate_commissions ac ON ac.id=aa.commission_id
    WHERE aa.affiliate_id=?
      AND aa.status!='Cancelled'
    ORDER BY aa.effective_date DESC,aa.id DESC
    LIMIT 300
  `).bind(a.affiliate_id).all();

  const openCarry=await db.prepare(`
    SELECT
      aa.id,aa.adjustment_amount,
      COALESCE((
        SELECT SUM(pa.applied_amount)
        FROM affiliate_payout_adjustments pa
        JOIN affiliate_payouts ap ON ap.id=pa.payout_id
        WHERE pa.adjustment_id=aa.id
          AND ap.status IN ('Draft','Approved','Paid')
      ),0) AS reserved_amount
    FROM affiliate_commission_adjustments aa
    WHERE aa.affiliate_id=?
      AND aa.recovery_mode='CarryForward'
      AND aa.status='Open'
  `).bind(a.affiliate_id).all();

  const adjustmentRows=adjustments.results||[];
  const totalAdjustments=round2(adjustmentRows.reduce((s,x)=>s+Number(x.adjustment_amount||0),0));
  const carryForwardBalance=round2((openCarry.results||[]).reduce(
    (s,x)=>s+(Number(x.adjustment_amount||0)-Number(x.reserved_amount||0)),0
  ));

  return Response.json({
    commissions:rows.results||[],
    payouts:payouts.results||[],
    adjustments:adjustmentRows,
    adjustment_summary:{
      adjustment_count:adjustmentRows.length,
      total_adjustments:totalAdjustments,
      carry_forward_balance:carryForwardBalance,
      currency:adjustmentRows[0]?.currency||'MYR'
    }
  },{
    headers:{'cache-control':'no-store'}
  });
}
