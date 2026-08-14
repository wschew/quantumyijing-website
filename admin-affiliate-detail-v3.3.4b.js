(()=>{const $=s=>document.querySelector(s),token=()=>$('#token')?.value.trim()||'';let id=0;
$('#affiliateSelect')?.addEventListener('change',()=>id=Number($('#affiliateSelect').value||0));
$('#load')?.addEventListener('click',()=>id=Number($('#affiliateSelect')?.value||0));
async function act(p){if(!id){alert('Load an affiliate first.');return}const r=await fetch('/api/admin/affiliate-control',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({affiliate_id:id,...p})}),d=await r.json().catch(()=>({}));$('#accountControlMsg').textContent=r.ok?'Updated successfully.':(d.error||r.status);if(r.ok)$('#load')?.click()}
$('#saveAffiliateStatus')?.addEventListener('click',()=>act({action:'set_status',status:$('#accountStatus').value,reason:$('#accountReason').value}));
$('#disablePortal')?.addEventListener('click',()=>act({action:'disable_portal',reason:$('#accountReason').value}));
$('#enablePortal')?.addEventListener('click',()=>act({action:'enable_portal',reason:$('#accountReason').value}));
$('#revokeSessions')?.addEventListener('click',()=>act({action:'revoke_sessions',reason:$('#accountReason').value}));
})();