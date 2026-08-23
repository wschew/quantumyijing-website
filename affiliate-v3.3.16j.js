
(()=>{
  const form=document.querySelector('form');
  const nat=document.querySelector('#affiliateNationality');
  const type=document.querySelector('#affiliateIdentificationType');
  const idno=document.querySelector('#affiliateIdentificationNumber');
  const agree=document.querySelector('#affiliateTermsAccepted');

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

    const enActive=candidates.find(el=>{
      const t=(el.textContent||'').trim();
      return t==='EN' && (el.classList.contains('active') || el.getAttribute('aria-pressed')==='true');
    });
    if(enActive) return 'en';

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

  const removeAccidentalDuplicateTerms=()=>{
    // On the Affiliate Application page the T&C already lives inside #affiliateComplianceFields.
    // If the separate "full terms" snippet was accidentally appended to affiliate.html,
    // remove it so the T&C is shown exactly once.
    if(document.querySelector('#affiliateComplianceFields')){
      document.querySelectorAll('.qy-aff-full-terms').forEach(el=>el.remove());
    }

    // Guard against accidentally duplicated bilingual full-terms sections.
    const full=[...document.querySelectorAll('.qy-aff-full-terms')];
    full.slice(1).forEach(el=>el.remove());
  };

  removeAccidentalDuplicateTerms();
  applyLang(detectLang());

  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,[role="button"]');
    if(!el)return;
    const t=(el.textContent||'').trim();
    if(t==='中文') setTimeout(()=>applyLang('zh'),0);
    if(t==='EN') setTimeout(()=>applyLang('en'),0);
  });

  new MutationObserver(()=>{
    removeAccidentalDuplicateTerms();
    applyLang(detectLang());
  }).observe(document.documentElement,{
    attributes:true,
    attributeFilter:['lang']
  });

  nat?.addEventListener('change',()=>{
    if(/malaysia/i.test(nat.value)) type.value='NRIC / MyKad';
  });

  if(form){
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
  }
})();
