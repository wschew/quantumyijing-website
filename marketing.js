(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('lang-toggle');
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // v2.7.1 unified bilingual marketing framework.
  // Exact-match translation keeps the marketing pages reusable without duplicating markup.
  const zh = {
    'INTERNATIONAL ACADEMY': '国际学院',
    'Events': '活动',
    'Promotions': '优惠',
    'News': '资讯',
    'Products': '产品',
    'Enquire': '咨询',
    'Quantum YiJing® Marketing Hub': 'Quantum YiJing® 营销中心',
    'Digital Business Platform': '数字商业平台',
    'Events Centre': '活动中心',
    'Upcoming learning experiences, webinars, workshops and community activities.': '汇集即将举行的课程、线上讲座、工作坊与社群活动。',
    'One official destination': '统一官方入口',
    'Use this page as the authoritative destination from social posts, advertisements and messages instead of sending prospects to scattered information.': '让社交媒体贴文、广告与讯息统一链接到此官方页面，避免潜在客户在零散资讯之间来回寻找。',
    'Event': '活动',
    'Upcoming Events': '即将举行的活动',
    'The Events Centre is ready for your next webinar, workshop, course intake, live session or physical event.': '活动中心已准备好发布下一场线上讲座、工作坊、课程招生、直播或实体活动。',
    'Explore →': '了解更多 →',
    'Marketing': '营销',
    'Run a campaign from social media': '从社交媒体启动营销活动',
    'Share one event link across TikTok, Facebook and YouTube. The enquiry system records campaign attribution for future analysis.': '在 TikTok、Facebook 与 YouTube 分享同一个活动链接，咨询系统会记录营销来源，供日后分析。',
    'Workflow': '流程',
    'Need an event announced?': '需要发布活动吗？',
    'Publish the event here first, then use social media to drive visitors to one clear registration or enquiry destination.': '先在这里发布活动，再通过社交媒体把访客带到一个清晰的报名或咨询入口。',

    'Promotions Centre': '优惠与推广中心',
    'A dedicated area for early-bird offers, bundles, seasonal campaigns and member benefits.': '集中发布早鸟优惠、组合配套、季节推广与会员福利。',
    'Status': '状态',
    'No active public promotion': '目前没有公开优惠活动',
    'This section is ready for your next campaign. Promotions can later be managed directly from the Academy admin system.': '本区已为下一次营销活动做好准备，未来可直接从学院管理系统发布与管理优惠。',
    'Membership': '会员',
    'Membership campaigns': '会员推广活动',
    'Promote yearly membership, renewal benefits or special member-only access through a dedicated landing page.': '通过专属落地页推广年度会员、续费福利或会员专享权益。',
    'Commerce': '商业',
    'Multi-channel commerce': '多渠道销售',
    'Website products may use SenangPay, while books sold through Google Play Books continue to use Google’s checkout.': '网站产品可使用 SenangPay；通过 Google Play Books 销售的书籍则继续使用 Google 自有结账系统。',

    'News & Announcements': '资讯与公告',
    'The official place for Academy announcements, new courses, research updates and media news.': '学院公告、新课程、研究进展与媒体资讯的官方发布平台。',
    'Academy announcements': '学院公告',
    'Use this section for new course intakes, schedule notices, graduations, research updates and public announcements.': '用于发布新课程招生、时间表通知、毕业消息、研究进展与公众公告。',
    'Social': '社交媒体',
    'Social media → website': '社交媒体 → 官网',
    'TikTok, Facebook and YouTube posts can link here when visitors need full details or an official source.': '当访客需要完整资料或官方来源时，TikTok、Facebook 与 YouTube 的内容可统一链接到这里。',
    'Roadmap': '发展路线',
    'Knowledge Centre foundation': '知识中心基础',
    'Future releases can connect articles, videos, research and FAQs into a searchable Quantum YiJing® Knowledge Centre.': '未来版本可把文章、视频、研究与常见问题整合成可搜索的 Quantum YiJing® 知识中心。',

    'Products & Learning Offers': '产品与学习方案',
    'A future-ready catalogue for courses, memberships, consultations, digital publications and physical products — with the correct payment channel for each offer.': '面向未来的产品目录，涵盖课程、会员、咨询、数字出版物与实体产品，并为每项产品采用合适的付款渠道。',
    'Multi-channel payment model': '多渠道付款模式',
    'Website checkout can use SenangPay when activated. Books sold through Google Play Books remain on Google’s own checkout. Future marketplaces can retain their own payment systems.': '网站结账功能启用后可使用 SenangPay；Google Play Books 销售的书籍继续使用 Google 自有结账；未来其他平台也可保留各自的付款系统。',
    'Commerce foundation': '商业基础',
    'One catalogue, different sales channels': '一个产品目录，多种销售渠道',
    'WEBSITE · SENANGPAY READY': '官网 · SENANGPAY 就绪',
    'Courses & Membership': '课程与会员',
    'Future course registrations, yearly membership and direct Academy offers can use your website checkout and SenangPay.': '未来的课程报名、年度会员及学院直营方案可使用官网结账与 SenangPay。',
    'View membership page': '查看会员页面',
    'GOOGLE PLAY BOOKS': 'GOOGLE PLAY BOOKS',
    'Books & Publications': '书籍与出版物',
    'Publications sold through Google Play Books continue to use Google’s payment gateway. The DBP links customers to the correct external purchase channel.': '通过 Google Play Books 销售的出版物继续使用 Google 付款系统；DBP 会把顾客引导到正确的外部购买渠道。',
    'View publications': '查看出版物',
    'FUTURE CATALOGUE': '未来产品目录',
    'Consultations & Physical Products': '咨询与实体产品',
    'The same product model is ready for consultations, teaching materials, books, accessories and future physical products.': '同一产品架构已可支持咨询、教材、书籍、配件及未来实体产品。',
    'Payment security:': '付款安全：',
    'SenangPay live checkout is not activated by v2.7. Merchant secrets must remain in Cloudflare encrypted secrets and never in browser JavaScript or GitHub.': 'v2.7 尚未启用 SenangPay 正式结账。商户密钥必须保存在 Cloudflare 加密机密中，绝不可放在浏览器 JavaScript 或 GitHub。',

    'Quantum YiJing® Membership': 'Quantum YiJing® 年度会员',
    'Learn throughout the year, at your own pace.': '全年持续学习，按自己的节奏成长。',
    'One campaign. One message. One clear action.': '一个活动，一个讯息，一个清晰行动。',
    'A flexible pathway for learners who value ongoing access, community learning and the ability to join Academy programmes across the year. Current fees, programme coverage and conditions are provided on enquiry.': '为重视持续学习、社群交流及全年灵活参与学院课程的学习者而设。最新费用、课程涵盖范围与相关条件，请向学院咨询。',
    'Designed for today’s busy learner': '为现代忙碌学习者而设计',
    'Less pressure. More continuity.': '减少压力，持续成长。',
    'Instead of committing to one long programme at one fixed time, the membership model can provide a flexible relationship with the Academy throughout the year.': '无需在固定时间一次承诺漫长课程，会员模式让您全年以更灵活的方式持续与学院学习和互动。',
    'Flexible participation': '灵活参与',
    'Join eligible Academy learning activities according to your available time and the current membership terms.': '按照自己的时间安排及当年会员条款，参与符合资格的学院学习活动。',
    'Ongoing community': '持续社群连接',
    'Stay connected with announcements, selected learning activities and the Academy community beyond a single course.': '不局限于单一课程，持续接收公告、参与精选学习活动，并与学院社群保持联系。',
    'Continuous learning': '持续学习',
    'Build knowledge progressively rather than treating learning as a one-time purchase.': '以循序渐进的方式积累知识，而不是把学习视为一次性的购买。',
    'Member-first updates': '会员优先资讯',
    'Future promotions, events and member benefits can be communicated through the DBP.': '未来的优惠、活动与会员福利可通过 DBP 统一发布与通知。',
    'This page is a reusable v2.7 landing-page template. Pricing and exact membership entitlements should be updated in the Marketing Hub before running paid advertisements.': '这是可重复使用的 v2.7 营销落地页模板。正式投放付费广告前，应先在营销中心更新价格及准确的会员权益。',
    'Request membership information': '索取会员资料',
    'Request information': '索取资料',
    'Full Name *': '姓名 *',
    'Email *': '电邮 *',
    'WhatsApp / Phone': 'WhatsApp / 电话',
    'Country': '国家／地区',
    'Area of Interest *': '感兴趣的项目 *',
    'Academy Course / Membership': '学院课程／会员',
    'Message *': '留言 *',
    "I'm interested in the yearly membership programme. Please send me the latest details.": '我对年度会员计划有兴趣，请发送最新详情给我。',
    'I agree to the': '我已阅读并同意',
    'Privacy Policy': '隐私政策',
    'and': '以及',
    'Terms of Use': '使用条款',
    '. *': '。*',
    'Send Enquiry': '提交咨询',

    'Legal Centre · Last updated 8 August 2026': '法律中心 · 最后更新：2026年8月8日',
    'Privacy Policy': '隐私政策',
    'This policy is a practical website template and should be reviewed by qualified Malaysian legal counsel as the Digital Business Platform expands.': '本政策为网站实务模板。随着数字商业平台扩展，建议由合资格的马来西亚法律顾问审核。',
    'Information we collect': '我们收集的资料',
    'When you submit an enquiry, registration or future transaction, we may collect your name, email address, telephone or WhatsApp number, country, areas of interest, message, campaign attribution and related records needed to respond to you.': '当您提交咨询、报名或未来交易时，我们可能收集姓名、电邮、电话或 WhatsApp、国家／地区、兴趣类别、留言、营销来源及回复您所需的相关记录。',
    'How we use information': '我们如何使用资料',
    'Information may be used to respond to enquiries, manage prospective students and students, administer Academy services, maintain records, improve marketing effectiveness and communicate relevant Academy information where permitted.': '资料可用于回复咨询、管理潜在客户与学员、提供学院服务、保存记录、改善营销效果，以及在法律允许的情况下发送相关学院资讯。',
    'Service providers': '服务提供商',
    'Our digital infrastructure may use service providers such as Cloudflare for hosting and database services and email-delivery providers for transactional messages. Purchases made through external platforms, including Google Play Books, are also subject to those platforms’ privacy practices.': '我们的数字基础设施可能使用 Cloudflare 等服务提供商进行托管与数据库服务，并使用电邮服务商发送交易讯息。通过 Google Play Books 等外部平台完成的购买，也受相关平台的隐私政策约束。',
    'Retention and security': '保存与安全',
    'We use reasonable technical and organizational controls for Academy records. Access to administration systems is restricted. No internet system can be guaranteed to be completely secure.': '我们采用合理的技术与组织措施保护学院记录，并限制管理系统的访问权限。但任何互联网系统都无法保证绝对安全。',
    'Your choices': '您的选择与权利',
    'You may contact us to request correction of inaccurate contact information or to ask questions about how your enquiry information is handled, subject to applicable law and record-keeping requirements.': '在适用法律与记录保存要求允许的范围内，您可联系我们更正不准确的联系资料，或询问我们如何处理您的咨询资料。',
    'Contact': '联系',
    'Email:': '电邮：',

    'Terms of Use': '使用条款',
    'These terms are a general operational template and should be reviewed by qualified Malaysian legal counsel before high-volume commerce or international expansion.': '本条款为一般营运模板。在进行大规模商业活动或国际扩展前，建议由合资格的马来西亚法律顾问审核。',
    'Website use': '网站使用',
    'This website provides information about Quantum YiJing® International Academy, educational programmes, research, services, publications, events and future products. You agree not to misuse the website, interfere with its operation or attempt unauthorized access to private systems.': '本网站提供 Quantum YiJing® 国际学院、教育课程、研究、服务、出版物、活动与未来产品的资料。您同意不滥用本网站、不干扰其运作，也不尝试未经授权访问私人系统。',
    'Intellectual property': '知识产权',
    'Unless otherwise stated, Academy text, graphics, teaching materials, original educational frameworks, branding and website content are protected by applicable intellectual-property rights. Quantum YiJing® is a registered trademark. Unauthorized commercial reproduction or redistribution is prohibited.': '除非另有说明，学院文字、图像、教学材料、原创教育框架、品牌与网站内容均受适用知识产权保护。Quantum YiJing® 为注册商标。未经授权不得作商业复制或重新分发。',
    'External platforms': '外部平台',
    'Some products may be sold through third-party platforms such as Google Play Books. Those transactions are governed by the relevant platform’s checkout, payment and platform terms. Future website checkout may use SenangPay and will be subject to the applicable transaction terms shown at checkout.': '部分产品可能通过 Google Play Books 等第三方平台销售，相关交易受该平台的结账、付款与使用条款约束。未来官网结账可能采用 SenangPay，并受结账时显示的适用交易条款约束。',
    'No guarantee of outcomes': '不保证结果',
    'Educational, consultation and metaphysical content does not guarantee financial, business, relationship, health or other outcomes. Users remain responsible for their decisions.': '教育、咨询及玄学内容不保证财务、事业、关系、健康或其他结果。使用者仍须对自己的决定负责。',
    'Applicable law': '适用法律',
    'These terms are intended to operate subject to applicable laws of Malaysia. Nothing here excludes rights that cannot lawfully be excluded.': '本条款拟在马来西亚适用法律范围内执行，任何依法不能排除的权利均不受本条款影响。',

    'Disclaimer': '免责声明',
    'Educational and informational purpose': '教育与资讯用途',
    'Yijing, Bazi, Feng Shui and related metaphysical content is presented for education, cultural study, personal reflection and professional consultation. Interpretations are not guarantees of future events or outcomes.': '易经、八字、风水及相关玄学内容用于教育、文化研究、个人反思与专业咨询。任何解读均不构成对未来事件或结果的保证。',
    'Professional decisions': '专业决策',
    'Website content and consultations should not be treated as a substitute for licensed medical, legal, financial, investment, psychological or other regulated professional advice. Seek an appropriately qualified professional when such advice is required.': '网站内容与咨询不能替代持牌医疗、法律、财务、投资、心理或其他受监管的专业意见。如有需要，应咨询相应的合资格专业人士。',
    'Research content': '研究内容',
    'Discussions that connect traditional ideas with modern scientific concepts are educational and exploratory unless clearly identified as peer-reviewed scientific findings. Research claims should be evaluated according to appropriate academic standards.': '把传统思想与现代科学概念联系起来的讨论，除非明确注明为经同行评审的科学成果，否则属于教育与探索性质。研究主张应按适当学术标准评估。',
    'Responsibility': '责任',
    'You remain responsible for decisions and actions taken after reading or receiving Academy content or consultation.': '您仍须对阅读或接受学院内容与咨询后所作的决定与行动负责。',

    'Refund & Cancellation Policy': '退款与取消政策',
    'This is a foundation policy for v2.7. Product-specific terms shown at registration or checkout should take priority where applicable and should be reviewed before live commerce is activated.': '这是 v2.7 的基础政策。若报名或结账页面另有特定产品条款，应以该等条款为准；正式启用在线交易前应再次审核。',
    'Courses and events': '课程与活动',
    'Cancellation, transfer, rescheduling and refund conditions may vary by programme. The applicable terms should be displayed before payment or confirmed in writing for each programme.': '不同课程的取消、转让、改期与退款条件可能不同。每项课程应在付款前显示适用条款，或以书面方式确认。',
    'Digital products': '数字产品',
    'Digital products supplied through third-party stores, including Google Play Books, are subject to the relevant platform’s purchase and refund rules.': '通过 Google Play Books 等第三方商店提供的数字产品，适用相关平台的购买与退款规则。',
    'Consultations': '咨询服务',
    'Consultation rescheduling or cancellation conditions should be stated at booking. Completed professional services are generally not refundable unless required by applicable law.': '咨询服务的改期或取消条件应在预约时说明。已完成的专业服务一般不予退款，除非适用法律另有要求。',
    'Physical products': '实体产品',
    'Future physical-product return, shipping and defect policies will be published before those products are offered for online sale.': '未来实体产品在上线销售前，将公布退货、运输与瑕疵处理政策。',
    'For a specific transaction, contact': '如需查询特定交易，请联系',
    'with your order or registration reference.': '并提供订单或报名编号。',

    'Cookie & Local Storage Policy': 'Cookie 与浏览器储存政策',
    'Current website use': '目前网站用途',
    'The current website may use browser local storage to remember your language preference. The private administrator area uses session storage to maintain an authenticated administration session in your browser.': '目前网站可能使用浏览器本地储存记住您的语言选择；私人管理区使用会话储存维持浏览器中的已验证管理登入状态。',
    'Analytics and advertising': '分析与广告',
    'As of v2.7, the public website does not require third-party advertising cookies for the new marketing foundation. If analytics, advertising pixels or remarketing tools are activated in future, this policy and any required consent mechanism should be updated before deployment.': '截至 v2.7，新营销基础并不依赖第三方广告 Cookie。未来如启用网站分析、广告像素或再营销工具，应在上线前更新本政策及所需的同意机制。',
    'Campaign parameters': '营销参数',
    'Marketing links may contain UTM parameters, campaign codes or affiliate identifiers. These may be recorded with an enquiry so the Academy can understand which marketing channels are effective.': '营销链接可能包含 UTM 参数、活动代码或联盟推广识别码。这些资料可能随咨询记录保存，以协助学院了解哪些营销渠道更有效。',

    'Quantum YiJing® International Academy': 'Quantum YiJing® 国际学院',
    'Where Ancient Wisdom Meets Modern Scientific Thinking': '古老智慧 · 现代科学思维',
    'Penang, Malaysia': '马来西亚 · 槟城',
    'Explore': '探索',
    'Connect': '联系',
    'Enquiry Form': '咨询表格',
    'Legal': '法律',
    'Refund Policy': '退款政策',
    'Cookie Policy': 'Cookie 政策',
    'Quantum YiJing Sdn. Bhd. Quantum YiJing® is a registered trademark. All rights reserved.': 'Quantum YiJing Sdn. Bhd. · Quantum YiJing® 为注册商标。版权所有。'
  };

  const originalText = new Map();
  const titleEn = document.title;
  const titleZh = {
    'Events Centre | Quantum YiJing®': '活动中心 | Quantum YiJing®',
    'Promotions Centre | Quantum YiJing®': '优惠与推广中心 | Quantum YiJing®',
    'News & Announcements | Quantum YiJing®': '资讯与公告 | Quantum YiJing®',
    'Products | Quantum YiJing®': '产品 | Quantum YiJing®',
    'Privacy Policy | Quantum YiJing®': '隐私政策 | Quantum YiJing®',
    'Terms of Use | Quantum YiJing®': '使用条款 | Quantum YiJing®',
    'Disclaimer | Quantum YiJing®': '免责声明 | Quantum YiJing®',
    'Refund & Cancellation Policy | Quantum YiJing®': '退款与取消政策 | Quantum YiJing®',
    'Cookie & Local Storage Policy | Quantum YiJing®': 'Cookie 与浏览器储存政策 | Quantum YiJing®',
    'Yearly Membership | Quantum YiJing®': '年度会员 | Quantum YiJing®',
    'Campaign Landing Page Template | Quantum YiJing®': '营销落地页模板 | Quantum YiJing®'
  }[titleEn] || titleEn;

  function translateTextNodes(lang) {
    // Capture textarea source values before text-node translation changes their defaultValue.
    document.querySelectorAll('textarea').forEach(el => {
      if (!el.dataset.qyEnValue) el.dataset.qyEnValue = el.value;
    });

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = originalText.has(node) ? originalText.get(node) : node.nodeValue;
      if (!originalText.has(node)) originalText.set(node, raw);
      const trimmed = raw.trim();
      if (!trimmed || !zh[trimmed]) {
        if (lang === 'en') node.nodeValue = raw;
        continue;
      }
      if (lang === 'zh') {
        const leading = raw.match(/^\s*/)?.[0] || '';
        const trailing = raw.match(/\s*$/)?.[0] || '';
        node.nodeValue = `${leading}${zh[trimmed]}${trailing}`;
      } else {
        node.nodeValue = raw;
      }
    }

    // Textareas use their current value after parsing, so translate the default message explicitly.
    document.querySelectorAll('textarea').forEach(el => {
      const base = el.dataset.qyEnValue || el.value;
      const trimmed = base.trim();
      if (zh[trimmed]) {
        const translated = zh[trimmed];
        const untouched = el.value === base || el.value === zh[trimmed] || el.value.trim() === trimmed || el.value.trim() === translated;
        if (untouched) el.value = lang === 'zh' ? translated : base;
      }
    });
  }

  function setLang(lang) {
    root.dataset.lang = lang;
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    translateTextNodes(lang);
    document.title = lang === 'zh' ? titleZh : titleEn;
    if (toggle) {
      toggle.textContent = lang === 'en' ? '中文' : 'EN';
      toggle.setAttribute('aria-label', lang === 'en' ? '切换到中文' : 'Switch to English');
    }
    localStorage.setItem('qy-language', lang);
    window.dispatchEvent(new CustomEvent('qy-language-change', { detail: { lang } }));
  }

  setLang(localStorage.getItem('qy-language') || 'en');
  toggle?.addEventListener('click', () => setLang(root.dataset.lang === 'en' ? 'zh' : 'en'));
})();
