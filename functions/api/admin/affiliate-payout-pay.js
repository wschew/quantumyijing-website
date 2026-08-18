function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);
export async function onRequestPost({request,env}){
 if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
 const b=await request.json().catch(()=>({})), id=Number(b.payout_id||0), paymentReference=clean(b.payment_reference,160), paymentDate=clean(b.payment_date,32);
 if(!id||!paymentReference||!paymentDate) return Response.json({error:'payout_id, payment_reference and payment_date are required.'},{status:400});
 const p=await db.prepare(`SELECT id,status FROM affiliate_payouts WHERE id=?`).bind(id).first();
 if(!p) return Response.json({error:'Payout not found.'},{status:404});
 if(p.status!=='Approved') return Response.json({error:'Only Approved payouts can be marked Paid.'},{status:409});
 await db.prepare('BEGIN').run();
 try{
  await db.prepare(`UPDATE affiliate_payouts SET status='Paid',payment_reference=?,payment_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(paymentReference,paymentDate,id).run();
  await db.prepare(`UPDATE affiliate_commissions SET status='Paid',paid_at=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT commission_id FROM affiliate_payout_items WHERE payout_id=?)`).bind(paymentDate,id).run();
  await db.prepare('COMMIT').run(); return Response.json({ok:true,status:'Paid'});
 }catch(e){try{await db.prepare('ROLLBACK').run()}catch{};console.error(e);return Response.json({error:'Unable to record payout payment.'},{status:500})}
}
