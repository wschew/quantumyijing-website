
function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function authorised(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
const allowed=['Pending','Approved','Rejected','Suspended','Archived'];

export async function onRequestGet({request,env}){
  if(!authorised(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  const u=new URL(request.url);
  const id=Number(u.searchParams.get('affiliate_id')||0);
  if(!id) return Response.json({error:'Affiliate ID required.'},{status:400});
  const row=await db.prepare(`
    SELECT id,affiliate_code,full_name,status,portal_enabled,
           membership_expires_at,admin_status_reason,
           admin_status_updated_at,admin_status_updated_by,
           last_portal_disabled_at,last_portal_enabled_at
    FROM affiliates WHERE id=?
  `).bind(id).first();
  if(!row) return Response.json({error:'Affiliate not found.'},{status:404});
  return Response.json({affiliate:row},{headers:{'cache-control':'no-store'}});
}

export async function onRequestPost({request,env}){
  if(!authorised(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
  try{
    const b=await request.json();
    const id=Number(b.affiliate_id||0);
    const action=String(b.action||'').trim();
    const reason=String(b.reason||'').trim();
    if(!id) return Response.json({error:'Affiliate ID required.'},{status:400});

    const a=await db.prepare(`SELECT id,status,portal_enabled FROM affiliates WHERE id=?`).bind(id).first();
    if(!a) return Response.json({error:'Affiliate not found.'},{status:404});

    const now=new Date().toISOString();

    if(action==='save_status'){
      const status=String(b.status||'').trim();
      if(!allowed.includes(status)) return Response.json({error:'Invalid affiliate status.'},{status:400});

      let portal=Number(b.portal_enabled?1:0);
      if(['Suspended','Rejected','Archived'].includes(status)) portal=0;

      await db.prepare(`
        UPDATE affiliates
        SET status=?,
            portal_enabled=?,
            admin_status_reason=?,
            admin_status_updated_at=?,
            admin_status_updated_by='Admin',
            last_portal_disabled_at=CASE WHEN ?=0 THEN ? ELSE last_portal_disabled_at END,
            last_portal_enabled_at=CASE WHEN ?=1 THEN ? ELSE last_portal_enabled_at END,
            suspended_at=CASE WHEN ?='Suspended' THEN ? ELSE suspended_at END,
            rejected_at=CASE WHEN ?='Rejected' THEN ? ELSE rejected_at END,
            updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(
        status,portal,reason,now,
        portal,now,
        portal,now,
        status,now,
        status,now,
        id
      ).run();

      if(portal===0){
        await db.prepare(`
          UPDATE affiliate_sessions
          SET revoked_at=?
          WHERE affiliate_id=? AND revoked_at=''
        `).bind(now,id).run();
      }

      return Response.json({ok:true,status,portal_enabled:portal});
    }

    if(action==='revoke_sessions'){
      await db.prepare(`
        UPDATE affiliate_sessions SET revoked_at=?
        WHERE affiliate_id=? AND revoked_at=''
      `).bind(now,id).run();
      return Response.json({ok:true});
    }

    return Response.json({error:'Unknown action.'},{status:400});
  }catch(e){
    console.error('affiliate control',e);
    return Response.json({error:'Unable to update affiliate account.'},{status:500});
  }
}
