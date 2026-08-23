
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const normEmail=v=>clean(v,200).toLowerCase();

async function sha256(v){
  const b=new TextEncoder().encode(v);
  const d=await crypto.subtle.digest('SHA-256',b);
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}

export async function onRequestPost({request,env}){
  const db=dbOf(env);
  if(!db)return Response.json({error:'Database unavailable.'},{status:503});
  const b=await request.json().catch(()=>({}));

  const email=normEmail(b.email);
  const nationality=clean(b.nationality,100);
  const identificationType=clean(b.identification_type,80);
  const identificationNumber=clean(b.identification_number,120).replace(/\s+/g,'');
  const termsVersion=clean(b.terms_version,80);
  const accepted=b.terms_accepted===true;

  if(!email||!nationality||!identificationType||!identificationNumber)
    return Response.json({error:'Nationality and identification details are required.'},{status:400});
  if(!accepted||!termsVersion)
    return Response.json({error:'Affiliate Terms & Conditions must be accepted.'},{status:400});

  const malaysia=/malaysia/i.test(nationality);
  if(malaysia && !/mykad|nric|ic/i.test(identificationType))
    return Response.json({error:'Malaysian affiliates must use NRIC / MyKad identification.'},{status:400});

  const current=await db.prepare(`
    SELECT version FROM affiliate_terms_versions WHERE version=? AND is_current=1 LIMIT 1
  `).bind(termsVersion).first();
  if(!current)return Response.json({error:'The affiliate terms version is not current. Please reload the application.'},{status:409});

  const aff=await db.prepare(`SELECT id FROM affiliates WHERE lower(email)=? ORDER BY id DESC LIMIT 1`)
    .bind(email).first();

  const now=new Date().toISOString();
  const hash=await sha256(identificationNumber);
  const last4=identificationNumber.slice(-4);
  const country=clean(request.headers.get('cf-ipcountry')||'',8);

  await db.prepare(`
    INSERT INTO affiliate_application_compliance(
      affiliate_id,email_normalized,nationality,identification_type,
      identification_number,identification_last4,identification_hash,
      terms_version,terms_accepted_at,terms_ip_country,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(email_normalized) DO UPDATE SET
      affiliate_id=COALESCE(excluded.affiliate_id,affiliate_application_compliance.affiliate_id),
      nationality=excluded.nationality,
      identification_type=excluded.identification_type,
      identification_number=excluded.identification_number,
      identification_last4=excluded.identification_last4,
      identification_hash=excluded.identification_hash,
      terms_version=excluded.terms_version,
      terms_accepted_at=excluded.terms_accepted_at,
      terms_ip_country=excluded.terms_ip_country,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    aff?.id||null,email,nationality,identificationType,identificationNumber,last4,hash,
    termsVersion,now,country
  ).run();

  return Response.json({ok:true,masked_identification:`••••${last4}`,terms_version:termsVersion});
}
