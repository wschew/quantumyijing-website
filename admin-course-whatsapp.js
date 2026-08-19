const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let recipients=[];

function token(){return $('#token').value.trim()}
async function api(url,opts={}){
  const r=await fetch(url,{
    ...opts,
    headers:{...(opts.headers||{}),authorization:`Bearer ${token()}`},
    cache:'no-store'
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
function status(text,error=false){
  $('#status').textContent=text;
  $('#status').className=error?'error':'success';
}
function render(){
  $('#rows').innerHTML=recipients.map(x=>{
    const st=String(x.invite_status||'Pending');
    const cls=st.toLowerCase();
    return `<tr>
      <td><input class="pick" type="checkbox" data-id="${x.order_id}" ${st==='Sent'?'':'checked'}></td>
      <td>${esc(x.customer_name)}</td>
      <td>${esc(x.customer_email)}</td>
      <td>${esc(x.order_reference)}</td>
      <td>${esc(x.currency)} ${Number(x.total||0).toFixed(2)}</td>
      <td>${esc(x.paid_at||'')}</td>
      <td><span class="badge ${cls}">${esc(st)}</span>${x.invite_error?`<div style="font-size:11px;color:#a32323">${esc(x.invite_error)}</div>`:''}</td>
      <td>${esc(x.invite_sent_at||'')}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="8">No paid registrants found for this course.</td></tr>';
}
async function loadCourses(){
  try{
    const d=await api('/api/admin/course-whatsapp-courses');
    $('#course').innerHTML='<option value="">Select course…</option>'+
      (d.courses||[]).map(c=>`<option value="${c.id}">${esc(c.sku)} — ${esc(c.name_en)} (${c.paid_count||0} paid)</option>`).join('');
    status('Courses loaded.');
  }catch(e){status(e.message,true)}
}
async function loadRecipients(){
  const productId=Number($('#course').value||0);
  if(!productId){status('Please select a course.',true);return}
  try{
    const d=await api(`/api/admin/course-whatsapp-recipients?product_id=${productId}`);
    recipients=d.recipients||[];
    $('#paidCount').textContent=d.summary.paid;
    $('#sentCount').textContent=d.summary.sent;
    $('#pendingCount').textContent=d.summary.pending;
    render();
    status(`Loaded ${d.summary.paid} paid registrant(s).`);
  }catch(e){status(e.message,true)}
}
function selectedIds(){
  return [...document.querySelectorAll('.pick:checked')].map(x=>Number(x.dataset.id)).filter(Boolean);
}
$('#token').addEventListener('change',loadCourses);
$('#load').onclick=loadRecipients;
$('#selectPending').onclick=()=>{
  document.querySelectorAll('.pick').forEach(cb=>{
    const r=recipients.find(x=>Number(x.order_id)===Number(cb.dataset.id));
    cb.checked=r && r.invite_status!=='Sent';
  });
};
$('#clearSelection').onclick=()=>document.querySelectorAll('.pick').forEach(x=>x.checked=false);
$('#selectAll').onchange=e=>document.querySelectorAll('.pick').forEach(x=>x.checked=e.target.checked);
$('#send').onclick=async()=>{
  const productId=Number($('#course').value||0);
  const groupUrl=$('#groupUrl').value.trim();
  const orderIds=selectedIds();
  if(!productId){status('Please select a course.',true);return}
  if(!groupUrl){status('Please enter the WhatsApp group invite URL.',true);return}
  if(!orderIds.length){status('Please select at least one paid registrant.',true);return}
  const courseText=$('#course').selectedOptions[0]?.textContent||'selected course';
  if(!confirm(`Send WhatsApp invitation to ${orderIds.length} selected registrant(s) for ${courseText}?`)) return;

  $('#send').disabled=true;
  try{
    const d=await api('/api/admin/course-whatsapp-send',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        product_id:productId,
        whatsapp_group_url:groupUrl,
        order_ids:orderIds,
        resend:$('#allowResend').checked
      })
    });
    status(`Completed: ${d.sent} sent, ${d.skipped} skipped, ${d.failed} failed.`);
    await loadRecipients();
  }catch(e){status(e.message,true)}
  finally{$('#send').disabled=false}
};
