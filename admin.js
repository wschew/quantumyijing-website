(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { token: sessionStorage.getItem('qyAdminToken') || '', page: 1, pageSize: 25, total: 0, selected: null };
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
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const filters = () => {
    const params = new URLSearchParams({ page: state.page, pageSize: state.pageSize });
    [['q','filterQ'],['status','filterStatus'],['interest','filterInterest'],['from','filterFrom'],['to','filterTo']].forEach(([key,id]) => {
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
    if (!rows.length) { host.innerHTML = '<p>No data yet.</p>'; return; }
    rows.forEach(row => {
      const label = row[labelKey] || 'Not specified', count = Number(row[valueKey] || 0);
      host.insertAdjacentHTML('beforeend', `<div class="bar-row"><span title="${esc(label)}">${esc(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(5,(count/max)*100)}%"></div></div><strong>${count}</strong></div>`);
    });
  }

  async function loadStats() {
    const response = await api('/api/admin/stats');
    const data = await response.json();
    $('statTotal').textContent = data.summary.total;
    $('statToday').textContent = data.summary.today;
    $('statMonth').textContent = data.summary.thisMonth;
    $('statNew').textContent = data.summary.newCount;
    $('statFollowUp').textContent = data.summary.followUp;
    $('statConverted').textContent = data.summary.converted;
    renderBars('interestChart', data.byInterest, 'interest');
    renderBars('countryChart', data.byCountry, 'country');
    renderBars('monthlyChart', data.monthly, 'month');
  }

  async function loadRecords() {
    setMessage('dashboardMessage', 'Loading…', true);
    const response = await api(`/api/admin/enquiries?${filters()}`);
    const data = await response.json();
    state.total = data.total;
    const body = $('recordsBody'); body.innerHTML = '';
    data.results.forEach(row => {
      const encoded = encodeURIComponent(JSON.stringify(row));
      body.insertAdjacentHTML('beforeend', `<tr><td>${esc(row.submitted_date)}<br><small>${esc(row.submitted_at_malaysia)}</small></td><td><strong>${esc(row.reference)}</strong></td><td><strong>${esc(row.name)}</strong><br><a href="mailto:${esc(row.email)}">${esc(row.email)}</a><br><small>${esc(row.phone || '')}</small></td><td>${esc(row.country || '—')}</td><td>${esc(row.interest)}</td><td><span class="status ${esc(row.status)}">${esc(row.status)}</span></td><td>${esc(row.follow_up_date || '—')}</td><td><button class="view-button" data-row="${encoded}" type="button">View</button></td></tr>`);
    });
    if (!data.results.length) body.innerHTML = '<tr><td colspan="8">No matching enquiries.</td></tr>';
    $('recordCount').textContent = `${data.total} record${data.total === 1 ? '' : 's'}`;
    const pages = Math.max(Math.ceil(data.total / state.pageSize), 1);
    $('pageInfo').textContent = `Page ${state.page} of ${pages}`;
    $('prevPage').disabled = state.page <= 1;
    $('nextPage').disabled = state.page >= pages;
    setMessage('dashboardMessage', '', true);
  }

  async function loadAll() { await Promise.all([loadStats(), loadRecords()]); }

  function openRecord(row) {
    state.selected = row;
    $('dialogReference').textContent = row.reference;
    $('recordDetails').innerHTML = detail('Name',row.name)+detail('Email',row.email)+detail('WhatsApp / Phone',row.phone)+detail('Country',row.country)+detail('Area of interest',row.interest)+detail('Submitted',row.submitted_at_malaysia)+detail('Message',row.message,true);
    $('editStatus').value = row.status;
    $('editFollowUp').value = row.follow_up_date || '';
    $('editNotes').value = row.notes || '';
    setMessage('dialogMessage','',true);
    $('recordDialog').showModal();
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); state.token = $('adminToken').value.trim();
    if (!state.token) return;
    try { await api('/api/admin/stats'); sessionStorage.setItem('qyAdminToken', state.token); showDashboard(); await loadAll(); }
    catch (error) { setMessage('loginMessage', error.status === 401 ? 'Incorrect administrator token.' : error.message); }
  });
  $('logoutButton').addEventListener('click', () => { sessionStorage.removeItem('qyAdminToken'); state.token=''; $('adminToken').value=''; showLogin(); });
  $('filterForm').addEventListener('submit', async e => { e.preventDefault(); state.page=1; await loadRecords().catch(handleError); });
  $('clearFilters').addEventListener('click', async () => { $('filterForm').reset(); state.page=1; await loadRecords().catch(handleError); });
  $('refreshButton').addEventListener('click', () => loadAll().catch(handleError));
  $('prevPage').addEventListener('click', async () => { if(state.page>1){state.page--;await loadRecords().catch(handleError);} });
  $('nextPage').addEventListener('click', async () => { if(state.page*state.pageSize<state.total){state.page++;await loadRecords().catch(handleError);} });
  $('recordsBody').addEventListener('click', e => { const button=e.target.closest('[data-row]'); if(button) openRecord(JSON.parse(decodeURIComponent(button.dataset.row))); });
  $('dialogClose').addEventListener('click', () => $('recordDialog').close());
  $('cancelRecord').addEventListener('click', () => $('recordDialog').close());
  $('saveRecord').addEventListener('click', async () => {
    if (!state.selected) return;
    try {
      await api(`/api/admin/enquiries/${state.selected.id}`, { method:'PATCH', body:JSON.stringify({ status:$('editStatus').value, followUpDate:$('editFollowUp').value, notes:$('editNotes').value }) });
      setMessage('dialogMessage','Record saved.',true); await loadAll(); setTimeout(()=>$('recordDialog').close(),500);
    } catch(error){ setMessage('dialogMessage',error.message); }
  });
  $('exportButton').addEventListener('click', async () => {
    try {
      const response = await api(`/api/admin/export?${filters()}`);
      const blob = await response.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a');
      a.href=url; a.download=`quantum-yijing-crm-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch(error){ handleError(error); }
  });
  function handleError(error){ if(error.status===401){sessionStorage.removeItem('qyAdminToken');showLogin();setMessage('loginMessage','Your session is not authorized. Please log in again.');} else setMessage('dashboardMessage',error.message); }

  if (state.token) { showDashboard(); loadAll().catch(handleError); } else showLogin();
})();
