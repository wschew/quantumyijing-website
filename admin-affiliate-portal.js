const $=s=>document.querySelector(s);

const token=()=>$('#token').value.trim();

function setStatus(message,type=''){
  const s=$('#status');
  s.className=`status${type?` ${type}`:''}`;
  s.textContent=message||'';
}

async function loadWaiting(){
  const select=$('#affiliateId');
  const send=$('#send');

  if(!token()){
    setStatus('Enter the Admin Token first.','error');
    return;
  }

  setStatus('Loading affiliates waiting for activation…');
  select.disabled=true;
  send.disabled=true;
  select.innerHTML='<option value="">Loading…</option>';

  try{
    const r=await fetch('/api/admin/affiliate-portal-activation',{
      method:'GET',
      headers:{authorization:`Bearer ${token()}`}
    });

    const d=await r.json().catch(()=>({}));

    if(!r.ok){
      select.innerHTML='<option value="">Unable to load affiliates</option>';
      setStatus(d.error||`Request failed (${r.status}).`,'error');
      return;
    }

    const rows=Array.isArray(d.affiliates)?d.affiliates:[];

    if(!rows.length){
      select.innerHTML='<option value="">No affiliates waiting for portal activation</option>';
      setStatus('No approved affiliates are currently waiting for portal activation.','success');
      return;
    }

    select.innerHTML='<option value="">Select affiliate…</option>'+
      rows.map(a=>{
        const label=[
          a.full_name||'Affiliate',
          a.affiliate_code||'',
          a.email||''
        ].filter(Boolean).join(' — ');
        return `<option value="${Number(a.id)}">${escapeHtml(label)}</option>`;
      }).join('');

    select.disabled=false;
    setStatus(`${rows.length} affiliate${rows.length===1?'':'s'} waiting for activation.`);
  }catch(e){
    select.innerHTML='<option value="">Unable to load affiliates</option>';
    setStatus('Unable to load affiliates.','error');
  }
}

function escapeHtml(v){
  return String(v??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

$('#load').addEventListener('click',loadWaiting);

$('#affiliateId').addEventListener('change',()=>{
  $('#send').disabled=!$('#affiliateId').value;
  if($('#affiliateId').value) setStatus('');
});

$('#send').addEventListener('click',async()=>{
  const id=Number($('#affiliateId').value);
  if(!id){
    setStatus('Please select an affiliate.','error');
    return;
  }

  const s=$('#status');
  $('#send').disabled=true;
  setStatus('Sending activation email…');

  try{
    const r=await fetch('/api/admin/affiliate-portal-activation',{
      method:'POST',
      headers:{
        authorization:`Bearer ${token()}`,
        'content-type':'application/json'
      },
      body:JSON.stringify({affiliate_id:id})
    });

    const d=await r.json().catch(()=>({}));

    if(!r.ok){
      setStatus(d.error||`Request failed (${r.status}).`,'error');
      $('#send').disabled=false;
      return;
    }

    setStatus('Activation email sent. The affiliate will remain in this list until the portal is activated.','success');
    $('#send').disabled=false;
  }catch(e){
    setStatus('Unable to send activation email.','error');
    $('#send').disabled=false;
  }
});
