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
    $('#accLiabilityBreakdown').textContent=`Gross ${money(d.liability?.currency,d.liability?.gross_amount)} · Pre-payout adjustments ${money(d.liability?.currency,d.liability?.pre_payout_adjustments)}`;
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

    const ledger=d.ledger||[];
    $('#accLedger').innerHTML=ledger.length?ledger.map(x=>`<tr><td><strong>${Number(x.id||x.commission_id||0)}</strong></td><td>${esc(x.eligibility_date||x.created_at||'—')}</td><td><strong>${esc(x.full_name||'—')}</strong><br><small>${esc(x.affiliate_code||'')}</small></td><td>${esc(x.order_reference||'—')}</td><td>${esc(x.customer_name||'—')}</td><td>${esc(x.product_name||'—')}</td><td>${money(x.currency,x.gross_sale)}</td><td>${Number(x.commission_rate||0).toFixed(2)}%</td><td>${money(x.currency,x.commission_amount)}</td><td>${pill(x.commission_status||'—')}</td><td>${x.payout_status?`${pill(x.payout_status)}<br><small>${esc(x.payout_reference||'')}${x.payment_date?` · ${esc(x.payment_date)}`:''}</small>`:'—'}</td><td><button class="reversal-pick-btn" data-commission-id="${Number(x.id||x.commission_id||0)}" data-sale="${Number(x.gross_sale||0)}">Refund / Reverse</button></td></tr>`).join(''):'<tr><td colspan="12" class="empty-cell">No affiliate commission transactions recorded yet.</td></tr>';
    await loadAdjustments();
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
  $('#sumGross').textContent=money(s.currency,s.original_commission);
  $('#sumAdjustments').textContent=money(s.currency,Number(s.pre_payout_adjustment||0)+Number(s.carry_forward_applied||0));
  $('#sumCarry').textContent=money(s.currency,s.carry_forward_balance);
  $('#sumCommission').textContent=money(s.currency,s.total_commission);
  $('#sumBlocked').textContent=Number(s.blocked_count||0);
  const rows=d.items||[];
  $('#eligible').innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.created_at)}</td><td>${esc(x.order_reference)}</td><td>${esc(x.customer_name)}</td><td>${esc(x.product_name)}</td><td>${money(x.currency,x.gross_sale)}</td><td>${Number(x.commission_rate||0).toFixed(2)}%</td><td>${money(x.currency,x.net_commission_amount??x.commission_amount)}${Number(x.pre_payout_adjustment||0)<-0.005?`<span class="net-payout-note">Original ${money(x.currency,x.commission_amount)} · Adj ${money(x.currency,x.pre_payout_adjustment)}</span>`:''}</td><td>${pill(x.status)}</td></tr>`).join(''):`<tr><td colspan="8" class="empty-cell">No eligible commissions for this period.</td></tr>`;
  msg('Eligible commissions loaded.');
  await loadPayouts();
 }catch(e){msg(e.message,true)}
}

async function loadPayouts(){
 try{
  const d=await api('/api/admin/affiliate-payout-list'),rows=d.payouts||[];
  $('#payouts').innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.payout_reference)}</td><td><strong>${esc(x.full_name)}</strong><br><small>${esc(x.affiliate_code||'')}</small></td><td>${esc(x.payout_period)}</td><td>${money(x.currency,x.total_sales)}</td><td><strong>${money(x.currency,x.total_commission)}</strong>${Number(x.adjustment_total||0)<-0.005?`<span class="net-payout-note">Gross ${money(x.currency,x.gross_commission||x.total_commission)} · Adjustments ${money(x.currency,x.adjustment_total)}</span>`:''}</td><td>${pill(x.status)}${Number(x.invalid_items||0)>0?'<br><small style="color:#b42318">Eligibility changed</small>':''}</td><td>${esc(x.payment_date||'—')}</td><td>${esc(x.payment_reference||'—')}</td><td>${x.status==='Draft'?`<button class="action-btn approve-btn" data-id="${x.id}">Approve</button>`:''}${x.status==='Approved'?`<button class="action-btn record-payment-btn" data-id="${x.id}" data-ref="${esc(x.payout_reference)}" data-amount="${Number(x.total_commission||0)}" data-currency="${esc(x.currency||'MYR')}">Record Payment</button>`:''}${['Draft','Approved'].includes(x.status)?`<br><button class="cancel-rebuild-btn" data-id="${x.id}">Cancel / Rebuild</button>`:''}</td></tr>`).join(''):`<tr><td colspan="9" class="empty-cell">No payout batches yet.</td></tr>`;
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


