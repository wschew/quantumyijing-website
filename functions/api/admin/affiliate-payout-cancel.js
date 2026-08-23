function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const b=await request.json().catch(()=>({})), id=Number(b.payout_id||0), reason=clean(b.reason)||'Cancelled to rebuild payout after commission adjustment.';
  const p=await db.prepare(`SELECT * FROM affiliate_payouts WHERE id=? LIMIT 1`).bind(id).first();
  if(!p) return Response.json({error:'Payout not found.'},{status:404});
  if(!['Draft','Approved'].includes(p.status)) return Response.json({error:'Only Draft or Approved payouts can be cancelled/rebuilt.'},{status:409});

  const itemRows=await db.prepare(`SELECT commission_id FROM affiliate_payout_items WHERE payout_id=?`).bind(id).all();
  const ids=(itemRows.results||[]).map(x=>Number(x.commission_id)).filter(Boolean);
  await db.prepare('BEGIN').run();
  try{
    await db.prepare(`INSERT INTO affiliate_payout_cancellations(payout_id,payout_reference,affiliate_id,payout_period,previous_status,gross_commission,adjustment_total,net_commission,reason) VALUES(?,?,?,?,?,?,?,?,?)`).bind(
      p.id,p.payout_reference||'',p.affiliate_id,p.payout_period||'',p.status,Number(p.gross_commission||p.total_commission||0),Number(p.adjustment_total||0),Number(p.total_commission||0),reason
    ).run();
    for(const cid of ids){await db.prepare(`UPDATE affiliate_commissions SET status='Approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='Payable'`).bind(cid).run();}
    await db.prepare(`DELETE FROM affiliate_payout_adjustments WHERE payout_id=?`).bind(id).run();
    await db.prepare(`DELETE FROM affiliate_payout_items WHERE payout_id=?`).bind(id).run();
    await db.prepare(`DELETE FROM affiliate_payouts WHERE id=?`).bind(id).run();
    await db.prepare('COMMIT').run();
  }catch(e){try{await db.prepare('ROLLBACK').run()}catch{};console.error(e);return Response.json({error:'Unable to cancel payout for rebuild.'},{status:500});}
  return Response.json({ok:true,cancelled_payout_id:id,previous_status:p.status});
}
