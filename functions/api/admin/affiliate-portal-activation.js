import {
  dbOf,randomToken,sha256,sendEmail,esc
} from '../affiliate/auth/_auth.js';

function tok(req){
  const h=req.headers.get('authorization')||'';
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});

  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  try{
    const q=await db.prepare(`
      SELECT id,affiliate_code,full_name,email,status,portal_enabled
      FROM affiliates
      WHERE status='Approved'
        AND COALESCE(portal_enabled,0)=0
      ORDER BY id DESC
    `).all();

    return Response.json({
      ok:true,
      affiliates:q.results||[]
    });
  }catch(e){
    console.error('affiliate activation waiting list',e);
    return Response.json({error:'Unable to load affiliates waiting for activation.'},{status:500});
  }
}

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  try{
    const b=await request.json();
    const id=Number(b.affiliate_id);

    const a=await db.prepare(`
      SELECT id,affiliate_code,full_name,email,status,portal_enabled
      FROM affiliates WHERE id=?
    `).bind(id).first();

    if(!a || a.status!=='Approved')
      return Response.json({error:'Approved affiliate not found.'},{status:404});

    if(Number(a.portal_enabled)===1)
      return Response.json({error:'Affiliate portal is already active.'},{status:409});

    const token=randomToken(32);
    const tokenHash=await sha256(token);
    const expires=new Date(Date.now()+7*24*60*60*1000).toISOString();

    await db.prepare(`
      INSERT INTO affiliate_activation_tokens
      (affiliate_id,token_hash,expires_at)
      VALUES (?,?,?)
    `).bind(a.id,tokenHash,expires).run();

    const origin=new URL(request.url).origin;
    const link=`${origin}/affiliate-activate.html?token=${encodeURIComponent(token)}`;

    const logoUrl='https://quantumyijing.com/images/quantum-yijing-3d-logo.png';
    const safeName=esc(a.full_name||'Affiliate');
    const safeCode=esc(a.affiliate_code||'');
    const safeLink=esc(link);

    const html=`<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
style="max-width:680px;background:#ffffff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden;box-shadow:0 12px 34px rgba(19,55,96,.10)">
<tr><td style="padding:26px 30px;background:#edf5ff;border-bottom:4px solid #d3a62c">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td width="82" valign="middle"><img src="${logoUrl}" width="68" height="68" alt="Quantum YiJing International Academy" style="display:block;width:68px;height:68px;object-fit:contain;border:0"></td>
<td valign="middle"><div style="font-size:21px;line-height:1.2;font-weight:800;color:#082b63">Quantum YiJing</div>
<div style="margin-top:4px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:2px;color:#45688f">INTERNATIONAL ACADEMY</div></td>
</tr></table></td></tr>

<tr><td style="padding:34px 34px 18px">
<div style="font-size:12px;font-weight:800;letter-spacing:1.7px;color:#1768c4;text-transform:uppercase">Affiliate Programme</div>
<h1 style="margin:10px 0 22px;font-size:27px;line-height:1.28;color:#0b2f66">Activate Your Affiliate Portal</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.75">Dear ${safeName},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.75">Your Quantum YiJing® Affiliate account has been approved and is ready for portal activation.</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#f7faff;border:1px solid #dce8f6;border-radius:12px">
<tr><td style="padding:13px 16px;color:#58708d;font-size:13px;width:145px">Affiliate Code</td>
<td style="padding:13px 16px;font-size:13px;font-weight:700;color:#173b63">${safeCode||'—'}</td></tr>
<tr><td style="padding:13px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Activation Link</td>
<td style="padding:13px 16px;font-size:13px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">Valid for 7 days</td></tr>
</table>

<p style="margin:0 0 22px;font-size:15px;line-height:1.75">Please click the button below to create your password and activate your private Affiliate Portal.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr>
<td align="center" bgcolor="#1768c4" style="border-radius:8px">
<a href="${safeLink}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">Activate Affiliate Portal</a>
</td></tr></table>

<p style="margin:0 0 16px;font-size:12px;line-height:1.7;color:#71839a">For security, this activation link expires in 7 days. If the button does not work, copy and paste this URL into your browser:<br>
<span style="word-break:break-all;color:#1768c4">${safeLink}</span></p>
<p style="margin:24px 0 0;font-size:15px;line-height:1.75">Warm regards,<br><strong>Master Chew Wai Soon</strong><br>
<span style="color:#526a85">Founder &amp; Chief Instructor</span></p>
</td></tr>

<tr><td style="padding:8px 34px 26px"><div style="border-top:1px solid #dce7f4;padding-top:26px">
<div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#1768c4">联盟计划</div>
<h2 style="margin:10px 0 20px;font-size:23px;line-height:1.4;color:#0b2f66">启用您的联盟平台</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.85">尊敬的 ${safeName}：</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.85">您的 Quantum YiJing® 联盟账户已获批准，现在可以启用私人联盟平台。</p>
<p style="margin:18px 0;font-size:15px;line-height:1.85"><strong>联盟编号：</strong> ${safeCode||'—'}<br><strong>启用链接有效期：</strong> 7 天</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.85">请点击以下按钮建立密码并启用您的私人联盟平台。</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr>
<td align="center" bgcolor="#1768c4" style="border-radius:8px">
<a href="${safeLink}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">启用联盟平台</a>
</td></tr></table>
<p style="margin:0 0 16px;font-size:12px;line-height:1.85;color:#71839a">为了账户安全，此启用链接将在 7 天后失效。如果按钮无法打开，请复制以下网址到浏览器：<br>
<span style="word-break:break-all;color:#1768c4">${safeLink}</span></p>
<p style="margin:24px 0 0;font-size:15px;line-height:1.85">敬祝安好！<br><strong>赵辉顺导师</strong><br><span style="color:#526a85">创办人｜首席导师</span></p>
</div></td></tr>

<tr><td align="center" style="padding:22px 26px;background:#f7f9fc;border-top:1px solid #e0e8f2;color:#5d7189;font-size:12px;line-height:1.8">
<a href="https://quantumyijing.com" style="color:#1768c4;text-decoration:none;font-weight:700">quantumyijing.com</a>
&nbsp;&nbsp;•&nbsp;&nbsp;
<a href="mailto:info@quantumyijing.com" style="color:#1768c4;text-decoration:none;font-weight:700">info@quantumyijing.com</a><br>
<span style="color:#7a8ca2">Where Ancient Wisdom Meets Modern Scientific Thinking</span><br>
<span style="color:#9aa8b8">© ${new Date().getFullYear()} Quantum YiJing International Academy</span>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

    await sendEmail(env.RESEND_API_KEY,{
      from:'Quantum YiJing International Academy <info@quantumyijing.com>',
      to:[a.email],
      subject:'Activate Your Quantum YiJing® Affiliate Portal | 启用您的联盟平台',
      html
    });

    return Response.json({ok:true,portal_enabled:!!a.portal_enabled});
  }catch(e){
    console.error('affiliate activation send',e);
    return Response.json({error:'Unable to send activation link.'},{status:500});
  }
}
