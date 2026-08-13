const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>$('#token').value.trim();
const monthLabel=m=>{const [y,mo]=m.split('-');return new Date(+y,+mo-1,1).toLocaleDateString('en-MY',{month:'short',year:'2-digit'})};

function lineChart(el,data,series){
 const W=900,H=300,p={l:55,r:20,t:20,b:45};
 const max=Math.max(1,...data.flatMap(d=>series.map(s=>Number(d[s.key]||0))));
 const x=i=>p.l+i*(W-p.l-p.r)/Math.max(1,data.length-1);
 const y=v=>H-p.b-(Number(v)/max)*(H-p.t-p.b);
 let svg=`<svg class="svgchart" viewBox="0 0 ${W} ${H}" role="img">`;
 for(let i=0;i<=4;i++){const v=max*i/4,yy=y(v);svg+=`<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" stroke="#e5eaf0"/><text x="${p.l-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="#667085">${Math.round(v)}</text>`}
 data.forEach((d,i)=>{if(i%2===0||data.length<=8)svg+=`<text x="${x(i)}" y="${H-15}" text-anchor="middle" font-size="11" fill="#667085">${monthLabel(d.month)}</text>`});
 const colors=['#0b56a5','#16a085','#7c3aed','#d97706'];
 series.forEach((s,si)=>{const pts=data.map((d,i)=>`${x(i)},${y(d[s.key])}`).join(' ');svg+=`<polyline fill="none" stroke="${colors[si]}" stroke-width="3" points="${pts}"/>`;data.forEach((d,i)=>svg+=`<circle cx="${x(i)}" cy="${y(d[s.key])}" r="3.5" fill="${colors[si]}"><title>${s.label}: ${d[s.key]}</title></circle>`)});
 svg+='</svg><div class="legend">'+series.map((s,i)=>`<span style="color:${colors[i]}">${s.label}</span>`).join('')+'</div>';
 el.innerHTML=svg;
}
function barChart(el,data,key,label,currency=false,topN=false){
 const rows=[...data];const W=700,H=Math.max(260,rows.length*34+50),p={l:topN?190:110,r:30,t:15,b:25};
 const max=Math.max(1,...rows.map(d=>Number(d[key]||0)));
 const inner=W-p.l-p.r;
 let svg=`<svg class="svgchart" viewBox="0 0 ${W} ${H}">`;
 rows.forEach((d,i)=>{const yy=p.t+i*34,w=Number(d[key]||0)/max*inner,name=d.full_name||d.country||'';svg+=`<text x="${p.l-8}" y="${yy+17}" text-anchor="end" font-size="12" fill="#344054">${esc(name)}</text><rect x="${p.l}" y="${yy+4}" width="${w}" height="18" rx="5" fill="#0b56a5"><title>${esc(name)}: ${currency?'RM ':''}${Number(d[key]||0).toFixed(currency?2:0)}</title></rect><text x="${p.l+w+7}" y="${yy+18}" font-size="11" fill="#667085">${currency?'RM ':''}${Number(d[key]||0).toFixed(currency?2:0)}</text>`});
 svg+='</svg>';el.innerHTML=svg;
}
async function dashboard(){
 if(!token()){alert('Enter Admin Token');return}
 const m=$('#month').value||new Date().toISOString().slice(0,7);
 const r=await fetch(`/api/admin/affiliate-analytics?month=${m}`,{headers:{authorization:`Bearer ${token()}`}});
 const d=await r.json().catch(()=>({}));if(!r.ok){alert(d.error||r.status);return}
 const k=d.kpis;
 $('#kpis').innerHTML=[
 ['Unique Visitors',k.visitors],['Applications',k.applications],['Approved',k.approved],['Active',k.active],
 ['Affiliate Sales',`RM ${Number(k.sales||0).toFixed(2)}`],['Commission',`RM ${Number(k.commission||0).toFixed(2)}`]
 ].map(x=>`<div class="kpi"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
 $('#kpis').classList.remove('hidden');
 lineChart($('#funnelChart'),d.trend,[{key:'visitors',label:'Unique visitors'},{key:'applications',label:'Applications'},{key:'approved',label:'Approved'},{key:'active',label:'Active'}]);
 lineChart($('#salesChart'),d.trend,[{key:'sales',label:'Affiliate sales (RM)'}]);
 barChart($('#countryChart'),d.country_sales,'sales','Sales',true,false);
 barChart($('#topChart'),d.top_affiliates,'sales','Sales',true,true);
 ['#funnelPanel','#salesPanel','#countryPanel','#topPanel'].forEach(s=>$(s).classList.remove('hidden'));
}
async function loadAffiliates(){
 if(!token()){alert('Enter Admin Token');return}
 const f=$('#filter').value;
 const r=await fetch('/api/admin/affiliates'+(f?`?status=${encodeURIComponent(f)}`:''),{headers:{authorization:`Bearer ${token()}`}});
 const d=await r.json().catch(()=>({}));if(!r.ok){$('#status').textContent=d.error||r.status;return}
 $('#status').textContent=`${d.results.length} affiliate record(s).`;
 $('#rows').innerHTML=d.results.map(a=>`<tr><td>${a.id}</td><td>${esc(a.affiliate_code)}</td><td>${esc(a.full_name)}</td><td>${esc(a.email)}</td><td>${esc(a.country)}</td><td>${esc(a.bank_name)} • ${esc(a.bank_account_number)}</td><td>${esc(a.status)}</td><td>${esc(a.membership_expires_at||'')}</td><td class="actions">${a.status==='Pending'?`<button class="approve" data-id="${a.id}" data-action="approve">Approve</button><button class="reject" data-id="${a.id}" data-action="reject">Reject</button>`:''}</td></tr>`).join('');
}
async function act(id,action){const r=await fetch('/api/admin/affiliates',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'application/json'},body:JSON.stringify({id:+id,action})});const d=await r.json();if(!r.ok){alert(d.error||r.status);return}if(d.affiliate_code)alert(`Approved: ${d.affiliate_code}`);loadAffiliates()}
$('#month').value=new Date().toISOString().slice(0,7);
$('#loadDashboard').onclick=dashboard;$('#loadAffiliates').onclick=loadAffiliates;
$('#rows').onclick=e=>{const b=e.target.closest('button[data-action]');if(b)act(b.dataset.id,b.dataset.action)};
