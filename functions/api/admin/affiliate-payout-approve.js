function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const r2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

async function staleAdjustments(db,p){
 const itemMismatch=await db.prepare(`SELECT COUNT(*) count FROM affiliate_payout_items pi JOIN affiliate_commissions ac ON ac.id=pi.commission_id WHERE pi.payout_id=? AND ABS(COALESCE(pi.pre_payout_adjustment,0)-COALESCE((SELECT SUM(aa.adjustment_amount) FROM affiliate_commission_adjustments aa WHERE aa.commission_id=ac.id AND aa.recovery_mode='PrePayout' AND aa.status!='Cancelled'),0))>0.005`).bind(p.id).first();
 if(Number(itemMismatch?.count||0)>0)return true;
 const unreserved=await db.prepare(`SELECT COUNT(*) count FROM affiliate_commission_adjustments aa WHERE aa.affiliate_id=? AND aa.recovery_mode='CarryForward' AND aa.status='Open' AND NOT EXISTS(SELECT 1 FROM affiliate_payout_adjustments pa WHERE pa.payout_id=? AND pa.adjustment_id=aa.id) AND (aa.adjustment_amount-COALESCE((SELECT SUM(pa2.applied_amount) FROM affiliate_payout_adjustments pa2 JOIN affiliate_payouts ap2 ON ap2.id=pa2.payout_id WHERE pa2.adjustment_id=aa.id AND ap2.status IN ('Draft','Approved','Paid')),0))<-0.005`).bind(p.affiliate_id,p.id).first();
 return Number(unreserved?.count||0)>0;
}

export async function onRequestPost({request,env}){
 if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});const b=await request.json().catch(()=>({})),id=Number(b.payout_id||0);const p=await db.prepare(`SELECT id,affiliate_id,status FROM affiliate_payouts WHERE id=?`).bind(id).first();if(!p)return Response.json({error:'Payout not found.'},{status:404});if(p.status!=='Draft')return Response.json({error:'Only Draft payouts can be approved.'},{status:409});
 const invalid=await db.prepare(`SELECT COUNT(*) count FROM affiliate_payout_items api JOIN affiliate_commissions ac ON ac.id=api.commission_id LEFT JOIN payments py ON py.id=(SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1) LEFT JOIN orders o ON o.id=ac.order_id WHERE api.payout_id=? AND NOT(COALESCE(py.status,'')='Paid' AND COALESCE(py.verification_status,'')='Verified' AND COALESCE(py.accounting_eligible,0)=1 AND COALESCE(o.payment_status,'')='Paid')`).bind(id).first();if(Number(invalid?.count||0)>0)return Response.json({error:'Payout contains commission(s) whose payment is no longer accounting-eligible. Review the affected sales before approval.'},{status:409});
 if(await staleAdjustments(db,p))return Response.json({error:'A refund/reversal adjustment changed after this Draft was created. Cancel/Rebuild this payout before approval.'},{status:409});
 await db.prepare(`UPDATE affiliate_payouts SET status='Approved',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();return Response.json({ok:true,status:'Approved'});
}
