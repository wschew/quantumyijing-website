(()=>{
  const form=document.querySelector('#affiliateForm');
  if(!form)return;

  const country=document.querySelector('#affiliateCountry') || form.querySelector('[name="country"]');
  const type=document.querySelector('#affiliateIdentificationType');
  const idno=document.querySelector('#affiliateIdentificationNumber');
  const agree=document.querySelector('#affiliateTermsAccepted') || form.querySelector('[name="terms_accepted"]');

  const detectLang=()=>{
    const h=(document.documentElement.getAttribute('lang')||'').toLowerCase();
    if(h.startsWith('zh')) return 'zh';

    const saved=(localStorage.getItem('lang')||localStorage.getItem('language')||'').toLowerCase();
    if(saved.startsWith('zh')||saved.includes('中文')) return 'zh';

    const candidates=[...document.querySelectorAll('button,a,[role="button"]')];
    const zhActive=candidates.find(el=>{
      const t=(el.textContent||'').trim();
      return t==='中文' && (el.classList.contains('active') || el.getAttribute('aria-pressed')==='true');
    });
    if(zhActive) return 'zh';
    return 'en';
  };

  const applyLang=(lang)=>{
    document.querySelectorAll('[data-qy-lang]').forEach(el=>{
      el.hidden=el.getAttribute('data-qy-lang')!==lang;
    });
    document.querySelectorAll('[data-qy-option-en]').forEach(opt=>{
      opt.textContent=lang==='zh'
        ? (opt.getAttribute('data-qy-option-zh')||opt.getAttribute('data-qy-option-en'))
        : opt.getAttribute('data-qy-option-en');
    });
  };

  applyLang(detectLang());

  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,[role="button"]');
    if(!el)return;
    const t=(el.textContent||'').trim();
    if(t==='中文') setTimeout(()=>applyLang('zh'),0);
    if(t==='EN') setTimeout(()=>applyLang('en'),0);
  });

  new MutationObserver(()=>applyLang(detectLang()))
    .observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

  country?.addEventListener('change',()=>{
    if(type && /malaysia/i.test(country.value)) type.value='NRIC / MyKad';
  });
  country?.addEventListener('blur',()=>{
    if(type && /malaysia/i.test(country.value)) type.value='NRIC / MyKad';
  });

  form.addEventListener('submit',async e=>{
    if(!country||!type||!idno||!agree)return;
    const lang=detectLang();

    if(!agree.checked){
      e.preventDefault();
      alert(lang==='zh'
        ? '请先阅读并同意联盟计划条款与条件。'
        : 'Please read and accept the Affiliate Programme Terms & Conditions.');
      return;
    }

    if(/malaysia/i.test(country.value) && type.value!=='NRIC / MyKad'){
      e.preventDefault();
      alert(lang==='zh'
        ? '马来西亚联盟会员必须选择 NRIC / MyKad。'
        : 'Malaysian affiliates must select NRIC / MyKad.');
      return;
    }

    const email=(form.querySelector('[name="email"]')?.value||'').trim();
    if(!email)return;

    try{
      await fetch('/api/affiliate/compliance',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          email,
          nationality:country.value,
          country:country.value,
          identification_type:type.value,
          identification_number:idno.value,
          terms_version:'QY-AFF-2026-08-V1',
          terms_accepted:true
        }),
        keepalive:true
      });
    }catch(err){
      console.error('affiliate compliance save',err);
    }
  },{capture:true});
})();