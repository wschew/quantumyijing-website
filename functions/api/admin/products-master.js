function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function authorised(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
const allowedTypes=['course','membership','consultation','ebook','digital','physical','event','other'];
const allowedStatus=['Draft','Active','Inactive','Archived'];

export async function onRequestGet({request,env}){
 if(!authorised(request,env))return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 const rows=await db.prepare(`SELECT id,sku,slug,product_type,name_en,name_zh,description_en,description_zh,status,price,currency,sales_channel,payment_provider,external_purchase_url,affiliate_enabled,commission_type,commission_value,starts_on,ends_on,time_en,time_zh,delivery_en,delivery_zh,instructor,early_bird_price,early_bird_end,hero_image_url,language_en,language_zh,affiliate_public_path,created_at,updated_at FROM products ORDER BY id DESC`).all();
 return Response.json({products:rows.results||[]});
}

export async function onRequestPost({request,env}){
 if(!authorised(request,env))return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 try{
  const b=await request.json();
  const id=Number(b.id||0),sku=String(b.sku||'').trim(),slug=String(b.slug||'').trim(),product_type=String(b.product_type||'').trim(),name_en=String(b.name_en||'').trim(),name_zh=String(b.name_zh||'').trim(),status=String(b.status||'Draft').trim(),currency=String(b.currency||'MYR').trim().toUpperCase();
  const price=(b.price===''||b.price===null||b.price===undefined)?null:Number(b.price);
  const early=(b.early_bird_price===''||b.early_bird_price===null||b.early_bird_price===undefined)?null:Number(b.early_bird_price);
  if(!sku||!slug||!name_en)return Response.json({error:'SKU, slug and English product name are required.'},{status:400});
  if(!allowedTypes.includes(product_type))return Response.json({error:'Invalid product type.'},{status:400});
  if(!allowedStatus.includes(status))return Response.json({error:'Invalid product status.'},{status:400});
  if(price!==null&&(!Number.isFinite(price)||price<0))return Response.json({error:'Invalid price.'},{status:400});
  if(early!==null&&(!Number.isFinite(early)||early<0))return Response.json({error:'Invalid early-bird price.'},{status:400});

  const vals=[sku,slug,product_type,name_en,name_zh,String(b.description_en||''),String(b.description_zh||''),status,price,currency,String(b.sales_channel||'Website'),String(b.payment_provider||'DOKU'),String(b.external_purchase_url||''),String(b.starts_on||''),String(b.ends_on||''),String(b.time_en||''),String(b.time_zh||''),String(b.delivery_en||''),String(b.delivery_zh||''),String(b.instructor||''),early,String(b.early_bird_end||''),String(b.hero_image_url||''),String(b.language_en||''),String(b.language_zh||'')];

  if(id){
   await db.prepare(`UPDATE products SET sku=?,slug=?,product_type=?,name_en=?,name_zh=?,description_en=?,description_zh=?,status=?,price=?,currency=?,sales_channel=?,payment_provider=?,external_purchase_url=?,starts_on=?,ends_on=?,time_en=?,time_zh=?,delivery_en=?,delivery_zh=?,instructor=?,early_bird_price=?,early_bird_end=?,hero_image_url=?,language_en=?,language_zh=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...vals,id).run();
   return Response.json({ok:true,id});
  }
  const r=await db.prepare(`INSERT INTO products(sku,slug,product_type,name_en,name_zh,description_en,description_zh,status,price,currency,sales_channel,payment_provider,external_purchase_url,starts_on,ends_on,time_en,time_zh,delivery_en,delivery_zh,instructor,early_bird_price,early_bird_end,hero_image_url,language_en,language_zh) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...vals).run();
  return Response.json({ok:true,id:r.meta?.last_row_id||null});
 }catch(e){
  console.error('products master save',e);
  const m=String(e?.message||'');
  if(m.includes('products.sku'))return Response.json({error:'SKU already exists.'},{status:409});
  if(m.includes('products.slug'))return Response.json({error:'Slug already exists.'},{status:409});
  return Response.json({error:'Unable to save product.'},{status:500});
 }
}
