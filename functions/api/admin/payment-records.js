function bearer(req){
  const h=req.headers.get('authorization')||'';
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
function authorized(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
function json(d,s=200){return Response.json(d,{status:s,headers:{'cache-control':'no-store'}})}

export async function onRequestGet({request,env}){
  if(!authorized(request,env))return json({error:'Unauthorized'},401);
  const db=dbOf(env);if(!db)return json({error:'Database unavailable'},503);

  const u=new URL(request.url);
  const type=(u.searchParams.get('type')||'all').toLowerCase();
  const search=(u.searchParams.get('q')||'').trim();
  const limit=Math.min(Math.max(Number(u.searchParams.get('limit')||100),1),300);

  let where=[];
  let binds=[];

  if(type==='generic') where.push('g.order_id IS NOT NULL');
  if(search){
    where.push(`(
      o.order_reference LIKE ? OR
      o.customer_name LIKE ? OR
      o.customer_email LIKE ? OR
      COALESCE(g.payment_purpose,'') LIKE ? OR
      COALESCE(py.provider_transaction_id,'') LIKE ?
    )`);
    const q=`%${search}%`;
    binds.push(q,q,q,q,q);
  }

  const sql=`
    SELECT
      o.id AS order_id,
      o.order_reference,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.currency,
      o.total,
      o.payment_status,
      o.payment_provider,
      o.external_order_id,
      o.created_at,
      o.updated_at,
      CASE WHEN g.order_id IS NOT NULL THEN 'Generic' ELSE 'Product / Course' END AS payment_type,
      COALESCE(g.payment_purpose,'') AS payment_purpose,
      COALESCE(g.customer_note,'') AS customer_note,
      COALESCE(py.id,'') AS payment_id,
      COALESCE(py.provider_transaction_id,'') AS transaction_id,
      COALESCE(py.amount,0) AS payment_amount,
      COALESCE(py.status,'') AS payment_record_status,
      COALESCE(py.verification_status,'') AS verification_status,
      COALESCE(py.paid_at,'') AS paid_at,
      COALESCE(py.gateway_mode,'') AS gateway_mode,
      COALESCE(cn.status,'') AS customer_email_status,
      COALESCE(cn.sent_at,'') AS customer_email_sent_at,
      COALESCE(cn.last_error,'') AS customer_email_error,
      COALESCE(inot.status,'') AS internal_email_status,
      COALESCE(inot.sent_at,'') AS internal_email_sent_at,
      COALESCE(inot.last_error,'') AS internal_email_error,
      COALESCE(gpr.admin_verification_status,'') AS admin_verification_status,
      COALESCE(gpr.gateway_notice_status,'') AS gateway_notice_status
    FROM orders o
    LEFT JOIN generic_payment_requests g ON g.order_id=o.id
    LEFT JOIN payments py ON py.id=(
      SELECT p2.id FROM payments p2
      WHERE p2.order_id=o.id
      ORDER BY p2.id DESC LIMIT 1
    )
    LEFT JOIN payment_email_notifications cn
      ON cn.order_id=o.id AND cn.notification_type='CustomerReceipt'
    LEFT JOIN payment_email_notifications inot
      ON inot.order_id=o.id AND inot.notification_type='InternalPaymentNotice'
    LEFT JOIN generic_payment_reviews gpr ON gpr.order_id=o.id
    ${where.length?'WHERE '+where.join(' AND '):''}
    ORDER BY o.id DESC
    LIMIT ?
  `;

  binds.push(limit);
  const rows=await db.prepare(sql).bind(...binds).all();
  return json({rows:rows.results||[]});
}

export function onRequest(c){
  return c.request.method==='GET'?onRequestGet(c):json({error:'Method not allowed'},405);
}
