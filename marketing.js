
(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('lang-toggle');
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  const setLang = lang => {
    root.dataset.lang = lang; root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-en][data-zh]').forEach(el => el.textContent = el.dataset[lang]);
    if (toggle) toggle.textContent = lang === 'en' ? '中文' : 'EN';
    localStorage.setItem('qy-language', lang);
  };
  setLang(localStorage.getItem('qy-language') || 'en');
  toggle?.addEventListener('click', () => setLang(root.dataset.lang === 'en' ? 'zh' : 'en'));
})();
