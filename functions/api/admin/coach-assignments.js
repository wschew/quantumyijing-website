import {dbOf} from '../coach/_auth.js';
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
function clean(v,n=500){return String(v??'').trim().slice(0,n)}
function potential(x){return Number(x.eligible_course_revenue||0)*Number(x.commission_rate||0)/100+Number(x.commission_fixed_amount||0)}
function isoDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?String(d):''}
function addDays(s,n){const d=new Date(`${s}T00:00:00Z`);if(Number.isNaN(d.getTime()))return '';d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function monthOf(s){return String(s||'').slice(0,7)}
async function liveStats(db,productId,until=''){
  const end=until?` AND date(COALESCE(py.paid_at,py.created_at))<=date(?)`:'';
  const sql=`SELECT COUNT(DISTINCT o.id) participant_count,COALESCE(SUM(py.gross_amount),0) eligible_revenue
    FROM payments py JOIN orders o ON o.id=py.order_id
    WHERE py.order_id IN (SELECT DISTINCT oi.order_id FROM order_items oi WHERE oi.product_id=?)
      AND py.status IN ('Paid','External') AND py.verification_status IN ('Verified','Reconciled')${end}`;
  try{const r=until?await db.prepare(sql).bind(productId,until).first():await db.prepare(sql).bind(productId).first();return {participant_count:Number(r?.participant_count||0),eligible_course_revenue:Number(r?.eligible_revenue||0)}}catch{return {participant_count:0,eligible_course_revenue:0}}
}
async function refreshAndClose(db,row){
  if(row.course_status==='Cancelled')return row;
  const today=new Date().toISOString().slice(0,10),end=isoDate(row.course_end_date),maxClose=end?addDays(end,5):'',chosen=isoDate(row.closing_date),closeDate=chosen&&(!maxClose||chosen<=maxClose)?chosen:maxClose;
  if(Number(row.participant_count_locked))return row;
  const shouldClose=!!closeDate&&today>=closeDate;
  const stats=await liveStats(db,row.product_id,shouldClose?closeDate:'');
  const merged={...row,...stats};
  if(shouldClose){const final=potential(merged);await db.prepare(`UPDATE coach_course_assignments SET participant_count=?,eligible_course_revenue=?,participant_count_locked=1,final_commission=?,course_status='Conducted',closing_date=?,closed_at=CURRENT_TIMESTAMP,payout_eligible_month=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(stats.participant_count,stats.eligible_course_revenue,final,closeDate,monthOf(closeDate),row.id).run();return {...merged,participant_count_locked:1,final_commission:final,course_status:'Conducted',closing_date:closeDate,payout_eligible_month:monthOf(closeDate)}}
  await db.prepare(`UPDATE coach_course_assignments SET participant_count=?,eligible_course_revenue=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(stats.participant_count,stats.eligible_course_revenue,row.id).run();return merged;
}
export async function onRequestGet({request,env}){if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});const db=dbOf(env);const r=await db.prepare(`SELECT a.*,c.coach_code,c.full_name coach_name FROM coach_course_assignments a JOIN coaches c ON c.id=a.coach_id ORDER BY a.course_start_date DESC,a.id DESC`).all();const out=[];for(const row of r.results||[]){const x=await refreshAndClose(db,row);out.push({...x,potential_commission:Number(x.participant_count_locked)?Number(x.final_commission||0):potential(x)})}return Response.json({assignments:out},{headers:{'cache-control':'no-store'}})}
export async function onRequestPost({request,env}){if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});const db=dbOf(env);let b;try{b=await request.json()}catch{return Response.json({error:'Invalid request'},{status:400})};const coachId=Number(b.coach_id||0),productId=Number(b.product_id||0);if(!coachId||!productId)return Response.json({error:'Coach and course are required.'},{status:400});const c=await db.prepare(`SELECT id,status FROM coaches WHERE id=?`).bind(coachId).first();if(!c||c.status!=='Approved')return Response.json({error:'Only Approved coaches may be assigned.'},{status:400});
  const start=isoDate(b.course_start_date),end=isoDate(b.course_end_date);if(!start||!end)return Response.json({error:'Course start and end dates are required.'},{status:400});const maxClose=addDays(end,5);let closing=isoDate(b.closing_date)||maxClose;if(closing<end||closing>maxClose)return Response.json({error:`Closing date must be between ${end} and ${maxClose}.`},{status:400});
  const rate=Math.max(0,Number(b.commission_rate||0)),fixed=Math.max(0,Number(b.commission_fixed_amount||0));
  const vals=[coachId,productId,clean(b.course_sku,80),clean(b.course_name,240),start,end,'Planned','percentage_of_revenue',rate,fixed,closing,clean(b.notes,1000)];
  if(Number(b.id||0)){await db.prepare(`UPDATE coach_course_assignments SET coach_id=?,product_id=?,course_sku=?,course_name=?,course_start_date=?,course_end_date=?,course_status=?,commission_mode=?,commission_rate=?,commission_fixed_amount=?,closing_date=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND participant_count_locked=0`).bind(...vals,Number(b.id)).run();return Response.json({ok:true,id:Number(b.id)});}
  const r=await db.prepare(`INSERT INTO coach_course_assignments(coach_id,product_id,course_sku,course_name,course_start_date,course_end_date,course_status,commission_mode,commission_rate,commission_fixed_amount,closing_date,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(...vals).first();return Response.json({ok:true,id:r.id});
}
