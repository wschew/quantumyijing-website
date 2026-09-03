function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    }
  });
}
function clean(v,n=500){return String(v??'').trim().slice(0,n)}

export async function onRequestPost(context){
  if(!context.env.ENQUIRIES_DB)return json({error:'Database is not configured.'},503);
  let body; try{body=await context.request.json()}catch{return json({error:'Invalid request.'},400)}

  const reference=clean(body.reference,120);
  const productId=Number(body.productId);
  const gender=clean(body.gender,20);
  const meal=clean(body.mealPreference,30);
  const notes=clean(body.accommodationNotes,1000);

  if(!reference || !Number.isInteger(productId) || productId<1)
    return json({error:'Registration reference and product are required.'},400);

  const db=context.env.ENQUIRIES_DB;
  const settings=await db.prepare(`
    SELECT gender_required,meal_preference_required,
           accommodation_included,accommodation_notes_enabled
    FROM product_registration_settings WHERE product_id=?
  `).bind(productId).first();

  if(settings){
    if(Number(settings.gender_required||0)===1 && !['Male','Female'].includes(gender))
      return json({error:'Please select Male or Female.'},400);
    if(Number(settings.meal_preference_required||0)===1 && !['Normal','Vegan'].includes(meal))
      return json({error:'Please select Normal or Vegan meal preference.'},400);
  }

  const enquiry=await db.prepare(`SELECT id FROM enquiries WHERE reference=? LIMIT 1`).bind(reference).first();
  if(!enquiry)return json({error:'Registration reference not found.'},404);

  await db.prepare(`
    INSERT INTO course_registration_details(
      enquiry_id,product_id,gender,meal_preference,accommodation_notes,created_at,updated_at
    ) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(enquiry_id) DO UPDATE SET
      product_id=excluded.product_id,
      gender=excluded.gender,
      meal_preference=excluded.meal_preference,
      accommodation_notes=excluded.accommodation_notes,
      updated_at=CURRENT_TIMESTAMP
  `).bind(enquiry.id,productId,gender,meal,notes).run();

  return json({ok:true});
}
