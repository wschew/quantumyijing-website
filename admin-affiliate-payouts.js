const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>$('#token').value.trim();
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{...(opts.headers||{}),authorization:`Bearer ${token()}`},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function msg(text,error=false){const el=$('#status');el.textContent=text||'';el.className=`status-message ${error?'error':'success'}`}
function money(c,v){return `${c||'MYR'} ${Number(v||0).toFixed(2)}`}
function pill(s){s=esc(s||'');return `<span class="status-pill status-${s}">${s}</span>`}

async function loadAffiliates(){
  try{
    const d=await api('/api/admin/affiliate-accounting-affiliates');
    const rows=d.affiliates||[], sel=$('#affiliateId'), current=sel.value;
    sel.innerHTML='<option value="">Select affiliate by name…</option>'+rows.map(a=>`<option value="${a.id}">${esc(a.full_name||'(No name)')} · ${esc(a.affiliate_code||'No code')} · ${esc(a.email||'')}</option>`).join('');
    if(current && rows.some(a=>String(a.id)===String(current))) sel.value=current;
    $('#affiliateHint').textContent=`${rows.length} affiliate${rows.length===1?'':'s'} available`;
  }catch(e){msg(e.message,true)}
}

async function loadAccounting(){
  try{
    msg('Loading affiliate accounting overview...');
    const d=await api('/api/admin/affiliate-accounting-summary');
    $('#accLiability').textContent=money(d.liability?.currency,d.liability?.amount);
    $('#accLiabilityCount').textContent=`${Number(d.liability?.commission_count||0)} commissions`;
    $('#accDraft').textContent=Number(d.batches?.draft||0);
    $('#accApproved').textContent=Number(d.batches?.approved||0);
    $('#accPaidTotal').textContent=money(d.batches?.currency,d.batches?.paid_total);
    $('#accPaidBatches').textContent=`${Number(d.batches?.paid||0)} paid batches`;

    const monthly=d.monthly||[];
    $('#accMonthly').innerHTML=monthly.length?monthly.map(x=>`<tr><td>${esc(x.payout_period)}</td><td>${Number(x.batches||0)}</td><td>${money(x.currency,x.total_sales)}</td><td>${money(x.currency,x.total_commission)}</td><td>${money(x.currency,x.open_commission)}</td><td>${money(x.currency,x.paid_commission)}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-cell">No payout batches yet.</td></tr>';

    const channels=d.channels||[];
    $('#accChannels').innerHTML=channels.length?channels.map(x=>`<tr><td>${esc(x.sales_channel)}</td><td>${money(x.currency,x.total_sales)}</td><td>${money(x.currency,x.total_commission)}</td><td>${Number(x.commission_count||0)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-cell">No eligible affiliate commission activity yet.</td></tr>';

    const countries=d.countries||[];
    $('#accCountries').innerHTML=countries.length?countries.map(x=>`<tr><td>${esc(x.country)}</td><td>${Number(x.payout_count||0)}</td><td>${money(x.currency,x.total_sales)}</td><td>${money(x.currency,x.total_commission)}</td><td>${money(x.currency,x.paid_commission)}</td></tr>`).join(''):`<tr><td colspan="5" class="empty-cell">${d.country_source?'No country payout activity yet.':'Country field is not available in the current affiliate schema.'}</td></tr>`;

    const paid=d.paid_history||[];
    $('#accPaidHistory').innerHTML=paid.length?paid.map(x=>`<tr><td>${esc(x.payment_date||'—')}</td><td><strong>${esc(x.full_name)}</strong><br><small>${esc(x.affiliate_code||'')}</small></td><td>${esc(x.payout_period)}</td><td>${money(x.currency,x.total_commission)}</td><td>${esc(x.payment_reference||x.payout_reference||'—')}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-cell">No paid payouts yet.</td></tr>';
    msg('Affiliate accounting overview loaded.');
  }catch(e){msg(e.message,true)}
}

async function loadEligible(){
 try{
  const aid=Number($('#affiliateId').value),period=$('#period').value;
  if(!aid)throw new Error('Please select an affiliate.');
  if(!period)throw new Error('Please select a payout month.');
  msg('Loading eligible commissions...');
  const d=await api(`/api/admin/affiliate-payout-candidates?affiliate_id=${aid}&period=${encodeURIComponent(period)}`);
  const s=d.summary||{};
  $('#sumCount').textContent=Number(s.eligible_sales_count||0);
  $('#sumSales').textContent=money(s.currency,s.total_sales);
  $('#sumCommission').textContent=money(s.currency,s.total_commission);
  $('#sumBlocked').textContent=Number(s.blocked_count||0);
  const rows=d.items||[];
  $('#eligible').innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.created_at)}</td><td>${esc(x.order_reference)}</td><td>${esc(x.customer_name)}</td><td>${esc(x.product_name)}</td><td>${money(x.currency,x.gross_sale)}</td><td>${Number(x.commission_rate||0).toFixed(2)}%</td><td>${money(x.currency,x.commission_amount)}</td><td>${pill(x.status)}</td></tr>`).join(''):`<tr><td colspan="8" class="empty-cell">No eligible commissions for this period.</td></tr>`;
  msg('Eligible commissions loaded.');
  await loadPayouts();
 }catch(e){msg(e.message,true)}
}

async function loadPayouts(){
 try{
  const d=await api('/api/admin/affiliate-payout-list'),rows=d.payouts||[];
  $('#payouts').innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.payout_reference)}</td><td><strong>${esc(x.full_name)}</strong><br><small>${esc(x.affiliate_code||'')}</small></td><td>${esc(x.payout_period)}</td><td>${money(x.currency,x.total_sales)}</td><td>${money(x.currency,x.total_commission)}</td><td>${pill(x.status)}${Number(x.invalid_items||0)>0?'<br><small style="color:#b42318">Eligibility changed</small>':''}</td><td>${esc(x.payment_date||'—')}</td><td>${esc(x.payment_reference||'—')}</td><td>${x.status==='Draft'?`<button class="action-btn approve-btn" data-id="${x.id}">Approve</button>`:''}</td></tr>`).join(''):`<tr><td colspan="9" class="empty-cell">No payout batches yet.</td></tr>`;
 }catch(e){msg(e.message,true)}
}

async function createPayout(){
 try{
  const aid=Number($('#affiliateId').value),period=$('#period').value;
  if(!aid)throw new Error('Please select an affiliate.');
  if(!period)throw new Error('Please select a payout month.');
  const d=await api('/api/admin/affiliate-payout-create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({affiliate_id:aid,payout_period:period})});
  msg(`Draft payout created: ${d.payout_reference}`);
  await loadEligible();
  await loadAccounting();
 }catch(e){msg(e.message,true)}
}

async function approvePayout(id){
 try{
  await api('/api/admin/affiliate-payout-approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payout_id:id})});
  msg('Payout approved.');
  await loadPayouts();
  await loadAccounting();
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
  await loadAccounting();
 }catch(e){msg(e.message,true)}
}

$('#load').addEventListener('click',loadEligible);
$('#create').addEventListener('click',createPayout);
$('#markPaid').addEventListener('click',markPaid);
$('#refreshAccounting').addEventListener('click',async()=>{await Promise.all([loadAffiliates(),loadPayouts(),loadAccounting()])});
$('#payouts').addEventListener('click',e=>{const b=e.target.closest('.approve-btn');if(b)approvePayout(Number(b.dataset.id))});
$('#period').value=new Date().toISOString().slice(0,7);
$('#token').addEventListener('change',async()=>{if(token()) await Promise.all([loadAffiliates(),loadPayouts(),loadAccounting()])});
