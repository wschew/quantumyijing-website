function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
export async function onRequestGet({request,env}){
 if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 const r=await db.prepare(`SELECT id,affiliate_code,full_name,email,status FROM affiliates WHERE status='Approved' ORDER BY full_name COLLATE NOCASE,affiliate_code`).all();
 return Response.json({affiliates:r.results||[]},{headers:{'cache-control':'no-store'}});
}
