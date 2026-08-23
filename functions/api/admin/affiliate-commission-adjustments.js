function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

async function carryForwardRows(db,affiliateId=0){
  const where=affiliateId?'WHERE aa.affiliate_id=? AND aa.recovery_mode=\'CarryForward\' AND aa.status=\'Open\'':'WHERE aa.recovery_mode=\'CarryForward\' AND aa.status=\'Open\'';
  const sql=`
    SELECT aa.*,
      COALESCE((
        SELECT SUM(pa.applied_amount)
        FROM affiliate_payout_adjustments pa
        JOIN affiliate_payouts ap ON ap.id=pa.payout_id
        WHERE pa.adjustment_id=aa.id
          AND ap.status IN ('Draft','Approved','Paid')
      ),0) AS reserved_amount
    FROM affiliate_commission_adjustments aa
    ${where}
    ORDER BY aa.effective_date,aa.id`;
  const r=affiliateId?await db.prepare(sql).bind(affiliateId).all():await db.prepare(sql).all();
  return (r.results||[]).map(x=>({...x,remaining_amount:round2(Number(x.adjustment_amount||0)-Number(x.reserved_amount||0))}));
}

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const u=new URL(request.url), affiliateId=Number(u.searchParams.get('affiliate_id')||0);

  const rows=await db.prepare(`
    SELECT aa.*,a.affiliate_code,a.full_name,
      ac.order_reference,ac.customer_name,ac.product_name,
      COALESCE((SELECT SUM(pa.applied_amount)
        FROM affiliate_payout_adjustments pa
        JOIN affiliate_payouts ap ON ap.id=pa.payout_id
        WHERE pa.adjustment_id=aa.id AND ap.status='Paid'),0) AS paid_applied_amount
    FROM affiliate_commission_adjustments aa
    JOIN affiliates a ON a.id=aa.affiliate_id
    JOIN affiliate_commissions ac ON ac.id=aa.commission_id
    WHERE (?=0 OR aa.affiliate_id=?)
    ORDER BY aa.id DESC
    LIMIT 300
  `).bind(affiliateId,affiliateId).all();

  const cf=await carryForwardRows(db,affiliateId);
  const carryBalance=round2(cf.reduce((s,x)=>s+Number(x.remaining_amount||0),0));
  return Response.json({adjustments:rows.results||[],carry_forward_balance:carryBalance,carry_forward_rows:cf},{headers:{'cache-control':'no-store'}});
}

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const b=await request.json().catch(()=>({}));
  const affiliateId=Number(b.affiliate_id||0), commissionId=Number(b.commission_id||0), refundAmount=round2(b.refund_amount);
  const type=clean(b.adjustment_type,30)||'Refund';
  const allowed=new Set(['Refund','Reversal','Chargeback','Manual']);
  const effectiveDate=clean(b.effective_date,32), reference=clean(b.reference,160), reason=clean(b.reason,1000);
  if(!affiliateId||!commissionId||!Number.isFinite(refundAmount)||refundAmount<=0) return Response.json({error:'Affiliate, commission transaction and a positive refund amount are required.'},{status:400});
  if(!allowed.has(type)) return Response.json({error:'Invalid adjustment type.'},{status:400});
  if(!effectiveDate||!reference||!reason) return Response.json({error:'Effective date, reference and reason are required for the audit trail.'},{status:400});

  const c=await db.prepare(`
    SELECT ac.*,a.affiliate_code,a.full_name,
      COALESCE((SELECT ap.status FROM affiliate_payout_items pi JOIN affiliate_payouts ap ON ap.id=pi.payout_id WHERE pi.commission_id=ac.id ORDER BY ap.id DESC LIMIT 1),'') AS payout_status,
      COALESCE((SELECT ap.id FROM affiliate_payout_items pi JOIN affiliate_payouts ap ON ap.id=pi.payout_id WHERE pi.commission_id=ac.id ORDER BY ap.id DESC LIMIT 1),0) AS payout_id
    FROM affiliate_commissions ac
    JOIN affiliates a ON a.id=ac.affiliate_id
    WHERE ac.id=? LIMIT 1
  `).bind(commissionId).first();
  if(!c) return Response.json({error:'Affiliate commission not found.'},{status:404});
  if(Number(c.affiliate_id)!==affiliateId) return Response.json({error:'Selected commission does not belong to the selected affiliate.'},{status:409});

  const prior=await db.prepare(`SELECT COALESCE(SUM(refund_amount),0) AS refunded,COALESCE(SUM(adjustment_amount),0) AS adjusted FROM affiliate_commission_adjustments WHERE commission_id=? AND status!='Cancelled'`).bind(commissionId).first();
  const sale=round2(c.gross_sale), commission=round2(c.commission_amount), refunded=round2(prior?.refunded);
  const remainingSale=round2(Math.max(sale-refunded,0));
  if(refundAmount>remainingSale+0.005) return Response.json({error:`Refund exceeds remaining reversible sale amount (${c.currency||'MYR'} ${remainingSale.toFixed(2)}).`},{status:409});

  const alreadyPaid=String(c.status||'')==='Paid'||String(c.payout_status||'')==='Paid';
  const recoveryMode=alreadyPaid?'CarryForward':'PrePayout';
  const remainingCommission=round2(Math.max(commission-Math.abs(Number(prior?.adjusted||0)),0));
  let reversal=refundAmount>=remainingSale-0.005?remainingCommission:round2(commission*(refundAmount/Math.max(sale,0.01)));
  reversal=Math.min(reversal,remainingCommission);
  if(reversal<=0) return Response.json({error:'This commission has already been fully reversed.'},{status:409});
  const adjustmentAmount=-round2(reversal);
  const initialStatus=recoveryMode==='PrePayout'?'Applied':'Open';

  const ins=await db.prepare(`INSERT INTO affiliate_commission_adjustments(
    affiliate_id,commission_id,order_id,adjustment_type,recovery_mode,
    original_sale_amount,refund_amount,original_commission_amount,adjustment_amount,currency,
    effective_date,reference,reason,status
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    c.affiliate_id,c.id,c.order_id||null,type,recoveryMode,
    sale,refundAmount,commission,adjustmentAmount,c.currency||'MYR',
    effectiveDate,reference,reason,initialStatus
  ).run();

  const rebuildRequired=['Draft','Approved'].includes(String(c.payout_status||''));
  return Response.json({
    ok:true,id:ins.meta?.last_row_id,recovery_mode:recoveryMode,
    adjustment_amount:adjustmentAmount,currency:c.currency||'MYR',
    rebuild_required:rebuildRequired,payout_id:Number(c.payout_id||0),
    message:alreadyPaid?'Negative commission adjustment created and will be deducted automatically from the next payout.':(rebuildRequired?'Pre-payout reversal recorded. The existing Draft/Approved payout must be cancelled and rebuilt.':'Pre-payout reversal recorded and will reduce the commission before payout.')
  });
}
