const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c='MYR')=>`${c||'MYR'} ${Number(v||0).toFixed(2)}`;
const monthLabel=m=>{const [y,mo]=m.split('-');return new Date(+y,+mo-1,1).toLocaleDateString('en-MY',{month:'short',year:'2-digit'})};

function lineChart(el,data){
  if(!Array.isArray(data)||!data.length){el.innerHTML='<p class="muted">No sales data yet.</p>';return}
  const W=960,H=320,p={l:65,r:20,t:20,b:50},max=Math.max(1,...data.map(d=>Number(d.sales||0))),x=i=>p.l+i*(W-p.l-p.r)/Math.max(1,data.length-1),y=v=>H-p.b-(Number(v)/max)*(H-p.t-p.b);
  let svg=`<svg class="svgchart" viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=4;i++){const v=max*i/4,yy=y(v);svg+=`<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" stroke="#e5eaf0"/><text x="${p.l-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="#667085">RM ${v.toFixed(0)}</text>`}
  data.forEach((d,i)=>{if(i%2===0||data.length<=8)svg+=`<text x="${x(i)}" y="${H-18}" text-anchor="middle" font-size="11" fill="#667085">${monthLabel(d.month)}</text>`});
  svg+=`<polyline fill="none" stroke="#0b56a5" stroke-width="3" points="${data.map((d,i)=>`${x(i)},${y(d.sales)}`).join(' ')}"/>`;
  data.forEach((d,i)=>svg+=`<circle cx="${x(i)}" cy="${y(d.sales)}" r="3.5" fill="#0b56a5"><title>${monthLabel(d.month)}: RM ${Number(d.sales||0).toFixed(2)}</title></circle>`);
  el.innerHTML=svg+'</svg>';
}

function stacked(el,data,labels){
  if(!Array.isArray(data)||!data.length){el.innerHTML='<p class="muted">No category sales data yet.</p>';return}
  const keys=['courses','consultations','books','digital','physical','memberships','events','other'],colors={courses:'#0b56a5',consultations:'#16a085',books:'#7c3aed',digital:'#d97706',physical:'#dc2626',memberships:'#0891b2',events:'#65a30d',other:'#6b7280'},W=960,H=360,p={l:65,r:20,t:20,b:55},totals=data.map(d=>keys.reduce((s,k)=>s+Number(d[k]||0),0)),max=Math.max(1,...totals),slot=(W-p.l-p.r)/Math.max(1,data.length),barW=Math.min(48,slot*.68),y=v=>H-p.b-(Number(v)/max)*(H-p.t-p.b);
  let svg=`<svg class="svgchart" viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=4;i++){const v=max*i/4,yy=y(v);svg+=`<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" stroke="#e5eaf0"/><text x="${p.l-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="#667085">RM ${v.toFixed(0)}</text>`}
  data.forEach((d,i)=>{const x=p.l+i*slot+(slot-barW)/2;let c=0;keys.forEach(k=>{const v=Number(d[k]||0);if(v<=0)return;const yt=y(c+v),yb=y(c);svg+=`<rect x="${x}" y="${yt}" width="${barW}" height="${Math.max(1,yb-yt)}" fill="${colors[k]}"><title>${monthLabel(d.month)} — ${labels[k]}: RM ${v.toFixed(2)}</title></rect>`;c+=v});if(i%2===0||data.length<=8)svg+=`<text x="${x+barW/2}" y="${H-20}" text-anchor="middle" font-size="11" fill="#667085">${monthLabel(d.month)}</text>`});
  svg+='</svg><div class="legend category-legend">'+keys.map(k=>`<span style="color:${colors[k]}">● ${esc(labels[k])}</span>`).join('')+'</div>';
  el.innerHTML=svg;
}

function commissionText(p){
  if(String(p.commission_type)==='fixed')return `${p.currency||'MYR'} ${Number(p.commission_value||0).toFixed(2)} per eligible sale`;
  return `${Number(p.commission_value||0).toFixed(2)}%`;
}

async function api(url){
  const r=await fetch(url,{cache:'no-store'});
  if(r.status===401){location.href='/affiliate-login.html';throw new Error('auth')}
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}

