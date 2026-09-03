
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);

async function current(db){
  return db.prepare(`
    SELECT
      s.id,
      s.generic_payment_commission_enabled,
      s.generic_payment_commission_rate,
      s.generic_payment_product_id,
      s.updated_at,
      s.updated_by,
      p.sku AS product_sku,
      p.name_en AS product_name
    FROM affiliate_accounting_settings s
    JOIN products p ON p.id=s.generic_payment_product_id
    WHERE s.id=1
  `).first();
}

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const s=await current(db);
  if(!s) return Response.json({error:'Affiliate accounting settings not initialized. Run migrate-v3.3.16f.sql.'},{status:409});
  return Response.json({settings:s},{headers:{'cache-control':'no-store'}});
}

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const b=await request.json().catch(()=>({}));
  const enabled=b.generic_payment_commission_enabled===true || Number(b.generic_payment_commission_enabled)===1 ? 1 : 0;
  const rate=Number(b.generic_payment_commission_rate);

  if(!Number.isFinite(rate)||rate<0||rate>100)
    return Response.json({error:'Generic payment commission rate must be between 0% and 100%.'},{status:400});

  const existing=await current(db);
  if(!existing) return Response.json({error:'Affiliate accounting settings not initialized. Run migrate-v3.3.16f.sql.'},{status:409});

  await db.prepare(`
    UPDATE affiliate_accounting_settings
    SET generic_payment_commission_enabled=?,
        generic_payment_commission_rate=?,
        updated_at=CURRENT_TIMESTAMP,
        updated_by='Admin'
    WHERE id=1
  `).bind(enabled,rate).run();

  return Response.json({ok:true,settings:await current(db)});
}
