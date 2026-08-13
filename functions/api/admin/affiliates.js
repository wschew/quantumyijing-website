function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
async function nextCode(db){const x=await db.prepare(`SELECT affiliate_code FROM affiliates WHERE affiliate_code LIKE 'QY-A%'`).all();let m=0;for(const r of x.results||[]){const q=/^QY-A(\d+)$/.exec(r.affiliate_code||'');if(q)m=Math.max(m,+q[1])}return 'QY-A'+String(m+1).padStart(4,'0')}
export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database binding unavailable'},{status:503});
  const u=new URL(request.url),status=u.searchParams.get('status')||'';
  let sql=`SELECT id,affiliate_code,full_name,display_name,email,phone,country,account_type,bank_name,bank_account_name,bank_account_number,status,membership_expires_at,renewal_status FROM affiliates`;
  const q=status?db.prepare(sql+' WHERE status=? ORDER BY id DESC').bind(status):db.prepare(sql+' ORDER BY id DESC');
  const d=await q.all();
  return Response.json({results:(d.results||[]).map(r=>({...r,bank_account_number:r.bank_account_number?'•••• '+String(r.bank_account_number).replace(/\s/g,'').slice(-4):''}))});
}
export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database binding unavailable'},{status:503});
  const b=await request.json(),id=Number(b.id),action=String(b.action||'');
  const aff=await db.prepare(`SELECT * FROM affiliates WHERE id=?`).bind(id).first();
  if(!aff) return Response.json({error:'Affiliate not found'},{status:404});
  if(action==='approve'){
    if(aff.status==='Approved') return Response.json({ok:true,affiliate_code:aff.affiliate_code});
    const s=await db.prepare(`SELECT affiliate_membership_months FROM affiliate_settings WHERE id=1`).first();
    const months=Number(s?.affiliate_membership_months||12),code=await nextCode(db),start=new Date(),expiry=new Date(start);expiry.setUTCMonth(expiry.getUTCMonth()+months);
    await db.prepare(`UPDATE affiliates SET affiliate_code=?,status='Approved',approved_at=?,membership_started_at=?,membership_expires_at=?,last_renewed_at=?,renewal_status='Active',updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(code,start.toISOString(),start.toISOString(),expiry.toISOString(),start.toISOString(),id).run();
    return Response.json({ok:true,affiliate_code:code,membership_expires_at:expiry.toISOString()});
  }
  if(action==='reject'){await db.prepare(`UPDATE affiliates SET status='Rejected',rejected_at=?,renewal_status='Not Applicable',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(new Date().toISOString(),id).run();return Response.json({ok:true})}
  return Response.json({error:'Unsupported action'},{status:400});
}
