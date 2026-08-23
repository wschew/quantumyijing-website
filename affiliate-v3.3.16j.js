
(()=>{
  const form=document.querySelector('form');
  if(!form)return;
  const nat=document.querySelector('#affiliateNationality');
  const type=document.querySelector('#affiliateIdentificationType');
  const idno=document.querySelector('#affiliateIdentificationNumber');
  const agree=document.querySelector('#affiliateTermsAccepted');

  nat?.addEventListener('change',()=>{
    if(/malaysia/i.test(nat.value)) type.value='NRIC / MyKad';
  });

  form.addEventListener('submit',async e=>{
    if(!nat||!type||!idno||!agree)return;
    if(!agree.checked){
      e.preventDefault();
      alert('Please read and accept the Affiliate Program Terms & Conditions.');
      return;
    }
    if(/malaysia/i.test(nat.value) && type.value!=='NRIC / MyKad'){
      e.preventDefault();
      alert('Malaysian affiliates must select NRIC / MyKad.');
      return;
    }

    const email=(form.querySelector('[name="email"]')?.value||'').trim();
    if(!email)return;

    // Save compliance metadata independently of the existing application endpoint.
    // This preserves the existing application workflow while adding the new fields.
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
