(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {
    token: sessionStorage.getItem('qyAdminToken') || '',
    page: 1, pageSize: 25, total: 0, selected: null,
    studentPage: 1, studentPageSize: 25, studentTotal: 0, selectedStudent: null,
    activeModule: 'crm',
    products: [],
    orders: [],
    payments: [],
    selectedPaymentId: 0
  };
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  const api = async (path, options = {}) => {
    const headers = { ...(options.headers || {}), authorization: `Bearer ${state.token}` };
    if (options.body) headers['content-type'] = 'application/json';
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response;
  };

  const filters = () => {
    const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
    [['q','filterQ'],['status','filterStatus'],['lifecycle','filterLifecycle'],['priority','filterPriority'],['interest','filterInterest'],['source','filterSource'],['campaign','filterCampaign'],['affiliate','filterAffiliate'],['from','filterFrom'],['to','filterTo']].forEach(([key,id]) => {
      const value = $(id).value.trim(); if (value) params.set(key, value);
    });
    return params;
  };
  const setMessage = (id, text, ok = false) => { const el = $(id); el.textContent = text; el.style.color = ok ? '#217a3d' : '#b42318'; };
  const showDashboard = () => { $('loginPanel').hidden = true; $('dashboard').hidden = false; };
  const showLogin = () => { $('dashboard').hidden = true; $('loginPanel').hidden = false; };
  const detail = (label, value, full = false) => `<div class="detail${full?' full':''}"><span>${esc(label)}</span><p>${esc(value || '—')}</p></div>`;
  const priorityClass = value => `priority-${String(value || 'Normal').toLowerCase()}`;

  function renderBars(id, rows, labelKey, valueKey = 'count') {
    const host = $(id); host.innerHTML = '';
    const max = Math.max(...rows.map(r => Number(r[valueKey] || 0)), 1);
    if (!rows.length) { host.innerHTML = '<p class="empty-state">No data yet.</p>'; return; }
    rows.forEach(row => {
      const label = row[labelKey] || 'Not specified', count = Number(row[valueKey] || 0);
      host.insertAdjacentHTML('beforeend', `<div class="bar-row"><span title="${esc(label)}">${esc(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(5,(count/max)*100)}%"></div></div><strong>${count}</strong></div>`);
    });
  }

  function renderTasks(tasks) {
    const host = $('taskList'); host.innerHTML = '';
    if (!tasks.length) { host.innerHTML = '<div class="empty-state">No follow-ups scheduled in the next seven days.</div>'; return; }
    tasks.forEach(row => {
      const urgency = row.bucket === 'Overdue' ? ' overdue' : row.bucket === 'Today' ? ' due-today' : '';
      const next = row.next_action ? ` · ${esc(row.next_action)}` : '';
      host.insertAdjacentHTML('beforeend', `<div class="task-item${urgency}"><span class="task-dot"></span><div><strong>${esc(row.name)} <em class="priority-pill ${priorityClass(row.priority)}">${esc(row.priority)}</em></strong><span>${esc(row.bucket)} · ${esc(row.follow_up_date)} · ${esc(row.interest)}${next}${row.student_id ? ` · ${esc(row.student_id)}` : ''}</span></div><button type="button" data-open-id="${row.id}">Open</button></div>`);
    });
  }

  async function loadStats() {
    const response = await api('/api/admin?action=stats');
    const data = await response.json();
    $('statTotal').textContent = data.summary.total;
    $('statOverdue').textContent = data.summary.overdue;
    $('statDueToday').textContent = data.summary.dueToday;
    $('statUpcoming').textContent = data.summary.upcoming;
    $('statPriority').textContent = data.summary.priorityLeads;
    $('statStudents').textContent = data.summary.students;
    renderTasks(data.tasks || []);
    renderBars('lifecycleChart', data.byLifecycle || [], 'lifecycle_stage');
    renderBars('interestChart', data.byInterest || [], 'interest');
    renderBars('countryChart', data.byCountry || [], 'country');
    renderBars('monthlyChart', data.monthly || [], 'month');
  }

  async function loadRecords() {
    setMessage('dashboardMessage', 'Loading…', true);
    const response = await api(`/api/admin?action=enquiries&${filters()}`);
    const data = await response.json();
    state.total = data.total;
    const body = $('recordsBody'); body.innerHTML = '';
    data.results.forEach(row => {
      const student = row.student_id ? `<span class="student-badge">${esc(row.student_id)}</span>` : '';
      const action = row.next_action ? `<strong>${esc(row.next_action)}</strong><br>` : '';
      body.insertAdjacentHTML('beforeend', `<tr data-id="${row.id}"><td>${esc(row.submitted_date)}<br><small>${esc(row.submitted_at_malaysia)}</small></td><td><strong>${esc(row.reference)}</strong><br>${student}</td><td><strong>${esc(row.name)}</strong><br><a href="mailto:${esc(row.email)}">${esc(row.email)}</a><br><small>${esc(row.phone || '')}</small></td><td>${esc(row.interest)}</td><td><strong>${esc(row.utm_source || row.marketing_source || 'Website')}</strong><br><small>${esc(row.utm_medium || '')}</small></td><td>${esc(row.utm_campaign || row.campaign_code || '—')}<br><small>${row.affiliate_code ? `Affiliate: ${esc(row.affiliate_code)}` : ''}</small></td><td><span class="priority-pill ${priorityClass(row.priority)}">${esc(row.priority || 'Normal')}</span></td><td><span class="lifecycle ${esc(row.lifecycle_stage).replace(/\s+/g,'-')}">${esc(row.lifecycle_stage)}</span></td><td><span class="status ${esc(row.status)}">${esc(row.status)}</span></td><td>${action}${esc(row.follow_up_date || '—')}<br><small>${esc(row.contact_preference || 'Any')}</small></td><td><button class="view-button" data-open-id="${row.id}" type="button">Open</button></td></tr>`);
    });
    if (!data.results.length) body.innerHTML = '<tr><td colspan="11">No matching records.</td></tr>';
    $('recordCount').textContent = `${data.total} record${data.total === 1 ? '' : 's'}`;
    const pages = Math.max(Math.ceil(data.total / state.pageSize), 1);
    $('pageInfo').textContent = `Page ${state.page} of ${pages}`;
    $('prevPage').disabled = state.page <= 1;
    $('nextPage').disabled = state.page >= pages;
    setMessage('dashboardMessage', '', true);
  }

  async function loadAll() { await Promise.all([loadStats(), loadRecords()]); }

  function renderTimeline(rows) {
    const host = $('timeline'); host.innerHTML = '';
    if (!rows.length) { host.innerHTML = '<div class="empty-state">No activity has been recorded yet.</div>'; return; }
    rows.forEach(row => host.insertAdjacentHTML('beforeend', `<article class="timeline-item"><strong>${esc(row.activity_type)}</strong><p>${esc(row.description)}</p><time>${esc(row.activity_date)}</time></article>`));
  }

  async function openRecordById(id) {
    try {
      const response = await api(`/api/admin?action=detail&id=${id}`);
      const data = await response.json();
      const row = data.enquiry;
      state.selected = row;
      $('dialogReference').textContent = row.reference;
      $('dialogStudentId').textContent = row.student_id ? `Student ID: ${row.student_id}` : 'Lead / Prospect';
      $('recordDetails').innerHTML = detail('Name',row.name)+detail('Email',row.email)+detail('WhatsApp / Phone',row.phone)+detail('Country',row.country)+detail('Area of interest',row.interest)+detail('Submitted',row.submitted_at_malaysia)+detail('Marketing source',row.utm_source || row.marketing_source || 'Website')+detail('UTM medium',row.utm_medium)+detail('Campaign',row.utm_campaign || row.campaign_code)+detail('Affiliate code',row.affiliate_code)+detail('Landing page',row.landing_page)+detail('Referrer',row.referrer,true)+detail('Message',row.message,true);
      $('editStatus').value = row.status;
      $('editLifecycle').value = row.lifecycle_stage || 'Lead';
      $('editPriority').value = row.priority || 'Normal';
      $('editContactPreference').value = row.contact_preference || 'Any';
      $('editFollowUp').value = row.follow_up_date || '';
      $('editNextAction').value = row.next_action || '';
      $('editTags').value = row.tags || '';
      $('editNotes').value = row.notes || '';
      $('convertStudent').disabled = Boolean(row.student_id);
      $('convertStudent').textContent = row.student_id ? 'Student Created' : 'Convert to Student';
      renderTimeline(data.activities || []);
      $('activityComposer').hidden = true;
      setMessage('dialogMessage','',true);
      if (!$('recordDialog').open) $('recordDialog').showModal();
    } catch(error) { handleError(error); }
  }

  async function saveRecord() {
    if (!state.selected) return;
    try {
      await api(`/api/admin?action=update&id=${state.selected.id}`, { method:'PATCH', body:JSON.stringify({
        status:$('editStatus').value,
        lifecycleStage:$('editLifecycle').value,
        priority:$('editPriority').value,
        contactPreference:$('editContactPreference').value,
        followUpDate:$('editFollowUp').value,
        nextAction:$('editNextAction').value,
        tags:$('editTags').value,
        notes:$('editNotes').value
      }) });
      setMessage('dialogMessage','Record saved.',true);
      await Promise.all([loadAll(), openRecordById(state.selected.id)]);
    } catch(error){ setMessage('dialogMessage',error.message); }
  }

  async function quickFollowUp(days) {
    if (!state.selected) return;
    try {
      const response = await api(`/api/admin?action=quickfollowup&id=${state.selected.id}`, { method:'POST', body:JSON.stringify({ days:Number(days) }) });
      const data = await response.json();
      setMessage('dialogMessage', data.followUpDate ? `Contact logged. Next follow-up: ${data.followUpDate}` : 'Contact logged and follow-up cleared.', true);
      await Promise.all([loadAll(), openRecordById(state.selected.id)]);
    } catch(error){ setMessage('dialogMessage',error.message); }
  }

  async function convertToStudent() {
    if (!state.selected || state.selected.student_id) return;
    if (!confirm(`Convert ${state.selected.name} to a registered student?`)) return;
    try {
      const response = await api(`/api/admin?action=convert&id=${state.selected.id}`, { method:'POST' });
      const data = await response.json();
      setMessage('dialogMessage',`Student created: ${data.studentId}`,true);
      await Promise.all([loadAll(), openRecordById(state.selected.id)]);
    } catch(error){ setMessage('dialogMessage',error.message); }
  }

  async function addActivity() {
    if (!state.selected) return;
    const description = $('activityDescription').value.trim();
    if (!description) { setMessage('dialogMessage','Please enter an activity description.'); return; }
    try {
      await api(`/api/admin?action=activity&id=${state.selected.id}`, { method:'POST', body:JSON.stringify({ type:$('activityType').value, description }) });
      $('activityDescription').value = '';
      $('activityComposer').hidden = true;
      setMessage('dialogMessage','Activity added.',true);
      await Promise.all([loadStats(), openRecordById(state.selected.id)]);
    } catch(error){ setMessage('dialogMessage',error.message); }
  }


  const studentFilters = () => {
    const params = new URLSearchParams({ page: state.studentPage, pageSize: state.studentPageSize });
    [['q','studentFilterQ'],['lifecycle','studentFilterLifecycle'],['programme','studentFilterProgramme']].forEach(([key,id]) => {
      const value = $(id).value.trim(); if (value) params.set(key, value);
    });
    return params;
  };

  function switchModule(module) {
    state.activeModule = module;
    const crmMode = module === 'crm';
    const studentMode = module === 'students';
    const marketingMode = module === 'marketing';
    const commerceMode = module === 'commerce';
    $('crmModule').hidden = !crmMode;
    $('studentsModule').hidden = !studentMode;
    $('marketingModule').hidden = !marketingMode;
    $('commerceModule').hidden = !commerceMode;
    $('crmTab').classList.toggle('active', crmMode);
    $('studentsTab').classList.toggle('active', studentMode);
    $('marketingTab').classList.toggle('active', marketingMode);
    $('commerceTab').classList.toggle('active', commerceMode);
    if (studentMode) loadStudentAll().catch(handleStudentError);
    if (marketingMode) loadMarketingStats().catch(handleMarketingError);
    if (commerceMode) loadCommerceAll().catch(handleCommerceError);
  }

  async function loadMarketingStats() {
    setMessage('marketingDashboardMessage','Loading…',true);
    const response = await api('/api/admin?action=marketingstats');
    const data = await response.json();
    $('marketingStatAttributed').textContent = data.summary.attributed;
    $('marketingStatCampaigns').textContent = data.summary.campaignLeads;
    $('marketingStatAffiliates').textContent = data.summary.affiliateLeads;
    $('marketingStatStudents').textContent = data.summary.convertedStudents;
    renderBars('marketingSourceChart', data.bySource || [], 'source');
    renderBars('marketingCampaignChart', data.byCampaign || [], 'campaign');
    renderBars('marketingAffiliateChart', data.byAffiliate || [], 'affiliate');
    renderBars('marketingLandingChart', data.byLanding || [], 'landing_page');
    const body = $('marketingRecentBody'); body.innerHTML='';
    (data.recent || []).forEach(row => {
      body.insertAdjacentHTML('beforeend', `<tr><td>${esc(row.submitted_date)}</td><td><strong>${esc(row.name)}</strong><br><small>${esc(row.reference)}</small></td><td><strong>${esc(row.utm_source || row.marketing_source || 'Website')}</strong><br><small>${esc(row.utm_medium || '')}</small></td><td>${esc(row.utm_campaign || row.campaign_code || '—')}</td><td>${esc(row.affiliate_code || '—')}</td><td>${esc(row.landing_page || '—')}</td><td>${Number(row.converted) ? 'Yes' : 'No'}</td><td><button class="view-button" data-open-id="${row.id}" type="button">Open</button></td></tr>`);
    });
    if (!(data.recent || []).length) body.innerHTML='<tr><td colspan="8">No attributed enquiries yet. Submit a test landing-page enquiry with UTM parameters.</td></tr>';
    setMessage('marketingDashboardMessage','',true);
  }

  function handleMarketingError(error){
    if(error.status===401){sessionStorage.removeItem('qyAdminToken');showLogin();setMessage('loginMessage','Your session is not authorized. Please log in again.');}
    else setMessage('marketingDashboardMessage',error.message);
  }

  async function loadStudentStats() {
    const response = await api('/api/admin?action=studentstats');
    const data = await response.json();
    $('studentStatTotal').textContent = data.summary.total;
    $('studentStatRegistered').textContent = data.summary.registered;
    $('studentStatActive').textContent = data.summary.active;
    $('studentStatGraduates').textContent = data.summary.graduates;
    $('studentStatAlumni').textContent = data.summary.alumni;
    renderBars('studentProgrammeChart', data.byProgramme || [], 'programme');
    renderBars('studentCountryChart', data.byCountry || [], 'country');
  }

  async function loadStudents() {
    setMessage('studentDashboardMessage','Loading…',true);
    const response = await api(`/api/admin?action=students&${studentFilters()}`);
    const data = await response.json();
    state.studentTotal = data.total;
    const body = $('studentsBody'); body.innerHTML = '';
    data.results.forEach(row => {
      body.insertAdjacentHTML('beforeend', `<tr>
        <td><strong>${esc(row.student_id)}</strong><br><small>${esc(row.reference || '')}</small></td>
        <td><strong>${esc(row.name)}</strong><br><a href="mailto:${esc(row.email)}">${esc(row.email)}</a><br><small>${esc(row.phone || '')}</small></td>
        <td>${esc(row.country || '—')}</td>
        <td>${esc(row.programme || '—')}</td>
        <td><span class="lifecycle ${esc(row.lifecycle_stage).replace(/\s+/g,'-')}">${esc(row.lifecycle_stage)}</span></td>
        <td>${esc(row.enrolled_date || '—')}</td>
        <td>${esc(row.graduated_date || '—')}</td>
        <td><button class="view-button" data-open-student="${row.id}" type="button">Open</button></td>
      </tr>`);
    });
    if (!data.results.length) body.innerHTML = '<tr><td colspan="8">No matching students.</td></tr>';
    $('studentRecordCount').textContent = `${data.total} student${data.total===1?'':'s'}`;
    const pages=Math.max(Math.ceil(data.total/state.studentPageSize),1);
    $('studentPageInfo').textContent=`Page ${state.studentPage} of ${pages}`;
    $('studentPrevPage').disabled=state.studentPage<=1;
    $('studentNextPage').disabled=state.studentPage>=pages;
    setMessage('studentDashboardMessage','',true);
  }

  async function loadStudentAll() {
    await Promise.all([loadStudentStats(), loadStudents()]);
  }

  function renderStudentTimeline(rows) {
    const host=$('studentTimeline'); host.innerHTML='';
    if(!rows.length){host.innerHTML='<div class="empty-state">No student activity has been recorded yet.</div>';return;}
    rows.forEach(row=>host.insertAdjacentHTML('beforeend',`<article class="timeline-item"><strong>${esc(row.activity_type)}</strong><p>${esc(row.description)}</p><time>${esc(row.activity_date)}</time></article>`));
  }

  async function openStudentById(id) {
    try {
      const response=await api(`/api/admin?action=studentdetail&id=${id}`);
      const data=await response.json();
      const row=data.student;
      state.selectedStudent=row;
      $('studentDialogName').textContent=row.name;
      $('studentDialogId').textContent=`Student ID: ${row.student_id}`;
      $('studentDetails').innerHTML =
        detail('Email',row.email)+detail('WhatsApp / Phone',row.phone)+detail('Country',row.country)+
        detail('Original enquiry',row.reference)+detail('Priority',row.priority)+detail('Preferred contact',row.contact_preference)+
        detail('Original area of interest',row.interest)+detail('Last contacted',row.last_contacted_at);
      $('studentEditProgramme').value=row.programme||'';
      $('studentEditLifecycle').value=row.lifecycle_stage||'Registered';
      $('studentEditEnrolled').value=row.enrolled_date||'';
      $('studentEditGraduated').value=row.graduated_date||'';
      $('studentEditNotes').value=row.private_notes||'';
      renderStudentTimeline(data.activities||[]);
      setMessage('studentDialogMessage','',true);
      if(!$('studentDialog').open) $('studentDialog').showModal();
    } catch(error){handleStudentError(error);}
  }

  async function saveStudent() {
    if(!state.selectedStudent) return;
    try {
      await api(`/api/admin?action=studentupdate&id=${state.selectedStudent.id}`,{
        method:'PATCH',
        body:JSON.stringify({
          programme:$('studentEditProgramme').value,
          lifecycleStage:$('studentEditLifecycle').value,
          enrolledDate:$('studentEditEnrolled').value,
          graduatedDate:$('studentEditGraduated').value,
          privateNotes:$('studentEditNotes').value
        })
      });
      setMessage('studentDialogMessage','Student record saved.',true);
      await Promise.all([loadStudentAll(), loadStats(), openStudentById(state.selectedStudent.id)]);
    } catch(error){setMessage('studentDialogMessage',error.message);}
  }


  const money = (value,currency='MYR') => `${currency === 'MYR' ? 'RM' : currency} ${Number(value||0).toFixed(2)}`;
  async function loadCommerceStats(){
    const response=await api('/api/admin?action=commercestats'), data=await response.json();
    $('commerceStatProducts').textContent=data.summary.products; $('commerceStatOrders').textContent=data.summary.orders; $('commerceStatPaid').textContent=data.summary.paid; $('commerceStatPending').textContent=data.summary.pending;
    renderBars('commerceChannelChart',data.byChannel||[],'label'); renderBars('commerceProviderChart',data.byProvider||[],'label'); renderBars('commerceStatusChart',data.byStatus||[],'label'); renderBars('commerceMethodChart',data.byMethod||[],'label');
  }
  async function loadCommerceProducts(){
    const response=await api('/api/admin?action=commerceproducts'), data=await response.json(); state.products=data.results||[];
    const body=$('commerceProductsBody'); body.innerHTML='';
    state.products.forEach(r=>body.insertAdjacentHTML('beforeend',`<tr><td><strong>${esc(r.sku)}</strong></td><td><strong>${esc(r.name_en)}</strong><br><small>${esc(r.name_zh||'')}</small><br><small>/${esc(r.slug)}</small></td><td>${esc(r.product_type)}</td><td class="money">${r.early_bird_active?`<strong>${money(r.effective_price,r.currency)}</strong><br><small>Early bird</small>`:money(r.price,r.currency)}</td><td>${esc(r.sales_channel)}</td><td>${esc(r.payment_provider)}</td><td>${esc(r.status)}</td><td><button type="button" class="view-button" data-edit-product="${r.id}">Edit</button> ${r.status==='Active'?`<a class="view-button button-link" href="/product/${encodeURIComponent(r.slug)}" target="_blank">View</a>`:''}</td></tr>`));
    if(!state.products.length) body.innerHTML='<tr><td colspan="8">No products yet. Create your first product.</td></tr>';
    const select=$('orderProduct'); select.innerHTML='<option value="">Select product</option>'+state.products.filter(p=>p.status==='Active').map(p=>`<option value="${p.id}">${esc(p.sku)} — ${esc(p.name_en)} (${money(p.price,p.currency)})</option>`).join('');
  }
  async function loadCommerceOrders(){
    setMessage('commerceDashboardMessage','Loading…',true); const response=await api('/api/admin?action=commerceorders'), data=await response.json(); const body=$('commerceOrdersBody'); body.innerHTML='';
    state.orders=data.results||[];
    state.orders.forEach(r=>body.insertAdjacentHTML('beforeend',`<tr><td><strong>${esc(r.order_reference)}</strong><br><small>${esc(String(r.created_at||'').slice(0,16).replace('T',' '))}</small></td><td><strong>${esc(r.customer_name)}</strong><br><small>${esc(r.customer_email)}</small></td><td>${esc(r.product_name||'—')}<br><small>${r.quantity||1} × ${esc(r.sku||'')}</small></td><td>${esc(r.sales_channel)}</td><td>${esc(r.payment_provider)}<br><span class="payment-pill ${esc(r.payment_status)}">${esc(r.payment_status)}</span>${r.verification_status?`<br><small>${esc(r.verification_status)}</small>`:''}</td><td class="money">${Number(r.discount_amount||0)>0?`<small>List ${money(r.list_unit_price,r.currency)}</small><br><small>Discount −${money(r.discount_amount,r.currency)} (${esc(r.pricing_rule||'Discount')})</small><br><strong>${money(r.total,r.currency)}</strong>`:`<strong>${money(r.total,r.currency)}</strong>`}</td><td>${esc(r.campaign_code||'—')}<br><small>${r.affiliate_code?`Affiliate: ${esc(r.affiliate_code)}`:''}</small></td><td><button type="button" class="view-button" data-record-payment="${r.id}">Record Payment</button></td></tr>`));
    if(!state.orders.length) body.innerHTML='<tr><td colspan="8">No orders yet.</td></tr>'; $('commerceOrderCount').textContent=`${state.orders.length} order${state.orders.length===1?'':'s'}`;
    const paymentOrder=$('paymentOrder'); if(paymentOrder) paymentOrder.innerHTML='<option value="">Select order</option>'+state.orders.map(o=>`<option value="${o.id}" data-total="${Number(o.total||0)}" data-currency="${esc(o.currency||'MYR')}">${esc(o.order_reference)} — ${esc(o.customer_name)} — ${money(o.total,o.currency)}</option>`).join('');
    setMessage('commerceDashboardMessage','',true);
  }
  async function loadCommercePayments(){
    const response=await api('/api/admin?action=commercepayments'), data=await response.json(); const body=$('commercePaymentsBody'); body.innerHTML='';
    state.payments=data.results||[];
    state.payments.forEach(r=>body.insertAdjacentHTML('beforeend',`<tr><td><strong>${esc(r.order_reference)}</strong><br><small>${esc(r.settlement_date||String(r.paid_at||'').slice(0,10)||'')}</small></td><td><strong>${esc(r.customer_name)}</strong><br><small>${esc(r.product_name||r.sku||'—')}</small></td><td>${esc(r.payment_method||r.provider)}<br><small>${esc(r.provider||'')}</small></td><td class="money">${money(r.gross_amount,r.currency)}</td><td class="money">${r.settlement_status==='Reconciled'||r.settlement_status==='Settled'?money(r.provider_fee,r.currency):'<span class="muted">Pending</span>'}</td><td class="money">${r.settlement_status==='Reconciled'||r.settlement_status==='Settled'?money(r.net_amount,r.currency):'<span class="muted">Pending</span>'}</td><td class="money">${r.settlement_status==='Reconciled'||r.settlement_status==='Settled'?money(r.bank_received_amount,r.currency):'<span class="muted">Pending</span>'}</td><td><strong>${esc(r.verification_status||'Unverified')}</strong><br><small>Accounting: ${Number(r.accounting_eligible)===1?'Eligible':'Not yet eligible'}</small><br><small>Customer email: ${esc(r.customer_email_status||'—')} · QY email: ${esc(r.internal_email_status||'—')}</small><br><small>Receipt: ${esc(r.customer_receipt_issuer||'—')}</small></td></tr>`));
    if(!(data.results||[]).length) body.innerHTML='<tr><td colspan="8">No payment records yet.</td></tr>';
  }

  async function loadCommerceAll(){await Promise.all([loadCommerceStats(),loadCommerceProducts(),loadCommerceOrders()]);}
  function slugify(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);}
  function openProduct(row=null){delete $('productSlug').dataset.manual; $('productId').value=row?.id||''; $('productDialogTitle').textContent=row?'Edit Product':'New Product'; $('productSku').value=row?.sku||''; $('productSlug').value=row?.slug||''; $('productType').value=row?.product_type||'course'; $('productStatus').value=row?.status||'Draft'; $('productPrice').value=row?.price??''; $('productCurrency').value=row?.currency||'MYR'; $('productChannel').value=row?.sales_channel||'Website'; $('productProvider').value=row?.payment_provider||'SenangPay'; $('productNameEn').value=row?.name_en||''; $('productNameZh').value=row?.name_zh||''; $('productDescriptionEn').value=row?.description_en||''; $('productDescriptionZh').value=row?.description_zh||''; $('productStartsOn').value=row?.starts_on||''; $('productEndsOn').value=row?.ends_on||''; $('productTimeEn').value=row?.time_en||''; $('productTimeZh').value=row?.time_zh||''; $('productDeliveryEn').value=row?.delivery_en||''; $('productDeliveryZh').value=row?.delivery_zh||''; $('productInstructor').value=row?.instructor||''; $('productHeroImage').value=row?.hero_image_url||''; $('productEarlyBirdPrice').value=row?.early_bird_price??''; $('productEarlyBirdEnd').value=row?.early_bird_end||''; $('productExternalUrl').value=row?.external_purchase_url||''; setMessage('productDialogMessage','',true); $('productDialog').showModal();}
  async function saveProduct(){try{const id=$('productId').value, response=await api(`/api/admin?action=productsave${id?`&id=${id}`:''}`,{method:id?'PATCH':'POST',body:JSON.stringify({sku:$('productSku').value,slug:$('productSlug').value||slugify($('productNameEn').value),productType:$('productType').value,status:$('productStatus').value,price:$('productPrice').value,currency:$('productCurrency').value,salesChannel:$('productChannel').value,paymentProvider:$('productProvider').value,nameEn:$('productNameEn').value,nameZh:$('productNameZh').value,descriptionEn:$('productDescriptionEn').value,descriptionZh:$('productDescriptionZh').value,startsOn:$('productStartsOn').value,endsOn:$('productEndsOn').value,timeEn:$('productTimeEn').value,timeZh:$('productTimeZh').value,deliveryEn:$('productDeliveryEn').value,deliveryZh:$('productDeliveryZh').value,instructor:$('productInstructor').value,heroImageUrl:$('productHeroImage').value,earlyBirdPrice:$('productEarlyBirdPrice').value,earlyBirdEnd:$('productEarlyBirdEnd').value,externalPurchaseUrl:$('productExternalUrl').value})}); const data=await response.json(); setMessage('productDialogMessage',`Product saved. Public page: /product/${data.slug||$('productSlug').value}`,true); $('productSlug').value=data.slug||$('productSlug').value; await loadCommerceAll();}catch(e){setMessage('productDialogMessage',e.message);}}
  function openOrder(){if(!state.products.length){setMessage('commerceDashboardMessage','Create an active product first.');return;} $('orderCustomerName').value='';$('orderCustomerEmail').value='';$('orderCustomerPhone').value='';$('orderQuantity').value='1';$('orderCampaign').value='';$('orderAffiliate').value='';setMessage('orderDialogMessage','',true);$('orderDialog').showModal();}
  async function saveOrder(){try{const response=await api('/api/admin?action=ordercreate',{method:'POST',body:JSON.stringify({customerName:$('orderCustomerName').value,customerEmail:$('orderCustomerEmail').value,customerPhone:$('orderCustomerPhone').value,productId:Number($('orderProduct').value),quantity:Number($('orderQuantity').value),salesChannel:$('orderChannel').value,paymentProvider:$('orderProvider').value,paymentStatus:$('orderPaymentStatus').value,campaignCode:$('orderCampaign').value,affiliateCode:$('orderAffiliate').value})});const data=await response.json();setMessage('orderDialogMessage',`Order ${data.orderReference} created — ${money(data.total,data.currency)}${data.discount>0?` (discount ${money(data.discount,data.currency)} · ${data.pricingRule})`:''}.`,true);await loadCommerceAll();}catch(e){setMessage('orderDialogMessage',e.message);}}
  function recalcPayment(){
    // v3.3.15f: Gross Sale is verified now.
    // Provider fee / net / bank receipt are reconciled later from settlement reports.
    $('paymentFee').value='';
    $('paymentNet').value='';
    $('paymentBank').value='';
  }
  function openPayment(orderId=''){
    const oid=Number(orderId||0);
    $('paymentOrder').value=String(orderId||'');
    const existing=state.payments.find(p=>Number(p.order_id)===oid) || null;
    state.selectedPaymentId=Number(existing?.id||0);

    $('paymentMethod').value=existing?.payment_method||existing?.provider||'DOKU';
    $('paymentProviderName').value=existing?.provider||$('paymentMethod').value||'DOKU';
    $('paymentTransactionRef').value=existing?.provider_transaction_id||'';
    $('paymentRecordStatus').value=existing?.status||'Paid';
    $('paymentVerification').value=existing?.verification_status==='Verified'?'Verified':'Unverified';
    $('paymentFee').value='';
    $('paymentSettlementDate').value=existing?.settlement_date||String(existing?.paid_at||new Date().toISOString()).slice(0,10);
    $('paymentReceiptIssuer').value=existing?.customer_receipt_issuer||'Quantum YiJing';
    $('paymentNotes').value=existing?.notes||'';

    const option=$('paymentOrder').selectedOptions[0];
    const orderTotal=Number(option?.dataset.total||0);
    const gross=Number(existing?.gross_amount||existing?.amount||orderTotal||0);
    $('paymentGross').value=gross.toFixed(2);
    $('paymentFee').value='';
    $('paymentNet').value='';
    $('paymentBank').value='';

    const isDoku=String(existing?.provider||existing?.payment_method||$('paymentMethod').value||'').toUpperCase()==='DOKU';
    const needsOverride=!!existing && isDoku && Number(existing.gateway_hash_verified||0)!==1 && existing.verification_status!=='Verified';
    $('manualVerificationOverrideBox').style.display=needsOverride?'block':'none';
    $('manualVerificationOverride').checked=false;

    setMessage(
      'paymentDialogMessage',
      existing
        ? `Editing payment #${existing.id}. ${existing.verification_status==='Verified'?'Already verified.':(needsOverride?'Gateway notification is not hash verified. Independently check the payment and use the manual verification override if appropriate.':'Confirm the Gross Sale and payment evidence, then set Verification to Verified. Saving will issue both QY receipt emails.')}`
        : 'New payment record.',
      true
    );
    $('paymentDialog').showModal();
  }
  function applyPaymentMethodDefaults(){
    const method=$('paymentMethod').value;
    if(method==='Google Play Books'){ $('paymentProviderName').value='Google Play Books'; $('paymentRecordStatus').value='External'; $('paymentReceiptIssuer').value='External Platform'; $('paymentVerification').value='Reconciled'; }
    else if(method==='Bank Transfer'){ $('paymentProviderName').value='Bank Transfer'; $('paymentRecordStatus').value='Paid'; $('paymentReceiptIssuer').value='Quantum YiJing'; $('paymentVerification').value='Unverified'; }
    else if(method==='DOKU'){ $('paymentProviderName').value='DOKU'; $('paymentRecordStatus').value='Paid'; $('paymentReceiptIssuer').value='Quantum YiJing'; $('paymentVerification').value='Unverified'; }
    else if(method==='Marketplace'){ $('paymentProviderName').value='Marketplace'; $('paymentRecordStatus').value='External'; $('paymentReceiptIssuer').value='External Platform'; }
  }
  async function savePayment(){
    try{
      const requestedVerification=$('paymentVerification').value;
      const orderId=Number($('paymentOrder').value);
      const selectedPayment=state.payments.find(p=>Number(p.id)===Number(state.selectedPaymentId||0)) || null;
      const isDoku=String(selectedPayment?.provider||selectedPayment?.payment_method||$('paymentMethod').value||'').toUpperCase()==='DOKU';
      const gatewayHashVerified=Number(selectedPayment?.gateway_hash_verified||0)===1;
      const manualOverride=$('manualVerificationOverride')?.checked===true;

      if(requestedVerification==='Verified' && isDoku && !gatewayHashVerified && !manualOverride){
        throw new Error('Gateway notification is not hash verified. Independently verify the payment and tick the manual verification override checkbox before continuing.');
      }

      const response=await api('/api/admin?action=paymentsave',{
        method:'POST',
        body:JSON.stringify({
          paymentId:Number(state.selectedPaymentId||0),
          orderId,
          paymentMethod:$('paymentMethod').value,
          provider:$('paymentProviderName').value,
          transactionReference:$('paymentTransactionRef').value,
          status:$('paymentRecordStatus').value,
          verificationStatus:requestedVerification,
          grossAmount:$('paymentGross').value,
          providerFee:'',
          settlementDate:$('paymentSettlementDate').value,
          customerReceiptIssuer:$('paymentReceiptIssuer').value,
          notes:$('paymentNotes').value,
          currency:'MYR',
          settlementStatus:'Pending'
        })
      });

      const data=await response.json();

      if(data.shouldVerify){
        setMessage('paymentDialogMessage','Payment saved. Verifying and issuing QY receipts…',true);

        const order=state.orders.find(o=>Number(o.id)===orderId);
        const isGeneric=!order?.product_name && !order?.sku;
        const endpoint=isGeneric
          ? '/api/admin/generic-payment-verify'
          : '/api/admin/payment-verify';

        const verifyResponse=await api(endpoint,{
          method:'POST',
          body:JSON.stringify({
            order_id:orderId,
            manual_override:manualOverride,
            manual_override_note:manualOverride
              ? 'QY Admin independently verified the payment against DOKU / bank / payment evidence.'
              : ''
          })
        });
        const verified=await verifyResponse.json();

        setMessage(
          'paymentDialogMessage',
          `Payment verified. Customer receipt and QY accounting receipt processed${verified.receipt_date?` · Receipt date ${verified.receipt_date}`:''}.`,
          true
        );
      }else{
        setMessage(
          'paymentDialogMessage',
          'Payment record saved. Settlement values remain pending reconciliation from the provider report.',
          true
        );
      }

      // Synchronize every Sales & Commerce view from the same database state.
      await loadCommerceAll();

    }catch(e){
      setMessage('paymentDialogMessage',e.message);
    }
  }
  function handleCommerceError(error){if(error.status===401){sessionStorage.removeItem('qyAdminToken');showLogin();setMessage('loginMessage','Your session is not authorized. Please log in again.');}else setMessage('commerceDashboardMessage',error.message);}

  function handleStudentError(error){
    if(error.status===401){sessionStorage.removeItem('qyAdminToken');showLogin();setMessage('loginMessage','Your session is not authorized. Please log in again.');}
    else setMessage('studentDashboardMessage',error.message);
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); state.token = $('adminToken').value.trim();
    if (!state.token) return;
    try {
      await api('/api/admin?action=stats');
      sessionStorage.setItem('qyAdminToken', state.token);
      showDashboard();
      const launchUrl=new URL(window.location.href);
      if(launchUrl.searchParams.get('module')==='commerce') await openCommercePaymentFromUrl();
      else await loadAll();
    }
    catch (error) { setMessage('loginMessage', error.status === 401 ? 'Incorrect administrator token.' : error.message); }
  });
  $('logoutButton').addEventListener('click', () => { sessionStorage.removeItem('qyAdminToken'); state.token=''; $('adminToken').value=''; showLogin(); });
  $('crmTab').addEventListener('click', () => switchModule('crm'));
  $('studentsTab').addEventListener('click', () => switchModule('students'));
  $('marketingTab').addEventListener('click', () => switchModule('marketing'));
  $('commerceTab').addEventListener('click', () => switchModule('commerce'));
  $('commerceRefreshButton').addEventListener('click', () => loadCommerceAll().catch(handleCommerceError));
  $('newProductButton').addEventListener('click', () => openProduct());
  $('newOrderButton').addEventListener('click', openOrder);
  $('newPaymentButton').addEventListener('click',()=>openPayment());
  $('paymentDialogClose').addEventListener('click',()=>$('paymentDialog').close()); $('paymentClose').addEventListener('click',()=>$('paymentDialog').close()); $('paymentSave').addEventListener('click',savePayment);
  $('paymentMethod').addEventListener('change',applyPaymentMethodDefaults); $('paymentGross').addEventListener('input',recalcPayment); $('paymentOrder').addEventListener('change',()=>{const o=$('paymentOrder').selectedOptions[0]; const t=Number(o?.dataset.total||0); $('paymentGross').value=t.toFixed(2); recalcPayment();});
  $('productDialogClose').addEventListener('click',()=>$('productDialog').close()); $('productClose').addEventListener('click',()=>$('productDialog').close()); $('productSave').addEventListener('click',saveProduct);
  $('productNameEn').addEventListener('input',()=>{if(!$('productId').value && !$('productSlug').dataset.manual){$('productSlug').value=slugify($('productNameEn').value);}}); $('productSlug').addEventListener('input',()=>{$('productSlug').dataset.manual='1';});
  $('orderDialogClose').addEventListener('click',()=>$('orderDialog').close()); $('orderClose').addEventListener('click',()=>$('orderDialog').close()); $('orderSave').addEventListener('click',saveOrder);
  $('marketingRefreshButton').addEventListener('click', () => loadMarketingStats().catch(handleMarketingError));
  $('studentFilterForm').addEventListener('submit', async e => { e.preventDefault(); state.studentPage=1; await loadStudents().catch(handleStudentError); });
  $('studentClearFilters').addEventListener('click', async () => { $('studentFilterForm').reset(); state.studentPage=1; await loadStudents().catch(handleStudentError); });
  $('studentRefreshButton').addEventListener('click', () => loadStudentAll().catch(handleStudentError));
  $('studentPrevPage').addEventListener('click', async () => { if(state.studentPage>1){state.studentPage--;await loadStudents().catch(handleStudentError);} });
  $('studentNextPage').addEventListener('click', async () => { if(state.studentPage*state.studentPageSize<state.studentTotal){state.studentPage++;await loadStudents().catch(handleStudentError);} });
  $('studentDialogClose').addEventListener('click', () => $('studentDialog').close());
  $('studentClose').addEventListener('click', () => $('studentDialog').close());
  $('studentSave').addEventListener('click', saveStudent);
  $('studentExportButton').addEventListener('click', async () => {
    try {
      const response=await api(`/api/admin?action=studentexport&${studentFilters()}`);
      const blob=await response.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a');
      a.href=url; a.download=`quantum-yijing-students-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch(error){handleStudentError(error);}
  });
  $('filterForm').addEventListener('submit', async e => { e.preventDefault(); state.page=1; await loadRecords().catch(handleError); });
  $('clearFilters').addEventListener('click', async () => { $('filterForm').reset(); state.page=1; await loadRecords().catch(handleError); });
  $('refreshButton').addEventListener('click', () => loadAll().catch(handleError));
  $('prevPage').addEventListener('click', async () => { if(state.page>1){state.page--;await loadRecords().catch(handleError);} });
  $('nextPage').addEventListener('click', async () => { if(state.page*state.pageSize<state.total){state.page++;await loadRecords().catch(handleError);} });
  document.addEventListener('click', e => {
    const openButton=e.target.closest('[data-open-id]'); if(openButton) openRecordById(Number(openButton.dataset.openId));
    const followButton=e.target.closest('[data-follow-days]'); if(followButton) quickFollowUp(Number(followButton.dataset.followDays));
    const studentButton=e.target.closest('[data-open-student]'); if(studentButton) openStudentById(Number(studentButton.dataset.openStudent));
    const productButton=e.target.closest('[data-edit-product]'); if(productButton){const row=state.products.find(p=>Number(p.id)===Number(productButton.dataset.editProduct)); if(row) openProduct(row);}
    const paymentButton=e.target.closest('[data-record-payment]'); if(paymentButton) openPayment(paymentButton.dataset.recordPayment);
  });
  $('dialogClose').addEventListener('click', () => $('recordDialog').close());
  $('cancelRecord').addEventListener('click', () => $('recordDialog').close());
  $('saveRecord').addEventListener('click', saveRecord);
  $('convertStudent').addEventListener('click', convertToStudent);
  $('addActivityButton').addEventListener('click', () => { $('activityComposer').hidden = false; $('activityDescription').focus(); });
  $('cancelActivity').addEventListener('click', () => { $('activityComposer').hidden = true; $('activityDescription').value=''; });
  $('saveActivity').addEventListener('click', addActivity);
  $('exportButton').addEventListener('click', async () => {
    try {
      const response = await api(`/api/admin?action=export&${filters()}`);
      const blob = await response.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a');
      a.href=url; a.download=`quantum-yijing-crm-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch(error){ handleError(error); }
  });

  function handleError(error){
    if(error.status===401){sessionStorage.removeItem('qyAdminToken');showLogin();setMessage('loginMessage','Your session is not authorized. Please log in again.');}
    else setMessage('dashboardMessage',error.message);
  }

  async function openCommercePaymentFromUrl(){
    const url=new URL(window.location.href);
    if(url.searchParams.get('module')!=='commerce') return;
    switchModule('commerce');
    await loadCommerceAll();
    const orderRef=(url.searchParams.get('order')||'').trim();
    if(!orderRef) return;
    const order=state.orders.find(o=>String(o.order_reference||'')===orderRef);
    if(!order){
      setMessage('commerceDashboardMessage',`Order ${orderRef} was not found.`);
      return;
    }
    openPayment(order.id);
  }

  if (state.token) {
    showDashboard();
    const launchUrl=new URL(window.location.href);
    if(launchUrl.searchParams.get('module')==='commerce') openCommercePaymentFromUrl().catch(handleCommerceError);
    else loadAll().catch(handleError);
  } else showLogin();
})();
