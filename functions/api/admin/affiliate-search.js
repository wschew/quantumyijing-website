function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
export async function onRequestGet({request,env}){
 if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 const q=(new URL(request.url).searchParams.get('q')||'').trim();
 if(!q){const r=await db.prepare("SELECT id,affiliate_code,full_name,email,status FROM affiliates ORDER BY full_name COLLATE NOCASE ASC LIMIT 300").all();return Response.json({results:r.results||[]})}
 const like=`%${q}%`;
 const r=await db.prepare("SELECT id,affiliate_code,full_name,email,status FROM affiliates WHERE CAST(id AS TEXT)=? OR affiliate_code LIKE ? OR full_name LIKE ? OR email LIKE ? ORDER BY full_name COLLATE NOCASE ASC LIMIT 100").bind(q,like,like,like).all();
 return Response.json({results:r.results||[]});
}
