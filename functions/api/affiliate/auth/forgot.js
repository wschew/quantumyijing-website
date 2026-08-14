import {dbOf,randomToken,sha256,sendEmail,esc} from './_auth.js';

export async function onRequestPost({request,env}){
  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  try{
    const b=await request.json();
    const email=String(b.email||'').trim().toLowerCase();

    const a=await db.prepare(`
      SELECT id,full_name,email,status,portal_enabled
      FROM affiliates
      WHERE lower(email)=lower(?)
      LIMIT 1
    `).bind(email).first();

    // Never reveal whether an account exists.
    if(!a || a.status!=='Approved' || !a.portal_enabled){
      return Response.json({ok:true});
    }

    const token=randomToken(32);
    const tokenHash=await sha256(token);
    const expires=new Date(Date.now()+60*60*1000).toISOString();

    await db.prepare(`
      INSERT INTO affiliate_password_reset_tokens
      (affiliate_id,token_hash,expires_at)
      VALUES (?,?,?)
    `).bind(a.id,tokenHash,expires).run();

    const origin=new URL(request.url).origin;
    const link=`${origin}/affiliate-reset.html?token=${encodeURIComponent(token)}`;

    await sendEmail(env.RESEND_API_KEY,{
      from:'Quantum YiJing International Academy <info@quantumyijing.com>',
      to:[a.email],
      subject:'Quantum YiJing® Affiliate Password Reset / 联盟密码重设',
      html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033">
        <h2 style="color:#0b56a5">Reset Your Affiliate Portal Password</h2>
        <p>Dear ${esc(a.full_name)},</p>
        <p>Use the secure link below to reset your password. The link expires in 60 minutes.</p>
        <p><a href="${link}">Reset Affiliate Portal Password</a></p>
        <hr style="border:0;border-top:1px solid #d8e2ee;margin:24px 0">
        <h2 style="color:#0b56a5">重设联盟平台密码</h2>
        <p>${esc(a.full_name)} 您好：</p>
        <p>请使用以下安全链接重设密码。链接将在 60 分钟后失效。</p>
        <p><a href="${link}">重设联盟平台密码</a></p>
      </div>`
    });

    return Response.json({ok:true});
  }catch(e){
    console.error('affiliate forgot password',e);
    return Response.json({ok:true});
  }
}
