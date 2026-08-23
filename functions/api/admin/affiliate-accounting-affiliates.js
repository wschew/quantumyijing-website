function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=160)=>String(v??'').trim().slice(0,n);

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const u=new URL(request.url);
  const q=clean(u.searchParams.get('q')||'').toLowerCase();

  let rows;
  if(q){
    const like=`%${q}%`;
    rows=await db.prepare(`
      SELECT id,affiliate_code,full_name,email,status
      FROM affiliates
      WHERE lower(COALESCE(full_name,'')) LIKE ?
         OR lower(COALESCE(affiliate_code,'')) LIKE ?
         OR lower(COALESCE(email,'')) LIKE ?
      ORDER BY full_name COLLATE NOCASE, id
      LIMIT 100
    `).bind(like,like,like).all();
  }else{
    rows=await db.prepare(`
      SELECT id,affiliate_code,full_name,email,status
      FROM affiliates
      ORDER BY full_name COLLATE NOCASE, id
      LIMIT 300
    `).all();
  }

  return Response.json({affiliates:rows.results||[]},{headers:{'cache-control':'no-store'}});
}
