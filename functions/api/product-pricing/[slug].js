const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});

export async function onRequestGet(context){
  const slug=String(context.params.slug||'').trim();
  if(!slug)return reply({error:'Product not found.'},404);

  const product=await context.env.ENQUIRIES_DB.prepare(`
    SELECT slug,status,price,currency,early_bird_price,early_bird_end
    FROM products
    WHERE slug=? AND status='Active'
    LIMIT 1
  `).bind(slug).first();
  if(!product)return reply({error:'Product not found.'},404);

  const today=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date());
  const earlyBirdActive=Number(product.early_bird_price)>0 && product.early_bird_end && today<=product.early_bird_end;

  return reply({
    slug:product.slug,
    currency:product.currency||'MYR',
    standardPrice:Number(product.price||0),
    earlyBirdPrice:product.early_bird_price==null?null:Number(product.early_bird_price),
    earlyBirdEnd:product.early_bird_end||null,
    earlyBirdActive:Boolean(earlyBirdActive),
    effectivePrice:earlyBirdActive?Number(product.early_bird_price):Number(product.price||0)
  });
}
