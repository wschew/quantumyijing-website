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
const activityTypes = new Set(['Call','WhatsApp','Email','Meeting','Brochure Sent','Payment','Course','Follow-up','Note','System','Enquiry']);
const priorities = new Set(['Hot','Warm','Normal','Low']);
const contactPreferences = new Set(['Any','Email','WhatsApp','Phone']);

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
  const priority = clean(url.searchParams.get('priority'), 20);
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
  if (priority) { conditions.push('e.priority = ?'); values.push(priority); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { conditions.push('e.submitted_date >= ?'); values.push(from); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { conditions.push('e.submitted_date <= ?'); values.push(to); }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function stats(context) {
  const today = malaysiaDate();
  const db = context.env.ENQUIRIES_DB;
  const summary = await db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN e.follow_up_date != '' AND e.follow_up_date < ? AND e.status != 'Closed' AND e.lifecycle_stage != 'Closed' THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN e.follow_up_date = ? AND e.status != 'Closed' AND e.lifecycle_stage != 'Closed' THEN 1 ELSE 0 END) AS due_today,
      SUM(CASE WHEN e.follow_up_date > ? AND e.follow_up_date <= date(?, '+7 day') AND e.status != 'Closed' AND e.lifecycle_stage != 'Closed' THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN e.priority IN ('Hot','Warm') AND e.status != 'Closed' AND e.lifecycle_stage != 'Closed' THEN 1 ELSE 0 END) AS priority_leads,
      SUM(CASE WHEN e.lifecycle_stage IN ('Registered','Active Student') THEN 1 ELSE 0 END) AS students
    FROM enquiries e
  `).bind(today, today, today, today).first();

  const tasks = await db.prepare(`
    SELECT e.id, e.name, e.interest, e.follow_up_date, e.priority, e.next_action,
      CASE WHEN e.follow_up_date < ? THEN 'Overdue' WHEN e.follow_up_date = ? THEN 'Today' ELSE 'Upcoming' END AS bucket,
      s.student_id
    FROM enquiries e
    LEFT JOIN students s ON s.enquiry_id = e.id
    WHERE e.follow_up_date != '' AND e.follow_up_date <= date(?, '+7 day')
      AND e.status != 'Closed' AND e.lifecycle_stage != 'Closed'
    ORDER BY CASE e.priority WHEN 'Hot' THEN 1 WHEN 'Warm' THEN 2 WHEN 'Normal' THEN 3 ELSE 4 END,
      e.follow_up_date ASC, e.id DESC LIMIT 20
  `).bind(today, today, today).all();

  const byLifecycle = await db.prepare(`SELECT lifecycle_stage, COUNT(*) AS count FROM enquiries GROUP BY lifecycle_stage ORDER BY count DESC, lifecycle_stage ASC`).all();
  const byInterest = await db.prepare(`SELECT interest, COUNT(*) AS count FROM enquiries GROUP BY interest ORDER BY count DESC, interest ASC LIMIT 10`).all();
  const byCountry = await db.prepare(`SELECT CASE WHEN trim(country) = '' THEN 'Not specified' ELSE country END AS country, COUNT(*) AS count FROM enquiries GROUP BY CASE WHEN trim(country) = '' THEN 'Not specified' ELSE country END ORDER BY count DESC, country ASC LIMIT 10`).all();
  const monthly = await db.prepare(`SELECT substr(submitted_date, 1, 7) AS month, COUNT(*) AS count FROM enquiries GROUP BY substr(submitted_date, 1, 7) ORDER BY month DESC LIMIT 12`).all();

  return json({
    ok: true,
    summary: {
      total: Number(summary?.total || 0), overdue: Number(summary?.overdue || 0),
      dueToday: Number(summary?.due_today || 0), upcoming: Number(summary?.upcoming || 0),
      priorityLeads: Number(summary?.priority_leads || 0), students: Number(summary?.students || 0)
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
      e.lifecycle_stage, e.priority, e.next_action, e.tags, e.contact_preference, e.last_contacted_at, e.updated_at, s.student_id, s.programme
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
  const priority = clean(body.priority, 20) || 'Normal';
  const nextAction = clean(body.nextAction, 300);
  const tags = clean(body.tags, 300);
  const contactPreference = clean(body.contactPreference, 20) || 'Any';
  if (!statuses.has(status)) return json({ error: 'Invalid CRM status.' }, 400);
  if (!lifecycleStages.has(lifecycleStage)) return json({ error: 'Invalid lifecycle stage.' }, 400);
  if (followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) return json({ error: 'Invalid follow-up date.' }, 400);
  if (!priorities.has(priority)) return json({ error: 'Invalid priority.' }, 400);
  if (!contactPreferences.has(contactPreference)) return json({ error: 'Invalid contact preference.' }, 400);

  const current = await context.env.ENQUIRIES_DB.prepare(`SELECT status,lifecycle_stage,follow_up_date,notes,priority,next_action,tags,contact_preference FROM enquiries WHERE id = ?`).bind(id).first();
  if (!current) return json({ error: 'Enquiry not found.' }, 404);
  await context.env.ENQUIRIES_DB.prepare(`UPDATE enquiries SET status=?, lifecycle_stage=?, priority=?, contact_preference=?, notes=?, follow_up_date=?, next_action=?, tags=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,lifecycleStage,priority,contactPreference,notes,followUpDate,nextAction,tags,id).run();

  const changes = [];
  if (current.status !== status) changes.push(`CRM status changed from ${current.status} to ${status}.`);
  if (current.lifecycle_stage !== lifecycleStage) changes.push(`Lifecycle changed from ${current.lifecycle_stage} to ${lifecycleStage}.`);
  if ((current.follow_up_date || '') !== followUpDate) changes.push(followUpDate ? `Follow-up scheduled for ${followUpDate}.` : 'Follow-up date cleared.');
  if ((current.notes || '') !== notes) changes.push('Private notes updated.');
  if ((current.priority || 'Normal') !== priority) changes.push(`Priority changed from ${current.priority || 'Normal'} to ${priority}.`);
  if ((current.contact_preference || 'Any') !== contactPreference) changes.push(`Preferred contact changed to ${contactPreference}.`);
  if ((current.next_action || '') !== nextAction) changes.push(nextAction ? `Next action: ${nextAction}.` : 'Next action cleared.');
  if ((current.tags || '') !== tags) changes.push('Tags updated.');
  if (changes.length) await context.env.ENQUIRIES_DB.prepare(`INSERT INTO crm_activities (enquiry_id,activity_type,description,activity_date) VALUES (?,?,?,?)`).bind(id,'System',changes.join(' '),malaysiaNow()).run();
  return json({ ok: true });
}

