
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function commissionText(p){
  if(String(p.commission_type)==='fixed'){
    return `${p.currency||'MYR'} ${Number(p.commission_value||0).toFixed(2)} per eligible sale`;
  }
  return `${Number(p.commission_value||0).toFixed(2)}%`;
}

async function getJson(url){
  const r=await fetch(url,{cache:'no-store'});
  if(r.status===401){
    location.href='/affiliate-login.html';
    throw new Error('Not authenticated');
  }
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}

async function enhanceEligibleLinks(){
  try{
    const l=await getJson('/api/affiliate/portal/links');
    const general=$('#generalLink');
    if(general) general.value=l.general_url||'';

    const box=$('#productLinks');
    if(!box) return;

    if(!Array.isArray(l.products) || !l.products.length){
      box.innerHTML=`
        <div class="product-link affiliate-offer">
          <b>No affiliate-eligible products are currently available.</b>
          <small>Please check again later.</small>
        </div>`;
      return;
    }

    box.innerHTML=l.products.map((p,i)=>`
      <div class="product-link affiliate-offer">
        <div class="offer-top">
          <div>
            <b>${esc(p.name_en)}</b>
            ${p.name_zh ? `<small>${esc(p.name_zh)}</small>` : ''}
          </div>
          <span class="offer-category">${esc(p.product_type)}</span>
        </div>

        <div class="offer-meta">
          <span><strong>SKU:</strong> ${esc(p.sku)}</span>
          <span><strong>Price:</strong> ${esc(p.currency||'MYR')} ${Number(p.price||0).toFixed(2)}</span>
          <span><strong>Commission:</strong> ${esc(commissionText(p))}</span>
        </div>

        <small class="commission-source">${esc(p.commission_source||'')}</small>

        <div class="link-row">
          <input id="affProductLink${i}" value="${esc(p.url)}" readonly>
          <button class="copy-product" data-target="affProductLink${i}">Copy Link</button>
        </div>
      </div>
    `).join('');

  }catch(e){
    console.error('affiliate product links',e);
  }
}

document.addEventListener('click',e=>{
  const b=e.target.closest('.copy-product');
  if(!b) return;
  const inp=document.getElementById(b.dataset.target);
  if(inp) navigator.clipboard?.writeText(inp.value);
});

document.addEventListener('DOMContentLoaded',enhanceEligibleLinks);
