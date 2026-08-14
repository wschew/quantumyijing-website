
(()=> {
  const $=s=>document.querySelector(s);
  const token=()=>$('#token')?.value.trim()||'';
  let currentAffiliateId=0;

  function selectedId(){
    return Number($('#affiliateSelect')?.value||0);
  }

  async function getControl(){
    currentAffiliateId=selectedId();
    if(!currentAffiliateId) return;

    const r=await fetch(`/api/admin/affiliate-control?affiliate_id=${currentAffiliateId}`,{
      headers:{authorization:`Bearer ${token()}`},
      cache:'no-store'
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      $('#accountControlMsg').textContent=d.error||`HTTP ${r.status}`;
      return;
    }

    const a=d.affiliate||{};
    $('#accountStatus').value=a.status||'Pending';
    $('#portalEnabled').value=Number(a.portal_enabled)===1?'1':'0';
    $('#accountReason').value=a.admin_status_reason||'';
    $('#accountUpdatedAt').textContent=a.admin_status_updated_at||'—';
    $('#accountUpdatedBy').textContent=a.admin_status_updated_by||'—';
    $('#accountControlPanel').classList.remove('hidden');
  }

  async function post(action, extra={}){
    currentAffiliateId=selectedId()||currentAffiliateId;
    if(!currentAffiliateId){
      alert('Load an affiliate first.');
      return;
    }

    const r=await fetch('/api/admin/affiliate-control',{
      method:'POST',
      headers:{
        authorization:`Bearer ${token()}`,
        'content-type':'application/json'
      },
      body:JSON.stringify({
        affiliate_id:currentAffiliateId,
        action,
        ...extra
      })
    });

    const d=await r.json().catch(()=>({}));
    $('#accountControlMsg').textContent=r.ok?'Updated successfully.':(d.error||`HTTP ${r.status}`);

    if(r.ok){
      await getControl();
      $('#load')?.click();
    }
  }

  $('#load')?.addEventListener('click',()=>setTimeout(getControl,200));
  $('#affiliateSelect')?.addEventListener('change',()=> {
    $('#accountControlPanel')?.classList.add('hidden');
  });

  $('#saveAccountControl')?.addEventListener('click',()=>post('save_status',{
    status:$('#accountStatus').value,
    portal_enabled:$('#portalEnabled').value==='1',
    reason:$('#accountReason').value.trim()
  }));

  $('#revokeSessions')?.addEventListener('click',()=>post('revoke_sessions'));
})();
