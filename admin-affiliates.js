const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function token(){return $('#token').value.trim();}
async function load(){
  const t=token();
  if(!t){$('#status').textContent='Enter the Admin Token.';return;}
  const f=$('#filter').value;
  const r=await fetch('/api/admin/affiliates'+(f?`?status=${encodeURIComponent(f)}`:''),{headers:{authorization:`Bearer ${t}`}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){$('#status').textContent=d.error||'Unable to load.';return;}
  $('#status').textContent=`${d.results.length} affiliate record(s).`;
  $('#rows').innerHTML=d.results.map(a=>`
    <tr>
      <td>${a.id}</td>
      <td>${esc(a.affiliate_code)}</td>
      <td><b>${esc(a.full_name)}</b><div class="muted">${esc(a.display_name)}</div></td>
      <td>${esc(a.email)}</td><td>${esc(a.phone)}</td><td>${esc(a.country)}</td><td>${esc(a.account_type)}</td>
      <td>${esc(a.bank_name)}<div class="muted">${esc(a.bank_account_name)} • ${esc(a.bank_account_number)}</div></td>
      <td>${esc(a.status)}</td><td>${esc(a.membership_expires_at||'')}</td>
      <td><div class="actions">
        ${a.status==='Pending'?`<button class="approve" data-id="${a.id}" data-action="approve">Approve</button><button class="reject" data-id="${a.id}" data-action="reject">Reject</button>`:''}
        ${a.status==='Approved'?`<button class="suspend" data-id="${a.id}" data-action="suspend">Suspend</button>`:''}
      </div></td>
    </tr>`).join('');
}
async function act(id,action){
  if(!confirm(`${action} affiliate #${id}?`)) return;
  const r=await fetch('/api/admin/affiliates',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({id:Number(id),action})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){alert(d.error||'Action failed');return;}
  if(d.affiliate_code) alert(`Approved. Affiliate Code: ${d.affiliate_code}`);
  await load();
}
$('#load').addEventListener('click',load);
$('#rows').addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(b)act(b.dataset.id,b.dataset.action)});
