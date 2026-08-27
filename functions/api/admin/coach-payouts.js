import {dbOf} from '../coach/_auth.js';
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function auth(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
function clean(v,n=300){return String(v??'').trim().slice(0,n)}
function money(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function validPeriod(v){return /^\d{4}-\d{2}$/.test(String(v||''))}
function periodBounds(p){const [y,m]=p.split('-').map(Number),start=`${p}-01`,d=new Date(Date.UTC(y,m,0));return {start,end:d.toISOString().slice(0,10)}}
function payoutRef(period,coachCode){const rnd=crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();return `COACHPAY-${period.replace('-','')}-${coachCode.replace('QY-','')}-${rnd}`}
async function serviceMonthStats(db,row,period){const {start,end}=periodBounds(period);try{const r=await db.prepare(`SELECT COUNT(DISTINCT o.id) cases,COALESCE(SUM(py.gross_amount),0) revenue FROM payments py JOIN orders o ON o.id=py.order_id WHERE py.order_id IN (SELECT DISTINCT oi.order_id FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE (? IS NOT NULL AND p.id=?) OR lower(trim(p.name_en))=lower(trim(?))) AND py.status IN ('Paid','External') AND py.verification_status IN ('Verified','Reconciled') AND date(COALESCE(py.paid_at,py.created_at)) BETWEEN date(?) AND date(?)`).bind(row.product_id,row.product_id,row.service_name,start,end).first();return {cases:Number(r?.cases||0),revenue:Number(r?.revenue||0)}}catch{return {cases:0,revenue:0}}}
async function candidates(db,coachId,period){
  const courseRows=await db.prepare(`SELECT * FROM coach_course_assignments WHERE coach_id=? AND participant_count_locked=1 AND final_commission IS NOT NULL AND payout_eligible_month=? AND course_status='Conducted' ORDER BY id`).bind(coachId,period).all();
  const items=[];
  for(const x of courseRows.results||[]){const used=await db.prepare(`SELECT 1 x FROM coach_payout_items WHERE source_type='Course' AND source_id=? AND source_period=? LIMIT 1`).bind(x.id,period).first();if(used)continue;items.push({source_type:'Course',source_id:x.id,source_period:period,description:`${x.course_sku||''}${x.course_sku&&x.course_name?' · ':''}${x.course_name||'Course'}`,eligible_revenue:Number(x.eligible_course_revenue||0),commission_rate:Number(x.commission_rate||0),commission_fixed_amount:Number(x.commission_fixed_amount||0),commission_amount:Number(x.final_commission||0),cases:Number(x.participant_count||0)});}
  const {start,end}=periodBounds(period);
  let serviceRows=[];try{const r=await db.prepare(`SELECT * FROM coach_service_assignments WHERE coach_id=? AND date(effective_from)<=date(?) AND (effective_until='' OR effective_until IS NULL OR date(effective_until)>=date(?)) ORDER BY id`).bind(coachId,end,start).all();serviceRows=r.results||[]}catch{}
  for(const x of serviceRows){const used=await db.prepare(`SELECT 1 x FROM coach_payout_items WHERE source_type='Service' AND source_id=? AND source_period=? LIMIT 1`).bind(x.id,period).first();if(used)continue;const s=await serviceMonthStats(db,x,period);if(s.cases<=0&&s.revenue<=0)continue;const commission=money(s.revenue*Number(x.commission_rate||0)/100+Number(x.commission_fixed_amount||0));items.push({source_type:'Service',source_id:x.id,source_period:period,description:x.service_name||x.service_code||'Service',eligible_revenue:s.revenue,commission_rate:Number(x.commission_rate||0),commission_fixed_amount:Number(x.commission_fixed_amount||0),commission_amount:commission,cases:s.cases});}
  return items;
}
async function getPayload(db,coachId,period){const c=await db.prepare(`SELECT id,coach_code,full_name,email,country,bank_name,bank_account_name,bank_account_number,status FROM coaches WHERE id=?`).bind(coachId).first();if(!c)throw Error('Coach not found.');const cand=await candidates(db,coachId,period);const batches=await db.prepare(`SELECT * FROM coach_payouts WHERE coach_id=? ORDER BY payout_period DESC,id DESC`).bind(coachId).all();const batchIds=(batches.results||[]).map(x=>x.id);let payoutItems=[];if(batchIds.length){const ph=batchIds.map(()=>'?').join(',');const q=await db.prepare(`SELECT * FROM coach_payout_items WHERE payout_id IN (${ph}) ORDER BY id`).bind(...batchIds).all();payoutItems=q.results||[]}return {coach:c,candidates:cand,batches:batches.results||[],payout_items:payoutItems,summary:{eligible_items:cand.length,course_revenue:money(cand.filter(x=>x.source_type==='Course').reduce((s,x)=>s+x.eligible_revenue,0)),service_revenue:money(cand.filter(x=>x.source_type==='Service').reduce((s,x)=>s+x.eligible_revenue,0)),commission:money(cand.reduce((s,x)=>s+x.commission_amount,0))}}}
export async function onRequestGet({request,env}){if(!auth(request,env))return Response.json({error:'Unauthorized'},{status:401});const u=new URL(request.url),coachId=Number(u.searchParams.get('coach_id')||0),period=clean(u.searchParams.get('period'),7);if(!coachId||!validPeriod(period))return Response.json({error:'Coach and payout month are required.'},{status:400});try{return Response.json(await getPayload(dbOf(env),coachId,period),{headers:{'cache-control':'no-store'}})}catch(e){return Response.json({error:e.message||'Unable to load coach payout.'},{status:500})}}
export async function onRequestPost({request,env}){if(!auth(request,env))return Response.json({error:'Unauthorized'},{status:401});const db=dbOf(env);let b;try{b=await request.json()}catch{return Response.json({error:'Invalid request'},{status:400})}const action=clean(b.action,40),coachId=Number(b.coach_id||0),period=clean(b.period,7);if(!coachId)return Response.json({error:'Coach is required.'},{status:400});
  try{
    if(action==='create_draft'){
      if(!validPeriod(period))return Response.json({error:'Payout month is required.'},{status:400});
      const c=await db.prepare(`SELECT coach_code,status FROM coaches WHERE id=?`).bind(coachId).first();
      if(!c||c.status!=='Approved')return Response.json({error:'Only Approved coaches can receive payouts.'},{status:400});

      const openExisting=await db.prepare(`
        SELECT id,status,payout_reference
        FROM coach_payouts
        WHERE coach_id=? AND payout_period=? AND status IN ('Draft','Approved')
        ORDER BY id DESC LIMIT 1
      `).bind(coachId,period).first();
      if(openExisting)return Response.json({
        error:`A ${openExisting.status} payout already exists for this coach and month (${openExisting.payout_reference}). Complete or cancel it before creating another payout batch.`
      },{status:409});

      const cand=await candidates(db,coachId,period);
      if(!cand.length)return Response.json({error:'No eligible coach commission items for this month.'},{status:409});
      const courseRevenue=money(cand.filter(x=>x.source_type==='Course').reduce((s,x)=>s+x.eligible_revenue,0)),
            serviceRevenue=money(cand.filter(x=>x.source_type==='Service').reduce((s,x)=>s+x.eligible_revenue,0)),
            total=money(cand.reduce((s,x)=>s+x.commission_amount,0)),
            ref=payoutRef(period,c.coach_code);
      const p=await db.prepare(`INSERT INTO coach_payouts(coach_id,payout_period,payout_reference,course_revenue,service_revenue,total_commission,status,notes) VALUES(?,?,?,?,?,?, 'Draft',?) RETURNING id`).bind(coachId,period,ref,courseRevenue,serviceRevenue,total,clean(b.notes,1000)).first();
      for(const x of cand)await db.prepare(`INSERT INTO coach_payout_items(payout_id,coach_id,source_type,source_id,source_period,description,eligible_revenue,commission_rate,commission_fixed_amount,commission_amount) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(p.id,coachId,x.source_type,x.source_id,x.source_period,x.description,x.eligible_revenue,x.commission_rate,x.commission_fixed_amount,x.commission_amount).run();
      return Response.json({ok:true,id:p.id,payout_reference:ref,total_commission:total});
    }
    const id=Number(b.id||0);if(!id)return Response.json({error:'Payout ID is required.'},{status:400});const p=await db.prepare(`SELECT * FROM coach_payouts WHERE id=? AND coach_id=?`).bind(id,coachId).first();if(!p)return Response.json({error:'Payout not found.'},{status:404});
    if(action==='approve'){if(p.status!=='Draft')return Response.json({error:'Only Draft payouts can be approved.'},{status:409});const c=await db.prepare(`SELECT bank_name,bank_account_name,bank_account_number,status FROM coaches WHERE id=?`).bind(coachId).first();if(!c||c.status!=='Approved')return Response.json({error:'Coach is not Approved.'},{status:409});if(!clean(c.bank_name)||!clean(c.bank_account_name)||!clean(c.bank_account_number))return Response.json({error:'Coach bank details are incomplete.'},{status:409});await db.prepare(`UPDATE coach_payouts SET status='Approved',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();return Response.json({ok:true});}
    if(action==='mark_paid'){if(p.status!=='Approved')return Response.json({error:'Only Approved payouts can be marked Paid.'},{status:409});const date=clean(b.payment_date,10),ref=clean(b.payment_reference,200);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!ref)return Response.json({error:'Payment date and bank/payment reference are required.'},{status:400});await db.prepare(`UPDATE coach_payouts SET status='Paid',payment_date=?,payment_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(date,ref,id).run();return Response.json({ok:true});}
    if(action==='cancel'){if(p.status==='Paid')return Response.json({error:'Paid payouts cannot be cancelled.'},{status:409});await db.prepare(`DELETE FROM coach_payout_items WHERE payout_id=?`).bind(id).run();await db.prepare(`UPDATE coach_payouts SET status='Cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();return Response.json({ok:true});}
    return Response.json({error:'Unknown action.'},{status:400});
  }catch(e){return Response.json({error:e.message||'Coach payout action failed.'},{status:500})}
}
