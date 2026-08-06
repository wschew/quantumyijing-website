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
  return (request.headers.get('authorization') || '') === `Bearer ${token}`;
}

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const statuses = new Set(['New', 'Contacted', 'Follow-up', 'Converted', 'Closed']);

export async function onRequestPatch(context) {
  if (!context.env.ENQUIRIES_DB) return json({ error: 'Database is not configured.' }, 503);
  if (!authorized(context.request, context.env.ADMIN_TOKEN)) return json({ error: 'Unauthorized.' }, 401);

  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid enquiry ID.' }, 400);

  let body;
  try { body = await context.request.json(); }
  catch { return json({ error: 'Invalid request.' }, 400); }

  const status = clean(body.status, 40);
  const notes = clean(body.notes, 4000);
  const followUpDate = clean(body.followUpDate, 10);
  if (!statuses.has(status)) return json({ error: 'Invalid status.' }, 400);
  if (followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) {
    return json({ error: 'Invalid follow-up date.' }, 400);
  }

  const result = await context.env.ENQUIRIES_DB.prepare(`
    UPDATE enquiries
    SET status = ?, notes = ?, follow_up_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, notes, followUpDate, id).run();

  if (!result.meta?.changes) return json({ error: 'Enquiry not found.' }, 404);
  return json({ ok: true });
}

export function onRequest(context) {
  if (context.request.method === 'PATCH') return onRequestPatch(context);
  return json({ error: 'Method not allowed.' }, 405);
}
