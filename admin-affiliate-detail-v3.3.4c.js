
(()=> {
  const $=s=>document.querySelector(s);
  const token=()=>$('#token')?.value.trim()||'';
  let currentAffiliateId=0;
  const selectedId=()=>Number($('#affiliateSelect')?.value||0);

  async function getControl(){
    currentAffiliateId=selectedId();
    if(!currentAffiliateId) return;
    const r=await fetch(`/api/admin/affiliate-control?affiliate_id=${currentAffiliateId}`,{
      headers:{authorization:`Bearer ${token()}`},cache:'no-store'
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok){ $('#accountControlMsg').textContent=d.error||`HTTP ${r.status}`; return; }
    const a=d.affiliate||{};
    $('#accountStatus').value=a.status||'Pending';
    $('#portalEnabled').value=Number(a.portal_enabled)===1?'1':'0';
    $('#accountReason').value=a.admin_status_reason||'';
    $('#accountUpdatedAt').textContent=a.admin_status_updated_at||'—';
    $('#accountUpdatedBy').textContent=a.admin_status_updated_by||'—';
    const badge=$('#testAccountBadge');
    if(badge){
      badge.textContent=Number(a.is_test_account)===1?'INTERNAL QA / TEST ACCOUNT':'';
      badge.style.display=Number(a.is_test_account)===1?'inline-flex':'none';
    }
    $('#accountControlPanel').classList.remove('hidden');
  }

  async function post(action,extra={}){
    currentAffiliateId=selectedId()||currentAffiliateId;
    if(!currentAffiliateId){ alert('Load an affiliate first.'); return; }
    const r=await fetch('/api/admin/affiliate-control',{
      method:'POST',
      headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},
      body:JSON.stringify({affiliate_id:currentAffiliateId,action,...extra})
    });
    const d=await r.json().catch(()=>({}));
    const msg=$('#accountControlMsg');
    if(!r.ok){ msg.textContent=d.error||`HTTP ${r.status}`; return; }

    if(action==='save_status'){
      if(d.email_notification?.sent) msg.textContent='Updated successfully. Affiliate notification email sent.';
      else if(d.previous_status!==d.status && d.email_notification?.skipped)
        msg.textContent='Updated successfully. Email notification skipped because email service is not configured.';
      else if(d.previous_status!==d.status && d.email_notification?.sent===false)
        msg.textContent='Status updated successfully, but notification email could not be sent.';
      else msg.textContent='Updated successfully. Status unchanged, so no status email was sent.';
    }else msg.textContent='Updated successfully.';

    await getControl();
    $('#load')?.click();
  }

  $('#load')?.addEventListener('click',()=>setTimeout(getControl,200));
  $('#affiliateSelect')?.addEventListener('change',()=>$('#accountControlPanel')?.classList.add('hidden'));
  $('#saveAccountControl')?.addEventListener('click',()=>post('save_status',{
    status:$('#accountStatus').value,
    portal_enabled:$('#portalEnabled').value==='1',
    reason:$('#accountReason').value.trim()
  }));
  $('#revokeSessions')?.addEventListener('click',()=>post('revoke_sessions'));

  async function loadComplianceAndAttributions(){
    const id=selectedId();
    if(!id)return;
    try{
      const r=await fetch(`/api/admin/affiliate-attribution-compliance?affiliate_id=${id}`,{
        headers:{authorization:`Bearer ${token()}`},cache:'no-store'
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok)return;

      const tbody=$('#attrs');
      if(tbody){
        const rows=d.attributions||[];
        tbody.innerHTML=rows.length?rows.map(x=>`<tr>
          <td>${String(x.customer_name||'—')}</td>
          <td>${String(x.customer_email||'—')}</td>
          <td>${String(x.first_order_reference||'—')}</td>
          <td>${String(x.started_at||'—').slice(0,10)}</td>
          <td>${String(x.expires_at||'—').slice(0,10)}</td>
          <td>${String(x.status||'—')}</td>
        </tr>`).join(''):'<tr><td colspan="6">No customer attribution recorded yet.</td></tr>';
        $('#attrPanel')?.classList.remove('hidden');
      }

      if(d.compliance){
        let box=$('#affiliateComplianceSummary');
        if(!box){
          box=document.createElement('section');
          box.id='affiliateComplianceSummary';
          box.className='panel';
          const profile=$('#profile');
          if(profile?.parentNode) profile.parentNode.insertBefore(box,profile.nextSibling);
        }
        box.innerHTML=`<h2>Affiliate Compliance</h2>
          <p><strong>Nationality:</strong> ${d.compliance.nationality||'—'}<br>
          <strong>Identification:</strong> ${d.compliance.identification_masked||'—'}<br>
          <strong>Terms:</strong> ${d.compliance.terms_version||'—'}<br>
          <strong>Accepted:</strong> ${String(d.compliance.terms_accepted_at||'—').replace('T',' ').slice(0,19)}</p>`;
      }
    }catch(e){console.error('affiliate attribution/compliance load',e)}
  }

  $('#load')?.addEventListener('click',()=>setTimeout(loadComplianceAndAttributions,350));

})();
