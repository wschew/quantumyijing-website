
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>$('#token').value.trim();
async function api(url,opts={}){
  const r=await fetch(url,{...opts,headers:{...(opts.headers||{}),authorization:`Bearer ${token()}`},cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
function msg(text,error=false){const el=$('#status');el.textContent=text||'';el.className=`status-message ${error?'error':'success'}`}
function money(c,v){return `${c||'MYR'} ${Number(v||0).toFixed(2)}`}
function pill(s){s=esc(s||'');return `<span class="status-pill status-${s}">${s}</span>`}


async function loadCommissionSettings(){
  const d=await api('/api/admin/affiliate-accounting-settings');
  const s=d.settings||{};
  $('#genericCommissionEnabled').value=Number(s.generic_payment_commission_enabled||0)===1?'1':'0';
  $('#genericCommissionRate').value=Number(s.generic_payment_commission_rate||0).toFixed(2);
  $('#genericCommissionProduct').textContent=`${s.product_name||'Generic Affiliate Payment'} · ${s.product_sku||'GEN-AFF'}`;
}
async function saveCommissionSettings(){
  try{
    const rate=Number($('#genericCommissionRate').value);
    const enabled=$('#genericCommissionEnabled').value==='1';
    if(!Number.isFinite(rate)||rate<0||rate>100) throw new Error('Commission rate must be between 0% and 100%.');
    const d=await api('/api/admin/affiliate-accounting-settings',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        generic_payment_commission_enabled:enabled,
        generic_payment_commission_rate:rate
      })
    });
    msg(`Generic payment affiliate commission saved: ${enabled?'Enabled':'Disabled'} · ${Number(d.settings.generic_payment_commission_rate).toFixed(2)}%.`);
    await loadCommissionSettings();
  }catch(e){msg(e.message,true)}
}

async function loadAffiliates(){
  const d=await api('/api/admin/affiliate-payout-affiliates');
  const rows=d.affiliates||[];
  $('#affiliateId').innerHTML='<option value="">Select affiliate…</option>'+
    rows.map(a=>`<option value="${Number(a.id)}">${esc(a.full_name)} — ${esc(a.affiliate_code||'')}</option>`).join('');
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
    $('#eligible').innerHTML=rows.length
      ? rows.map(x=>`<tr><td>${esc(x.eligibility_date||x.created_at)}</td><td>${esc(x.order_reference)}</td><td>${esc(x.customer_name)}</td><td>${esc(x.product_name)}</td><td>${money(x.currency,x.gross_sale)}</td><td>${Number(x.commission_rate||0).toFixed(2)}%</td><td>${money(x.currency,x.commission_amount)}</td><td>${pill(x.status)}</td></tr>`).join('')
      : `<tr><td colspan="8" class="empty-cell">No eligible commissions for this period.</td></tr>`;
    msg('Eligible commissions loaded.');
    await loadPayouts();
  }catch(e){msg(e.message,true)}
}

async function loadPayouts(){
  try{
    const d=await api('/api/admin/affiliate-payout-list');
    const rows=d.payouts||[];
    $('#payouts').innerHTML=rows.length?rows.map(x=>{
      let action='—';
      if(x.status==='Draft'){
        action=`<button class="action-btn approve-btn" data-id="${x.id}">Approve</button>`;
      }else if(x.status==='Approved'){
        action=`<div class="inline-pay">
          <input type="date" data-pay-date="${x.id}" aria-label="Payment date">
          <input type="text" data-pay-ref="${x.id}" placeholder="Bank/payment reference" aria-label="Payment reference">
          <button class="action-btn pay-btn" data-id="${x.id}">Record Bank Transfer</button>
        </div>`;
      }else if(x.status==='Paid'){
        const ae=x.affiliate_email_status||'—';
        const qe=x.accounting_email_status||'—';
        action=`<span class="paid-note">Completed</span><br><small>Affiliate email: ${esc(ae)}<br>QY accounting email: ${esc(qe)}</small>`;
      }
      return `<tr>
        <td>${esc(x.payout_reference)}</td>
        <td><strong>${esc(x.full_name)}</strong><br><small>${esc(x.affiliate_code||'')}</small></td>
        <td>${esc(x.payout_period)}</td>
        <td>${money(x.currency,x.total_sales)}</td>
        <td>${money(x.currency,x.total_commission)}</td>
        <td>${pill(x.status)}${Number(x.invalid_items||0)>0?'<br><small style="color:#b42318">Eligibility changed</small>':''}</td>
        <td>${esc(x.payment_date||'—')}</td>
        <td>${esc(x.payment_reference||'—')}</td>
        <td>${action}</td>
      </tr>`;
    }).join(''):`<tr><td colspan="9" class="empty-cell">No monthly payouts yet.</td></tr>`;
  }catch(e){msg(e.message,true)}
}

