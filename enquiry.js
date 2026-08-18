const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const ACADEMY_NAME = 'Quantum YiJing International Academy';
const FROM_ADDRESS = `${ACADEMY_NAME} <info@quantumyijing.com>`;
const INTERNAL_ADDRESS = 'info@quantumyijing.com';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;

async function saveEnquiry(db, data, meta) {
  if (!db) throw new Error('ENQUIRIES_DB binding is not configured.');

  const inserted = await db.prepare(`
    INSERT INTO enquiries (
      reference, submitted_at_utc, submitted_at_malaysia, submitted_date,
      name, email, phone, country, interest, message, language, status, source, lifecycle_stage
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 'Website', 'Lead')
    RETURNING id
  `).bind(
    meta.reference, meta.submittedAtUtc, meta.submitted, meta.submittedDate,
    data.name, data.email, data.phone, data.country, data.interest,
    data.message, data.language
  ).first();

  if (inserted?.id) {
    await db.prepare(`
      INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
      VALUES (?, 'Enquiry', 'Website enquiry received.', ?)
    `).bind(inserted.id, meta.submitted).run();
  }
  return inserted;
}

async function saveAttribution(db, enquiryId, attribution) {
  if (!db || !enquiryId) return;
  const standardValues = [
    enquiryId, attribution.marketingSource, attribution.campaignCode, attribution.landingPage,
    attribution.referrer, attribution.utmSource, attribution.utmMedium, attribution.utmCampaign,
    attribution.utmContent, attribution.utmTerm, attribution.affiliateCode
  ];
  try {
    // v3.0 can optionally store the originating product when those columns exist.
    await db.prepare(`
      INSERT INTO enquiry_attribution (
        enquiry_id, marketing_source, campaign_code, landing_page, referrer,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, affiliate_code, product_id, product_slug
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(enquiry_id) DO UPDATE SET
        marketing_source=excluded.marketing_source, campaign_code=excluded.campaign_code,
        landing_page=excluded.landing_page, referrer=excluded.referrer, utm_source=excluded.utm_source,
        utm_medium=excluded.utm_medium, utm_campaign=excluded.utm_campaign, utm_content=excluded.utm_content,
        utm_term=excluded.utm_term, affiliate_code=excluded.affiliate_code,
        product_id=excluded.product_id, product_slug=excluded.product_slug
    `).bind(...standardValues, attribution.productId || null, attribution.productSlug).run();
  } catch (extendedError) {
    // Backward-compatible fallback for a v2.9 attribution table without product_id/product_slug.
    try {
      await db.prepare(`
        INSERT INTO enquiry_attribution (
          enquiry_id, marketing_source, campaign_code, landing_page, referrer,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term, affiliate_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(enquiry_id) DO UPDATE SET
          marketing_source=excluded.marketing_source, campaign_code=excluded.campaign_code,
          landing_page=excluded.landing_page, referrer=excluded.referrer, utm_source=excluded.utm_source,
          utm_medium=excluded.utm_medium, utm_campaign=excluded.utm_campaign,
          utm_content=excluded.utm_content, utm_term=excluded.utm_term,
          affiliate_code=excluded.affiliate_code
      `).bind(...standardValues).run();
    } catch (fallbackError) {
      // Marketing attribution must never prevent a legitimate enquiry from being recorded.
      console.warn('Attribution storage skipped', fallbackError);
    }
  }
}

