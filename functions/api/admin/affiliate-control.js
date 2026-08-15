
function dbOf(env){ return env.ENQUIRIES_DB || env.DB || null; }
function bearer(req){ const h=req.headers.get('authorization')||''; return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''; }
function authorised(req,env){ return !!env.ADMIN_TOKEN && bearer(req)===env.ADMIN_TOKEN; }
const allowed=['Pending','Approved','Rejected','Suspended','Archived'];

function esc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function sendStatusEmail(env,a,oldStatus,newStatus,reason){
  if(!env.RESEND_API_KEY || !a?.email) return {sent:false,skipped:true};

  let subject='Quantum YiJing® Affiliate Account Update';
  let headline='Affiliate Account Update';
  let en=`Your Quantum YiJing® Affiliate account status has been updated to ${newStatus}.`;
  let zh=`您的 Quantum YiJing® 联盟账户状态已更新为 ${newStatus}。`;

  if(newStatus==='Approved' && oldStatus!=='Approved'){
    if(oldStatus==='Suspended' || oldStatus==='Archived'){
      subject='Your Quantum YiJing® Affiliate Account Has Been Restored';
      headline='Affiliate Account Restored';
      en='Your Quantum YiJing® Affiliate account has been restored and portal access is available again.';
      zh='您的 Quantum YiJing® 联盟账户已恢复，现在可以重新使用联盟平台。';
    }else{
      subject='Your Quantum YiJing® Affiliate Account Is Approved';
      headline='Affiliate Account Approved';
      en='Your Quantum YiJing® Affiliate account has been approved.';
      zh='您的 Quantum YiJing® 联盟账户已获批准。';
    }
  }else if(newStatus==='Suspended'){
    subject='Quantum YiJing® Affiliate Account Suspended';
    headline='Affiliate Account Suspended';
    en='Your Quantum YiJing® Affiliate account has been temporarily suspended and portal access has been disabled.';
    zh='您的 Quantum YiJing® 联盟账户已暂时停用，联盟平台访问权限也已关闭。';
  }else if(newStatus==='Rejected'){
    subject='Quantum YiJing® Affiliate Application Status';
    headline='Affiliate Application Update';
    en='Your Quantum YiJing® Affiliate application/account has been marked as Rejected.';
    zh='您的 Quantum YiJing® 联盟申请/账户状态已更新为未获批准。';
  }else if(newStatus==='Archived'){
    subject='Quantum YiJing® Affiliate Account Archived';
    headline='Affiliate Account Archived';
    en='Your Quantum YiJing® Affiliate account has been archived and portal access has been disabled.';
    zh='您的 Quantum YiJing® 联盟账户已归档，联盟平台访问权限已关闭。';
  }

  const html=`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:680px;margin:auto">
  <h2 style="color:#0b56a5">${esc(headline)}</h2>
  <p>Dear ${esc(a.display_name||a.full_name||'Affiliate')},</p>
  <p>${esc(en)}</p><p>${esc(zh)}</p>
  ${reason?`<p><strong>Reason / 原因:</strong><br>${esc(reason)}</p>`:''}
  <p><strong>Affiliate Code:</strong> ${esc(a.affiliate_code||'')}</p>
  <p>Quantum YiJing® Affiliate Programme</p></div>`;

  const r=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      from:env.AFFILIATE_FROM_EMAIL||'Quantum YiJing <info@quantumyijing.com>',
      to:[a.email],subject,html
    })
  });
  if(!r.ok){ console.error('affiliate status email failed',r.status,await r.text()); return {sent:false,status:r.status}; }
  return {sent:true};
}

export async function onRequestGet({request,env}){
  if(!authorised(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const id=Number(new URL(request.url).searchParams.get('affiliate_id')||0);
  if(!id) return Response.json({error:'Affiliate ID required.'},{status:400});
  const row=await db.prepare(`SELECT id,affiliate_code,full_name,display_name,email,status,portal_enabled,
    membership_expires_at,is_test_account,admin_status_reason,admin_status_updated_at,admin_status_updated_by,
    last_portal_disabled_at,last_portal_enabled_at FROM affiliates WHERE id=?`).bind(id).first();
  if(!row) return Response.json({error:'Affiliate not found.'},{status:404});
  return Response.json({affiliate:row},{headers:{'cache-control':'no-store'}});
}

export async function onRequestPost({request,env}){
  if(!authorised(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  try{
    const b=await request.json();
    const id=Number(b.affiliate_id||0), action=String(b.action||'').trim(), reason=String(b.reason||'').trim();
    if(!id) return Response.json({error:'Affiliate ID required.'},{status:400});

    const a=await db.prepare(`SELECT id,affiliate_code,full_name,display_name,email,status,portal_enabled,is_test_account
                              FROM affiliates WHERE id=?`).bind(id).first();
    if(!a) return Response.json({error:'Affiliate not found.'},{status:404});
    const now=new Date().toISOString();

    if(action==='save_status'){
      const status=String(b.status||'').trim();
      if(!allowed.includes(status)) return Response.json({error:'Invalid affiliate status.'},{status:400});
      let portal=Number(b.portal_enabled?1:0);
      if(['Suspended','Rejected','Archived'].includes(status)) portal=0;

      await db.prepare(`UPDATE affiliates SET status=?,portal_enabled=?,admin_status_reason=?,
        admin_status_updated_at=?,admin_status_updated_by='Admin',
        last_portal_disabled_at=CASE WHEN ?=0 THEN ? ELSE last_portal_disabled_at END,
        last_portal_enabled_at=CASE WHEN ?=1 THEN ? ELSE last_portal_enabled_at END,
        suspended_at=CASE WHEN ?='Suspended' THEN ? ELSE suspended_at END,
        rejected_at=CASE WHEN ?='Rejected' THEN ? ELSE rejected_at END,
        updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(status,portal,reason,now,portal,now,portal,now,status,now,status,now,id).run();

      if(portal===0){
        await db.prepare(`UPDATE affiliate_sessions SET revoked_at=? WHERE affiliate_id=? AND revoked_at=''`)
          .bind(now,id).run();
      }

      const email_notification = a.status!==status
        ? await sendStatusEmail(env,a,a.status,status,reason)
        : {sent:false,skipped:true,unchanged:true};

      return Response.json({ok:true,previous_status:a.status,status,portal_enabled:portal,email_notification});
    }

    if(action==='revoke_sessions'){
      await db.prepare(`UPDATE affiliate_sessions SET revoked_at=? WHERE affiliate_id=? AND revoked_at=''`)
        .bind(now,id).run();
      return Response.json({ok:true});
    }

    return Response.json({error:'Unknown action.'},{status:400});
  }catch(e){
    console.error('affiliate control',e);
    return Response.json({error:'Unable to update affiliate account.'},{status:500});
  }
}
