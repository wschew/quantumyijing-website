(() => {
  const VERSION='v3.4.1d';
  const $=(s,r=document)=>r.querySelector(s);

  function findToken(){
    return $('input[type="password"]')?.value?.trim()||'';
  }
  async function api(url,opt={}){
    const token=findToken();
    const headers={...(opt.headers||{}),'content-type':'application/json'};
    if(token)headers.authorization=`Bearer ${token}`;
    const r=await fetch(url,{...opt,headers});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
    return d;
  }
  function buttonByText(txt){
    return [...document.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()===txt.toLowerCase());
  }
  function labelInput(labelText){
    const labels=[...document.querySelectorAll('label')];
    const lab=labels.find(l=>l.textContent.trim().toLowerCase().startsWith(labelText.toLowerCase()));
    return lab?.querySelector('input,select,textarea')||null;
  }
  function currentSku(){return (labelInput('SKU')?.value||'').trim()}
  function currentCategory(){return (labelInput('Category')?.value||labelInput('Product type')?.value||'').trim().toLowerCase()}
  function status(msg,bad=false){
    const el=$('#regReqStatus'); if(!el)return;
    el.textContent=msg; el.style.color=bad?'#b42318':'#16743a';
  }

  async function resolveProduct(){
    const sku=currentSku();
    if(!sku)return null;
    const d=await api('/api/admin?action=commerceproducts');
    return (d.results||[]).find(x=>String(x.sku||'').trim().toLowerCase()===sku.toLowerCase())||null;
  }

  async function loadSettings(){
    if(currentCategory()!=='course'){
      status('Registration Requirements apply to course products only.');
      return;
    }
    try{
      const p=await resolveProduct();
      if(!p){status('Save the course product first, then its registration requirements will be attached automatically.');return;}
      const d=await api(`/api/admin/product-registration-settings?product_id=${encodeURIComponent(p.id)}`);
      const s=d.settings||{};
      $('#rrGender').checked=Number(s.gender_required||0)===1;
      $('#rrMeal').checked=Number(s.meal_preference_required||0)===1;
      $('#rrAccommodation').checked=Number(s.accommodation_included||0)===1;
      $('#rrNotes').checked=Number(s.accommodation_notes_enabled||0)===1;
      $('#rrCheckin').value=s.registration_time||'';
      $('#rrCheckout').value=s.checkout_time||'';
      status(`Registration settings loaded for ${p.sku}.`);
    }catch(e){status(e.message,true)}
  }

  async function saveSettings(){
    if(currentCategory()!=='course')return;
    const p=await resolveProduct();
    if(!p){status('Product saved, but registration settings could not yet resolve the product ID. Click Save Registration Requirements once.',true);return;}
    await api('/api/admin/product-registration-settings',{
      method:'POST',
      body:JSON.stringify({
        productId:p.id,
        genderRequired:$('#rrGender').checked,
        mealPreferenceRequired:$('#rrMeal').checked,
        accommodationIncluded:$('#rrAccommodation').checked,
        accommodationNotesEnabled:$('#rrNotes').checked,
        registrationTime:$('#rrCheckin').value,
        checkoutTime:$('#rrCheckout').value
      })
    });
    status(`Registration requirements saved for ${p.sku}.`);
  }

  function inject(){
    if($('#registrationRequirementsCard'))return;
    const saveProduct=buttonByText('Save Product');
    if(!saveProduct)return;

    const card=document.createElement('section');
    card.id='registrationRequirementsCard';
    card.style.cssText='margin:22px 0 18px;padding:22px;border:1px solid #d5e2f0;border-radius:18px;background:#f8fbff;';
    card.innerHTML=`
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <h2 style="margin:0 0 8px;color:#0b67c6;font-size:26px">Registration Requirements</h2>
          <p style="margin:0;color:#667a95;line-height:1.55">Reusable course-specific registration fields. These do not alter pricing, payment or coach commission.</p>
        </div>
        <strong style="color:#0b67c6">${VERSION}</strong>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:20px">
        <label style="display:flex;align-items:center;gap:10px;font-weight:700"><input id="rrGender" type="checkbox" style="width:20px;height:20px"> Ask Gender (Male / Female) · required</label>
        <label style="display:flex;align-items:center;gap:10px;font-weight:700"><input id="rrMeal" type="checkbox" style="width:20px;height:20px"> Ask Meal Preference (Normal / Vegan) · required</label>
        <label style="display:flex;align-items:center;gap:10px;font-weight:700"><input id="rrAccommodation" type="checkbox" style="width:20px;height:20px"> Accommodation Included</label>
        <label style="display:flex;align-items:center;gap:10px;font-weight:700"><input id="rrNotes" type="checkbox" style="width:20px;height:20px"> Ask Accommodation / Dietary Notes</label>
        <label style="font-weight:700">Registration / Check-in Time<input id="rrCheckin" type="time" style="display:block;width:100%;margin-top:8px;padding:12px;border:1px solid #cbd9ea;border-radius:10px"></label>
        <label style="font-weight:700">Course End / Check-out Time<input id="rrCheckout" type="time" style="display:block;width:100%;margin-top:8px;padding:12px;border:1px solid #cbd9ea;border-radius:10px"></label>
      </div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:18px">
        <button id="rrSave" type="button" style="border:0;border-radius:12px;padding:13px 18px;background:#0b67c6;color:white;font-weight:800;cursor:pointer">Save Registration Requirements</button>
        <span id="regReqStatus" style="font-weight:700"></span>
      </div>
    `;
    saveProduct.parentElement.insertBefore(card,saveProduct);
    $('#rrSave').addEventListener('click',()=>saveSettings().catch(e=>status(e.message,true)));

    const sku=labelInput('SKU');
    const category=labelInput('Category')||labelInput('Product type');
    sku?.addEventListener('change',loadSettings);
    category?.addEventListener('change',loadSettings);

    // After the existing Product Master has saved a new/edited product, attach settings.
    saveProduct.addEventListener('click',()=>{
      if(currentCategory()!=='course')return;
      status('Waiting for Product Master to save the course…');
      setTimeout(()=>saveSettings().catch(e=>status(e.message,true)),1200);
      setTimeout(()=>saveSettings().catch(()=>{}),2500);
    });

    loadSettings();
  }

  const timer=setInterval(()=>{
    inject();
    if($('#registrationRequirementsCard'))clearInterval(timer);
  },250);
  setTimeout(()=>clearInterval(timer),10000);
})();
