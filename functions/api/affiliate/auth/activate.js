import {
  dbOf,sha256,randomSalt,passwordHash
} from './_auth.js';

export async function onRequestPost({request,env}){
  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  try{
    const b=await request.json();
    const token=String(b.token||'').trim();
    const password=String(b.password||'');

    if(!token) return Response.json({error:'Activation token required'},{status:400});
    if(password.length<10)
      return Response.json({error:'Password must be at least 10 characters.'},{status:400});

    const tokenHash=await sha256(token);
    const t=await db.prepare(`
      SELECT t.id,t.affiliate_id,t.expires_at,t.used_at,a.status
      FROM affiliate_activation_tokens t
      JOIN affiliates a ON a.id=t.affiliate_id
      WHERE t.token_hash=?
      LIMIT 1
    `).bind(tokenHash).first();

    if(!t || t.used_at || t.status!=='Approved')
      return Response.json({error:'Activation link is invalid or already used.'},{status:400});

    const expired=await db.prepare(`
      SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END expired
    `).bind(t.expires_at).first();

    if(expired?.expired)
      return Response.json({error:'Activation link has expired. Please request a new activation link.'},{status:400});

    const salt=randomSalt();
    const iterations=210000;
    const hash=await passwordHash(password,salt,iterations);
    const now=new Date().toISOString();

    await db.prepare(`
      UPDATE affiliates
      SET portal_enabled=1,
          portal_activated_at=?,
          password_hash=?,
          password_salt=?,
          password_iterations=?,
          last_password_changed_at=?,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(now,hash,salt,iterations,now,t.affiliate_id).run();

    await db.prepare(`
      UPDATE affiliate_activation_tokens
      SET used_at=?
      WHERE id=?
    `).bind(now,t.id).run();

    return Response.json({ok:true});
  }catch(e){
    console.error('affiliate activate',e);
    return Response.json({error:'Unable to activate portal account.'},{status:500});
  }
}
