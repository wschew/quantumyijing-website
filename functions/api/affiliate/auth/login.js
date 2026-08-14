import {
  dbOf,verifyPassword,randomToken,sha256,cookie
} from './_auth.js';

export async function onRequestPost({request,env}){
  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  try{
    const b=await request.json();
    const email=String(b.email||'').trim().toLowerCase();
    const password=String(b.password||'');

    const a=await db.prepare(`
      SELECT id,email,status,portal_enabled,password_hash,password_salt,
             password_iterations,membership_expires_at
      FROM affiliates
      WHERE lower(email)=lower(?)
      LIMIT 1
    `).bind(email).first();

    if(!a || a.status!=='Approved' || !a.portal_enabled || !a.password_hash)
      return Response.json({error:'Invalid email or password.'},{status:401});

    const memberValid=await db.prepare(`
      SELECT CASE
        WHEN ?='' THEN 1
        WHEN datetime(?) > datetime('now') THEN 1
        ELSE 0
      END valid
    `).bind(a.membership_expires_at,a.membership_expires_at).first();

    if(!memberValid?.valid)
      return Response.json({error:'Affiliate membership has expired. Please contact Quantum YiJing for renewal.'},{status:403});

    const valid=await verifyPassword(
      password,a.password_salt,a.password_iterations,a.password_hash
    );
    if(!valid) return Response.json({error:'Invalid email or password.'},{status:401});

    const token=randomToken(32);
    const hash=await sha256(token);
    const now=new Date();
    const expires=new Date(now.getTime()+30*24*60*60*1000);

    await db.prepare(`
      INSERT INTO affiliate_sessions
      (affiliate_id,token_hash,expires_at,last_seen_at,user_agent)
      VALUES (?,?,?,?,?)
    `).bind(
      a.id,hash,expires.toISOString(),now.toISOString(),
      String(request.headers.get('user-agent')||'').slice(0,500)
    ).run();

    await db.prepare(`
      UPDATE affiliates SET last_login_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(now.toISOString(),a.id).run();

    return new Response(JSON.stringify({ok:true}),{
      status:200,
      headers:{
        'content-type':'application/json',
        'set-cookie':cookie('QY_AFF_SESSION',token,30*24*60*60),
        'cache-control':'no-store'
      }
    });
  }catch(e){
    console.error('affiliate login',e);
    return Response.json({error:'Unable to sign in.'},{status:500});
  }
}
