const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function authorized(request, token) {
  return Boolean(token) && (request.headers.get('authorization') || '') === `Bearer ${token}`;
}

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const clean = (value, max = 160) => String(value ?? '').trim().slice(0, max);

export async function onRequestGet(context) {
  if (!context.env.ENQUIRIES_DB) return json({ error: 'Database is not configured.' }, 503);
  if (!authorized(context.request, context.env.ADMIN_TOKEN)) return json({ error: 'Unauthorized.' }, 401);

  const url = new URL(context.request.url);
  const q = clean(url.searchParams.get('q'));
  const status = clean(url.searchParams.get('status'), 40);
  const interest = clean(url.searchParams.get('interest'), 100);
  const from = clean(url.searchParams.get('from'), 10);
  const to = clean(url.searchParams.get('to'), 10);

  const conditions = [];
  const values = [];
  if (q) {
    conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR country LIKE ? OR reference LIKE ? OR message LIKE ?)');
    const like = `%${q}%`;
    values.push(like, like, like, like, like, like);
  }
  if (status) { conditions.push('status = ?'); values.push(status); }
  if (interest) { conditions.push('interest = ?'); values.push(interest); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { conditions.push('submitted_date >= ?'); values.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { conditions.push('submitted_date <= ?'); values.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await context.env.ENQUIRIES_DB.prepare(`
    SELECT reference, submitted_date, submitted_at_malaysia, name, email, phone,
           country, interest, message, language, status, follow_up_date, notes, source
    FROM enquiries
    ${where}
    ORDER BY id DESC
    LIMIT 10000
  `).bind(...values).all();

  const headers = ['Reference','Date','Date & Time (Malaysia)','Name','Email','WhatsApp / Phone',
    'Country','Area of Interest','Message','Language','Status','Follow-up Date','Notes','Source'];
  const rows = (result.results || []).map(r => [r.reference, r.submitted_date,
    r.submitted_at_malaysia, r.name, r.email, r.phone, r.country, r.interest,
    r.message, r.language === 'zh' ? 'Chinese' : 'English', r.status,
    r.follow_up_date, r.notes, r.source]);
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="quantum-yijing-crm-${stamp}.csv"`,
      'cache-control': 'no-store'
    }
  });
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ error: 'Method not allowed.' }, 405);
}
