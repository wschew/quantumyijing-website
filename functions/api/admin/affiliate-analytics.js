<<<<<<< Updated upstream
function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function monthShift(ym,delta){const [y,m]=ym.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`}
function categoryKey(t){t=String(t||'').toLowerCase();return t==='course'?'courses':t==='consultation'?'consultations':t==='ebook'?'books':t==='digital'?'digital':t==='physical'?'physical':t==='membership'?'memberships':t==='event'?'events':'other'}

export async function onRequestGet({request,env}){
 if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 const u=new URL(request.url),selected=(u.searchParams.get('month')||new Date().toISOString().slice(0,7)).slice(0,7);
 const months=[];for(let i=-11;i<=0;i++)months.push(monthShift(selected,i));const first=months[0],last=selected;

 const visitors=await db.prepare(`SELECT visited_month month,COUNT(DISTINCT visitor_id) value FROM affiliate_page_visits WHERE visited_month BETWEEN ? AND ? GROUP BY visited_month`).bind(first,last).all();
 const applications=await db.prepare(`SELECT substr(joined_at,1,7) month,COUNT(*) value FROM affiliates WHERE substr(joined_at,1,7) BETWEEN ? AND ? GROUP BY substr(joined_at,1,7)`).bind(first,last).all();
 const approved=await db.prepare(`SELECT substr(approved_at,1,7) month,COUNT(*) value FROM affiliates WHERE status IN ('Approved','Suspended','Archived') AND approved_at!='' AND substr(approved_at,1,7) BETWEEN ? AND ? GROUP BY substr(approved_at,1,7)`).bind(first,last).all();
 const active=await db.prepare(`SELECT substr(ac.created_at,1,7) month,COUNT(DISTINCT ac.affiliate_id) value FROM affiliate_commissions ac JOIN orders o ON o.id=ac.order_id WHERE o.payment_status='Paid' AND substr(ac.created_at,1,7) BETWEEN ? AND ? AND ac.status NOT IN ('Reversed','Cancelled') GROUP BY substr(ac.created_at,1,7)`).bind(first,last).all();
 const sales=await db.prepare(`SELECT substr(ac.created_at,1,7) month,COALESCE(SUM(ac.gross_sale),0) value,COALESCE(SUM(ac.commission_amount),0) commission FROM affiliate_commissions ac JOIN orders o ON o.id=ac.order_id WHERE o.payment_status='Paid' AND substr(ac.created_at,1,7) BETWEEN ? AND ? AND ac.status NOT IN ('Reversed','Cancelled') GROUP BY substr(ac.created_at,1,7)`).bind(first,last).all();

 const categoryRows=await db.prepare(`SELECT substr(ac.created_at,1,7) month,COALESCE(p.product_type,'other') product_type,COALESCE(SUM(ac.gross_sale),0) sales FROM affiliate_commissions ac JOIN orders o ON o.id=ac.order_id LEFT JOIN products p ON p.id=ac.product_id WHERE o.payment_status='Paid' AND substr(ac.created_at,1,7) BETWEEN ? AND ? AND ac.status NOT IN ('Reversed','Cancelled') GROUP BY substr(ac.created_at,1,7),COALESCE(p.product_type,'other') ORDER BY month`).bind(first,last).all();

 const byCountry=await db.prepare(`SELECT COALESCE(NULLIF(a.country,''),'Unknown') country,COALESCE(SUM(ac.gross_sale),0) sales FROM affiliate_commissions ac JOIN orders o ON o.id=ac.order_id JOIN affiliates a ON a.id=ac.affiliate_id WHERE o.payment_status='Paid' AND substr(ac.created_at,1,7)=? AND ac.status NOT IN ('Reversed','Cancelled') GROUP BY COALESCE(NULLIF(a.country,''),'Unknown') ORDER BY sales DESC`).bind(selected).all();
 const top=await db.prepare(`SELECT a.id,a.affiliate_code,a.full_name,COUNT(ac.id) sale_count,COALESCE(SUM(ac.gross_sale),0) sales,COALESCE(SUM(ac.commission_amount),0) commission FROM affiliate_commissions ac JOIN orders o ON o.id=ac.order_id JOIN affiliates a ON a.id=ac.affiliate_id WHERE o.payment_status='Paid' AND substr(ac.created_at,1,7)=? AND ac.status NOT IN ('Reversed','Cancelled') GROUP BY a.id,a.affiliate_code,a.full_name ORDER BY sales DESC LIMIT 10`).bind(selected).all();

 const map=rows=>Object.fromEntries((rows.results||[]).map(r=>[r.month,Number(r.value||0)]));
 const mv=map(visitors),ma=map(applications),mappr=map(approved),mact=map(active),ms=map(sales),sc=Object.fromEntries((sales.results||[]).map(r=>[r.month,Number(r.commission||0)]));
 const trend=months.map(m=>({month:m,visitors:mv[m]||0,applications:ma[m]||0,approved:mappr[m]||0,active:mact[m]||0,sales:ms[m]||0,commission:sc[m]||0}));

 const empty=()=>({courses:0,consultations:0,books:0,digital:0,physical:0,memberships:0,events:0,other:0});
 const byMonth=Object.fromEntries(months.map(m=>[m,empty()]));
 for(const row of categoryRows.results||[]){if(byMonth[row.month])byMonth[row.month][categoryKey(row.product_type)]+=Number(row.sales||0)}
 const category_sales_trend=months.map(month=>({month,...byMonth[month]}));
 const cur=trend[trend.length-1];

 return Response.json({
  selected_month:selected,
  trend,
  category_sales_trend,
  category_labels:{courses:'Courses',consultations:'Consultations',books:'Books / eBooks',digital:'Digital Products',physical:'Physical Products',memberships:'Memberships',events:'Events',other:'Other'},
  country_sales:byCountry.results||[],
  top_affiliates:top.results||[],
  kpis:{visitors:cur.visitors,applications:cur.applications,approved:cur.approved,active:cur.active,sales:cur.sales,commission:cur.commission}
 });
}
=======
function dbOf(env){
  return env.ENQUIRIES_DB || env.DB || null;
}

function tok(req){
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ')
    ? h.slice(7).trim()
    : '';
}

function ok(req,env){
  return !!env.ADMIN_TOKEN && tok(req) === env.ADMIN_TOKEN;
}

function monthShift(ym,delta){
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y,m-1+delta,1));

  return `${d.getUTCFullYear()}-${String(
    d.getUTCMonth()+1
  ).padStart(2,'0')}`;
}

function categoryKey(t){
  t = String(t || '').toLowerCase();

  return t === 'course' ? 'courses'
    : t === 'consultation' ? 'consultations'
    : t === 'ebook' ? 'books'
    : t === 'digital' ? 'digital'
    : t === 'physical' ? 'physical'
    : t === 'membership' ? 'memberships'
    : t === 'event' ? 'events'
    : 'other';
}

export async function onRequestGet({request,env}){

  if(!ok(request,env)){
    return Response.json(
      {error:'Unauthorized'},
      {status:401}
    );
  }

  const db = dbOf(env);

  if(!db){
    return Response.json(
      {error:'Database unavailable'},
      {status:503}
    );
  }

  const u = new URL(request.url);

  const selected = (
    u.searchParams.get('month') ||
    new Date().toISOString().slice(0,7)
  ).slice(0,7);

  const months = [];

  for(let i=-11;i<=0;i++){
    months.push(monthShift(selected,i));
  }

  const first = months[0];
  const last = selected;


  /*
   * UNIQUE VISITORS
   *
   * Anonymous traffic. There is currently no affiliate_id,
   * so test-account filtering cannot be applied here.
   */
  const visitors = await db.prepare(`
    SELECT
      visited_month month,
      COUNT(DISTINCT visitor_id) value
    FROM affiliate_page_visits
    WHERE visited_month BETWEEN ? AND ?
    GROUP BY visited_month
  `).bind(first,last).all();


  /*
   * APPLICATIONS
   * Exclude QA/test affiliate accounts.
   */
  const applications = await db.prepare(`
    SELECT
      substr(a.joined_at,1,7) month,
      COUNT(*) value
    FROM affiliates a
    WHERE substr(a.joined_at,1,7) BETWEEN ? AND ?
      AND COALESCE(a.is_test_account,0)=0
    GROUP BY substr(a.joined_at,1,7)
  `).bind(first,last).all();


  /*
   * APPROVED AFFILIATES
   */
  const approved = await db.prepare(`
    SELECT
      substr(a.approved_at,1,7) month,
      COUNT(*) value
    FROM affiliates a
    WHERE a.status IN ('Approved','Suspended','Archived')
      AND a.approved_at != ''
      AND substr(a.approved_at,1,7) BETWEEN ? AND ?
      AND COALESCE(a.is_test_account,0)=0
    GROUP BY substr(a.approved_at,1,7)
  `).bind(first,last).all();


  /*
   * ACTIVE AFFILIATES
   */
  const active = await db.prepare(`
    SELECT
      substr(ac.created_at,1,7) month,
      COUNT(DISTINCT ac.affiliate_id) value
    FROM affiliate_commissions ac
    JOIN orders o
      ON o.id = ac.order_id
    JOIN affiliates a
      ON a.id = ac.affiliate_id
    WHERE o.payment_status = 'Paid'
      AND substr(ac.created_at,1,7) BETWEEN ? AND ?
      AND ac.status NOT IN ('Reversed','Cancelled')
      AND COALESCE(a.is_test_account,0)=0
    GROUP BY substr(ac.created_at,1,7)
  `).bind(first,last).all();


  /*
   * MONTHLY AFFILIATE SALES + COMMISSION
   */
  const sales = await db.prepare(`
    SELECT
      substr(ac.created_at,1,7) month,
      COALESCE(SUM(ac.gross_sale),0) value,
      COALESCE(SUM(ac.commission_amount),0) commission
    FROM affiliate_commissions ac
    JOIN orders o
      ON o.id = ac.order_id
    JOIN affiliates a
      ON a.id = ac.affiliate_id
    WHERE o.payment_status = 'Paid'
      AND substr(ac.created_at,1,7) BETWEEN ? AND ?
      AND ac.status NOT IN ('Reversed','Cancelled')
      AND COALESCE(a.is_test_account,0)=0
    GROUP BY substr(ac.created_at,1,7)
  `).bind(first,last).all();


  /*
   * MONTHLY SALES BY CATEGORY
   */
  const categoryRows = await db.prepare(`
    SELECT
      substr(ac.created_at,1,7) month,
      COALESCE(p.product_type,'other') product_type,
      COALESCE(SUM(ac.gross_sale),0) sales
    FROM affiliate_commissions ac
    JOIN orders o
      ON o.id = ac.order_id
    JOIN affiliates a
      ON a.id = ac.affiliate_id
    LEFT JOIN products p
      ON p.id = ac.product_id
    WHERE o.payment_status = 'Paid'
      AND substr(ac.created_at,1,7) BETWEEN ? AND ?
      AND ac.status NOT IN ('Reversed','Cancelled')
      AND COALESCE(a.is_test_account,0)=0
    GROUP BY
      substr(ac.created_at,1,7),
      COALESCE(p.product_type,'other')
    ORDER BY month
  `).bind(first,last).all();


  /*
   * SALES BY COUNTRY
   */
  const byCountry = await db.prepare(`
    SELECT
      COALESCE(NULLIF(a.country,''),'Unknown') country,
      COALESCE(SUM(ac.gross_sale),0) sales
    FROM affiliate_commissions ac
    JOIN orders o
      ON o.id = ac.order_id
    JOIN affiliates a
      ON a.id = ac.affiliate_id
    WHERE o.payment_status = 'Paid'
      AND substr(ac.created_at,1,7) = ?
      AND ac.status NOT IN ('Reversed','Cancelled')
      AND COALESCE(a.is_test_account,0)=0
    GROUP BY
      COALESCE(NULLIF(a.country,''),'Unknown')
    ORDER BY sales DESC
  `).bind(selected).all();


  /*
   * TOP 10 REAL AFFILIATES
   */
  const top = await db.prepare(`
    SELECT
      a.id,
      a.affiliate_code,
      a.full_name,
      COUNT(ac.id) sale_count,
      COALESCE(SUM(ac.gross_sale),0) sales,
      COALESCE(SUM(ac.commission_amount),0) commission
    FROM affiliate_commissions ac
    JOIN orders o
      ON o.id = ac.order_id
    JOIN affiliates a
      ON a.id = ac.affiliate_id
    WHERE o.payment_status = 'Paid'
      AND substr(ac.created_at,1,7) = ?
      AND ac.status NOT IN ('Reversed','Cancelled')
      AND COALESCE(a.is_test_account,0)=0
    GROUP BY
      a.id,
      a.affiliate_code,
      a.full_name
    ORDER BY sales DESC
    LIMIT 10
  `).bind(selected).all();


  const map = rows =>
    Object.fromEntries(
      (rows.results || []).map(
        r => [r.month, Number(r.value || 0)]
      )
    );

  const mv = map(visitors);
  const ma = map(applications);
  const mappr = map(approved);
  const mact = map(active);
  const ms = map(sales);

  const sc = Object.fromEntries(
    (sales.results || []).map(
      r => [r.month, Number(r.commission || 0)]
    )
  );

  const trend = months.map(m => ({
    month:m,
    visitors:mv[m] || 0,
    applications:ma[m] || 0,
    approved:mappr[m] || 0,
    active:mact[m] || 0,
    sales:ms[m] || 0,
    commission:sc[m] || 0
  }));

  const empty = () => ({
    courses:0,
    consultations:0,
    books:0,
    digital:0,
    physical:0,
    memberships:0,
    events:0,
    other:0
  });

  const byMonth = Object.fromEntries(
    months.map(m => [m,empty()])
  );

  for(const row of categoryRows.results || []){
    if(byMonth[row.month]){
      byMonth[row.month][
        categoryKey(row.product_type)
      ] += Number(row.sales || 0);
    }
  }

  const category_sales_trend = months.map(
    month => ({
      month,
      ...byMonth[month]
    })
  );

  const cur = trend[trend.length - 1];

  return Response.json({
    selected_month:selected,
    trend,
    category_sales_trend,

    category_labels:{
      courses:'Courses',
      consultations:'Consultations',
      books:'Books / eBooks',
      digital:'Digital Products',
      physical:'Physical Products',
      memberships:'Memberships',
      events:'Events',
      other:'Other'
    },

    country_sales:byCountry.results || [],
    top_affiliates:top.results || [],

    kpis:{
      visitors:cur.visitors,
      applications:cur.applications,
      approved:cur.approved,
      active:cur.active,
      sales:cur.sales,
      commission:cur.commission
    }
  });
}
>>>>>>> Stashed changes
