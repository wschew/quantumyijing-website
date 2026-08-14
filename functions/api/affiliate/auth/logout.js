import {dbOf,readCookie,sha256,clearCookie} from './_auth.js';

export async function onRequestPost({request,env}){
  const db=dbOf(env);
  const token=readCookie(request,'QY_AFF_SESSION');

  if(db && token){
    const hash=await sha256(token);
    await db.prepare(`
      UPDATE affiliate_sessions
      SET revoked_at=CURRENT_TIMESTAMP
      WHERE token_hash=? AND revoked_at=''
    `).bind(hash).run();
  }

  return new Response(JSON.stringify({ok:true}),{
    headers:{
      'content-type':'application/json',
      'set-cookie':clearCookie('QY_AFF_SESSION'),
      'cache-control':'no-store'
    }
  });
}
