
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

  const u=new URL(request.url);
  const productId=Number(u.searchParams.get('product_id')||0);
  if(!productId) return json({error:'product_id is required'},400);

  const product=await db.prepare(`
    SELECT id,sku,slug,name_en,name_zh,product_type
    FROM products WHERE id=? LIMIT 1
  `).bind(productId).first();
  if(!product) return json({error:'Course not found'},404);

  const rows=await db.prepare(`
    SELECT DISTINCT
      o.id AS order_id,
      o.order_reference,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.total,
      o.currency,
      o.payment_status,
      COALESCE(
        (SELECT paid_at FROM payments p
          WHERE p.order_id=o.id AND p.status='Paid'
          ORDER BY p.id DESC LIMIT 1),
        o.updated_at
      ) AS paid_at,
      COALESCE(cwi.email_status,'Pending') AS invite_status,
      COALESCE(cwi.sent_at,'') AS invite_sent_at,
      COALESCE(cwi.last_error,'') AS invite_error
    FROM orders o
    JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN course_whatsapp_invitations cwi
      ON cwi.order_id=o.id AND cwi.product_id=?
    WHERE oi.product_id=?
      AND o.payment_status='Paid'
      AND COALESCE(o.customer_email,'')<>''
    ORDER BY paid_at DESC,o.id DESC
  `).bind(productId,productId).all();

  const recipients=rows.results||[];
  return json({
    product,
    recipients,
    summary:{
      paid:recipients.length,
      sent:recipients.filter(x=>x.invite_status==='Sent').length,
      pending:recipients.filter(x=>x.invite_status!=='Sent').length
    }
  });
}
