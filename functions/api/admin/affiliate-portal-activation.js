import {
  dbOf,randomToken,sha256,sendEmail,esc
} from '../affiliate/auth/_auth.js';

function tok(req){
  const h=req.headers.get('authorization')||'';
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}

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

    await sendEmail(env.RESEND_API_KEY,{
      from:'Quantum YiJing International Academy <info@quantumyijing.com>',
      to:[a.email],
      subject:'Activate Your Quantum YiJing® Affiliate Portal / 启用联盟平台',
      html:`<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033">
        <h2 style="color:#0b56a5">Activate Your Affiliate Portal</h2>
        <p>Dear ${esc(a.full_name)},</p>
        <p>Your Quantum YiJing® Affiliate Code is <b>${esc(a.affiliate_code)}</b>.</p>
        <p>Please use the secure link below to create your password and activate your private Affiliate Portal. The link expires in 7 days.</p>
        <p><a href="${link}">Activate Affiliate Portal</a></p>
        <hr style="border:0;border-top:1px solid #d8e2ee;margin:24px 0">
        <h2 style="color:#0b56a5">启用您的联盟平台</h2>
        <p>${esc(a.full_name)} 您好：</p>
        <p>您的 Quantum YiJing® 联盟代码为 <b>${esc(a.affiliate_code)}</b>。</p>
        <p>请使用以下安全链接建立密码并启用您的私人联盟平台。链接将在 7 天后失效。</p>
        <p><a href="${link}">启用联盟平台</a></p>
      </div>`
    });

    return Response.json({ok:true,portal_enabled:!!a.portal_enabled});
  }catch(e){
    console.error('affiliate activation send',e);
    return Response.json({error:'Unable to send activation link.'},{status:500});
  }
}
