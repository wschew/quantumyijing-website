function unauthorized(){
  return Response.json({error:'Unauthorized'},{status:401});
}
function tokenFrom(request){
  const h = request.headers.get('authorization') || '';
  if(h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  const u = new URL(request.url);
  return u.searchParams.get('token') || '';
}
function allowed(request, env){
  const expected = env.ADMIN_TOKEN || '';
  const got = tokenFrom(request);
  return expected && got && got === expected;
}
function clean(v,max=300){ return String(v ?? '').trim().slice(0,max); }

async function nextAffiliateCode(env){
  const rows = await env.DB.prepare(`
    SELECT affiliate_code FROM affiliates
    WHERE affiliate_code LIKE 'QY-A%'
  `).all();
  let max=0;
  for(const r of (rows.results||[])){
    const m=/^QY-A(\d+)$/.exec(r.affiliate_code||'');
    if(m) max=Math.max(max, Number(m[1]));
  }
  return 'QY-A' + String(max+1).padStart(4,'0');
}

export async function onRequestGet({ request, env }) {
  if(!allowed(request,env)) return unauthorized();
  const u = new URL(request.url);
  const status = clean(u.searchParams.get('status') || '',30);

  let sql = `SELECT id,affiliate_code,full_name,display_name,email,phone,country,account_type,
                    bank_name,bank_account_name,bank_account_number,status,commission_override,
                    joined_at,approved_at,rejected_at,membership_started_at,membership_expires_at,
                    renewal_status,notes,created_at,updated_at
             FROM affiliates`;
  const binds=[];
  if(status){ sql += ' WHERE status=?'; binds.push(status); }
  sql += ' ORDER BY id DESC LIMIT 500';

  const q = env.DB.prepare(sql);
  const data = binds.length ? await q.bind(...binds).all() : await q.all();

  // Mask account number in list response. Full number is deliberately not returned here.
  const results=(data.results||[]).map(r=>({
    ...r,
    bank_account_number: r.bank_account_number
      ? '•••• ' + String(r.bank_account_number).replace(/\s/g,'').slice(-4)
      : ''
  }));
  return Response.json({results});
}

export async function onRequestPost({ request, env }) {
  if(!allowed(request,env)) return unauthorized();
  let body;
  try{ body=await request.json(); }catch{ return Response.json({error:'Invalid JSON'},{status:400}); }

  const id=Number(body.id);
  const action=clean(body.action,30);
  if(!Number.isInteger(id) || id<1) return Response.json({error:'Invalid affiliate id'},{status:400});

  const aff=await env.DB.prepare(`SELECT * FROM affiliates WHERE id=?`).bind(id).first();
  if(!aff) return Response.json({error:'Affiliate not found'},{status:404});

  if(action==='approve'){
    if(aff.status==='Approved') return Response.json({ok:true,affiliate_code:aff.affiliate_code,already_approved:true});
    const settings=await env.DB.prepare(`SELECT affiliate_membership_months FROM affiliate_settings WHERE id=1`).first();
    const months=Number(settings?.affiliate_membership_months || 12);
    const code=await nextAffiliateCode(env);
    const start=new Date();
    const expiry=new Date(start);
    expiry.setUTCMonth(expiry.getUTCMonth()+months);

    await env.DB.prepare(`
      UPDATE affiliates SET
        affiliate_code=?, status='Approved',
        approved_at=?, membership_started_at=?, membership_expires_at=?,
        last_renewed_at=?, renewal_status='Active', updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(code,start.toISOString(),start.toISOString(),expiry.toISOString(),start.toISOString(),id).run();

    if(env.RESEND_API_KEY){
      try{
        await fetch('https://api.resend.com/emails',{
          method:'POST',
          headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
          body:JSON.stringify({
            from: env.AFFILIATE_FROM_EMAIL || 'Quantum YiJing <info@quantumyijing.com>',
            to:[aff.email],
            subject:'Welcome to the Quantum YiJing® Affiliate Programme',
            html:`<h2>Your QY Affiliate application has been approved.</h2>
                  <p><b>Affiliate Code:</b> ${code}</p>
                  <p>Your membership is active for ${months} months and is renewable annually.</p>
                  <p>Use your code with eligible QY product links. Example:<br>
                  <code>https://quantumyijing.com/?aff=${code}</code></p>
                  <p>Quantum YiJing®</p>`
          })
        });
      }catch(_){}
    }
    return Response.json({ok:true,affiliate_code:code,membership_expires_at:expiry.toISOString()});
  }

  if(action==='reject'){
    const now=new Date().toISOString();
    await env.DB.prepare(`
      UPDATE affiliates SET status='Rejected', rejected_at=?, renewal_status='Not Applicable',
      updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(now,id).run();
    return Response.json({ok:true});
  }

  if(action==='suspend'){
    const now=new Date().toISOString();
    await env.DB.prepare(`
      UPDATE affiliates SET status='Suspended', suspended_at=?, renewal_status='Suspended',
      updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(now,id).run();
    return Response.json({ok:true});
  }

  return Response.json({error:'Unsupported action'},{status:400});
}
