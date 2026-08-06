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

function acknowledgementHtml(name) {
  const safeName = escapeHtml(name);
  return `<!doctype html><html><body style="margin:0;background:#f3f7fc;font-family:Arial,'Noto Sans SC',sans-serif;color:#17243a"><div style="max-width:680px;margin:0 auto;padding:28px 14px"><div style="background:linear-gradient(135deg,#061b42,#0b5bd3);border-radius:18px 18px 0 0;padding:30px;color:#fff"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9fd0ff">Quantum YiJing</div><h1 style="margin:8px 0 0;font-size:26px">Enquiry Received</h1></div><div style="background:#fff;border-radius:0 0 18px 18px;padding:34px;box-shadow:0 14px 40px rgba(6,33,77,.10)"><p>Dear ${safeName},</p><p>Thank you for contacting <strong>${ACADEMY_NAME}</strong>. We have received your enquiry and will normally reply within <strong>1–2 working days</strong>.</p><p>Your interest in our courses, professional services and research activities is sincerely appreciated.</p><p style="margin-top:28px">Warm regards,<br><strong>Master Chew Wai Soon</strong><br>Founder &amp; Chief Instructor</p><hr style="border:0;border-top:1px solid #dce7f4;margin:30px 0"><p>尊敬的 ${safeName}：</p><p>感谢您联系<strong>量子易经国际学院</strong>。我们已收到您的咨询，一般会在 <strong>1–2 个工作日内</strong>回复。</p><p>感谢您对本学院课程、专业服务与研究工作的关注。</p><p style="margin-top:28px">敬祝安好！<br><strong>赵辉顺导师</strong><br>创办人｜首席导师</p><div style="margin-top:30px;padding:18px;background:#f5f9ff;border-radius:12px;font-size:13px;color:#50657e"><strong>info@quantumyijing.com</strong><br><a href="https://quantumyijing.com" style="color:#0b5bd3">quantumyijing.com</a><br><em>Where Ancient Wisdom Meets Modern Scientific Thinking</em></div></div></div></body></html>`;
}

function internalHtml(data, meta) {
  const row = (label, value) => `<tr><td style="padding:9px 12px;background:#f3f7fc;font-weight:bold;width:150px">${label}</td><td style="padding:9px 12px;border-bottom:1px solid #e4ecf6">${escapeHtml(value || '—')}</td></tr>`;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17243a"><h2 style="color:#073b8c">New Website Enquiry</h2><table style="border-collapse:collapse;width:100%;max-width:760px">${row('Name',data.name)}${row('Email',data.email)}${row('WhatsApp / Phone',data.phone)}${row('Country',data.country)}${row('Interest',data.interest)}${row('Language',data.language === 'zh' ? 'Chinese' : 'English')}${row('Submitted',meta.submitted)}${row('Message',data.message)}</table><p style="font-size:12px;color:#71839a">Submitted through quantumyijing.com. Reply directly to this message to contact the enquirer.</p></body></html>`;
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

  const allowedInterests = new Set(['General Enquiry','Academy Course','Bazi Consultation','Feng Shui Consultation','Baby Naming','Research Collaboration','Media / Speaking','Other']);
  const startedAt = Number(body.startedAt || 0);
  const elapsed = Date.now() - startedAt;

  if (!data.name || !validEmail(data.email) || !allowedInterests.has(data.interest) || data.message.length < 10 || body.consent !== 'on') {
    return json({ error: 'Please complete all required fields.' }, 400);
  }
  if (!Number.isFinite(startedAt) || elapsed < 2500 || elapsed > 86_400_000) {
    return json({ error: 'Please reload the form and try again.' }, 400);
  }

  const submitted = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });
  const subjectTag = data.interest.replace(/[^a-zA-Z0-9 /&-]/g, '');

  try {
    await Promise.all([
      sendEmail(context.env.RESEND_API_KEY, {
        from: FROM_ADDRESS,
        to: [INTERNAL_ADDRESS],
        reply_to: data.email,
        subject: `[Website Enquiry] ${subjectTag} — ${data.name}`,
        html: internalHtml(data, { submitted }),
        text: `New website enquiry\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone}\nCountry: ${data.country}\nInterest: ${data.interest}\nMessage: ${data.message}`
      }),
      sendEmail(context.env.RESEND_API_KEY, {
        from: FROM_ADDRESS,
        to: [data.email],
        reply_to: INTERNAL_ADDRESS,
        subject: 'Enquiry Received | 已收到您的咨询',
        html: acknowledgementHtml(data.name),
        text: `Dear ${data.name},\n\nThank you for contacting ${ACADEMY_NAME}. We have received your enquiry and will normally reply within 1–2 working days.\n\n尊敬的 ${data.name}：\n\n感谢您联系量子易经国际学院。我们已收到您的咨询，一般会在 1–2 个工作日内回复。\n\ninfo@quantumyijing.com`
      })
    ]);
    return json({ ok: true });
  } catch (error) {
    console.error('Email delivery failed', error);
    return json({ error: 'Email delivery failed.' }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ error: 'Method not allowed.' }, 405);
}
