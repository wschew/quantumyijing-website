function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    }
  });
}
function clean(v,n=300){return String(v??'').trim().slice(0,n)}
function bearer(req){
  const h=req.headers.get('authorization')||'';
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
function authorized(req,token){
  const got=bearer(req);
  return !!token && !!got && got===token;
}
function flag(v){return v===true||v===1||v==='1'?1:0}

async function requireAdmin(context){
  if(!context.env.ENQUIRIES_DB) return json({error:'Database is not configured.'},503);
  if(!context.env.ADMIN_TOKEN) return json({error:'Administrator access is not configured.'},503);
  if(!authorized(context.request,context.env.ADMIN_TOKEN)) return json({error:'Unauthorized.'},401);
  return null;
}

export async function onRequestGet(context){
  const denied=await requireAdmin(context); if(denied)return denied;
  const url=new URL(context.request.url);
  const productId=Number(url.searchParams.get('product_id'));
  if(!Number.isInteger(productId)||productId<1)return json({error:'Valid product_id is required.'},400);

  const db=context.env.ENQUIRIES_DB;
  const product=await db.prepare(`SELECT id,sku,name_en,product_type FROM products WHERE id=?`).bind(productId).first();
  if(!product)return json({error:'Product not found.'},404);

  const row=await db.prepare(`
    SELECT product_id,gender_required,meal_preference_required,
           accommodation_included,accommodation_notes_enabled,
           registration_time,checkout_time,updated_at
    FROM product_registration_settings
    WHERE product_id=?
  `).bind(productId).first();

  return json({
    ok:true,
    product,
    settings:row||{
      product_id:productId,
      gender_required:0,
      meal_preference_required:0,
      accommodation_included:0,
      accommodation_notes_enabled:0,
      registration_time:'',
      checkout_time:''
    }
  });
}

export async function onRequestPost(context){
  const denied=await requireAdmin(context); if(denied)return denied;
  let body; try{body=await context.request.json()}catch{return json({error:'Invalid request.'},400)}

  const productId=Number(body.productId);
  if(!Number.isInteger(productId)||productId<1)return json({error:'Valid productId is required.'},400);

  const registrationTime=clean(body.registrationTime,20);
  const checkoutTime=clean(body.checkoutTime,20);
  const timeRe=/^([01]\d|2[0-3]):[0-5]\d$/;
  if(registrationTime && !timeRe.test(registrationTime))return json({error:'Registration time must use HH:MM.'},400);
  if(checkoutTime && !timeRe.test(checkoutTime))return json({error:'Checkout/end time must use HH:MM.'},400);

  const db=context.env.ENQUIRIES_DB;
  const product=await db.prepare(`SELECT id,product_type FROM products WHERE id=?`).bind(productId).first();
  if(!product)return json({error:'Product not found.'},404);
  if(String(product.product_type||'').toLowerCase()!=='course')
    return json({error:'Registration requirements are currently supported for course products.'},400);

  await db.prepare(`
    INSERT INTO product_registration_settings(
      product_id,gender_required,meal_preference_required,
      accommodation_included,accommodation_notes_enabled,
      registration_time,checkout_time,updated_at
    ) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(product_id) DO UPDATE SET
      gender_required=excluded.gender_required,
      meal_preference_required=excluded.meal_preference_required,
      accommodation_included=excluded.accommodation_included,
      accommodation_notes_enabled=excluded.accommodation_notes_enabled,
      registration_time=excluded.registration_time,
      checkout_time=excluded.checkout_time,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    productId,
    flag(body.genderRequired),
    flag(body.mealPreferenceRequired),
    flag(body.accommodationIncluded),
    flag(body.accommodationNotesEnabled),
    registrationTime,
    checkoutTime
  ).run();

  return json({ok:true,productId});
}
