const clean=(v,max=300)=>String(v??'').trim().slice(0,max);
const json=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'no-store'}});
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=160;
function ref(){return `QY-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`}

export async function onRequestPost({request,env}){
  let b={};
  try{b=await request.json()}catch{return json({error:'Invalid request.'},400)}

  if(clean(b.website,200))return json({error:'Invalid request.'},400);

  const started=Number(b.startedAt||0),elapsed=Date.now()-started;
  if(!Number.isFinite(started)||elapsed<1500||elapsed>86400000)
    return json({error:'Please reload the page and try again.'},400);

  const name=clean(b.name,100);
  const email=clean(b.email,160).toLowerCase();
  const phone=clean(b.phone,60);
  const purpose=clean(b.purpose,160)||'General Payment';
  const note=clean(b.note,1000);
  const amount=Number(b.amount);

  if(!name||!validEmail(email)||b.consent!=='on')
    return json({error:'Please complete all required fields.'},400);

  if(!Number.isFinite(amount)||amount<1||amount>100000)
    return json({error:'Payment amount must be between MYR 1.00 and MYR 100,000.00.'},400);

  const db=env.ENQUIRIES_DB;
  if(!db)return json({error:'Database unavailable.'},503);

  const orderReference=ref();
  const fixed=Math.round(amount*100)/100;

  const inserted=await db.prepare(`
    INSERT INTO orders(
      order_reference,customer_name,customer_email,customer_phone,
      currency,subtotal,total,sales_channel,payment_provider,payment_status
    ) VALUES(?,?,?,?,? ,?,?, 'Website','DOKU','Pending')
    RETURNING id
  `).bind(
    orderReference,name,email,phone,'MYR',fixed,fixed
  ).first();

  if(!inserted?.id)return json({error:'Unable to create payment record.'},500);

  await db.prepare(`
    INSERT INTO generic_payment_requests(
      order_id,payment_purpose,customer_note,created_at,updated_at
    ) VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(inserted.id,purpose,note).run();

  return json({ok:true,orderReference,amount:fixed,currency:'MYR'});
}

export function onRequest(c){
  return c.request.method==='POST'
    ? onRequestPost(c)
    : json({error:'Method not allowed.'},405);
}