async function quickFollowUp(context, url) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid enquiry ID.' }, 400);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const days = Number(body.days);
  if (![0,1,3,7].includes(days)) return json({ error: 'Invalid follow-up interval.' }, 400);
  const db = context.env.ENQUIRIES_DB;
  const current = await db.prepare(`SELECT id,name,status,lifecycle_stage,next_action FROM enquiries WHERE id=?`).bind(id).first();
  if (!current) return json({ error: 'Enquiry not found.' }, 404);
  const now = malaysiaNow();
  let followUpDate = '';
  if (days > 0) {
    const base = new Date(`${malaysiaDate()}T12:00:00+08:00`);
    base.setDate(base.getDate() + days);
    followUpDate = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kuala_Lumpur', year:'numeric', month:'2-digit', day:'2-digit' }).format(base);
  }
  const nextStatus = days > 0 && current.status !== 'Converted' ? 'Follow-up' : (current.status === 'New' ? 'Contacted' : current.status);
  const description = days > 0 ? `Contact recorded. Next follow-up scheduled for ${followUpDate}${current.next_action ? ` · ${current.next_action}` : ''}.` : 'Contact recorded. Follow-up date cleared.';
  await db.batch([
    db.prepare(`UPDATE enquiries SET status=?, follow_up_date=?, last_contacted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nextStatus, followUpDate, now, id),
    db.prepare(`INSERT INTO crm_activities (enquiry_id,activity_type,description,activity_date) VALUES (?,'Follow-up',?,?)`).bind(id,description,now)
  ]);
  return json({ ok:true, followUpDate });
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
      e.country, e.interest, e.message, e.language, e.status, e.lifecycle_stage, e.priority, e.contact_preference,
      e.follow_up_date, e.next_action, e.last_contacted_at, e.tags, e.notes, e.source
    FROM enquiries e LEFT JOIN students s ON s.enquiry_id=e.id ${where} ORDER BY e.id DESC LIMIT 10000
  `).bind(...values).all();
  const headers = ['Reference','Student ID','Date','Date & Time (Malaysia)','Name','Email','WhatsApp / Phone','Country','Area of Interest','Message','Language','CRM Status','Lifecycle Stage','Priority','Preferred Contact','Follow-up Date','Next Action','Last Contacted','Tags','Notes','Source'];
  const rows = (result.results || []).map(r => [r.reference,r.student_id,r.submitted_date,r.submitted_at_malaysia,r.name,r.email,r.phone,r.country,r.interest,r.message,r.language === 'zh' ? 'Chinese' : 'English',r.status,r.lifecycle_stage,r.priority,r.contact_preference,r.follow_up_date,r.next_action,r.last_contacted_at,r.tags,r.notes,r.source]);
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
    if (context.request.method === 'POST' && action === 'quickfollowup') return await quickFollowUp(context, url);
    if (context.request.method === 'POST' && action === 'convert') return await convert(context, url);
    if (context.request.method === 'POST' && action === 'activity') return await addActivity(context, url);
    return json({ error: 'Unknown admin action.' }, 404);
  } catch (error) {
    console.error('Admin API failed', error);
    return json({ error: 'Academy Operating System request failed.' }, 500);
  }
}
