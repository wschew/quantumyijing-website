function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  return header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : '';
}

function authorized(request, env) {
  return !!env.ADMIN_TOKEN && bearer(request) === env.ADMIN_TOKEN;
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = env.ENQUIRIES_DB;
  if (!db) {
    return json({ error: 'Database binding unavailable' }, 503);
  }

  const summary = await db.prepare(`
    SELECT
      COUNT(*) AS sent,
      SUM(CASE WHEN delivered_at != '' THEN 1 ELSE 0 END) AS delivered,
      SUM(CASE WHEN opened_at != '' THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN clicked_at != '' THEN 1 ELSE 0 END) AS clicked,
      SUM(CASE WHEN problem_type != '' THEN 1 ELSE 0 END) AS problems
    FROM (
      SELECT
        l.id,
        COALESCE(MAX(CASE WHEN ev.event_type='email.delivered' THEN ev.event_at END), '') AS delivered_at,
        COALESCE(MAX(CASE WHEN ev.event_type='email.opened' THEN ev.event_at END), '') AS opened_at,
        COALESCE(MAX(CASE WHEN ev.event_type='email.clicked' THEN ev.event_at END), '') AS clicked_at,
        COALESCE(MAX(CASE WHEN ev.event_type IN ('email.bounced','email.failed','email.suppressed','email.complained') THEN ev.event_type END), '') AS problem_type
      FROM marketing_automation_logs l
      LEFT JOIN marketing_email_events ev ON ev.automation_log_id=l.id
      WHERE l.sequence_code='YJ12-NURTURE' AND l.status='Sent'
      GROUP BY l.id
    ) delivery
  `).first();

  const rows = await db.prepare(`
    SELECT
      l.id AS automation_log_id,
      l.enquiry_id,
      l.step_no,
      l.template_code,
      l.sent_at,
      e.name,
      e.email,
      COALESCE(MAX(CASE WHEN ev.event_type='email.delivered' THEN ev.event_at END), '') AS delivered_at,
      COALESCE(MAX(CASE WHEN ev.event_type='email.opened' THEN ev.event_at END), '') AS opened_at,
      COALESCE(MAX(CASE WHEN ev.event_type='email.clicked' THEN ev.event_at END), '') AS clicked_at,
      COALESCE(MAX(CASE WHEN ev.event_type IN ('email.bounced','email.failed','email.suppressed','email.complained') THEN ev.event_type END), '') AS problem_type,
      COALESCE(MAX(CASE WHEN ev.event_type IN ('email.bounced','email.failed','email.suppressed','email.complained') THEN ev.event_at END), '') AS problem_at
    FROM marketing_automation_logs l
    LEFT JOIN enquiries e ON e.id=l.enquiry_id
    LEFT JOIN marketing_email_events ev ON ev.automation_log_id=l.id
    WHERE l.sequence_code='YJ12-NURTURE' AND l.status='Sent'
    GROUP BY
      l.id,
      l.enquiry_id,
      l.step_no,
      l.template_code,
      l.sent_at,
      e.name,
      e.email
    ORDER BY l.id DESC
    LIMIT 100
  `).all();

  return json({
    ok: true,
    summary: {
      sent: Number(summary?.sent || 0),
      delivered: Number(summary?.delivered || 0),
      opened: Number(summary?.opened || 0),
      clicked: Number(summary?.clicked || 0),
      problems: Number(summary?.problems || 0)
    },
    results: rows.results || []
  });
}
