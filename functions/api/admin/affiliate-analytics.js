function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function monthShift(ym,delta){
  const [y,m]=ym.split('-').map(Number);
  const d=new Date(Date.UTC(y,m-1+delta,1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

export async function onRequestGet({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const u=new URL(request.url);
  const selected=(u.searchParams.get('month')||new Date().toISOString().slice(0,7)).slice(0,7);

  const months=[];
  for(let i=-11;i<=0;i++) months.push(monthShift(selected,i));
  const first=months[0], last=selected;

  // Visitors: unique monthly anonymous browser IDs.
  const visitors=await db.prepare(`
    SELECT visited_month month, COUNT(DISTINCT visitor_id) value
    FROM affiliate_page_visits
    WHERE visited_month BETWEEN ? AND ?
    GROUP BY visited_month
  `).bind(first,last).all();

  // Applications submitted in month.
  const applications=await db.prepare(`
    SELECT substr(joined_at,1,7) month, COUNT(*) value
    FROM affiliates
    WHERE substr(joined_at,1,7) BETWEEN ? AND ?
    GROUP BY substr(joined_at,1,7)
  `).bind(first,last).all();

  // Approved in month.
  const approved=await db.prepare(`
    SELECT substr(approved_at,1,7) month, COUNT(*) value
    FROM affiliates
    WHERE status IN ('Approved','Suspended','Archived')
      AND approved_at!=''
      AND substr(approved_at,1,7) BETWEEN ? AND ?
    GROUP BY substr(approved_at,1,7)
  `).bind(first,last).all();

  // Active affiliates = at least one successfully paid affiliate sale in month.
  // Uses affiliate_commissions because entries are only created for attributed affiliate sales.
  const active=await db.prepare(`
    SELECT substr(ac.created_at,1,7) month, COUNT(DISTINCT ac.affiliate_id) value
    FROM affiliate_commissions ac
    JOIN orders o ON o.id=ac.order_id
    WHERE o.payment_status='Paid'
      AND substr(ac.created_at,1,7) BETWEEN ? AND ?
      AND ac.status NOT IN ('Reversed','Cancelled')
    GROUP BY substr(ac.created_at,1,7)
  `).bind(first,last).all();

  // Monthly paid affiliate sales.
  const sales=await db.prepare(`
    SELECT substr(ac.created_at,1,7) month,
           COALESCE(SUM(ac.gross_sale),0) value,
           COALESCE(SUM(ac.commission_amount),0) commission
    FROM affiliate_commissions ac
    JOIN orders o ON o.id=ac.order_id
    WHERE o.payment_status='Paid'
      AND substr(ac.created_at,1,7) BETWEEN ? AND ?
      AND ac.status NOT IN ('Reversed','Cancelled')
    GROUP BY substr(ac.created_at,1,7)
  `).bind(first,last).all();

  // Country for selected month uses affiliate's registered country.
  const byCountry=await db.prepare(`
    SELECT COALESCE(NULLIF(a.country,''),'Unknown') country,
           COALESCE(SUM(ac.gross_sale),0) sales
    FROM affiliate_commissions ac
    JOIN orders o ON o.id=ac.order_id
    JOIN affiliates a ON a.id=ac.affiliate_id
    WHERE o.payment_status='Paid'
      AND substr(ac.created_at,1,7)=?
      AND ac.status NOT IN ('Reversed','Cancelled')
    GROUP BY COALESCE(NULLIF(a.country,''),'Unknown')
    ORDER BY sales DESC
  `).bind(selected).all();

  const top=await db.prepare(`
    SELECT a.id,a.affiliate_code,a.full_name,
           COUNT(ac.id) sale_count,
           COALESCE(SUM(ac.gross_sale),0) sales,
           COALESCE(SUM(ac.commission_amount),0) commission
    FROM affiliate_commissions ac
    JOIN orders o ON o.id=ac.order_id
    JOIN affiliates a ON a.id=ac.affiliate_id
    WHERE o.payment_status='Paid'
      AND substr(ac.created_at,1,7)=?
      AND ac.status NOT IN ('Reversed','Cancelled')
    GROUP BY a.id,a.affiliate_code,a.full_name
    ORDER BY sales DESC
    LIMIT 10
  `).bind(selected).all();

  const map=(rows)=>Object.fromEntries((rows.results||[]).map(r=>[r.month,Number(r.value||0)]));
  const mv=map(visitors),ma=map(applications),mappr=map(approved),mact=map(active),ms=map(sales);
  const sc=Object.fromEntries((sales.results||[]).map(r=>[r.month,Number(r.commission||0)]));

  const trend=months.map(m=>({
    month:m,
    visitors:mv[m]||0,
    applications:ma[m]||0,
    approved:mappr[m]||0,
    active:mact[m]||0,
    sales:ms[m]||0,
    commission:sc[m]||0
  }));

  const cur=trend[trend.length-1];
  return Response.json({
    selected_month:selected,
    trend,
    country_sales:byCountry.results||[],
    top_affiliates:top.results||[],
    kpis:{
      visitors:cur.visitors,
      applications:cur.applications,
      approved:cur.approved,
      active:cur.active,
      sales:cur.sales,
      commission:cur.commission,
      visitor_to_application:cur.visitors?cur.applications/cur.visitors*100:0,
      application_to_approval:cur.applications?cur.approved/cur.applications*100:0
    }
  });
}
