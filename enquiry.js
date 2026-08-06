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
