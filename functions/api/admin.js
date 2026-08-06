const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

function authorized(request, token) {
  return Boolean(token) && (request.headers.get('authorization') || '') === `Bearer ${token}`;
}

const clean = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const statuses = new Set(['New', 'Contacted', 'Follow-up', 'Converted', 'Closed']);

function requireConfigured(context) {
  if (!context.env.ENQUIRIES_DB) return json({ error: 'Database is not configured.' }, 503);
  if (!context.env.ADMIN_TOKEN) return json({ error: 'Administrator access is not configured.' }, 503);
  if (!authorized(context.request, context.env.ADMIN_TOKEN)) return json({ error: 'Unauthorized.' }, 401);
  return null;
}

function buildFilters(url) {
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
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function stats(context) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const month = today.slice(0, 7);
  const db = context.env.ENQUIRIES_DB;

  const summary = await db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN submitted_date = ? THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN substr(submitted_date, 1, 7) = ? THEN 1 ELSE 0 END) AS this_month,
      SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'Follow-up' THEN 1 ELSE 0 END) AS follow_up,
      SUM(CASE WHEN status = 'Converted' THEN 1 ELSE 0 END) AS converted
    FROM enquiries
  `).bind(today, month).first();
  const byInterest = await db.prepare(`SELECT interest, COUNT(*) AS count FROM enquiries GROUP BY interest ORDER BY count DESC, interest ASC LIMIT 10`).all();
  const byCountry = await db.prepare(`SELECT CASE WHEN trim(country) = '' THEN 'Not specified' ELSE country END AS country, COUNT(*) AS count FROM enquiries GROUP BY CASE WHEN trim(country) = '' THEN 'Not specified' ELSE country END ORDER BY count DESC, country ASC LIMIT 10`).all();
  const monthly = await db.prepare(`SELECT substr(submitted_date, 1, 7) AS month, COUNT(*) AS count FROM enquiries GROUP BY substr(submitted_date, 1, 7) ORDER BY month DESC LIMIT 12`).all();

  return json({
    ok: true,
    summary: {
      total: Number(summary?.total || 0), today: Number(summary?.today || 0),
      thisMonth: Number(summary?.this_month || 0), newCount: Number(summary?.new_count || 0),
      followUp: Number(summary?.follow_up || 0), converted: Number(summary?.converted || 0)
    },
    byInterest: byInterest.results || [], byCountry: byCountry.results || [],
    monthly: (monthly.results || []).reverse()
  });
}

async function enquiries(context, url) {
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') || 25), 10), 100);
  const offset = (page - 1) * pageSize;
  const { where, values } = buildFilters(url);
  const db = context.env.ENQUIRIES_DB;
  const countResult = await db.prepare(`SELECT COUNT(*) AS total FROM enquiries ${where}`).bind(...values).first();
  const result = await db.prepare(`
    SELECT id, reference, submitted_at_malaysia, submitted_date, name, email, phone,
      country, interest, message, language, status, source, follow_up_date, notes, updated_at
    FROM enquiries ${where} ORDER BY id DESC LIMIT ? OFFSET ?
  `).bind(...values, pageSize, offset).all();
  return json({ ok: true, page, pageSize, total: Number(countResult?.total || 0), results: result.results || [] });
}

async function exportCsv(context, url) {
  const { where, values } = buildFilters(url);
  const result = await context.env.ENQUIRIES_DB.prepare(`
    SELECT reference, submitted_date, submitted_at_malaysia, name, email, phone,
      country, interest, message, language, status, follow_up_date, notes, source
    FROM enquiries ${where} ORDER BY id DESC LIMIT 10000
  `).bind(...values).all();
  const headers = ['Reference','Date','Date & Time (Malaysia)','Name','Email','WhatsApp / Phone','Country','Area of Interest','Message','Language','Status','Follow-up Date','Notes','Source'];
  const rows = (result.results || []).map(r => [r.reference,r.submitted_date,r.submitted_at_malaysia,r.name,r.email,r.phone,r.country,r.interest,r.message,r.language === 'zh' ? 'Chinese' : 'English',r.status,r.follow_up_date,r.notes,r.source]);
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="quantum-yijing-crm-${stamp}.csv"`, 'cache-control': 'no-store' } });
}

async function update(context, url) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid enquiry ID.' }, 400);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const status = clean(body.status, 40);
  const notes = clean(body.notes, 4000);
  const followUpDate = clean(body.followUpDate, 10);
  if (!statuses.has(status)) return json({ error: 'Invalid status.' }, 400);
  if (followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) return json({ error: 'Invalid follow-up date.' }, 400);
  const result = await context.env.ENQUIRIES_DB.prepare(`UPDATE enquiries SET status = ?, notes = ?, follow_up_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(status, notes, followUpDate, id).run();
  if (!result.meta?.changes) return json({ error: 'Enquiry not found.' }, 404);
  return json({ ok: true });
}

export async function onRequest(context) {
  const blocked = requireConfigured(context);
  if (blocked) return blocked;
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';
  try {
    if (context.request.method === 'GET' && action === 'stats') return await stats(context);
    if (context.request.method === 'GET' && action === 'enquiries') return await enquiries(context, url);
    if (context.request.method === 'GET' && action === 'export') return await exportCsv(context, url);
    if (context.request.method === 'PATCH' && action === 'update') return await update(context, url);
    return json({ error: 'Unknown admin action.' }, 404);
  } catch (error) {
    console.error('Admin API failed', error);
    return json({ error: 'CRM request failed.' }, 500);
  }
}
