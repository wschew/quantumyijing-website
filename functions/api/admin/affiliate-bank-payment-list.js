function tok(req){
  const h=req.headers.get('authorization')||'';
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}

async function affiliateColumns(db){
  const r=await db.prepare(`PRAGMA table_info(affiliates)`).all();
  return new Set((r.results||[]).map(x=>String(x.name||'').toLowerCase()));
}
function columnExpr(cols,name,fallback="''"){
  return cols.has(name)?`a.${name}`:fallback;
}

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const u=new URL(request.url);
  const period=String(u.searchParams.get('period')||'').trim();
  const includeTests=u.searchParams.get('include_tests')==='1';
  if(!/^\d{4}-\d{2}$/.test(period)){
    return Response.json({error:'A valid payout period (YYYY-MM) is required.'},{status:400});
  }

  try{
    const cols=await affiliateColumns(db);
    const country=cols.has('country')?'a.country':(cols.has('nationality')?'a.nationality':"''");
    const accountType=columnExpr(cols,'account_type');
    const bankName=columnExpr(cols,'bank_name');
    const bankHolder=columnExpr(cols,'bank_account_name');
    const bankNumber=columnExpr(cols,'bank_account_number');
    const testFlag=cols.has('is_test_account')?'COALESCE(a.is_test_account,0)':'0';

    const rows=await db.prepare(`
      SELECT
        ap.id AS payout_id,
        ap.payout_reference,
        ap.payout_period,
        ap.currency,
        ap.total_sales,
        ap.total_commission AS net_amount_payable,
        ap.status AS payout_status,
        a.id AS affiliate_id,
        a.affiliate_code,
        a.full_name,
        a.display_name,
        a.email,
        ${country} AS country,
        ${accountType} AS account_type,
        ${bankName} AS bank_name,
        ${bankHolder} AS bank_account_name,
        ${bankNumber} AS bank_account_number,
        ${testFlag} AS is_test_account
      FROM affiliate_payouts ap
      JOIN affiliates a ON a.id=ap.affiliate_id
      WHERE ap.payout_period=?
        AND ap.status='Approved'
        AND (?=1 OR ${testFlag}=0)
      ORDER BY ap.currency,a.full_name,a.affiliate_code,ap.id
    `).bind(period,includeTests?1:0).all();

    const items=(rows.results||[]).map(x=>({
      ...x,
      payout_id:Number(x.payout_id||0),
      affiliate_id:Number(x.affiliate_id||0),
      total_sales:Number(x.total_sales||0),
      net_amount_payable:Number(x.net_amount_payable||0),
      is_test_account:Number(x.is_test_account||0)
    }));

    const totals={};
    for(const x of items){
      const c=x.currency||'MYR';
      if(!totals[c]) totals[c]={currency:c,payouts:0,total_sales:0,net_amount_payable:0};
      totals[c].payouts+=1;
      totals[c].total_sales+=Number(x.total_sales||0);
      totals[c].net_amount_payable+=Number(x.net_amount_payable||0);
    }

    return Response.json({
      period,
      include_tests:includeTests,
      items,
      totals:Object.values(totals),
      note:'Read-only bank payment preparation. Exporting this list does not change payout status or mark any payout Paid.'
    },{headers:{'cache-control':'no-store','pragma':'no-cache'}});
  }catch(e){
    console.error('affiliate bank payment list',e);
    return Response.json({error:'Unable to load affiliate bank payment list.'},{status:500});
  }
}
