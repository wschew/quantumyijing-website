import {dbOf} from '../coach/_auth.js';
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
function clean(v,n=500){return String(v??'').trim().slice(0,n)}
const SERVICES={FENGSHUI:'Feng Shui Consultation',BAZI:'Bazi Consultation',BIRTHDATE:'Auspicious Birthdate Selection',NAME:'Auspicious Name Baby/Company'};
async function serviceStats(db,row){
  try{const r=await db.prepare(`SELECT COUNT(DISTINCT o.id) cases,COALESCE(SUM(py.gross_amount),0) revenue
    FROM payments py JOIN orders o ON o.id=py.order_id
    WHERE py.order_id IN (SELECT DISTINCT oi.order_id FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE (? IS NOT NULL AND p.id=?) OR lower(trim(p.name_en))=lower(trim(?)))
      AND py.status IN ('Paid','External') AND py.verification_status IN ('Verified','Reconciled')
      AND date(COALESCE(py.paid_at,py.created_at))>=date(?)
      AND (?='' OR date(COALESCE(py.paid_at,py.created_at))<=date(?))`).bind(row.product_id,row.product_id,row.service_name,row.effective_from,row.effective_until||'',row.effective_until||'').first();return {case_count:Number(r?.cases||0),eligible_service_revenue:Number(r?.revenue||0)}}catch{return {case_count:0,eligible_service_revenue:0}}
}
function potential(x){return Number(x.eligible_service_revenue||0)*Number(x.commission_rate||0)/100+Number(x.commission_fixed_amount||0)}
async function overlap(db,{coachId,code,from,until,excludeId=0}){
  // Open-ended periods are treated as 9999-12-31. Same coach + same service may not overlap.
  const row=await db.prepare(`SELECT id,effective_from,effective_until FROM coach_service_assignments
    WHERE coach_id=? AND service_code=? AND id<>?
      AND date(effective_from)<=date(CASE WHEN ?='' THEN '9999-12-31' ELSE ? END)
      AND date(CASE WHEN effective_until='' OR effective_until IS NULL THEN '9999-12-31' ELSE effective_until END)>=date(?)
    LIMIT 1`).bind(coachId,code,excludeId,until,until,from).first();
  return row||null;
}
export async function onRequestGet({request,env}){if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});const db=dbOf(env);const r=await db.prepare(`SELECT a.*,c.coach_code,c.full_name coach_name FROM coach_service_assignments a JOIN coaches c ON c.id=a.coach_id ORDER BY a.id DESC`).all();const out=[];for(const row of r.results||[]){const s=await serviceStats(db,row);out.push({...row,...s,potential_commission:potential({...row,...s})})}return Response.json({services:Object.entries(SERVICES).map(([code,name])=>({code,name})),assignments:out},{headers:{'cache-control':'no-store'}})}
export async function onRequestPost({request,env}){if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});const db=dbOf(env);let b;try{b=await request.json()}catch{return Response.json({error:'Invalid request'},{status:400})};
  const action=clean(b.action,40)||'create';
  if(action==='end'){const id=Number(b.id||0);if(!id)return Response.json({error:'Assignment ID required.'},{status:400});const row=await db.prepare(`SELECT id,status,effective_from FROM coach_service_assignments WHERE id=?`).bind(id).first();if(!row)return Response.json({error:'Assignment not found.'},{status:404});if(row.status!=='Active')return Response.json({error:'Service assignment is already inactive.'},{status:409});const today=new Date().toISOString().slice(0,10);const end=today<row.effective_from?row.effective_from:today;await db.prepare(`UPDATE coach_service_assignments SET status='Inactive',effective_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(end,id).run();return Response.json({ok:true,ended_id:id,effective_until:end});}

  const coachId=Number(b.coach_id||0),code=clean(b.service_code,40),name=SERVICES[code];if(!coachId||!name)return Response.json({error:'Approved coach and service are required.'},{status:400});const c=await db.prepare(`SELECT status FROM coaches WHERE id=?`).bind(coachId).first();if(!c||c.status!=='Approved')return Response.json({error:'Only Approved coaches may be assigned.'},{status:400});const from=clean(b.effective_from,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(from))return Response.json({error:'Effective From date is required.'},{status:400});const until=clean(b.effective_until,10);if(until&&until<from)return Response.json({error:'Effective Until cannot be before Effective From.'},{status:400});const rate=Math.max(0,Number(b.commission_rate||0)),fixed=Math.max(0,Number(b.commission_fixed_amount||0));const status=['Active','Inactive'].includes(b.status)?b.status:'Active';let product=null;try{product=await db.prepare(`SELECT id FROM products WHERE lower(trim(name_en))=lower(trim(?)) LIMIT 1`).bind(name).first()}catch{}const productId=Number(product?.id||0)||null;

  if(action==='update'){
    const id=Number(b.id||0);if(!id)return Response.json({error:'Assignment ID required.'},{status:400});
    const old=await db.prepare(`SELECT * FROM coach_service_assignments WHERE id=?`).bind(id).first();if(!old)return Response.json({error:'Assignment not found.'},{status:404});
    const hit=await overlap(db,{coachId,code,from,until,excludeId:id});if(hit)return Response.json({error:`This coach already has an overlapping ${name} commission period (${hit.effective_from} to ${hit.effective_until||'Ongoing'}). End or shorten that period first.`},{status:409});
    const stats=await serviceStats(db,old);
    const historical=stats.case_count>0||stats.eligible_service_revenue>0;
    const rateChanged=Number(old.commission_rate||0)!==rate||Number(old.commission_fixed_amount||0)!==fixed||clean(old.effective_from,10)!==from||Number(old.coach_id)!==coachId||clean(old.service_code,40)!==code;
    if(historical&&rateChanged)return Response.json({error:'This assignment already has eligible service revenue/cases. Historical commission terms are locked. End the current period and create a new non-overlapping period with the new rate.'},{status:409});
    await db.prepare(`UPDATE coach_service_assignments SET coach_id=?,service_code=?,service_name=?,product_id=?,effective_from=?,effective_until=?,commission_rate=?,commission_fixed_amount=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(coachId,code,name,productId,from,until,rate,fixed,status,id).run();
    return Response.json({ok:true,id,updated:true});
  }

  const hit=await overlap(db,{coachId,code,from,until});if(hit)return Response.json({error:`This coach already has an overlapping ${name} commission period (${hit.effective_from} to ${hit.effective_until||'Ongoing'}). Edit/end that period first, then create the next seasonal rate period.`},{status:409});
  const r=await db.prepare(`INSERT INTO coach_service_assignments(coach_id,service_code,service_name,product_id,effective_from,effective_until,commission_rate,commission_fixed_amount,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(coachId,code,name,productId,from,until,rate,fixed,status,clean(b.notes,1000)).first();return Response.json({ok:true,id:r.id});
}
