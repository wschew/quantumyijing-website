function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
export async function onRequestPost({request,env}){
 if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
 const b=await request.json().catch(()=>({})), id=Number(b.payout_id||0);
 const p=await db.prepare(`SELECT id,status FROM affiliate_payouts WHERE id=?`).bind(id).first();
 if(!p) return Response.json({error:'Payout not found.'},{status:404});
 if(p.status!=='Draft') return Response.json({error:'Only Draft payouts can be approved.'},{status:409});
 await db.prepare(`UPDATE affiliate_payouts SET status='Approved',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
 return Response.json({ok:true,status:'Approved'});
}