async function createPayout(){
  try{
    const aid=Number($('#affiliateId').value),period=$('#period').value;
    if(!aid)throw new Error('Please select an affiliate.');
    if(!period)throw new Error('Please select a payout month.');
    const d=await api('/api/admin/affiliate-payout-create',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({affiliate_id:aid,payout_period:period})
    });
    msg(`Monthly payout draft created: ${d.payout_reference}`);
    await loadEligible();
  }catch(e){msg(e.message,true)}
}

async function approvePayout(id){
  try{
    await api('/api/admin/affiliate-payout-approve',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({payout_id:id})
    });
    msg('Monthly payout approved. Complete the bank transfer, then record the payment date and bank reference on this payout row.');
    await loadPayouts();
  }catch(e){msg(e.message,true)}
}

async function recordBankTransfer(id){
  try{
    const date=document.querySelector(`[data-pay-date="${id}"]`)?.value||'';
    const ref=document.querySelector(`[data-pay-ref="${id}"]`)?.value.trim()||'';
    if(!date)throw new Error('Please enter the bank transfer date.');
    if(!ref)throw new Error('Please enter the bank/payment reference.');
    const d=await api('/api/admin/affiliate-payout-pay',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({payout_id:id,payment_date:date,payment_reference:ref})
    });
    const mailSummary=`Affiliate email: ${d.affiliate_email_sent?'Sent':'FAILED'} · QY accounting email: ${d.accounting_email_sent?'Sent':'FAILED'}`;
    msg(`Bank transfer recorded. The monthly payout and linked commissions are now Paid. ${mailSummary}`,!(d.affiliate_email_sent&&d.accounting_email_sent));
    await loadPayouts();
  }catch(e){msg(e.message,true)}
}

$('#load').addEventListener('click',loadEligible);
$('#create').addEventListener('click',createPayout);
$('#payouts').addEventListener('click',e=>{
  const approve=e.target.closest('.approve-btn');
  if(approve){approvePayout(Number(approve.dataset.id));return}
  const pay=e.target.closest('.pay-btn');
  if(pay)recordBankTransfer(Number(pay.dataset.id));
});
$('#period').value=new Date().toISOString().slice(0,7);

$('#token').addEventListener('change',()=>Promise.all([loadAffiliates(),loadCommissionSettings()]).catch(e=>msg(e.message,true)));
$('#token').addEventListener('blur',()=>{if(token())Promise.all([loadAffiliates(),loadCommissionSettings()]).catch(e=>msg(e.message,true))});

$('#saveGenericCommission')?.addEventListener('click',saveCommissionSettings);


async function repairGenericCommission(){
  try{
    const ref=$('#repairAffiliateOrder').value.trim();
    if(!ref) throw new Error('Enter the QY order reference.');
    const d=await api('/api/admin/affiliate-generic-commission-repair',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({order_reference:ref})
    });
    const c=d.commission||{};
    if(d.already_exists){
      msg(`Commission already exists · ${Number(c.commission_rate||0).toFixed(2)}% · MYR ${Number(c.commission_amount||0).toFixed(2)}.`);
    }else{
      msg(`Missing affiliate commission created · ${c.affiliate_code||''} · ${Number(c.commission_rate||0).toFixed(2)}% · MYR ${Number(c.commission_amount||0).toFixed(2)}.`);
    }
  }catch(e){msg(e.message,true)}
}
$('#repairAffiliateCommission')?.addEventListener('click',repairGenericCommission);
