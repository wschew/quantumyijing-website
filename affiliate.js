const $ = (s) => document.querySelector(s);

async function loadSettings(){
  try{
    const r = await fetch('/api/affiliate/settings', {headers:{'accept':'application/json'}});
    if(!r.ok) return;
    const d = await r.json();
    if(d.default_commission_rate != null) $('#commissionRate').textContent = `${d.default_commission_rate}%`;
    if(d.referral_days != null) $('#referralDays').textContent = `${d.referral_days} days`;
    if(d.customer_attribution_months != null) $('#attributionMonths').textContent = `${d.customer_attribution_months} months`;
    if(d.affiliate_membership_months != null) $('#membershipMonths').textContent = `${d.affiliate_membership_months} months, renewable`;
  }catch(_){}
}

$('#affiliateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = $('#formStatus');
  const btn = $('#submitBtn');

  if(!form.reportValidity()) return;

  const fd = new FormData(form);
  const payload = Object.fromEntries(fd.entries());
  payload.privacy_consent = fd.get('privacy_consent') === '1';
  payload.terms_accepted = fd.get('terms_accepted') === '1';

  btn.disabled = true;
  status.className = 'status';
  status.textContent = 'Submitting application…';

  try{
    const r = await fetch('/api/affiliate/apply', {
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify(payload)
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || 'Unable to submit application.');
    form.reset();
    status.className = 'status ok';
    status.textContent = `Application received. Reference: ${d.application_reference}. Quantum YiJing will review your application.`;
  }catch(err){
    status.className = 'status err';
    status.textContent = err.message || 'Unable to submit application.';
  }finally{
    btn.disabled = false;
  }
});

loadSettings();
