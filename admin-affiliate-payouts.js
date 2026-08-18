const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>$('#token').value.trim();
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{...(opts.headers||{}),authorization:`Bearer ${token()}`},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function msg(text,error=false){const el=$('#status');el.textContent=text||'';el.className=`status-message ${error?'error':'success'}`}
function money(c,v){return `${c||'MYR'} ${Number(v||0).toFixed(2)}`}
function pill(s){s=esc(s||'');return `<span class="status-pill status-${s}">${s}</span>`}

async function loadEligible(){
 try{
  const aid=Number($('#affiliateId').value),period=$('#period').value;
  if(!aid)throw new Error('Please enter an Affiliate ID.');
  if(!period)throw new Error('Please select a payout month.');
  msg('Loading eligible commissions...');
  const d=await api(`/api/admin/affiliate-payout-candidates?affiliate_id=${aid}&period=${encodeURIComponent(period)}`);
  const s=d.summary||{};
  $('#sumCount').textContent=Number(s.eligible_sales_count||0);
  $('#sumSales').textContent=money(s.currency,s.total_sales);
  $('#sumCommission').textContent=money(s.currency,s.total_commission);
  const rows=d.items||[];
  $('#eligible').innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.created_at)}</td><td>${esc(x.order_reference)}</td><td>${esc(x.customer_name)}</td><td>${esc(x.product_name)}</td><td>${money(x.currency,x.gross_sale)}</td><td>${Number(x.commission_rate||0).toFixed(2)}%</td><td>${money(x.currency,x.commission_amount)}</td><td>${pill(x.status)}</td></tr>`).join(''):`<tr><td colspan="8" class="empty-cell">No eligible commissions for this period.</td></tr>`;
  msg('Eligible commissions loaded.');
  await loadPayouts();
 }catch(e){msg(e.message,true)}
}

async function loadPayouts(){
 try{
  const d=await api('/api/admin/affiliate-payout-list'),rows=d.payouts||[];
  $('#payouts').innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.payout_reference)}</td><td><strong>${esc(x.full_name)}</strong><br><small>${esc(x.affiliate_code||'')}</small></td><td>${esc(x.payout_period)}</td><td>${money(x.currency,x.total_sales)}</td><td>${money(x.currency,x.total_commission)}</td><td>${pill(x.status)}</td><td>${esc(x.payment_date||'—')}</td><td>${esc(x.payment_reference||'—')}</td><td>${x.status==='Draft'?`<button class="action-btn approve-btn" data-id="${x.id}">Approve</button>`:''}</td></tr>`).join(''):`<tr><td colspan="9" class="empty-cell">No payout batches yet.</td></tr>`;
 }catch(e){msg(e.message,true)}
}

async function createPayout(){
 try{
  const aid=Number($('#affiliateId').value),period=$('#period').value;
  if(!aid)throw new Error('Please enter an Affiliate ID.');
  if(!period)throw new Error('Please select a payout month.');
  const d=await api('/api/admin/affiliate-payout-create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({affiliate_id:aid,payout_period:period})});
  msg(`Draft payout created: ${d.payout_reference}`);
  await loadEligible();
 }catch(e){msg(e.message,true)}
}

async function approvePayout(id){
 try{
  await api('/api/admin/affiliate-payout-approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payout_id:id})});
  msg('Payout approved.');
  await loadPayouts();
 }catch(e){msg(e.message,true)}
}

async function markPaid(){
 try{
  const id=Number($('#payPayout').value),date=$('#paymentDate').value,ref=$('#paymentRef').value.trim();
  if(!id)throw new Error('Please enter the Payout ID.');
  if(!date)throw new Error('Please select the Payment Date.');
  if(!ref)throw new Error('Please enter the Payment Reference.');
  await api('/api/admin/affiliate-payout-pay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payout_id:id,payment_date:date,payment_reference:ref})});
  msg('Bank transfer recorded. Payout and linked commissions are now Paid.');
  await loadPayouts();
 }catch(e){msg(e.message,true)}
}

$('#load').addEventListener('click',loadEligible);
$('#create').addEventListener('click',createPayout);
$('#markPaid').addEventListener('click',markPaid);
$('#payouts').addEventListener('click',e=>{const b=e.target.closest('.approve-btn');if(b)approvePayout(Number(b.dataset.id))});
$('#period').value=new Date().toISOString().slice(0,7);
