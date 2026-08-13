function clean(v, max=200){
  return String(v ?? '').trim().slice(0,max);
}
function emailOk(v){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function randRef(){
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return 'AFFAPP-' + Date.now().toString(36).toUpperCase() + '-' +
    Array.from(a).map(x=>x.toString(36).toUpperCase()).join('').slice(0,8);
}
function pendingCode(){
  return 'PENDING-' + crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({error:'Invalid request.'},{status:400}); }

  const full_name = clean(body.full_name,120);
  const display_name = clean(body.display_name,120);
  const email = clean(body.email,160).toLowerCase();
  const phone = clean(body.phone,60);
  const country = clean(body.country,100);
  const account_type = clean(body.account_type,20);
  const bank_name = clean(body.bank_name,120);
  const bank_account_name = clean(body.bank_account_name,160);
  const bank_account_number = clean(body.bank_account_number,80);
  const privacy_consent = body.privacy_consent === true ? 1 : 0;
  const terms_accepted = body.terms_accepted === true ? 1 : 0;

  if(!full_name || !emailOk(email) || !phone || !country || !bank_name || !bank_account_name || !bank_account_number){
    return Response.json({error:'Please complete all required fields.'},{status:400});
  }
  if(!['Individual','Company'].includes(account_type)){
    return Response.json({error:'Invalid account type.'},{status:400});
  }
  if(!privacy_consent || !terms_accepted){
    return Response.json({error:'Privacy consent and Affiliate Programme terms must be accepted.'},{status:400});
  }

  const existing = await env.DB.prepare(`
    SELECT id,status,affiliate_code FROM affiliates
    WHERE lower(email)=lower(?) AND status IN ('Pending','Approved')
    ORDER BY id DESC LIMIT 1
  `).bind(email).first();

  if(existing){
    return Response.json({
      error: existing.status === 'Approved'
        ? 'An approved affiliate account already exists for this email.'
        : 'An affiliate application for this email is already pending review.'
    },{status:409});
  }

  const ref = randRef();
  const pcode = pendingCode();
  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    INSERT INTO affiliates (
      affiliate_code, full_name, display_name, email, phone, country, account_type,
      bank_name, bank_account_name, bank_account_number, status,
      privacy_consent, terms_accepted, terms_accepted_at, joined_at, notes,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,'Pending',1,1,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(
    pcode, full_name, display_name, email, phone, country, account_type,
    bank_name, bank_account_name, bank_account_number, now, now,
    `Application reference: ${ref}`
  ).run();

  // Optional admin notification via Resend if configured.
  if(env.RESEND_API_KEY){
    try{
      await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          from: env.AFFILIATE_FROM_EMAIL || 'Quantum YiJing <info@quantumyijing.com>',
          to:[env.AFFILIATE_ADMIN_EMAIL || 'info@quantumyijing.com'],
          subject:`New QY Affiliate Application — ${full_name}`,
          html:`<h2>New Affiliate Application</h2>
                <p><b>Reference:</b> ${ref}</p>
                <p><b>Name:</b> ${full_name}</p>
                <p><b>Email:</b> ${email}</p>
                <p><b>Phone:</b> ${phone}</p>
                <p><b>Country:</b> ${country}</p>
                <p>Review in the QY Affiliate Admin page.</p>`
        })
      });
    }catch(_){}
  }

  return Response.json({
    ok:true,
    application_reference:ref,
    affiliate_record_id:result.meta?.last_row_id ?? null
  },{status:201});
}
