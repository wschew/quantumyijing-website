function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function authorized(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
function clean(v,max=1000){return String(v??'').trim().slice(0,max)}
function json(d,s=200){return Response.json(d,{status:s,headers:{'cache-control':'no-store'}})}
function validUrl(u){return /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+(?:[?#].*)?$/i.test(u)}

export async function onRequestGet({request,env}){
  if(!authorized(request,env))return json({error:'Unauthorized'},401);
  const db=dbOf(env);if(!db)return json({error:'Database unavailable'},503);
  const u=new URL(request.url),productId=Number(u.searchParams.get('product_id')||0);
  if(!productId)return json({error:'product_id is required'},400);
  const product=await db.prepare(`SELECT id,sku,name_en,name_zh FROM products WHERE id=? LIMIT 1`).bind(productId).first();
  if(!product)return json({error:'Course not found'},404);
  const group=await db.prepare(`SELECT product_id,group_name,invite_url,is_active,created_at,updated_at FROM course_whatsapp_groups WHERE product_id=? LIMIT 1`).bind(productId).first();
  return json({product,group:group||{product_id:productId,group_name:'',invite_url:'',is_active:1}});
}

export async function onRequestPost({request,env}){
  if(!authorized(request,env))return json({error:'Unauthorized'},401);
  const db=dbOf(env);if(!db)return json({error:'Database unavailable'},503);
  let body={};try{body=await request.json()}catch{return json({error:'Invalid request body'},400)}
  const productId=Number(body.product_id||0),groupName=clean(body.group_name,200),inviteUrl=clean(body.invite_url,1000);
  if(!productId)return json({error:'product_id is required'},400);
  if(!groupName)return json({error:'Please enter a WhatsApp group name'},400);
  if(!validUrl(inviteUrl))return json({error:'Please enter a valid WhatsApp group invitation link beginning with https://chat.whatsapp.com/'},400);
  await db.prepare(`INSERT INTO course_whatsapp_groups(product_id,group_name,invite_url,is_active,created_at,updated_at)
    VALUES(?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(product_id) DO UPDATE SET group_name=excluded.group_name,invite_url=excluded.invite_url,is_active=1,updated_at=CURRENT_TIMESTAMP`)
    .bind(productId,groupName,inviteUrl).run();
  return json({ok:true});
}

export function onRequest(c){if(c.request.method==='GET')return onRequestGet(c);if(c.request.method==='POST')return onRequestPost(c);return json({error:'Method not allowed'},405)}
