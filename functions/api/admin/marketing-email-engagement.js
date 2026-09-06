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

function clean(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function latestReplyPreview(value) {
  let text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();

  const separators = [
    /\n\s*On[\s\S]{0,500}?wrote:\s*(?:\n|$)/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}\s*(?:\n|$)/i,
    /\n\s*From:\s.+(?:\n|$)/i,
    /\n\s*_{5,}\s*(?:\n|$)/
  ];

  let cutAt = text.length;
  for (const separator of separators) {
    const match = separator.exec(text);
    if (match && match.index < cutAt) cutAt = match.index;
  }

  text = text.slice(0, cutAt)
    .split('\n')
    .filter(line => !/^\s*>/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean(text || '[HTML email reply]', 500);
}

function engagementRecommendation(row) {
  const base = {
    enquiry_id: Number(row.enquiry_id || 0),
    automation_id: Number(row.automation_id || 0),
    name: clean(row.name, 200),
    email: clean(row.email, 320),
    reference: clean(row.reference, 100),
    automation_status: clean(row.automation_status, 30),
    current_step: Number(row.current_step || 0),
    next_send_at: clean(row.next_send_at, 30),
    last_event_at: clean(
      row.reply_at || row.problem_at || row.clicked_at ||
      row.opened_at || row.delivered_at || row.sent_at,
      30
    )
  };

  if (row.problem_type) {
    return {
      ...base,
      level: 'problem',
      signal: clean(row.problem_type, 60).replace('email.', ''),
      action: 'Do not contact by email. Check or replace the address before any follow-up.',
      timing: 'Stopped',
      follow_up_days: 0
    };
  }

  if (row.reply_at) {
    return {
      ...base,
      level: 'reply',
      signal: Number(row.unread_replies || 0) > 0 ? 'Unread reply' : 'Reply received',
      action: 'Review the customer message and follow up personally.',
      timing: Number(row.unread_replies || 0) > 0 ? 'Now' : 'Today',
      follow_up_days: 0
    };
  }

  if (row.clicked_at) {
    return {
      ...base,
      level: 'clicked',
      signal: 'Clicked',
      action: 'High engagement. Contact the prospect with course details or an enrolment offer.',
      timing: 'Within 1 day',
      follow_up_days: 1
    };
  }

  if (row.opened_at) {
    return {
      ...base,
      level: 'opened',
      signal: 'Opened',
      action: 'Interest detected. Prepare a helpful personal follow-up if there is no further action.',
      timing: 'Within 3 days',
      follow_up_days: 3
    };
  }

  if (row.delivered_at) {
    return {
      ...base,
      level: 'delivered',
      signal: 'Delivered',
      action: 'No engagement yet. Allow the nurture sequence to continue.',
      timing: 'Continue nurture'
    };
  }

  return {
    ...base,
    level: 'waiting',
    signal: 'Sent',
    action: 'Await delivery information before taking action.',
    timing: 'Monitor'
  };
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

  const replySummary = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='Unread' THEN 1 ELSE 0 END) AS unread
    FROM marketing_email_replies
    WHERE enquiry_id IS NOT NULL
  `).first();

  const replies = await db.prepare(`
    SELECT
      r.id,
      r.enquiry_id,
      r.automation_id,
      r.automation_log_id,
      r.from_email,
      r.to_email,
      r.subject,
      SUBSTR(r.text_body, 1, 5000) AS preview_source,
      r.received_at,
      r.status,
      e.name,
      e.reference
    FROM marketing_email_replies r
    LEFT JOIN enquiries e ON e.id=r.enquiry_id
    WHERE r.enquiry_id IS NOT NULL
    ORDER BY r.id DESC
    LIMIT 100
  `).all();

  const recommendationRows = await db.prepare(`
    WITH engagement AS (
      SELECT
        a.id AS automation_id,
        a.enquiry_id,
        a.status AS automation_status,
        a.current_step,
        a.next_send_at,
        MAX(l.sent_at) AS sent_at,
        MAX(CASE WHEN ev.event_type='email.delivered' THEN ev.event_at END) AS delivered_at,
        MAX(CASE WHEN ev.event_type='email.opened' THEN ev.event_at END) AS opened_at,
        MAX(CASE WHEN ev.event_type='email.clicked' THEN ev.event_at END) AS clicked_at,
        MAX(CASE WHEN ev.event_type IN ('email.bounced','email.failed','email.suppressed','email.complained') THEN ev.event_at END) AS problem_at
      FROM marketing_automations a
      LEFT JOIN marketing_automation_logs l ON l.automation_id=a.id
      LEFT JOIN marketing_email_events ev ON ev.automation_log_id=l.id
      WHERE a.sequence_code='YJ12-NURTURE'
      GROUP BY a.id, a.enquiry_id, a.status, a.current_step, a.next_send_at
    ),
    problems AS (
      SELECT
        l.automation_id,
        ev.event_type AS problem_type
      FROM marketing_email_events ev
      JOIN marketing_automation_logs l ON l.id=ev.automation_log_id
      WHERE ev.event_type IN ('email.bounced','email.failed','email.suppressed','email.complained')
        AND ev.id=(
          SELECT ev2.id
          FROM marketing_email_events ev2
          JOIN marketing_automation_logs l2 ON l2.id=ev2.automation_log_id
          WHERE l2.automation_id=l.automation_id
            AND ev2.event_type IN ('email.bounced','email.failed','email.suppressed','email.complained')
          ORDER BY ev2.id DESC
          LIMIT 1
        )
    ),
    replies AS (
      SELECT
        automation_id,
        MAX(received_at) AS reply_at,
        SUM(CASE WHEN status='Unread' THEN 1 ELSE 0 END) AS unread_replies
      FROM marketing_email_replies
      WHERE automation_id IS NOT NULL
      GROUP BY automation_id
    )
    SELECT
      g.*,
      p.problem_type,
      r.reply_at,
      COALESCE(r.unread_replies, 0) AS unread_replies,
      e.name,
      e.email,
      e.reference
    FROM engagement g
    JOIN enquiries e ON e.id=g.enquiry_id
    LEFT JOIN problems p ON p.automation_id=g.automation_id
    LEFT JOIN replies r ON r.automation_id=g.automation_id
    ORDER BY
      CASE
        WHEN p.problem_type IS NOT NULL THEN 1
        WHEN r.reply_at IS NOT NULL THEN 2
        WHEN g.clicked_at IS NOT NULL THEN 3
        WHEN g.opened_at IS NOT NULL THEN 4
        WHEN g.delivered_at IS NOT NULL THEN 5
        ELSE 6
      END,
      COALESCE(r.reply_at, g.problem_at, g.clicked_at, g.opened_at, g.delivered_at, g.sent_at) DESC
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
    results: rows.results || [],
    replySummary: {
      total: Number(replySummary?.total || 0),
      unread: Number(replySummary?.unread || 0)
    },
    replies: (replies.results || []).map(({ preview_source, ...reply }) => ({
      ...reply,
      preview: latestReplyPreview(preview_source)
    })),
    recommendations: (recommendationRows.results || []).map(engagementRecommendation)
  });
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = env.ENQUIRIES_DB;
  if (!db) {
    return json({ error: 'Database binding unavailable' }, 503);
  }

  const action = clean(new URL(request.url).searchParams.get('action'), 30);
  if (action !== 'read') {
    return json({ error: 'Unsupported action' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const replyId = Number(body?.replyId);
  if (!Number.isInteger(replyId) || replyId < 1) {
    return json({ error: 'Valid replyId is required' }, 400);
  }

  const result = await db.prepare(`
    UPDATE marketing_email_replies
    SET status='Read'
    WHERE id=?
  `).bind(replyId).run();

  return json({
    ok: true,
    updated: Number(result?.meta?.changes || 0) > 0
  });
}
