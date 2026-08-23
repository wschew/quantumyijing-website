
(()=>{
  const form=document.querySelector('form');
  if(!form)return;

  const nat=document.querySelector('#affiliateNationality');
  const type=document.querySelector('#affiliateIdentificationType');
  const idno=document.querySelector('#affiliateIdentificationNumber');
  const agree=document.querySelector('#affiliateTermsAccepted');

  const detectLang=()=>{
    const h=(document.documentElement.getAttribute('lang')||'').toLowerCase();
    if(h.startsWith('zh')) return 'zh';

    const saved=(localStorage.getItem('lang')||localStorage.getItem('language')||'').toLowerCase();
    if(saved.startsWith('zh')||saved.includes('中文')) return 'zh';

    const active=[...document.querySelectorAll('button,a,[role="button"]')].find(el=>{
      const t=(el.textContent||'').trim();
      const activeState=el.classList.contains('active')||el.getAttribute('aria-pressed')==='true';
      return activeState && (t==='中文'||t==='EN');
    });
    if(active && (active.textContent||'').trim()==='中文') return 'zh';
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

  // Follow the existing page EN / 中文 controls without changing their original logic.
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,[role="button"]');
    if(!el)return;
    const t=(el.textContent||'').trim();
    if(t==='中文') setTimeout(()=>applyLang('zh'),0);
    if(t==='EN') setTimeout(()=>applyLang('en'),0);
  });

  // Also follow pages that change <html lang="...">.
  new MutationObserver(()=>applyLang(detectLang()))
    .observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

  nat?.addEventListener('change',()=>{
    if(/malaysia/i.test(nat.value)) type.value='NRIC / MyKad';
  });

  form.addEventListener('submit',async e=>{
    if(!nat||!type||!idno||!agree)return;
    const lang=detectLang();
    if(!agree.checked){
      e.preventDefault();
      alert(lang==='zh'
        ? '请先阅读并同意联盟计划条款与条件。'
        : 'Please read and accept the Affiliate Program Terms & Conditions.');
      return;
    }
    if(/malaysia/i.test(nat.value) && type.value!=='NRIC / MyKad'){
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
          nationality:nat.value,
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
