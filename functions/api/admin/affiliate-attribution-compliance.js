
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const mask=(type,last4)=>last4?`${type||'ID'} ••••••${last4}`:'—';

export async function onRequestGet({request,env}){
  if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
  const id=Number(new URL(request.url).searchParams.get('affiliate_id')||0);
  if(!id)return Response.json({error:'affiliate_id is required'},{status:400});

  const a=await db.prepare(`SELECT id,email FROM affiliates WHERE id=? LIMIT 1`).bind(id).first();
  if(!a)return Response.json({error:'Affiliate not found'},{status:404});

  const compliance=await db.prepare(`
    SELECT nationality,identification_type,identification_last4,terms_version,terms_accepted_at
    FROM affiliate_application_compliance
    WHERE affiliate_id=? OR email_normalized=lower(?)
    ORDER BY id DESC LIMIT 1
  `).bind(id,a.email||'').first();

  const attrs=await db.prepare(`
    SELECT customer_name,customer_email_normalized AS customer_email,
           first_order_reference,started_at,expires_at,status
    FROM affiliate_customer_attributions
    WHERE affiliate_id=?
    ORDER BY started_at DESC
  `).bind(id).all();

  return Response.json({
    compliance:compliance?{
      nationality:compliance.nationality,
      identification_type:compliance.identification_type,
      identification_masked:mask(compliance.identification_type,compliance.identification_last4),
      terms_version:compliance.terms_version,
      terms_accepted_at:compliance.terms_accepted_at
    }:null,
    attributions:attrs.results||[]
  },{headers:{'cache-control':'no-store'}});
}
