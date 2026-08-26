function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&bearer(req)===env.ADMIN_TOKEN}
function period(v){v=String(v||'').trim();return /^\d{4}-\d{2}$/.test(v)?v:''}
export async function onRequestGet({request,env}){
  if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
  const u=new URL(request.url),p=period(u.searchParams.get('period')),includeTests=u.searchParams.get('include_tests')==='1';
  if(!p)return Response.json({error:'Payout month is required.'},{status:400});
  try{
    const coaches=await db.prepare(`SELECT
      'Coach' payee_type,c.coach_code payee_code,c.full_name payee_name,
      c.bank_name,c.bank_account_name,c.bank_account_number,c.country,
      COALESCE(cp.currency,'MYR') currency,cp.total_commission net_amount_payable,
      cp.payout_period,cp.payout_reference,c.email,0 is_test_account
      FROM coach_payouts cp JOIN coaches c ON c.id=cp.coach_id
      WHERE cp.payout_period=? AND cp.status='Approved'
      ORDER BY c.coach_code,c.full_name`).bind(p).all();
    const affiliates=await db.prepare(`SELECT
      'Affiliate' payee_type,a.affiliate_code payee_code,
      COALESCE(NULLIF(a.full_name,''),a.display_name) payee_name,
      a.bank_name,a.bank_account_name,a.bank_account_number,a.country,
      COALESCE(ap.currency,'MYR') currency,ap.total_commission net_amount_payable,
      ap.payout_period,ap.payout_reference,a.email,COALESCE(a.is_test_account,0) is_test_account
      FROM affiliate_payouts ap JOIN affiliates a ON a.id=ap.affiliate_id
      WHERE ap.payout_period=? AND ap.status='Approved'
        AND (?=1 OR COALESCE(a.is_test_account,0)=0)
      ORDER BY a.affiliate_code,a.full_name`).bind(p,includeTests?1:0).all();
    const items=[...(coaches.results||[]),...(affiliates.results||[])];
    const totals={coach_count:0,affiliate_count:0,total_count:items.length,missing_bank:0,by_currency:{}};
    for(const x of items){
      if(x.payee_type==='Coach')totals.coach_count++;else totals.affiliate_count++;
      if(!String(x.bank_name||'').trim()||!String(x.bank_account_name||'').trim()||!String(x.bank_account_number||'').trim())totals.missing_bank++;
      const c=x.currency||'MYR';totals.by_currency[c]=(totals.by_currency[c]||0)+Number(x.net_amount_payable||0);
    }
    return Response.json({period:p,items,totals},{headers:{'cache-control':'no-store'}});
  }catch(e){console.error('month-end bank payment list',e);return Response.json({error:e.message||'Unable to load month-end bank payment list.'},{status:500})}
}
