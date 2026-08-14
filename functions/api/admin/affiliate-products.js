function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function token(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&token(req)===env.ADMIN_TOKEN}

export async function onRequestGet({request,env}){
 if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 const rows=await db.prepare(`SELECT id,sku,slug,product_type,name_en,name_zh,status,price,currency,affiliate_enabled,commission_type,commission_value,affiliate_public_path,updated_at FROM products ORDER BY CASE status WHEN 'Active' THEN 0 ELSE 1 END,product_type,name_en`).all();
 const settings=await db.prepare(`SELECT default_commission_rate FROM affiliate_settings WHERE id=1`).first();
 return Response.json({default_commission_rate:Number(settings?.default_commission_rate||0),products:rows.results||[]});
}

export async function onRequestPost({request,env}){
 if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 try{
  const b=await request.json(),id=Number(b.id),enabled=b.affiliate_enabled?1:0,type=String(b.commission_type||'').trim(),path=String(b.affiliate_public_path||'').trim();
  let value=null;
  if(b.commission_value!==''&&b.commission_value!==null&&b.commission_value!==undefined){value=Number(b.commission_value);if(!Number.isFinite(value)||value<0)return Response.json({error:'Invalid commission value.'},{status:400})}
  if(!id)return Response.json({error:'Product ID required.'},{status:400});
  if(type&&!['percentage','fixed'].includes(type))return Response.json({error:'Commission type must be percentage, fixed, or blank.'},{status:400});
  if(path&&!path.startsWith('/')&&!/^https?:\/\//i.test(path))return Response.json({error:'Public path must start with / or be a full http/https URL.'},{status:400});
  await db.prepare(`UPDATE products SET affiliate_enabled=?,commission_type=?,commission_value=?,affiliate_public_path=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(enabled,type,value,path,id).run();
  return Response.json({ok:true});
 }catch(e){console.error('affiliate product settings',e);return Response.json({error:'Unable to update affiliate product settings.'},{status:500})}
}
