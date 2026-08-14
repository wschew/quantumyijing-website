import {requireAffiliate} from '../auth/_auth.js';

function monthShift(ym,delta){
  const [y,m]=ym.split('-').map(Number);
  const d=new Date(Date.UTC(y,m-1+delta,1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

function categoryKey(t){
  t=String(t||'').toLowerCase();
  if(t==='course') return 'courses';
  if(t==='consultation') return 'consultations';
  if(t==='ebook') return 'books';
  if(t==='digital') return 'digital';
  if(t==='physical') return 'physical';
  if(t==='membership') return 'memberships';
  if(t==='event') return 'events';
  return 'other';
}

export async function onRequestGet({request,env}){
  const auth=await requireAffiliate(request,env);
  if(auth.error) return auth.error;

  const {db,affiliate:a}=auth;
  const u=new URL(request.url);
  const selected=(u.searchParams.get('month')||new Date().toISOString().slice(0,7)).slice(0,7);

  const months=[];
  for(let i=-11;i<=0;i++) months.push(monthShift(selected,i));
  const first=months[0];

  const monthly=await db.prepare(`
    SELECT substr(ac.created_at,1,7) month,
           COALESCE(SUM(ac.gross_sale),0) sales
    FROM affiliate_commissions ac
    JOIN orders o ON o.id=ac.order_id
    WHERE ac.affiliate_id=?
      AND o.payment_status='Paid'
      AND ac.status NOT IN ('Reversed','Cancelled')
      AND substr(ac.created_at,1,7) BETWEEN ? AND ?
    GROUP BY substr(ac.created_at,1,7)
  `).bind(a.affiliate_id,first,selected).all();

  const byCategory=await db.prepare(`
    SELECT substr(ac.created_at,1,7) month,
           COALESCE(p.product_type,'other') product_type,
           COALESCE(SUM(ac.gross_sale),0) sales
    FROM affiliate_commissions ac
    JOIN orders o ON o.id=ac.order_id
    LEFT JOIN products p ON p.id=ac.product_id
    WHERE ac.affiliate_id=?
      AND o.payment_status='Paid'
      AND ac.status NOT IN ('Reversed','Cancelled')
      AND substr(ac.created_at,1,7) BETWEEN ? AND ?
    GROUP BY substr(ac.created_at,1,7),COALESCE(p.product_type,'other')
  `).bind(a.affiliate_id,first,selected).all();

  const salesMap=Object.fromEntries((monthly.results||[]).map(r=>[r.month,Number(r.sales||0)]));

  const empty=()=>({
    courses:0,consultations:0,books:0,digital:0,
    physical:0,memberships:0,events:0,other:0
  });
  const cat=Object.fromEntries(months.map(m=>[m,empty()]));

  for(const r of byCategory.results||[]){
    if(cat[r.month]) cat[r.month][categoryKey(r.product_type)]+=Number(r.sales||0);
  }

  return Response.json({
    selected_month:selected,
    monthly_sales:months.map(month=>({month,sales:salesMap[month]||0})),
    monthly_category_sales:months.map(month=>({month,...cat[month]})),
    category_labels:{
      courses:'Courses',
      consultations:'Consultations',
      books:'Books / eBooks',
      digital:'Digital Products',
      physical:'Physical Products',
      memberships:'Memberships',
      events:'Events',
      other:'Other'
    }
  },{
    headers:{'cache-control':'no-store'}
  });
}
