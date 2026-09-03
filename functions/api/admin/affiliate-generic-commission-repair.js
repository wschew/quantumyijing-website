
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const b=await request.json().catch(()=>({}));
  const ref=clean(b.order_reference,100);
  if(!ref) return Response.json({error:'order_reference is required.'},{status:400});

  const o=await db.prepare(`
    SELECT
      o.id,o.order_reference,o.customer_name,o.currency,o.total,o.affiliate_code,o.payment_status,
      g.affiliate_test_mode,
      py.status AS payment_record_status,
      py.verification_status,
      COALESCE(py.accounting_eligible,0) AS accounting_eligible
    FROM orders o
    JOIN generic_payment_requests g ON g.order_id=o.id
    LEFT JOIN payments py ON py.id=(
      SELECT p2.id FROM payments p2 WHERE p2.order_id=o.id ORDER BY p2.id DESC LIMIT 1
    )
    WHERE o.order_reference=?
    LIMIT 1
  `).bind(ref).first();

  if(!o) return Response.json({error:'Generic payment order not found.'},{status:404});
  if(o.payment_status!=='Paid'||o.payment_record_status!=='Paid'||o.verification_status!=='Verified'||Number(o.accounting_eligible)!==1)
    return Response.json({error:'Order must be Paid + Verified + Accounting Eligible before commission repair.'},{status:409});
  if(!clean(o.affiliate_code,100))
    return Response.json({error:'Order has no affiliate attribution.'},{status:409});

  const s=await db.prepare(`
    SELECT generic_payment_commission_enabled,generic_payment_commission_rate,generic_payment_product_id
    FROM affiliate_accounting_settings WHERE id=1
  `).first();
  if(!s) return Response.json({error:'Affiliate accounting settings are not initialized.'},{status:409});
  if(Number(s.generic_payment_commission_enabled)!==1)
    return Response.json({error:'Generic payment affiliate commission is currently disabled.'},{status:409});

  const aff=await db.prepare(`
    SELECT id,affiliate_code,full_name,status
    FROM affiliates WHERE upper(affiliate_code)=upper(?) LIMIT 1
  `).bind(o.affiliate_code).first();
  if(!aff||aff.status!=='Approved') return Response.json({error:'Affiliate is not Approved.'},{status:409});

  const existing=await db.prepare(`
    SELECT id,commission_rate,commission_amount,status
    FROM affiliate_commissions WHERE affiliate_id=? AND order_id=? LIMIT 1
  `).bind(aff.id,o.id).first();
  if(existing) return Response.json({ok:true,already_exists:true,commission:existing});

  const product=await db.prepare(`SELECT id,sku,name_en FROM products WHERE id=? LIMIT 1`)
    .bind(Number(s.generic_payment_product_id)).first();
  if(!product) return Response.json({error:'Configured generic affiliate product not found.'},{status:409});

  const rate=Math.max(0,Math.min(Number(s.generic_payment_commission_rate||0),100));
  const gross=Number(o.total||0);
  const commission=Math.round((gross*rate/100)*100)/100;

  const ins=await db.prepare(`
    INSERT INTO affiliate_commissions(
      affiliate_id,order_id,product_id,order_reference,customer_name,product_name,
      gross_sale,currency,commission_rate,commission_amount,status,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'Approved',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(
    aff.id,o.id,product.id,o.order_reference,o.customer_name,product.name_en,
    gross,o.currency||'MYR',rate,commission
  ).run();

  return Response.json({
    ok:true,
    commission:{
      id:Number(ins.meta?.last_row_id||0),
      affiliate_code:aff.affiliate_code,
      product_id:product.id,
      product_name:product.name_en,
      gross_sale:gross,
      commission_rate:rate,
      commission_amount:commission,
      status:'Approved'
    }
  });
}
