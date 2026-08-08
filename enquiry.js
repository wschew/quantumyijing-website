(() => {
  const form = document.getElementById('academy-enquiry-form');
  if (!form) return;

  const status = document.getElementById('enquiry-status');
  const startedAt = document.getElementById('enquiry-started-at');
  const submitButton = form.querySelector('button[type="submit"]');
  const submitText = submitButton.querySelector('span');
  startedAt.value = String(Date.now());

  const copy = {
    en: {
      sending: 'Sending your enquiry…',
      success: 'Thank you. Your enquiry has been received and a confirmation email has been sent.',
      error: 'We could not send your enquiry. Please email info@quantumyijing.com.',
      invalid: 'Please complete all required fields correctly.',
      button: 'Send Enquiry'
    },
    zh: {
      sending: '正在提交您的咨询……',
      success: '感谢您。我们已收到您的咨询，并已发送确认电邮。',
      error: '暂时无法提交。请电邮至 info@quantumyijing.com。',
      invalid: '请正确填写所有必填项目。',
      button: '提交咨询'
    }
  };

  function lang() { return document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en'; }
  function setStatus(message, type = '') {
    status.textContent = message;
    status.className = `form-status ${type}`.trim();
  }

  form.addEventListener('input', event => {
    if (event.target.matches('input, select, textarea')) event.target.removeAttribute('aria-invalid');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const current = copy[lang()];

    if (!form.checkValidity()) {
      form.reportValidity();
      form.querySelectorAll(':invalid').forEach(field => field.setAttribute('aria-invalid', 'true'));
      setStatus(current.invalid, 'error');
      return;
    }

    submitButton.disabled = true;
    submitText.textContent = current.sending;
    setStatus(current.sending);

    const values = Object.fromEntries(new FormData(form).entries());
    values.language = lang();

    // v2.7 marketing attribution: records where the prospect came from without cookies.
    const params = new URLSearchParams(window.location.search);
    const inferredSource = params.get('utm_source') || params.get('source') || (document.referrer ? (() => {
      try { const host = new URL(document.referrer).hostname.toLowerCase();
        if (host.includes('tiktok')) return 'TikTok';
        if (host.includes('facebook') || host.includes('fb.com')) return 'Facebook';
        if (host.includes('youtube') || host.includes('youtu.be')) return 'YouTube';
        if (host.includes('google')) return 'Google';
        return 'Referral';
      } catch { return 'Referral'; }
    })() : 'Website');
    values.marketingSource = inferredSource.slice(0, 80);
    values.campaignCode = (params.get('campaign') || params.get('utm_campaign') || '').slice(0, 100);
    values.landingPage = window.location.pathname.slice(0, 200);
    values.referrer = document.referrer.slice(0, 400);
    values.utmSource = (params.get('utm_source') || '').slice(0, 100);
    values.utmMedium = (params.get('utm_medium') || '').slice(0, 100);
    values.utmCampaign = (params.get('utm_campaign') || '').slice(0, 100);
    values.utmContent = (params.get('utm_content') || '').slice(0, 120);
    values.affiliateCode = (params.get('aff') || params.get('affiliate') || '').slice(0, 80);

    try {
      const response = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(values)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Request failed');

      form.reset();
      startedAt.value = String(Date.now());
      setStatus(current.success, 'success');
    } catch (error) {
      console.error('Enquiry submission failed:', error);
      setStatus(current.error, 'error');
    } finally {
      submitButton.disabled = false;
      submitText.textContent = copy[lang()].button;
    }
  });
})();
