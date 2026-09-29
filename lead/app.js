(() => {
  const form = document.getElementById('leadMagnetForm');
  const status = document.getElementById('leadMagnetStatus');
  const languageToggle = document.getElementById('languageToggle');

  if (!form || !status) return;

  const params = new URLSearchParams(location.search);
  const startedAt = Date.now();

  const offer =
    (params.get('offer') || 'general-yijing-resource')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 80) || 'general-yijing-resource';

  let language =
    params.get('lang') === 'zh' ||
    document.documentElement.lang.toLowerCase().startsWith('zh')
      ? 'zh'
      : 'en';

  function applyLanguage() {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';

    document.querySelectorAll('[data-en][data-zh]').forEach(el => {
      el.textContent = language === 'zh'
        ? el.getAttribute('data-zh')
        : el.getAttribute('data-en');
    });

    if (languageToggle) {
      languageToggle.textContent = language === 'zh' ? 'English' : '中文';
    }

    document.title = language === 'zh'
      ? '免费学习资源 | 量子易经国际学院'
      : 'Free Resource | Quantum YiJing International Academy';
  }

  if (languageToggle) {
    languageToggle.addEventListener('click', () => {
      language = language === 'zh' ? 'en' : 'zh';
      applyLanguage();
    });
  }

  applyLanguage();

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    status.className = 'lead-status';
    status.textContent = '';

    if (!form.reportValidity()) return;

    button.disabled = true;

    const buttonText = button.querySelector('[data-en][data-zh]');
    if (buttonText) {
      buttonText.textContent = language === 'zh' ? '提交中…' : 'Submitting…';
    }

    const body = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      country: formData.get('country'),

      interest: 'General Enquiry',
      message: language === 'zh'
        ? 'Lead Magnet：索取免费学习资源。资源编号：' + offer
        : 'Lead Magnet — requested complimentary learning resource. Offer: ' + offer,
      language,

      consent: formData.get('consent'),
      whatsappMarketingConsent: formData.get('whatsappMarketingConsent'),
      website: formData.get('website'),
      startedAt,

      marketingSource: 'Lead Magnet',
      campaignCode: params.get('utm_campaign') || ('LEAD-' + offer.toUpperCase()),
      landingPage: location.pathname + '?offer=' + encodeURIComponent(offer),
      referrer: document.referrer,

      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
      utmContent: params.get('utm_content') || '',
      utmTerm: params.get('utm_term') || '',

      affiliateCode: params.get('aff') || params.get('affiliate') || '',
      createOrder: false
    };

    try {
      const response = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
          (language === 'zh'
            ? '暂时无法提交，请稍后再试。'
            : 'Unable to submit your request. Please try again.')
        );
      }

      form.reset();

      status.className = 'lead-status success';
      status.textContent = language === 'zh'
        ? '登记成功。您的参考编号是 ' + data.reference + '。正式资源连接后，将可在这里提供获取方式。'
        : 'Registration successful. Your reference is ' + data.reference + '. Resource delivery will be enabled here once the final resource is connected.';
    } catch (error) {
      status.className = 'lead-status error';
      status.textContent =
        error && error.message
          ? error.message
          : (language === 'zh'
              ? '暂时无法提交，请稍后再试。'
              : 'Unable to submit your request. Please try again.');
    } finally {
      button.disabled = false;

      if (buttonText) {
        buttonText.textContent = language === 'zh'
          ? '索取免费资源'
          : 'Request Free Resource';
      }
    }
  });
})();
