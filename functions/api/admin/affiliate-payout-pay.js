
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);

const ELIGIBLE_PAYMENT_JOIN = `
 JOIN payments py ON py.id=(
   SELECT p2.id FROM payments p2
   WHERE p2.order_id=ac.order_id
   ORDER BY p2.id DESC LIMIT 1
 )
 JOIN orders o ON o.id=ac.order_id
`;

const ELIGIBLE_PAYMENT_WHERE = `
 py.status='Paid'
 AND py.verification_status='Verified'
 AND COALESCE(py.accounting_eligible,0)=1
 AND o.payment_status='Paid'
`;

const ELIGIBILITY_DATE = `
 COALESCE(
   NULLIF(py.accounting_eligible_at,''),
   NULLIF(py.verified_at,''),
   NULLIF(py.paid_at,''),
   ac.created_at
 )
`;

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const b=await request.json().catch(()=>({}));
  const id=Number(b.payout_id||0);
  const paymentReference=clean(b.payment_reference,160);
  const paymentDate=clean(b.payment_date,32);

  if(!id||!paymentReference||!paymentDate)
    return Response.json({error:'payout_id, payment_reference and payment_date are required.'},{status:400});

  const p=await db.prepare(`SELECT id,status FROM affiliate_payouts WHERE id=?`).bind(id).first();
  if(!p) return Response.json({error:'Payout not found.'},{status:404});
  if(p.status!=='Approved') return Response.json({error:'Only Approved payouts can be marked Paid.'},{status:409});

  const invalid=await db.prepare(`
    SELECT COUNT(*) AS count
    FROM affiliate_payout_items api
    JOIN affiliate_commissions ac ON ac.id=api.commission_id
    LEFT JOIN payments py ON py.id=(
      SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1
    )
    LEFT JOIN orders o ON o.id=ac.order_id
    WHERE api.payout_id=?
      AND NOT(
        COALESCE(py.status,'')='Paid'
        AND COALESCE(py.verification_status,'')='Verified'
        AND COALESCE(py.accounting_eligible,0)=1
        AND COALESCE(o.payment_status,'')='Paid'
      )
  `).bind(id).first();

  if(Number(invalid?.count||0)>0)
    return Response.json({
      error:'Payment eligibility changed after approval. Do not pay this batch until the affected sales are reviewed.'
    },{status:409});

  await db.prepare('BEGIN').run();
  try{
    await db.prepare(`
      UPDATE affiliate_payouts
      SET status='Paid',payment_reference=?,payment_date=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(paymentReference,paymentDate,id).run();

    await db.prepare(`
      UPDATE affiliate_commissions
      SET status='Paid',paid_at=?,updated_at=CURRENT_TIMESTAMP
      WHERE id IN(
        SELECT commission_id FROM affiliate_payout_items WHERE payout_id=?
      )
    `).bind(paymentDate,id).run();

    await db.prepare('COMMIT').run();
    return Response.json({ok:true,status:'Paid'});
  }catch(e){
    try{await db.prepare('ROLLBACK').run()}catch{}
    console.error(e);
    return Response.json({error:'Unable to record payout payment.'},{status:500});
  }
}
