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
const lifecycleStages = new Set(['Lead', 'Prospect', 'Registered', 'Active Student', 'Graduate', 'Alumni', 'Closed']);
const activityTypes = new Set(['Call','WhatsApp','Email','Meeting','Brochure Sent','Payment','Course','Note','System','Enquiry']);

function malaysiaNow() {
  return new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });
}
function malaysiaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kuala_Lumpur', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}

function requireConfigured(context) {
  if (!context.env.ENQUIRIES_DB) return json({ error: 'Database is not configured.' }, 503);
  if (!context.env.ADMIN_TOKEN) return json({ error: 'Administrator access is not configured.' }, 503);
  if (!authorized(context.request, context.env.ADMIN_TOKEN)) return json({ error: 'Unauthorized.' }, 401);
  return null;
}

function buildFilters(url) {
  const q = clean(url.searchParams.get('q'));
  const status = clean(url.searchParams.get('status'), 40);
  const lifecycle = clean(url.searchParams.get('lifecycle'), 40);
  const interest = clean(url.searchParams.get('interest'), 100);
  const from = clean(url.searchParams.get('from'), 10);
  const to = clean(url.searchParams.get('to'), 10);
  const conditions = [];
  const values = [];
  if (q) {
    conditions.push('(e.name LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.country LIKE ? OR e.reference LIKE ? OR e.message LIKE ? OR s.student_id LIKE ?)');
    const like = `%${q}%`;
    values.push(like, like, like, like, like, like, like);
  }
  if (status) { conditions.push('e.status = ?'); values.push(status); }
  if (lifecycle) { conditions.push('e.lifecycle_stage = ?'); values.push(lifecycle); }
  if (interest) { conditions.push('e.interest = ?'); values.push(interest); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { conditions.push('e.submitted_date >= ?'); values.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { conditions.push('e.submitted_date <= ?'); values.push(to); }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function stats(context) {
  const today = malaysiaDate();
  const db = context.env.ENQUIRIES_DB;
  const summary = await db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN e.status = 'New' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN e.lifecycle_stage = 'Prospect' THEN 1 ELSE 0 END) AS interested,
      SUM(CASE WHEN e.lifecycle_stage IN ('Registered','Active Student') THEN 1 ELSE 0 END) AS students,
      SUM(CASE WHEN e.lifecycle_stage IN ('Graduate','Alumni') THEN 1 ELSE 0 END) AS alumni,
      SUM(CASE WHEN e.follow_up_date != '' AND e.follow_up_date <= ? AND e.status != 'Closed' AND e.lifecycle_stage != 'Closed' THEN 1 ELSE 0 END) AS due
    FROM enquiries e
  `).bind(today).first();

  const tasks = await db.prepare(`
    SELECT e.id, e.name, e.interest, e.follow_up_date,
      CASE WHEN e.follow_up_date < ? THEN 1 ELSE 0 END AS is_overdue,
      s.student_id
    FROM enquiries e
    LEFT JOIN students s ON s.enquiry_id = e.id
    WHERE e.follow_up_date != '' AND e.follow_up_date <= ?
      AND e.status != 'Closed' AND e.lifecycle_stage != 'Closed'
    ORDER BY e.follow_up_date ASC, e.id DESC LIMIT 12
  `).bind(today, today).all();

  const byLifecycle = await db.prepare(`SELECT lifecycle_stage, COUNT(*) AS count FROM enquiries GROUP BY lifecycle_stage ORDER BY count DESC, lifecycle_stage ASC`).all();
  const byInterest = await db.prepare(`SELECT interest, COUNT(*) AS count FROM enquiries GROUP BY interest ORDER BY count DESC, interest ASC LIMIT 10`).all();
  const byCountry = await db.prepare(`SELECT CASE WHEN trim(country) = '' THEN 'Not specified' ELSE country END AS country, COUNT(*) AS count FROM enquiries GROUP BY CASE WHEN trim(country) = '' THEN 'Not specified' ELSE country END ORDER BY count DESC, country ASC LIMIT 10`).all();
  const monthly = await db.prepare(`SELECT substr(submitted_date, 1, 7) AS month, COUNT(*) AS count FROM enquiries GROUP BY substr(submitted_date, 1, 7) ORDER BY month DESC LIMIT 12`).all();

  return json({
    ok: true,
    summary: {
      total: Number(summary?.total || 0), newCount: Number(summary?.new_count || 0),
      interested: Number(summary?.interested || 0), students: Number(summary?.students || 0),
      alumni: Number(summary?.alumni || 0), followUpsDue: Number(summary?.due || 0)
    },
    tasks: tasks.results || [], byLifecycle: byLifecycle.results || [], byInterest: byInterest.results || [],
    byCountry: byCountry.results || [], monthly: (monthly.results || []).reverse()
  });
}

async function enquiries(context, url) {
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') || 25), 10), 100);
  const offset = (page - 1) * pageSize;
  const { where, values } = buildFilters(url);
  const db = context.env.ENQUIRIES_DB;
  const baseJoin = `FROM enquiries e LEFT JOIN students s ON s.enquiry_id = e.id`;
  const countResult = await db.prepare(`SELECT COUNT(*) AS total ${baseJoin} ${where}`).bind(...values).first();
  const result = await db.prepare(`
    SELECT e.id, e.reference, e.submitted_at_malaysia, e.submitted_date, e.name, e.email, e.phone,
      e.country, e.interest, e.message, e.language, e.status, e.source, e.follow_up_date, e.notes,
      e.lifecycle_stage, e.updated_at, s.student_id, s.programme
    ${baseJoin} ${where} ORDER BY e.id DESC LIMIT ? OFFSET ?
  `).bind(...values, pageSize, offset).all();
  return json({ ok: true, page, pageSize, total: Number(countResult?.total || 0), results: result.results || [] });
}

async function detail(context, url) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid enquiry ID.' }, 400);
  const enquiry = await context.env.ENQUIRIES_DB.prepare(`
    SELECT e.*, s.student_id, s.programme, s.enrolled_date, s.graduated_date
    FROM enquiries e LEFT JOIN students s ON s.enquiry_id = e.id WHERE e.id = ?
  `).bind(id).first();
  if (!enquiry) return json({ error: 'Enquiry not found.' }, 404);
  const activities = await context.env.ENQUIRIES_DB.prepare(`
    SELECT id, activity_type, description, activity_date, created_at
    FROM crm_activities WHERE enquiry_id = ? ORDER BY id DESC LIMIT 100
  `).bind(id).all();
  return json({ ok: true, enquiry, activities: activities.results || [] });
}

async function update(context, url) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid enquiry ID.' }, 400);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const status = clean(body.status, 40);
  const lifecycleStage = clean(body.lifecycleStage, 40);
  const notes = clean(body.notes, 4000);
  const followUpDate = clean(body.followUpDate, 10);
  if (!statuses.has(status)) return json({ error: 'Invalid CRM status.' }, 400);
  if (!lifecycleStages.has(lifecycleStage)) return json({ error: 'Invalid lifecycle stage.' }, 400);
  if (followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) return json({ error: 'Invalid follow-up date.' }, 400);

  const current = await context.env.ENQUIRIES_DB.prepare(`SELECT status,lifecycle_stage,follow_up_date,notes FROM enquiries WHERE id = ?`).bind(id).first();
  if (!current) return json({ error: 'Enquiry not found.' }, 404);
  await context.env.ENQUIRIES_DB.prepare(`UPDATE enquiries SET status=?, lifecycle_stage=?, notes=?, follow_up_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,lifecycleStage,notes,followUpDate,id).run();

  const changes = [];
  if (current.status !== status) changes.push(`CRM status changed from ${current.status} to ${status}.`);
  if (current.lifecycle_stage !== lifecycleStage) changes.push(`Lifecycle changed from ${current.lifecycle_stage} to ${lifecycleStage}.`);
  if ((current.follow_up_date || '') !== followUpDate) changes.push(followUpDate ? `Follow-up scheduled for ${followUpDate}.` : 'Follow-up date cleared.');
  if ((current.notes || '') !== notes) changes.push('Private notes updated.');
  if (changes.length) await context.env.ENQUIRIES_DB.prepare(`INSERT INTO crm_activities (enquiry_id,activity_type,description,activity_date) VALUES (?,?,?,?)`).bind(id,'System',changes.join(' '),malaysiaNow()).run();
  return json({ ok: true });
}

async function convert(context, url) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid enquiry ID.' }, 400);
  const db = context.env.ENQUIRIES_DB;
  const enquiry = await db.prepare(`SELECT * FROM enquiries WHERE id = ?`).bind(id).first();
  if (!enquiry) return json({ error: 'Enquiry not found.' }, 404);
  const existing = await db.prepare(`SELECT student_id FROM students WHERE enquiry_id = ?`).bind(id).first();
  if (existing) return json({ ok: true, studentId: existing.student_id });

  const year = new Date().toLocaleString('en-US', { timeZone:'Asia/Kuala_Lumpur', year:'numeric' });
  const maxRow = await db.prepare(`SELECT MAX(id) AS max_id FROM students`).first();
  const next = Number(maxRow?.max_id || 0) + 1;
  const studentId = `QY${year}-${String(next).padStart(4,'0')}`;
  const enrolledDate = malaysiaDate();

  await db.batch([
    db.prepare(`INSERT INTO students (enquiry_id,student_id,name,email,phone,country,programme,lifecycle_stage,enrolled_date,private_notes) VALUES (?,?,?,?,?,?,?,'Registered',?,?)`).bind(id,studentId,enquiry.name,enquiry.email,enquiry.phone,enquiry.country,enquiry.interest,enrolledDate,enquiry.notes || ''),
    db.prepare(`UPDATE enquiries SET status='Converted', lifecycle_stage='Registered', follow_up_date='', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),
    db.prepare(`INSERT INTO crm_activities (enquiry_id,activity_type,description,activity_date) VALUES (?,'Course',?,?)`).bind(id,`Converted to student. Student ID ${studentId}.`,malaysiaNow())
  ]);
  return json({ ok: true, studentId });
}

async function addActivity(context, url) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid enquiry ID.' }, 400);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const type = clean(body.type, 40);
  const description = clean(body.description, 1000);
  if (!activityTypes.has(type) || !description) return json({ error: 'Please provide a valid activity.' }, 400);
  const exists = await context.env.ENQUIRIES_DB.prepare(`SELECT id FROM enquiries WHERE id=?`).bind(id).first();
  if (!exists) return json({ error: 'Enquiry not found.' }, 404);
  await context.env.ENQUIRIES_DB.batch([
    context.env.ENQUIRIES_DB.prepare(`INSERT INTO crm_activities (enquiry_id,activity_type,description,activity_date) VALUES (?,?,?,?)`).bind(id,type,description,malaysiaNow()),
    context.env.ENQUIRIES_DB.prepare(`UPDATE enquiries SET last_contacted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(malaysiaNow(),id)
  ]);
  return json({ ok: true });
}

async function exportCsv(context, url) {
  const { where, values } = buildFilters(url);
  const result = await context.env.ENQUIRIES_DB.prepare(`
    SELECT e.reference, s.student_id, e.submitted_date, e.submitted_at_malaysia, e.name, e.email, e.phone,
      e.country, e.interest, e.message, e.language, e.status, e.lifecycle_stage, e.follow_up_date,
      e.last_contacted_at, e.notes, e.source
    FROM enquiries e LEFT JOIN students s ON s.enquiry_id=e.id ${where} ORDER BY e.id DESC LIMIT 10000
  `).bind(...values).all();
  const headers = ['Reference','Student ID','Date','Date & Time (Malaysia)','Name','Email','WhatsApp / Phone','Country','Area of Interest','Message','Language','CRM Status','Lifecycle Stage','Follow-up Date','Last Contacted','Notes','Source'];
  const rows = (result.results || []).map(r => [r.reference,r.student_id,r.submitted_date,r.submitted_at_malaysia,r.name,r.email,r.phone,r.country,r.interest,r.message,r.language === 'zh' ? 'Chinese' : 'English',r.status,r.lifecycle_stage,r.follow_up_date,r.last_contacted_at,r.notes,r.source]);
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="quantum-yijing-aos-${stamp}.csv"`, 'cache-control': 'no-store' } });
}

export async function onRequest(context) {
  const blocked = requireConfigured(context);
  if (blocked) return blocked;
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';
  try {
    if (context.request.method === 'GET' && action === 'stats') return await stats(context);
    if (context.request.method === 'GET' && action === 'enquiries') return await enquiries(context, url);
    if (context.request.method === 'GET' && action === 'detail') return await detail(context, url);
    if (context.request.method === 'GET' && action === 'export') return await exportCsv(context, url);
    if (context.request.method === 'PATCH' && action === 'update') return await update(context, url);
    if (context.request.method === 'POST' && action === 'convert') return await convert(context, url);
    if (context.request.method === 'POST' && action === 'activity') return await addActivity(context, url);
    return json({ error: 'Unknown admin action.' }, 404);
  } catch (error) {
    console.error('Admin API failed', error);
    return json({ error: 'Academy Operating System request failed.' }, 500);
  }
}
