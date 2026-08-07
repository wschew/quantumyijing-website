(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { token: sessionStorage.getItem('qyAdminToken') || '', page: 1, pageSize: 25, total: 0, selected: null };
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
    [['q','filterQ'],['status','filterStatus'],['lifecycle','filterLifecycle'],['interest','filterInterest'],['from','filterFrom'],['to','filterTo']].forEach(([key,id]) => {
      const value = $(id).value.trim(); if (value) params.set(key, value);
    });
    return params;
  };
  const setMessage = (id, text, ok = false) => { const el = $(id); el.textContent = text; el.style.color = ok ? '#217a3d' : '#b42318'; };
  const showDashboard = () => { $('loginPanel').hidden = true; $('dashboard').hidden = false; };
  const showLogin = () => { $('dashboard').hidden = true; $('loginPanel').hidden = false; };
  const detail = (label, value, full = false) => `<div class="detail${full?' full':''}"><span>${esc(label)}</span><p>${esc(value || '—')}</p></div>`;

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
    if (!tasks.length) { host.innerHTML = '<div class="empty-state">No follow-ups due. Your task list is clear.</div>'; return; }
    tasks.forEach(row => {
      const overdue = row.is_overdue ? ' overdue' : '';
      host.insertAdjacentHTML('beforeend', `<div class="task-item${overdue}"><span class="task-dot"></span><div><strong>${esc(row.name)}</strong><span>${esc(row.follow_up_date)} · ${esc(row.interest)}${row.student_id ? ` · ${esc(row.student_id)}` : ''}</span></div><button type="button" data-open-id="${row.id}">Open</button></div>`);
    });
  }

  async function loadStats() {
    const response = await api('/api/admin?action=stats');
    const data = await response.json();
    $('statTotal').textContent = data.summary.total;
    $('statDue').textContent = data.summary.followUpsDue;
    $('statNew').textContent = data.summary.newCount;
    $('statInterested').textContent = data.summary.interested;
    $('statStudents').textContent = data.summary.students;
    $('statAlumni').textContent = data.summary.alumni;
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
      body.insertAdjacentHTML('beforeend', `<tr data-id="${row.id}"><td>${esc(row.submitted_date)}<br><small>${esc(row.submitted_at_malaysia)}</small></td><td><strong>${esc(row.reference)}</strong><br>${student}</td><td><strong>${esc(row.name)}</strong><br><a href="mailto:${esc(row.email)}">${esc(row.email)}</a><br><small>${esc(row.phone || '')}</small></td><td>${esc(row.interest)}</td><td><span class="lifecycle ${esc(row.lifecycle_stage).replace(/\s+/g,'-')}">${esc(row.lifecycle_stage)}</span></td><td><span class="status ${esc(row.status)}">${esc(row.status)}</span></td><td>${esc(row.follow_up_date || '—')}</td><td><button class="view-button" data-open-id="${row.id}" type="button">Open</button></td></tr>`);
    });
    if (!data.results.length) body.innerHTML = '<tr><td colspan="8">No matching records.</td></tr>';
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
      $('recordDetails').innerHTML = detail('Name',row.name)+detail('Email',row.email)+detail('WhatsApp / Phone',row.phone)+detail('Country',row.country)+detail('Area of interest',row.interest)+detail('Submitted',row.submitted_at_malaysia)+detail('Message',row.message,true);
      $('editStatus').value = row.status;
      $('editLifecycle').value = row.lifecycle_stage || 'Lead';
      $('editFollowUp').value = row.follow_up_date || '';
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
        followUpDate:$('editFollowUp').value,
        notes:$('editNotes').value
      }) });
      setMessage('dialogMessage','Record saved.',true);
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
      await openRecordById(state.selected.id);
    } catch(error){ setMessage('dialogMessage',error.message); }
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); state.token = $('adminToken').value.trim();
    if (!state.token) return;
    try { await api('/api/admin?action=stats'); sessionStorage.setItem('qyAdminToken', state.token); showDashboard(); await loadAll(); }
    catch (error) { setMessage('loginMessage', error.status === 401 ? 'Incorrect administrator token.' : error.message); }
  });
  $('logoutButton').addEventListener('click', () => { sessionStorage.removeItem('qyAdminToken'); state.token=''; $('adminToken').value=''; showLogin(); });
  $('filterForm').addEventListener('submit', async e => { e.preventDefault(); state.page=1; await loadRecords().catch(handleError); });
  $('clearFilters').addEventListener('click', async () => { $('filterForm').reset(); state.page=1; await loadRecords().catch(handleError); });
  $('refreshButton').addEventListener('click', () => loadAll().catch(handleError));
  $('prevPage').addEventListener('click', async () => { if(state.page>1){state.page--;await loadRecords().catch(handleError);} });
  $('nextPage').addEventListener('click', async () => { if(state.page*state.pageSize<state.total){state.page++;await loadRecords().catch(handleError);} });
  document.addEventListener('click', e => { const button=e.target.closest('[data-open-id]'); if(button) openRecordById(Number(button.dataset.openId)); });
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
      a.href=url; a.download=`quantum-yijing-aos-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch(error){ handleError(error); }
  });

  function handleError(error){
    if(error.status===401){sessionStorage.removeItem('qyAdminToken');showLogin();setMessage('loginMessage','Your session is not authorized. Please log in again.');}
    else setMessage('dashboardMessage',error.message);
  }

  if (state.token) { showDashboard(); loadAll().catch(handleError); } else showLogin();
})();
