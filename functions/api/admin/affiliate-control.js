function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function authorised(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
const statuses=['Pending','Approved','Rejected','Suspended','Archived'];

export async function onRequestPost({request,env}){
 if(!authorised(request,env))return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 try{
  const b=await request.json(),affiliate_id=Number(b.affiliate_id),action=String(b.action||'').trim(),reason=String(b.reason||'').trim();
  if(!affiliate_id)return Response.json({error:'Affiliate ID required.'},{status:400});
  const a=await db.prepare(`SELECT id,status,portal_enabled FROM affiliates WHERE id=?`).bind(affiliate_id).first();
  if(!a)return Response.json({error:'Affiliate not found.'},{status:404});
  const now=new Date().toISOString();

  if(action==='set_status'){
   const status=String(b.status||'').trim();
   if(!statuses.includes(status))return Response.json({error:'Invalid affiliate status.'},{status:400});
   let pe=Number(a.portal_enabled||0);
   if(['Suspended','Rejected','Archived'].includes(status))pe=0;
   await db.prepare(`UPDATE affiliates SET status=?,portal_enabled=?,admin_status_reason=?,admin_status_updated_at=?,admin_status_updated_by='Admin',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,pe,reason,now,affiliate_id).run();
   if(['Suspended','Rejected','Archived'].includes(status))await db.prepare(`UPDATE affiliate_sessions SET revoked_at=? WHERE affiliate_id=? AND revoked_at=''`).bind(now,affiliate_id).run();
   return Response.json({ok:true,status,portal_enabled:pe});
  }

  if(action==='disable_portal'){
   await db.prepare(`UPDATE affiliates SET portal_enabled=0,last_portal_disabled_at=?,admin_status_reason=?,admin_status_updated_at=?,admin_status_updated_by='Admin',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(now,reason,now,affiliate_id).run();
   await db.prepare(`UPDATE affiliate_sessions SET revoked_at=? WHERE affiliate_id=? AND revoked_at=''`).bind(now,affiliate_id).run();
   return Response.json({ok:true,portal_enabled:0});
  }

  if(action==='enable_portal'){
   await db.prepare(`UPDATE affiliates SET portal_enabled=1,last_portal_enabled_at=?,admin_status_reason=?,admin_status_updated_at=?,admin_status_updated_by='Admin',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(now,reason,now,affiliate_id).run();
   return Response.json({ok:true,portal_enabled:1});
  }

  if(action==='revoke_sessions'){
   await db.prepare(`UPDATE affiliate_sessions SET revoked_at=? WHERE affiliate_id=? AND revoked_at=''`).bind(now,affiliate_id).run();
   return Response.json({ok:true});
  }

  return Response.json({error:'Unknown action.'},{status:400});
 }catch(e){
  console.error('affiliate admin control',e);
  return Response.json({error:'Unable to update affiliate account.'},{status:500});
 }
}
