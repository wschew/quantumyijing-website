function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function malaysiaNow() {
  return new Date().toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

const RESOURCES = {
  'd3-test-guide': {
    url: '/lead/resources/test-guide.pdf',
    label: 'test-guide.pdf'
  }
};

export async function onRequestPost(context) {
  const db = context.env.ENQUIRIES_DB;

  if (!db) {
    return json({ ok: false, error: 'Database unavailable.' }, 503);
  }

  let body;

  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }

  const reference = String(body.reference || '').trim().slice(0, 80);
  const offer = String(body.offer || '').trim().slice(0, 80);

  const resource = RESOURCES[offer];

  if (!reference || !resource) {
    return json({ ok: false, error: 'Invalid download request.' }, 400);
  }

  const enquiry = await db.prepare(`
    SELECT id
    FROM enquiries
    WHERE reference = ?
    LIMIT 1
  `).bind(reference).first();

  if (!enquiry?.id) {
    return json({ ok: false, error: 'Enquiry not found.' }, 404);
  }

  await db.prepare(`
    INSERT INTO crm_activities (
      enquiry_id,
      activity_type,
      description,
      activity_date
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    enquiry.id,
    'Lead Magnet Download',
    'Downloaded lead magnet: ' + offer + ' (' + resource.label + ')',
    malaysiaNow()
  ).run();

  return json({
    ok: true,
    url: resource.url
  });
}

export function onRequest(context) {
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }

  return json({ ok: false, error: 'Method not allowed.' }, 405);
}