function orderReference(){return `QY-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;}
async function createProductOrder(db,enquiryId,data,attribution){
  if(!db||!attribution.createOrder||!attribution.productSlug)return null;
  const product=await db.prepare(`SELECT id,slug,name_en,status,price,currency,sales_channel,payment_provider,early_bird_price,early_bird_end FROM products WHERE slug=? AND status='Active' LIMIT 1`).bind(attribution.productSlug).first();
  if(!product || product.sales_channel!=='Website') return null;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const listUnit=Number(product.price||0);
  const early=Number(product.early_bird_price)>0 && product.early_bird_end && today<=product.early_bird_end;
  const finalUnit=early?Number(product.early_bird_price):listUnit;
  const discount=Math.max(listUnit-finalUnit,0), ref=orderReference();
  const displayCurrency=attribution.displayCurrency||'', displayRate=Number(attribution.displayExchangeRate||0), displayAmount=Number(attribution.displayAmount||0);
  const order=await db.prepare(`INSERT INTO orders(order_reference,enquiry_id,customer_name,customer_email,customer_phone,currency,subtotal,total,sales_channel,payment_provider,payment_status,campaign_code,affiliate_code,display_currency,display_exchange_rate,display_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ref,enquiryId,data.name,data.email,data.phone,product.currency||'MYR',finalUnit,finalUnit,product.sales_channel,product.payment_provider,'Pending',attribution.campaignCode||attribution.utmCampaign||'',attribution.affiliateCode||'',displayCurrency,displayRate,displayAmount).run();
  const orderId=order.meta?.last_row_id;
  if(orderId) await db.prepare(`INSERT INTO order_items(order_id,product_id,quantity,unit_price,line_total,list_unit_price,discount_amount,final_unit_price,pricing_rule) VALUES(?,?,?,?,?,?,?,?,?)`).bind(orderId,product.id,1,finalUnit,finalUnit,listUnit,discount,finalUnit,early?'Early Bird':'Standard').run();
  return {orderReference:ref,total:finalUnit,currency:product.currency||'MYR',productName:product.name_en};
}

