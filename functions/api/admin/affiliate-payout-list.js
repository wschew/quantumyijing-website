
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

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const rows=await db.prepare(`
    SELECT
      ap.*,a.affiliate_code,a.full_name,a.email,
      (
        SELECT COUNT(*)
        FROM affiliate_payout_items api
        JOIN affiliate_commissions ac ON ac.id=api.commission_id
        LEFT JOIN payments py ON py.id=(
          SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1
        )
        LEFT JOIN orders o ON o.id=ac.order_id
        WHERE api.payout_id=ap.id
          AND NOT(
            COALESCE(py.status,'')='Paid'
            AND COALESCE(py.verification_status,'')='Verified'
            AND COALESCE(py.accounting_eligible,0)=1
            AND COALESCE(o.payment_status,'')='Paid'
          )
      ) AS invalid_items
    FROM affiliate_payouts ap
    JOIN affiliates a ON a.id=ap.affiliate_id
    ORDER BY ap.id DESC
    LIMIT 200
  `).all();

  return Response.json({payouts:rows.results||[]},{headers:{'cache-control':'no-store'}});
}
