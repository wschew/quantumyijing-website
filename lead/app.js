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

  // Explicit allow-list: public offer code -> downloadable resource.
  // Never construct resource paths directly from visitor-supplied URL values.
  const resources = {
    'd3-test-guide': {
      url: '/lead/resources/test-guide.pdf',
      filename: 'test-guide.pdf'
    }
  };

  const resource = resources[offer] || null;

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
      languageToggle.textContent = language === 'zh' ? 'English' : 'ä¸­æ–‡';
    }

    document.title = language === 'zh'
      ? 'å…è´¹å­¦ä¹ èµ„æº | é‡å­æ˜“ç»å›½é™…å­¦é™¢'
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
      buttonText.textContent = language === 'zh' ? 'æäº¤ä¸­â€¦' : 'Submittingâ€¦';
    }

    const body = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      country: formData.get('country'),

      interest: 'General Enquiry',
      message: language === 'zh'
        ? 'Lead Magnetï¼šç´¢å–å…è´¹å­¦ä¹ èµ„æºã€‚èµ„æºç¼–å·ï¼š' + offer
        : 'Lead Magnet â€” requested complimentary learning resource. Offer: ' + offer,
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
            ? 'æš‚æ—¶æ— æ³•æäº¤ï¼Œè¯·ç¨åŽå†è¯•ã€‚'
            : 'Unable to submit your request. Please try again.')
        );
      }

      form.reset();

      status.className = 'lead-status success';

      if (resource) {
        const message = document.createElement('span');
        message.textContent = language === 'zh'
          ? '索取成功。您的参考编号是 ' + data.reference + '。'
          : 'Request successful. Your reference is ' + data.reference + '.';

        const separator = document.createTextNode(' ');

        const download = document.createElement('a');
        download.href = resource.url;
        download.download = resource.filename;
        download.className = 'lead-download';
        download.target = '_blank';
        download.rel = 'noopener';
        download.textContent = language === 'zh'
          ? 'ä¸‹è½½å…è´¹èµ„æº'
          : 'Download Free Resource';

        status.replaceChildren(message, separator, download);
      } else {
        status.textContent = language === 'zh'
          ? '索取成功。您的参考编号是 ' + data.reference + '。该资源目前尚未开放下载。'
          : 'Request successful. Your reference is ' + data.reference + '. This resource is not yet available for download.';
      }
    } catch (error) {
      status.className = 'lead-status error';
      status.textContent =
        error && error.message
          ? error.message
          : (language === 'zh'
              ? 'æš‚æ—¶æ— æ³•æäº¤ï¼Œè¯·ç¨åŽå†è¯•ã€‚'
              : 'Unable to submit your request. Please try again.');
    } finally {
      button.disabled = false;

      if (buttonText) {
        buttonText.textContent = language === 'zh'
          ? 'ç´¢å–å…è´¹èµ„æº'
          : 'Request Free Resource';
      }
    }
  });
})();
