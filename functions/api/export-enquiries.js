const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }
});

const csvCell = value => {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
};

function authorized(request, token) {
  if (!token) return false;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${token}`;
}

export async function onRequestGet(context) {
  if (!context.env.ENQUIRIES_DB) return json({ error: 'Database is not configured.' }, 503);
  if (!authorized(context.request, context.env.ENQUIRY_EXPORT_TOKEN)) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  const url = new URL(context.request.url);
  const from = (url.searchParams.get('from') || '').trim();
  const to = (url.searchParams.get('to') || '').trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 5000), 1), 10000);

  const conditions = [];
  const values = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    conditions.push('submitted_date >= ?');
    values.push(from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    conditions.push('submitted_date <= ?');
    values.push(to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const statement = context.env.ENQUIRIES_DB.prepare(`
    SELECT reference, submitted_date, submitted_at_malaysia, name, email, phone,
           country, interest, message, language, status, source
    FROM enquiries
    ${where}
    ORDER BY id DESC
    LIMIT ?
  `).bind(...values, limit);

  const result = await statement.all();
  const columns = [
    'Reference','Date','Date & Time (Malaysia)','Name','Email','WhatsApp / Phone',
    'Country','Area of Interest','Message','Language','Status','Source'
  ];
  const rows = (result.results || []).map(row => [
    row.reference, row.submitted_date, row.submitted_at_malaysia, row.name,
    row.email, row.phone, row.country, row.interest, row.message,
    row.language === 'zh' ? 'Chinese' : 'English', row.status, row.source
  ]);

  // UTF-8 BOM helps Microsoft Excel display Chinese characters correctly.
  const csv = '\uFEFF' + [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="quantum-yijing-enquiries-${stamp}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ error: 'Method not allowed.' }, 405);
}
