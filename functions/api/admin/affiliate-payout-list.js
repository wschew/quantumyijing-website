function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
export async function onRequestGet({request,env}){
 if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
 const rows=await db.prepare(`SELECT ap.*,a.affiliate_code,a.full_name,a.email FROM affiliate_payouts ap JOIN affiliates a ON a.id=ap.affiliate_id ORDER BY ap.id DESC LIMIT 200`).all();
 return Response.json({payouts:rows.results||[]},{headers:{'cache-control':'no-store'}});
}
