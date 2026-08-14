import {dbOf,sha256,randomSalt,passwordHash} from './_auth.js';

export async function onRequestPost({request,env}){
  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  try{
    const b=await request.json();
    const token=String(b.token||'').trim();
    const password=String(b.password||'');

    if(password.length<10)
      return Response.json({error:'Password must be at least 10 characters.'},{status:400});

    const tokenHash=await sha256(token);
    const t=await db.prepare(`
      SELECT id,affiliate_id,expires_at,used_at
      FROM affiliate_password_reset_tokens
      WHERE token_hash=?
      LIMIT 1
    `).bind(tokenHash).first();

    if(!t || t.used_at)
      return Response.json({error:'Reset link is invalid or already used.'},{status:400});

    const expired=await db.prepare(`
      SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END expired
    `).bind(t.expires_at).first();

    if(expired?.expired)
      return Response.json({error:'Reset link has expired.'},{status:400});

    const salt=randomSalt();
    const iterations=210000;
    const hash=await passwordHash(password,salt,iterations);
    const now=new Date().toISOString();

    await db.prepare(`
      UPDATE affiliates
      SET password_hash=?,
          password_salt=?,
          password_iterations=?,
          last_password_changed_at=?,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(hash,salt,iterations,now,t.affiliate_id).run();

    await db.prepare(`
      UPDATE affiliate_password_reset_tokens
      SET used_at=?
      WHERE id=?
    `).bind(now,t.id).run();

    await db.prepare(`
      UPDATE affiliate_sessions
      SET revoked_at=?
      WHERE affiliate_id=? AND revoked_at=''
    `).bind(now,t.affiliate_id).run();

    return Response.json({ok:true});
  }catch(e){
    console.error('affiliate reset password',e);
    return Response.json({error:'Unable to reset password.'},{status:500});
  }
}
