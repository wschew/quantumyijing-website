function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);

export async function onRequestPost({request,env}){
  if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
  const b=await request.json().catch(()=>({}));
  const ref=clean(b.order_reference,100);
  if(!ref)return Response.json({error:'order_reference is required.'},{status:400});

  const o=await db.prepare(`
    SELECT o.id,o.order_reference,o.customer_name,o.customer_email,o.total,o.currency,
           o.payment_status,o.affiliate_code,
           p.status AS payment_record_status,p.verification_status,
           COALESCE(p.accounting_eligible,0) AS accounting_eligible,
           p.amount AS payment_amount
    FROM orders o
    LEFT JOIN payments p ON p.id=(
      SELECT p2.id FROM payments p2 WHERE p2.order_id=o.id ORDER BY p2.id DESC LIMIT 1
    )
    WHERE o.order_reference=?
    LIMIT 1
  `).bind(ref).first();
  if(!o)return Response.json({error:'Order not found.'},{status:404});
  if(o.payment_status!=='Paid'||o.payment_record_status!=='Paid'||o.verification_status!=='Verified'||Number(o.accounting_eligible)!==1)
    return Response.json({error:'Order must be Paid + Verified + Accounting Eligible before commission repair.'},{status:409});
  if(!clean(o.affiliate_code,100))return Response.json({error:'Order has no affiliate attribution.'},{status:409});

  const aff=await db.prepare(`SELECT id,affiliate_code,full_name,status,membership_expires_at FROM affiliates WHERE upper(affiliate_code)=upper(?) LIMIT 1`)
    .bind(o.affiliate_code).first();
  if(!aff||aff.status!=='Approved')return Response.json({error:'Affiliate is not Approved.'},{status:409});

  const pr=await db.prepare(`
    SELECT DISTINCT pr.id AS product_id,pr.sku,pr.name_en,pr.affiliate_enabled,pr.commission_type,pr.commission_value
    FROM order_items oi
    JOIN products pr ON pr.id=oi.product_id
    WHERE oi.order_id=? AND COALESCE(pr.affiliate_enabled,0)=1
    ORDER BY pr.id
    LIMIT 1
  `).bind(o.id).first();
  if(!pr)return Response.json({error:'No affiliate-enabled product is attached to this order.'},{status:409});

  const existing=await db.prepare(`SELECT id,commission_rate,commission_amount,status FROM affiliate_commissions WHERE affiliate_id=? AND order_id=? AND product_id=? LIMIT 1`)
    .bind(aff.id,o.id,pr.product_id).first();
  if(existing)return Response.json({ok:true,already_exists:true,commission:existing});

  const gross=Number(o.payment_amount||o.total||0);
  const type=clean(pr.commission_type||'percentage',30).toLowerCase();
  const value=Math.max(0,Number(pr.commission_value||0));
  let rate=0,commission=0;
  if(type==='fixed'){
    commission=Math.round(value*100)/100;
    rate=gross>0?(commission/gross*100):0;
  }else{
    rate=Math.min(value,100);
    commission=Math.round((gross*rate/100)*100)/100;
  }
  if(commission<=0)return Response.json({error:`Product ${pr.sku||pr.product_id} has no positive affiliate commission configured.`},{status:409});

  const ins=await db.prepare(`
    INSERT INTO affiliate_commissions(
      affiliate_id,order_id,product_id,order_reference,customer_name,product_name,
      gross_sale,currency,commission_rate,commission_amount,status,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'Approved',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(aff.id,o.id,pr.product_id,o.order_reference,o.customer_name,pr.name_en||pr.sku,
          gross,o.currency||'MYR',rate,commission).run();

  return Response.json({ok:true,commission:{
    id:Number(ins.meta?.last_row_id||0),affiliate_code:aff.affiliate_code,
    sku:pr.sku,product_name:pr.name_en,gross_sale:gross,
    commission_rate:rate,commission_amount:commission,status:'Approved'
  }});
}
