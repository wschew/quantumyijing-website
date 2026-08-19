
function bearer(req){
  const h=req.headers.get('authorization')||'';
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
function authorized(req,env){
  return !!env.ADMIN_TOKEN && bearer(req)===env.ADMIN_TOKEN;
}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
function clean(v,max=500){return String(v??'').trim().slice(0,max)}
function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}

export async function onRequestGet({request,env}){
  if(!authorized(request,env)) return json({error:'Unauthorized'},401);
  const db=dbOf(env); if(!db) return json({error:'Database unavailable'},503);

  const rows=await db.prepare(`
    SELECT
      p.id,p.sku,p.slug,p.name_en,p.name_zh,p.product_type,p.status,
      COUNT(DISTINCT CASE WHEN o.payment_status='Paid' THEN o.id END) AS paid_count
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id=p.id
    LEFT JOIN orders o ON o.id=oi.order_id
    WHERE lower(COALESCE(p.product_type,''))='course'
       OR lower(COALESCE(p.product_type,''))='courses'
    GROUP BY p.id
    ORDER BY p.id DESC
  `).all();

  return json({courses:rows.results||[]});
}
