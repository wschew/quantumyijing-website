const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

function authorized(request, token) {
  if (!token) return false;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${token}`;
}

const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);

export async function onRequestGet(context) {
  if (!context.env.ENQUIRIES_DB) return json({ error: 'Database is not configured.' }, 503);
  if (!authorized(context.request, context.env.ADMIN_TOKEN)) return json({ error: 'Unauthorized.' }, 401);

  const url = new URL(context.request.url);
  const q = clean(url.searchParams.get('q'), 160);
  const status = clean(url.searchParams.get('status'), 40);
  const interest = clean(url.searchParams.get('interest'), 100);
  const from = clean(url.searchParams.get('from'), 10);
  const to = clean(url.searchParams.get('to'), 10);
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') || 25), 10), 100);
  const offset = (page - 1) * pageSize;

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

  const countResult = await context.env.ENQUIRIES_DB
    .prepare(`SELECT COUNT(*) AS total FROM enquiries ${where}`)
    .bind(...values)
    .first();

  const result = await context.env.ENQUIRIES_DB.prepare(`
    SELECT id, reference, submitted_at_malaysia, submitted_date, name, email, phone,
           country, interest, message, language, status, source, follow_up_date,
           notes, updated_at
    FROM enquiries
    ${where}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).bind(...values, pageSize, offset).all();

  return json({
    ok: true,
    page,
    pageSize,
    total: Number(countResult?.total || 0),
    results: result.results || []
  });
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ error: 'Method not allowed.' }, 405);
}