function renderProducts(l){
  const box=$('#productLinks');
  if(!Array.isArray(l.products)||!l.products.length){box.innerHTML='<div class="product-link affiliate-offer"><b>No affiliate-eligible products are currently available.</b><small>Please check again later.</small></div>';return}
  box.innerHTML=l.products.map((p,i)=>`<div class="product-link affiliate-offer"><div class="offer-top"><div><b>${esc(p.name_en)}</b>${p.name_zh?`<small>${esc(p.name_zh)}</small>`:''}</div><span class="offer-category">${esc(p.product_type)}</span></div><div class="offer-meta"><span><strong>SKU:</strong> ${esc(p.sku)}</span><span><strong>Price:</strong> ${esc(p.currency||'MYR')} ${Number(p.price||0).toFixed(2)}</span><span><strong>Commission:</strong> ${esc(commissionText(p))}</span></div><small class="commission-source">${esc(p.commission_source||'')}</small><div class="link-row"><input id="affProductLink${i}" value="${esc(p.url)}" readonly><button class="copy-product" data-target="affProductLink${i}">Copy Link</button></div></div>`).join('');
}

function renderCommissions(rows){
  $('#commissions').innerHTML=Array.isArray(rows)&&rows.length?rows.map(x=>`<tr><td>${esc(x.created_at)}</td><td>${esc(x.order_reference)}</td><td>${esc(x.customer_name)}</td><td>${esc(x.product_name)}</td><td>${esc(x.currency)} ${Number(x.gross_sale||0).toFixed(2)}</td><td>${Number(x.commission_rate||0)}%</td><td>${esc(x.currency)} ${Number(x.commission_amount||0).toFixed(2)}</td><td>${esc(x.status)}</td><td>${esc(x.paid_at||'')}</td></tr>`).join(''):'<tr><td colspan="9">No commission transactions yet.</td></tr>';
}

function renderPayouts(rows){
  $('#payouts').innerHTML=Array.isArray(rows)&&rows.length?rows.map(x=>`<tr><td>${esc(x.payout_period)}</td><td>${esc(x.payout_reference)}</td><td>${esc(x.currency)} ${Number(x.total_sales||0).toFixed(2)}</td><td>${esc(x.currency)} ${Number(x.total_commission||0).toFixed(2)}</td><td>${esc(x.status)}</td><td>${esc(x.payment_date||'')}</td><td>${esc(x.payment_reference||'')}</td></tr>`).join(''):'<tr><td colspan="7">No payout history yet.</td></tr>';
}

async function load(){
  try{
    const [me,a,t,l]=await Promise.all([api('/api/affiliate/portal/me'),api('/api/affiliate/portal/analytics'),api('/api/affiliate/portal/transactions'),api('/api/affiliate/portal/links')]);
    const aff=me.affiliate||{},s=me.summary||{},currentMonth=Array.isArray(a.monthly_sales)&&a.monthly_sales.length?a.monthly_sales[a.monthly_sales.length-1]:{sales:0};
    $('#welcome').textContent=`Welcome, ${aff.display_name||aff.full_name||'Affiliate'}`;
    $('#affiliateCode').textContent=aff.affiliate_code||'—';
    $('#membership').textContent=`Membership expires: ${String(aff.membership_expires_at||'—').slice(0,10)}`;
    $('#accountStatus').textContent=`Account status: ${aff.status||'—'}${aff.renewal_status?` · Renewal: ${aff.renewal_status}`:''}`;
    $('#metrics').innerHTML=[
      ['Total Sales',money(s.total_sales)],
      ['Current Month Sales',money(currentMonth.sales)],
      ['Commission Earned',money(s.commission_earned)],
      ['Pending Commission',money(s.commission_pending)],
      ['Commission Paid',money(s.commission_paid)]
    ].map(x=>`<div class="metric"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
    lineChart($('#salesChart'),a.monthly_sales);
    stacked($('#categoryChart'),a.monthly_category_sales,a.category_labels||{});
    $('#generalLink').value=l.general_url||'';
    renderProducts(l);
    renderCommissions(t.commissions);
    renderPayouts(t.payouts);
  }catch(e){
    if(e.message!=='auth'){console.error(e);$('#metrics').innerHTML='<div class="metric"><span>Dashboard</span><b>Unable to load data</b></div>'}
  }
}

function copied(message){
  const s=$('#copyStatus'); if(!s)return;
  s.className='status success';s.textContent=message;
  setTimeout(()=>{s.textContent='';s.className='status'},1800);
}

$('#copyGeneral').addEventListener('click',async()=>{const v=$('#generalLink').value;if(v){await navigator.clipboard?.writeText(v);copied('General referral link copied.')}});
$('#productLinks').addEventListener('click',async e=>{const b=e.target.closest('.copy-product');if(!b)return;const inp=document.getElementById(b.dataset.target);if(inp){await navigator.clipboard?.writeText(inp.value);copied('Product referral link copied.')}});
$('#logout').addEventListener('click',async()=>{await fetch('/api/affiliate/auth/logout',{method:'POST'});location.href='/affiliate-login.html'});
load();