function selectPayoutForPayment(btn){
 const id=Number(btn?.dataset?.id||0);
 const ref=String(btn?.dataset?.ref||'');
 const amount=Number(btn?.dataset?.amount||0);
 const currency=String(btn?.dataset?.currency||'MYR');
 if(!id||!ref){msg('Unable to select this payout for payment.',true);return;}
 $('#payPayout').value=String(id);
 $('#payPayoutRef').value=`${ref} — ${money(currency,amount)}`;
 $('#paymentDate').value='';
 $('#paymentRef').value='';
 msg(`Approved payout selected for bank transfer: ${ref}`);
 document.querySelector('.bank-card')?.scrollIntoView({behavior:'smooth',block:'start'});
 setTimeout(()=>$('#paymentDate')?.focus(),350);
}

async function markPaid(){
 try{
  const id=Number($('#payPayout').value),date=$('#paymentDate').value,ref=$('#paymentRef').value.trim();
  if(!id)throw new Error('Please select an Approved payout using Record Payment.');
  if(!date)throw new Error('Please select the Payment Date.');
  if(!ref)throw new Error('Please enter the Payment Reference.');
  await api('/api/admin/affiliate-payout-pay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payout_id:id,payment_date:date,payment_reference:ref})});
  msg('Bank transfer recorded. Payout and linked commissions are now Paid.');
  await loadPayouts();
  await loadAccounting();
 }catch(e){msg(e.message,true)}
}


async function loadCommissionOptions(){
 try{
  const aid=Number($('#affiliateId')?.value||0),sel=$('#adjustCommissionId'),hint=$('#adjustCommissionHint');
  if(!sel)return;
  if(!aid){sel.innerHTML='<option value="">Select affiliate first…</option>';if(hint)hint.textContent='Select an affiliate above, then choose the exact commission transaction.';return;}
  const d=await api(`/api/admin/affiliate-commission-options?affiliate_id=${aid}`),rows=d.commissions||[];
  sel.innerHTML='<option value="">Select commission transaction…</option>'+rows.map(x=>{
    const paid=(x.payout_status||'').toLowerCase()==='paid';
    const payout=x.payout_status?` | ${x.payout_status}${x.payment_date?` ${x.payment_date}`:''}`:'';
    const remaining=Math.max(Number(x.gross_sale||0)-Number(x.refunded_sale||0),0);
    return `<option value="${Number(x.commission_id)}" data-sale="${remaining}" data-affiliate-id="${Number(x.affiliate_id)}">#${Number(x.commission_id)} | ${esc(x.order_reference||'No invoice')} | ${esc(x.customer_name||'No customer')} | ${esc(x.product_name||'No product')} | ${money(x.currency,x.gross_sale)} | Comm ${money(x.currency,x.commission_amount)}${payout}${paid?' | PAID':''}</option>`;
  }).join('');
  if(hint)hint.textContent=rows.length?`${rows.length} commission transaction${rows.length===1?'':'s'} for ${d.affiliate?.full_name||'selected affiliate'}, including paid history.`:'No commission transactions found for this affiliate.';
 }catch(e){msg(e.message,true)}
}

function syncSelectedCommission(){
 const sel=$('#adjustCommissionId'),opt=sel?.selectedOptions?.[0];
 if(!opt||!opt.value)return;
 const remaining=Number(opt.dataset.sale||0);
 if(remaining>0)$('#adjustRefundAmount').value=remaining.toFixed(2);
 $('#adjustDate').value=new Date().toISOString().slice(0,10);
}

async function loadAdjustments(){
 try{
  const aid=Number($('#affiliateId')?.value||0);
  const qs=aid?`?affiliate_id=${aid}`:'';
  const d=await api(`/api/admin/affiliate-commission-adjustments${qs}`);
  $('#adjustmentBalance').textContent=money('MYR',d.carry_forward_balance||0);
  const rows=d.adjustments||[];
  $('#adjustmentRows').innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.effective_date||x.created_at||'—')}</td><td><strong>${esc(x.full_name||'—')}</strong><br><small>${esc(x.affiliate_code||'')}</small></td><td>${Number(x.commission_id||0)}</td><td>${esc(x.order_reference||'—')}<br><small>${esc(x.customer_name||'—')}</small></td><td>${esc(x.adjustment_type)}</td><td>${money(x.currency,x.refund_amount)}</td><td class="adjustment-negative">${money(x.currency,x.adjustment_amount)}</td><td>${esc(x.recovery_mode==='CarryForward'?'Carry-forward':'Before payout')}</td><td>${pill(x.status)}</td><td>${esc(x.reference||'—')}<br><small>${esc(x.reason||'')}</small></td></tr>`).join(''):'<tr><td colspan="10" class="empty-cell">No refund / reversal adjustments recorded.</td></tr>';
 }catch(e){if(token())msg(e.message,true)}
}

async function recordAdjustment(){
 try{
  const commissionId=Number($('#adjustCommissionId').value),affiliateId=Number($('#affiliateId').value),refundAmount=Number($('#adjustRefundAmount').value),adjustmentType=$('#adjustType').value,effectiveDate=$('#adjustDate').value,reference=$('#adjustReference').value.trim(),reason=$('#adjustReason').value.trim();
  if(!affiliateId)throw new Error('Select an affiliate first.');
  if(!commissionId)throw new Error('Select a commission transaction.');
  if(!refundAmount||refundAmount<=0)throw new Error('Enter the refunded sale amount.');
  if(!effectiveDate||!reference||!reason)throw new Error('Effective date, reference and reason are required.');
  const d=await api('/api/admin/affiliate-commission-adjustments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({affiliate_id:affiliateId,commission_id:commissionId,refund_amount:refundAmount,adjustment_type:adjustmentType,effective_date:effectiveDate,reference,reason})});
  msg(`${d.message} Adjustment: ${money(d.currency,d.adjustment_amount)}`);
  if(d.rebuild_required) alert(`Refund/reversal recorded. Payout #${d.payout_id} is Draft/Approved and must be Cancelled/Rebuilt before approval or bank payment.`);
  await Promise.all([loadAdjustments(),loadAccounting(),loadPayouts()]);
 }catch(e){msg(e.message,true)}
}

