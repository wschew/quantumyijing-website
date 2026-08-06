const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function authorized(request, token) {
  return Boolean(token) && (request.headers.get('authorization') || '') === `Bearer ${token}`;
}

export async function onRequestGet(context) {
  if (!context.env.ENQUIRIES_DB) return json({ error: 'Database is not configured.' }, 503);
  if (!authorized(context.request, context.env.ADMIN_TOKEN)) return json({ error: 'Unauthorized.' }, 401);

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const month = today.slice(0, 7);

  const summary = await context.env.ENQUIRIES_DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN submitted_date = ? THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN substr(submitted_date, 1, 7) = ? THEN 1 ELSE 0 END) AS this_month,
      SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'Follow-up' THEN 1 ELSE 0 END) AS follow_up,
      SUM(CASE WHEN status = 'Converted' THEN 1 ELSE 0 END) AS converted
    FROM enquiries
  `).bind(today, month).first();

  const byInterest = await context.env.ENQUIRIES_DB.prepare(`
    SELECT interest, COUNT(*) AS count
    FROM enquiries
    GROUP BY interest
    ORDER BY count DESC, interest ASC
    LIMIT 10
  `).all();

  const byCountry = await context.env.ENQUIRIES_DB.prepare(`
    SELECT CASE WHEN trim(country) = '' THEN 'Not specified' ELSE country END AS country,
           COUNT(*) AS count
    FROM enquiries
    GROUP BY CASE WHEN trim(country) = '' THEN 'Not specified' ELSE country END
    ORDER BY count DESC, country ASC
    LIMIT 10
  `).all();

  const monthly = await context.env.ENQUIRIES_DB.prepare(`
    SELECT substr(submitted_date, 1, 7) AS month, COUNT(*) AS count
    FROM enquiries
    GROUP BY substr(submitted_date, 1, 7)
    ORDER BY month DESC
    LIMIT 12
  `).all();

  return json({
    ok: true,
    summary: {
      total: Number(summary?.total || 0),
      today: Number(summary?.today || 0),
      thisMonth: Number(summary?.this_month || 0),
      newCount: Number(summary?.new_count || 0),
      followUp: Number(summary?.follow_up || 0),
      converted: Number(summary?.converted || 0)
    },
    byInterest: byInterest.results || [],
    byCountry: byCountry.results || [],
    monthly: (monthly.results || []).reverse()
  });
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ error: 'Method not allowed.' }, 405);
}