async function sendEmail(apiKey, payload) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function acknowledgementHtml(name, reference, interest, submitted) {
  const safeName = escapeHtml(name);
  const safeReference = escapeHtml(reference);
  const safeInterest = escapeHtml(interest);
  const safeSubmitted = escapeHtml(submitted);
  const logoUrl = 'https://quantumyijing.com/images/quantum-yijing-3d-logo.png';

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb">
      <tr>
        <td align="center" style="padding:28px 12px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden;box-shadow:0 12px 34px rgba(19,55,96,.10)">
            <tr>
              <td style="padding:26px 30px;background:#edf5ff;border-bottom:4px solid #d3a62c">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="82" valign="middle">
                      <img src="${logoUrl}" width="68" height="68" alt="Quantum YiJing International Academy" style="display:block;width:68px;height:68px;object-fit:contain;border:0">
                    </td>
                    <td valign="middle">
                      <div style="font-size:21px;line-height:1.2;font-weight:800;color:#082b63">Quantum YiJing</div>
                      <div style="margin-top:4px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:2px;color:#45688f">INTERNATIONAL ACADEMY</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 34px 18px">
                <div style="font-size:12px;font-weight:800;letter-spacing:1.7px;color:#1768c4;text-transform:uppercase">Enquiry confirmation</div>
                <h1 style="margin:10px 0 22px;font-size:27px;line-height:1.28;color:#0b2f66">Thank you for contacting us</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75">Dear ${safeName},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75">Thank you for contacting <strong>${ACADEMY_NAME}</strong>. Your enquiry has been received successfully, and we will normally reply within <strong>1–2 working days</strong>.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#f7faff;border:1px solid #dce8f6;border-radius:12px">
                  <tr><td style="padding:13px 16px;color:#58708d;font-size:13px;width:145px">Reference</td><td style="padding:13px 16px;font-size:13px;font-weight:700;color:#173b63">${safeReference}</td></tr>
                  <tr><td style="padding:13px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Area of interest</td><td style="padding:13px 16px;font-size:13px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">${safeInterest}</td></tr>
                  <tr><td style="padding:13px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Received</td><td style="padding:13px 16px;font-size:13px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">${safeSubmitted}</td></tr>
                </table>
                <p style="margin:24px 0 0;font-size:15px;line-height:1.75">Warm regards,<br><strong>Master Chew Wai Soon</strong><br><span style="color:#526a85">Founder &amp; Chief Instructor</span></p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 34px 26px">
                <div style="border-top:1px solid #dce7f4;padding-top:26px">
                  <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#1768c4">咨询确认</div>
                  <h2 style="margin:10px 0 20px;font-size:23px;line-height:1.4;color:#0b2f66">感谢您联系我们</h2>
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.85">尊敬的 ${safeName}：</p>
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.85">感谢您联系<strong>量子易经国际学院</strong>。我们已成功收到您的咨询，一般会在 <strong>1–2 个工作日内</strong>回复。</p>
                  <p style="margin:24px 0 0;font-size:15px;line-height:1.85">敬祝安好！<br><strong>赵辉顺导师</strong><br><span style="color:#526a85">创办人｜首席导师</span></p>
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 26px;background:#f7f9fc;border-top:1px solid #e0e8f2;color:#5d7189;font-size:12px;line-height:1.8">
                <a href="https://quantumyijing.com" style="color:#1768c4;text-decoration:none;font-weight:700">quantumyijing.com</a>
                &nbsp;&nbsp;•&nbsp;&nbsp;
                <a href="mailto:info@quantumyijing.com" style="color:#1768c4;text-decoration:none;font-weight:700">info@quantumyijing.com</a><br>
                <span style="color:#7a8ca2">Where Ancient Wisdom Meets Modern Scientific Thinking</span><br>
                <span style="color:#9aa8b8">© ${new Date().getFullYear()} Quantum YiJing International Academy</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function internalHtml(data, meta) {
  const row = (label, value) => `<tr><td style="padding:10px 13px;background:#f5f8fc;font-weight:700;width:155px;color:#315274;border-bottom:1px solid #e2eaf3">${label}</td><td style="padding:10px 13px;border-bottom:1px solid #e2eaf3;color:#17243a">${escapeHtml(value || '—')}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,'Noto Sans SC',sans-serif;color:#17243a"><div style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #dce7f4;border-radius:16px;overflow:hidden"><div style="padding:22px 26px;background:#edf5ff;border-bottom:4px solid #d3a62c"><div style="font-size:12px;font-weight:800;letter-spacing:1.6px;color:#1768c4">QUANTUM YIJING INTERNATIONAL ACADEMY</div><h2 style="margin:8px 0 0;color:#0b2f66">New Website Enquiry</h2></div><div style="padding:26px"><p style="margin:0 0 18px;color:#526a85">Reference: <strong style="color:#173b63">${escapeHtml(meta.reference)}</strong></p><table style="border-collapse:separate;border-spacing:0;width:100%;border:1px solid #e2eaf3;border-radius:10px;overflow:hidden">${row('Name',data.name)}${row('Email',data.email)}${row('WhatsApp / Phone',data.phone)}${row('Country',data.country)}${row('Interest',data.interest)}${row('Language',data.language === 'zh' ? 'Chinese' : 'English')}${row('Marketing Source',data.marketingSource || 'Website')}${row('Campaign',data.campaignCode || '—')}${row('Affiliate',data.affiliateCode || '—')}${row('Submitted',meta.submitted)}${row('Message',data.message)}</table><p style="margin:20px 0 0;font-size:12px;color:#71839a">Submitted through quantumyijing.com. Reply directly to this email to contact the enquirer.</p></div></div></body></html>`;
}

export async function onRequestPost(context) {
  if (!context.env.RESEND_API_KEY) return json({ error: 'Email service is not configured.' }, 503);

  const contentType = context.request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return json({ error: 'Unsupported content type.' }, 415);

  let body;
  try { body = await context.request.json(); }
  catch { return json({ error: 'Invalid request.' }, 400); }

  // Honeypot: bots often fill hidden fields. Return success without sending.
  if (clean(body.website, 200)) return json({ ok: true });

  const data = {
    name: clean(body.name, 100),
    email: clean(body.email, 160).toLowerCase(),
    phone: clean(body.phone, 60),
    country: clean(body.country, 80),
    interest: clean(body.interest, 100),
    message: clean(body.message, 3000),
    language: body.language === 'zh' ? 'zh' : 'en'
  };

  const attribution = {
    marketingSource: clean(body.marketingSource, 80) || 'Website',
    campaignCode: clean(body.campaignCode, 100),
    landingPage: clean(body.landingPage, 200),
    referrer: clean(body.referrer, 400),
    utmSource: clean(body.utmSource, 100),
    utmMedium: clean(body.utmMedium, 100),
    utmCampaign: clean(body.utmCampaign, 100),
    utmContent: clean(body.utmContent, 120),
    utmTerm: clean(body.utmTerm, 120),
    affiliateCode: clean(body.affiliateCode, 80),
    productId: Number(body.productId || 0),
    productSlug: clean(body.productSlug, 120),
    createOrder: body.createOrder === true || body.createOrder === 'true',
    displayCurrency: clean(body.displayCurrency, 10),
    displayExchangeRate: Number(body.displayExchangeRate || 0),
    displayAmount: Number(body.displayAmount || 0)
  };

  const allowedInterests = new Set(['General Enquiry','Academy Course','Bazi Consultation','Feng Shui Consultation','Baby Naming','Research Collaboration','Media / Speaking','Other']);
  const startedAt = Number(body.startedAt || 0);
  const elapsed = Date.now() - startedAt;

  if (!data.name || !validEmail(data.email) || !allowedInterests.has(data.interest) || data.message.length < 10 || body.consent !== 'on') {
    return json({ error: 'Please complete all required fields.' }, 400);
  }
  if (!Number.isFinite(startedAt) || elapsed < 2500 || elapsed > 86_400_000) {
    return json({ error: 'Please reload the form and try again.' }, 400);
  }

  const now = new Date();
  const submittedAtUtc = now.toISOString();
  const submitted = now.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });
  const submittedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const subjectTag = data.interest.replace(/[^a-zA-Z0-9 /&-]/g, '');
  const reference = `QY-${submittedDate.replaceAll('-', '')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  const meta = { submitted, submittedAtUtc, submittedDate, reference };

  let inserted;
  let orderInfo;
  try {
    // Database/order creation is the primary transaction. Once this succeeds,
    // a temporary email-provider failure must not hide the valid order from checkout.
    inserted = await saveEnquiry(context.env.ENQUIRIES_DB, data, meta);
    await saveAttribution(context.env.ENQUIRIES_DB, inserted?.id, attribution);
    orderInfo = await createProductOrder(context.env.ENQUIRIES_DB, inserted?.id, data, attribution);
  } catch (error) {
    console.error('Enquiry/order persistence failed', error);
    return json({ error: 'Unable to record registration. Please try again.' }, 500);
  }

  const isCourseRegistration = !!orderInfo?.orderReference;

  let emailWarning = false;
  try {
    const emailJobs = [
      sendEmail(context.env.RESEND_API_KEY, {
        from: FROM_ADDRESS,
        to: [INTERNAL_ADDRESS],
        reply_to: data.email,
        subject: isCourseRegistration
          ? `[Course Registration] ${orderInfo?.productName || data.interest} — ${data.name}`
          : `[Website Enquiry] ${subjectTag} — ${data.name}`,
        html: internalHtml({ ...data, ...attribution }, meta),
        text: isCourseRegistration
          ? `New course registration\nReference: ${reference}\nOrder: ${orderInfo?.orderReference || ''}\nProduct: ${orderInfo?.productName || ''}\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone}\nCountry: ${data.country}`
          : `New website enquiry\nReference: ${reference}\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone}\nCountry: ${data.country}\nInterest: ${data.interest}\nMessage: ${data.message}`
      })
    ];

    // IMPORTANT:
    // Only genuine enquiries receive the customer acknowledgement.
    // If an actual course order was created, do NOT send the generic
    // "we will reply within 1–2 working days" email.
    if (!isCourseRegistration) {
      emailJobs.push(
        sendEmail(context.env.RESEND_API_KEY, {
          from: FROM_ADDRESS,
          to: [data.email],
          reply_to: INTERNAL_ADDRESS,
          subject: 'Enquiry Received | 已收到您的咨询',
          html: acknowledgementHtml(data.name, reference, data.interest, submitted),
          text: `Dear ${data.name},\n\nThank you for contacting ${ACADEMY_NAME}. Reference: ${reference}. We have received your enquiry and will normally reply within 1–2 working days.\n\n尊敬的 ${data.name}：\n\n感谢您联系量子易经国际学院。我们已收到您的咨询，一般会在 1–2 个工作日内回复。\n\ninfo@quantumyijing.com`
        })
      );
    }

    await Promise.all(emailJobs);
  } catch (error) {
    emailWarning = true;
    console.error('Email delivery failed after registration/order was recorded', error);
  }

  return json({
    ok: true,
    reference,
    orderReference: orderInfo?.orderReference || '',
    orderTotal: orderInfo?.total ?? null,
    currency: orderInfo?.currency || '',
    emailWarning
  });
}

export function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ error: 'Method not allowed.' }, 405);
}