async function cancelPayout(id){
 try{
  if(!confirm('Cancel this Draft/Approved payout and rebuild it using the latest refund/reversal adjustments?'))return;
  await api('/api/admin/affiliate-payout-cancel',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payout_id:id,reason:'Cancelled/Rebuilt after refund or commission reversal adjustment.'})});
  msg('Payout cancelled for rebuild. Its commissions are available again using the latest adjustment balance.');
  await Promise.all([loadPayouts(),loadAccounting()]);
  if($('#affiliateId').value&&$('#period').value)await loadEligible();
 }catch(e){msg(e.message,true)}
}

$('#load').addEventListener('click',loadEligible);
$('#create').addEventListener('click',createPayout);
$('#markPaid').addEventListener('click',markPaid);
$('#refreshAccounting').addEventListener('click',async()=>{await Promise.all([loadAffiliates(),loadPayouts(),loadAccounting(),loadAdjustments()])});
$('#payouts').addEventListener('click',e=>{const a=e.target.closest('.approve-btn');if(a)approvePayout(Number(a.dataset.id));const p=e.target.closest('.record-payment-btn');if(p)selectPayoutForPayment(p);const c=e.target.closest('.cancel-rebuild-btn');if(c)cancelPayout(Number(c.dataset.id))});
$('#accLedger').addEventListener('click',async e=>{const b=e.target.closest('.reversal-pick-btn');if(!b)return;const row=b.closest('tr');const commissionId=b.dataset.commissionId||'';const ledgerAffiliate=(row?.querySelector('small')?.textContent||'').trim();const opt=[...$('#affiliateId').options].find(o=>ledgerAffiliate&&o.textContent.includes(ledgerAffiliate));if(opt){$('#affiliateId').value=opt.value;await Promise.all([loadAdjustments(),loadCommissionOptions()]);}$('#adjustCommissionId').value=commissionId;syncSelectedCommission();$('#adjustReference').focus();document.querySelector('.reversal-card')?.scrollIntoView({behavior:'smooth',block:'start'});});
$('#recordAdjustment').addEventListener('click',recordAdjustment);
$('#period').value=new Date().toISOString().slice(0,7);
$('#token').addEventListener('change',async()=>{if(token()){await Promise.all([loadAffiliates(),loadPayouts(),loadAccounting(),loadAdjustments()]);await loadCommissionOptions();}});
$('#affiliateId').addEventListener('change',async()=>{if(token())await Promise.all([loadAdjustments(),loadCommissionOptions()]);});
$('#adjustCommissionId').addEventListener('change',syncSelectedCommission);
$('#adjustDate').value=new Date().toISOString().slice(0,10);
