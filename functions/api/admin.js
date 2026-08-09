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
  const source = clean(url.searchParams.get('source'), 100);
  const campaign = clean(url.searchParams.get('campaign'), 120);
  const affiliate = clean(url.searchParams.get('affiliate'), 100);
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
  if (source) { conditions.push('(a.marketing_source = ? OR a.utm_source = ?)'); values.push(source, source); }
  if (campaign) { conditions.push('(a.campaign_code = ? OR a.utm_campaign = ?)'); values.push(campaign, campaign); }
  if (affiliate) { conditions.push('a.affiliate_code = ?'); values.push(affiliate); }
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
  const baseJoin = `FROM enquiries e LEFT JOIN students s ON s.enquiry_id = e.id LEFT JOIN enquiry_attribution a ON a.enquiry_id = e.id`;
  const countResult = await db.prepare(`SELECT COUNT(*) AS total ${baseJoin} ${where}`).bind(...values).first();
  const result = await db.prepare(`
    SELECT e.id, e.reference, e.submitted_at_malaysia, e.submitted_date, e.name, e.email, e.phone,
      e.country, e.interest, e.message, e.language, e.status, e.source, e.follow_up_date, e.notes,
      e.lifecycle_stage, e.priority, e.next_action, e.tags, e.contact_preference, e.last_contacted_at, e.updated_at, s.student_id, s.programme,
      a.marketing_source, a.campaign_code, a.landing_page, a.referrer, a.utm_source, a.utm_medium, a.utm_campaign, a.utm_content, a.utm_term, a.affiliate_code
    ${baseJoin} ${where} ORDER BY e.id DESC LIMIT ? OFFSET ?
  `).bind(...values, pageSize, offset).all();
  return json({ ok: true, page, pageSize, total: Number(countResult?.total || 0), results: result.results || [] });
}

async function detail(context, url) {
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Invalid enquiry ID.' }, 400);
  const enquiry = await context.env.ENQUIRIES_DB.prepare(`
    SELECT e.*, s.student_id, s.programme, s.enrolled_date, s.graduated_date,
      a.marketing_source, a.campaign_code, a.landing_page, a.referrer, a.utm_source, a.utm_medium,
      a.utm_campaign, a.utm_content, a.utm_term, a.affiliate_code
    FROM enquiries e LEFT JOIN students s ON s.enquiry_id = e.id
    LEFT JOIN enquiry_attribution a ON a.enquiry_id = e.id WHERE e.id = ?
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
      e.follow_up_date, e.next_action, e.last_contacted_at, e.tags, e.notes, e.source,
      a.marketing_source, a.utm_source, a.utm_medium, a.utm_campaign, a.utm_content, a.utm_term,
      a.campaign_code, a.affiliate_code, a.landing_page, a.referrer
    FROM enquiries e LEFT JOIN students s ON s.enquiry_id=e.id
    LEFT JOIN enquiry_attribution a ON a.enquiry_id=e.id ${where} ORDER BY e.id DESC LIMIT 10000
  `).bind(...values).all();
  const headers = ['Reference','Student ID','Date','Date & Time (Malaysia)','Name','Email','WhatsApp / Phone','Country','Area of Interest','Message','Language','CRM Status','Lifecycle Stage','Priority','Preferred Contact','Follow-up Date','Next Action','Last Contacted','Tags','Notes','CRM Source','Marketing Source','UTM Source','UTM Medium','UTM Campaign','UTM Content','UTM Term','Campaign Code','Affiliate Code','Landing Page','Referrer'];
  const rows = (result.results || []).map(r => [r.reference,r.student_id,r.submitted_date,r.submitted_at_malaysia,r.name,r.email,r.phone,r.country,r.interest,r.message,r.language === 'zh' ? 'Chinese' : 'English',r.status,r.lifecycle_stage,r.priority,r.contact_preference,r.follow_up_date,r.next_action,r.last_contacted_at,r.tags,r.notes,r.source,r.marketing_source,r.utm_source,r.utm_medium,r.utm_campaign,r.utm_content,r.utm_term,r.campaign_code,r.affiliate_code,r.landing_page,r.referrer]);
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="quantum-yijing-aos-${stamp}.csv"`, 'cache-control': 'no-store' } });
}


async function marketingStats(context) {
  const db = context.env.ENQUIRIES_DB;
  const summary = await db.prepare(`
    SELECT
      COUNT(a.id) AS attributed,
      SUM(CASE WHEN trim(COALESCE(a.utm_campaign,'')) != '' OR trim(COALESCE(a.campaign_code,'')) != '' THEN 1 ELSE 0 END) AS campaign_leads,
      SUM(CASE WHEN trim(COALESCE(a.affiliate_code,'')) != '' THEN 1 ELSE 0 END) AS affiliate_leads,
      SUM(CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END) AS converted_students
    FROM enquiry_attribution a
    JOIN enquiries e ON e.id=a.enquiry_id
    LEFT JOIN students s ON s.enquiry_id=e.id
  `).first();
  const bySource = await db.prepare(`
    SELECT CASE WHEN trim(COALESCE(NULLIF(a.utm_source,''),a.marketing_source,''))='' THEN 'Website' ELSE COALESCE(NULLIF(a.utm_source,''),a.marketing_source) END AS source,
      COUNT(*) AS count, SUM(CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END) AS students
    FROM enquiry_attribution a JOIN enquiries e ON e.id=a.enquiry_id LEFT JOIN students s ON s.enquiry_id=e.id
    GROUP BY source ORDER BY count DESC, source ASC LIMIT 12
  `).all();
  const byCampaign = await db.prepare(`
    SELECT COALESCE(NULLIF(a.utm_campaign,''),NULLIF(a.campaign_code,''),'Unspecified') AS campaign,
      COUNT(*) AS count, SUM(CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END) AS students
    FROM enquiry_attribution a JOIN enquiries e ON e.id=a.enquiry_id LEFT JOIN students s ON s.enquiry_id=e.id
    WHERE trim(COALESCE(a.utm_campaign,a.campaign_code,'')) != ''
    GROUP BY campaign ORDER BY count DESC, campaign ASC LIMIT 12
  `).all();
  const byAffiliate = await db.prepare(`
    SELECT a.affiliate_code AS affiliate, COUNT(*) AS count, SUM(CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END) AS students
    FROM enquiry_attribution a JOIN enquiries e ON e.id=a.enquiry_id LEFT JOIN students s ON s.enquiry_id=e.id
    WHERE trim(a.affiliate_code) != '' GROUP BY a.affiliate_code ORDER BY count DESC, affiliate ASC LIMIT 12
  `).all();
  const byLanding = await db.prepare(`
    SELECT CASE WHEN trim(a.landing_page)='' THEN 'Unknown' ELSE a.landing_page END AS landing_page, COUNT(*) AS count
    FROM enquiry_attribution a GROUP BY CASE WHEN trim(a.landing_page)='' THEN 'Unknown' ELSE a.landing_page END
    ORDER BY count DESC, landing_page ASC LIMIT 12
  `).all();
  const recent = await db.prepare(`
    SELECT e.id,e.reference,e.submitted_date,e.name,e.email,e.interest,e.lifecycle_stage,
      a.marketing_source,a.utm_source,a.utm_medium,a.utm_campaign,a.campaign_code,a.affiliate_code,a.landing_page,
      CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS converted
    FROM enquiry_attribution a JOIN enquiries e ON e.id=a.enquiry_id LEFT JOIN students s ON s.enquiry_id=e.id
    ORDER BY e.id DESC LIMIT 30
  `).all();
  return json({ ok:true, summary:{
    attributed:Number(summary?.attributed||0), campaignLeads:Number(summary?.campaign_leads||0),
    affiliateLeads:Number(summary?.affiliate_leads||0), convertedStudents:Number(summary?.converted_students||0)
  }, bySource:bySource.results||[], byCampaign:byCampaign.results||[], byAffiliate:byAffiliate.results||[], byLanding:byLanding.results||[], recent:recent.results||[] });
}


async function studentStats(context) {
  const db = context.env.ENQUIRIES_DB;
  const summary = await db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN lifecycle_stage='Registered' THEN 1 ELSE 0 END) AS registered,
      SUM(CASE WHEN lifecycle_stage='Active Student' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN lifecycle_stage='Graduate' THEN 1 ELSE 0 END) AS graduates,
      SUM(CASE WHEN lifecycle_stage='Alumni' THEN 1 ELSE 0 END) AS alumni
    FROM students
  `).first();
  const byProgramme = await db.prepare(`
    SELECT CASE WHEN trim(programme)='' THEN 'Not specified' ELSE programme END AS programme, COUNT(*) AS count
    FROM students GROUP BY CASE WHEN trim(programme)='' THEN 'Not specified' ELSE programme END
    ORDER BY count DESC, programme ASC LIMIT 12
  `).all();
  const byCountry = await db.prepare(`
    SELECT CASE WHEN trim(country)='' THEN 'Not specified' ELSE country END AS country, COUNT(*) AS count
    FROM students GROUP BY CASE WHEN trim(country)='' THEN 'Not specified' ELSE country END
    ORDER BY count DESC, country ASC LIMIT 12
  `).all();
  return json({
    ok:true,
    summary:{
      total:Number(summary?.total||0),
      registered:Number(summary?.registered||0),
      active:Number(summary?.active||0),
      graduates:Number(summary?.graduates||0),
      alumni:Number(summary?.alumni||0)
    },
    byProgramme:byProgramme.results||[],
    byCountry:byCountry.results||[]
  });
}

function buildStudentFilters(url) {
  const q = clean(url.searchParams.get('q'));
  const lifecycle = clean(url.searchParams.get('lifecycle'), 40);
  const programme = clean(url.searchParams.get('programme'), 120);
  const conditions = [];
  const values = [];
  if (q) {
    conditions.push('(s.student_id LIKE ? OR s.name LIKE ? OR s.email LIKE ? OR s.phone LIKE ? OR s.country LIKE ? OR s.programme LIKE ?)');
    const like = `%${q}%`;
    values.push(like,like,like,like,like,like);
  }
  if (lifecycle) { conditions.push('s.lifecycle_stage=?'); values.push(lifecycle); }
  if (programme) { conditions.push('s.programme=?'); values.push(programme); }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
}

async function students(context, url) {
  const page = Math.max(Number(url.searchParams.get('page')||1),1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')||25),10),100);
  const offset = (page-1)*pageSize;
  const {where,values}=buildStudentFilters(url);
  const db=context.env.ENQUIRIES_DB;
  const count=await db.prepare(`SELECT COUNT(*) AS total FROM students s ${where}`).bind(...values).first();
  const result=await db.prepare(`
    SELECT s.id,s.enquiry_id,s.student_id,s.name,s.email,s.phone,s.country,s.programme,s.lifecycle_stage,
      s.enrolled_date,s.graduated_date,s.private_notes,s.created_at,s.updated_at,
      e.reference,e.priority,e.contact_preference,e.last_contacted_at
    FROM students s LEFT JOIN enquiries e ON e.id=s.enquiry_id
    ${where}
    ORDER BY s.id DESC LIMIT ? OFFSET ?
  `).bind(...values,pageSize,offset).all();
  return json({ok:true,page,pageSize,total:Number(count?.total||0),results:result.results||[]});
}

async function studentDetail(context, url) {
  const id=Number(url.searchParams.get('id'));
  if(!Number.isInteger(id)||id<1) return json({error:'Invalid student ID.'},400);
  const db=context.env.ENQUIRIES_DB;
  const student=await db.prepare(`
    SELECT s.*,e.reference,e.interest,e.message,e.priority,e.contact_preference,e.last_contacted_at,e.notes AS crm_notes
    FROM students s LEFT JOIN enquiries e ON e.id=s.enquiry_id WHERE s.id=?
  `).bind(id).first();
  if(!student) return json({error:'Student not found.'},404);
  const activities=await db.prepare(`
    SELECT id,activity_type,description,activity_date,created_at
    FROM crm_activities WHERE enquiry_id=? ORDER BY id DESC LIMIT 100
  `).bind(student.enquiry_id).all();
  return json({ok:true,student,activities:activities.results||[]});
}

async function studentUpdate(context, url) {
  const id=Number(url.searchParams.get('id'));
  if(!Number.isInteger(id)||id<1) return json({error:'Invalid student ID.'},400);
  let body;
  try{body=await context.request.json();}catch{return json({error:'Invalid request.'},400);}
  const programme=clean(body.programme,160);
  const lifecycleStage=clean(body.lifecycleStage,40);
  const enrolledDate=clean(body.enrolledDate,10);
  const graduatedDate=clean(body.graduatedDate,10);
  const privateNotes=clean(body.privateNotes,4000);
  const allowed=new Set(['Registered','Active Student','Graduate','Alumni']);
  if(!allowed.has(lifecycleStage)) return json({error:'Invalid student lifecycle stage.'},400);
  if(enrolledDate&&!/^\d{4}-\d{2}-\d{2}$/.test(enrolledDate)) return json({error:'Invalid enrolled date.'},400);
  if(graduatedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(graduatedDate)) return json({error:'Invalid graduated date.'},400);
  const db=context.env.ENQUIRIES_DB;
  const current=await db.prepare(`SELECT * FROM students WHERE id=?`).bind(id).first();
  if(!current) return json({error:'Student not found.'},404);
  await db.batch([
    db.prepare(`UPDATE students SET programme=?,lifecycle_stage=?,enrolled_date=?,graduated_date=?,private_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(programme,lifecycleStage,enrolledDate,graduatedDate,privateNotes,id),
    db.prepare(`UPDATE enquiries SET lifecycle_stage=?,status='Converted',updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(lifecycleStage,current.enquiry_id)
  ]);
  const changes=[];
  if((current.programme||'')!==programme) changes.push(`Programme updated to ${programme||'Not specified'}.`);
  if(current.lifecycle_stage!==lifecycleStage) changes.push(`Student lifecycle changed from ${current.lifecycle_stage} to ${lifecycleStage}.`);
  if((current.enrolled_date||'')!==enrolledDate) changes.push(enrolledDate?`Enrolled date set to ${enrolledDate}.`:'Enrolled date cleared.');
  if((current.graduated_date||'')!==graduatedDate) changes.push(graduatedDate?`Graduated date set to ${graduatedDate}.`:'Graduated date cleared.');
  if((current.private_notes||'')!==privateNotes) changes.push('Student private notes updated.');
  if(changes.length){
    await db.prepare(`INSERT INTO crm_activities (enquiry_id,activity_type,description,activity_date) VALUES (?,'Course',?,?)`)
      .bind(current.enquiry_id,changes.join(' '),malaysiaNow()).run();
  }
  return json({ok:true});
}

async function studentExport(context, url) {
  const {where,values}=buildStudentFilters(url);
  const result=await context.env.ENQUIRIES_DB.prepare(`
    SELECT s.student_id,s.name,s.email,s.phone,s.country,s.programme,s.lifecycle_stage,s.enrolled_date,s.graduated_date,
      s.private_notes,e.reference,e.priority,e.contact_preference
    FROM students s LEFT JOIN enquiries e ON e.id=s.enquiry_id
    ${where} ORDER BY s.id DESC LIMIT 10000
  `).bind(...values).all();
  const headers=['Student ID','Name','Email','WhatsApp / Phone','Country','Programme','Lifecycle Stage','Enrolled Date','Graduated Date','Private Notes','Original Enquiry','Priority','Preferred Contact'];
  const rows=(result.results||[]).map(r=>[r.student_id,r.name,r.email,r.phone,r.country,r.programme,r.lifecycle_stage,r.enrolled_date,r.graduated_date,r.private_notes,r.reference,r.priority,r.contact_preference]);
  const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
  const stamp=new Date().toISOString().slice(0,10);
  return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="quantum-yijing-students-${stamp}.csv"`,'cache-control':'no-store'}});
}


const productTypes = new Set(['course','membership','consultation','ebook','digital','physical','event','other']);
const productStatuses = new Set(['Draft','Active','Inactive','Archived']);
const paymentStatuses = new Set(['Pending','Paid','Failed','Cancelled','Refunded','External']);
const paymentMethods = new Set(['SenangPay','Bank Transfer','Google Play Books','Cash','Manual','Marketplace','Other']);
const verificationStatuses = new Set(['Unverified','Verified','Reconciled']);

async function commerceStats(context) {
  const db=context.env.ENQUIRIES_DB;
  const products=await db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) active FROM products`).first();
  const orders=await db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN payment_status IN ('Paid','External') THEN 1 ELSE 0 END) paid, SUM(CASE WHEN payment_status='Pending' THEN 1 ELSE 0 END) pending FROM orders`).first();
  const moneySummary=await db.prepare(`SELECT
      COALESCE(SUM(gross_amount),0) gross_sales,
      COALESCE(SUM(provider_fee),0) provider_fees,
      COALESCE(SUM(net_amount),0) net_sales,
      COALESCE(SUM(bank_received_amount),0) bank_received
    FROM payments WHERE status IN ('Paid','External') OR verification_status IN ('Verified','Reconciled')`).first();
  const byChannel=await db.prepare(`SELECT sales_channel label, COUNT(*) count FROM orders GROUP BY sales_channel ORDER BY count DESC`).all();
  const byProvider=await db.prepare(`SELECT payment_provider label, COUNT(*) count FROM orders GROUP BY payment_provider ORDER BY count DESC`).all();
  const byStatus=await db.prepare(`SELECT payment_status label, COUNT(*) count FROM orders GROUP BY payment_status ORDER BY count DESC`).all();
  const byMethod=await db.prepare(`SELECT CASE WHEN trim(payment_method)='' THEN provider ELSE payment_method END label, COUNT(*) count FROM payments GROUP BY CASE WHEN trim(payment_method)='' THEN provider ELSE payment_method END ORDER BY count DESC`).all();
  return json({ok:true,summary:{
    products:Number(products?.active||0),orders:Number(orders?.total||0),paid:Number(orders?.paid||0),pending:Number(orders?.pending||0),
    grossSales:Number(moneySummary?.gross_sales||0),providerFees:Number(moneySummary?.provider_fees||0),
    netSales:Number(moneySummary?.net_sales||0),bankReceived:Number(moneySummary?.bank_received||0)
  },byChannel:byChannel.results||[],byProvider:byProvider.results||[],byStatus:byStatus.results||[],byMethod:byMethod.results||[]});
}

async function commerceProducts(context) {
  const result=await context.env.ENQUIRIES_DB.prepare(`SELECT id,sku,slug,product_type,name_en,name_zh,description_en,description_zh,status,price,currency,sales_channel,payment_provider,external_purchase_url,senangpay_enabled,affiliate_enabled,commission_type,commission_value,starts_on,ends_on,time_en,time_zh,delivery_en,delivery_zh,instructor,early_bird_price,early_bird_end,hero_image_url FROM products ORDER BY CASE status WHEN 'Active' THEN 1 WHEN 'Draft' THEN 2 ELSE 3 END, id DESC`).all();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const rows=(result.results||[]).map(r=>{const early=Number(r.early_bird_price)>0 && r.early_bird_end && today<=r.early_bird_end; return {...r,early_bird_active:early,effective_price:early?Number(r.early_bird_price):Number(r.price||0)};});
  return json({ok:true,results:rows});
}

function makeSlug(value){return clean(value,200).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);}
async function saveProduct(context,url) {
  let body; try{body=await context.request.json()}catch{return json({error:'Invalid request.'},400)}
  const id=Number(url.searchParams.get('id')||0), sku=clean(body.sku,80), type=clean(body.productType,30), status=clean(body.status,20), nameEn=clean(body.nameEn,200), nameZh=clean(body.nameZh,200), currency=clean(body.currency,10)||'MYR', channel=clean(body.salesChannel,80)||'Website', provider=clean(body.paymentProvider,80)||'SenangPay', externalUrl=clean(body.externalPurchaseUrl,1000);
  const slug=makeSlug(body.slug)||makeSlug(nameEn), price=Number(body.price||0), earlyRaw=body.earlyBirdPrice, early=earlyRaw===''||earlyRaw==null?null:Number(earlyRaw);
  const descriptionEn=clean(body.descriptionEn,1200),descriptionZh=clean(body.descriptionZh,1200),startsOn=clean(body.startsOn,20),endsOn=clean(body.endsOn,20),timeEn=clean(body.timeEn,100),timeZh=clean(body.timeZh,100),deliveryEn=clean(body.deliveryEn,100),deliveryZh=clean(body.deliveryZh,100),instructor=clean(body.instructor,160),earlyEnd=clean(body.earlyBirdEnd,20),hero=clean(body.heroImageUrl,500);
  if(!sku||!slug||!nameEn)return json({error:'SKU and English name are required.'},400); if(!productTypes.has(type)||!productStatuses.has(status))return json({error:'Invalid product type or status.'},400); if(!Number.isFinite(price)||price<0)return json({error:'Invalid price.'},400); if(early!==null&&(!Number.isFinite(early)||early<0))return json({error:'Invalid early-bird price.'},400);
  const db=context.env.ENQUIRIES_DB;
  const params=[sku,slug,type,nameEn,nameZh,descriptionEn,descriptionZh,status,price,currency,channel,provider,externalUrl,startsOn,endsOn,timeEn,timeZh,deliveryEn,deliveryZh,instructor,early,earlyEnd,hero];
  if(id){await db.prepare(`UPDATE products SET sku=?,slug=?,product_type=?,name_en=?,name_zh=?,description_en=?,description_zh=?,status=?,price=?,currency=?,sales_channel=?,payment_provider=?,external_purchase_url=?,starts_on=?,ends_on=?,time_en=?,time_zh=?,delivery_en=?,delivery_zh=?,instructor=?,early_bird_price=?,early_bird_end=?,hero_image_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...params,id).run(); return json({ok:true,id,slug});}
  const r=await db.prepare(`INSERT INTO products(sku,slug,product_type,name_en,name_zh,description_en,description_zh,status,price,currency,sales_channel,payment_provider,external_purchase_url,starts_on,ends_on,time_en,time_zh,delivery_en,delivery_zh,instructor,early_bird_price,early_bird_end,hero_image_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...params).run(); return json({ok:true,id:r.meta?.last_row_id,slug});
}

async function commerceOrders(context) {
  const result=await context.env.ENQUIRIES_DB.prepare(`
    SELECT o.id,o.order_reference,o.customer_name,o.customer_email,o.customer_phone,o.currency,o.total,
      o.sales_channel,o.payment_provider,o.payment_status,o.campaign_code,o.affiliate_code,o.external_order_id,o.created_at,
      p.name_en product_name,p.sku,oi.quantity,
      py.id payment_id,py.payment_method,py.provider_transaction_id,py.gross_amount,py.provider_fee,py.net_amount,
      py.bank_received_amount,py.settlement_date,py.verification_status,py.customer_receipt_issuer,py.status payment_record_status
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN products p ON p.id=oi.product_id
    LEFT JOIN payments py ON py.id=(SELECT MAX(p2.id) FROM payments p2 WHERE p2.order_id=o.id)
    ORDER BY o.id DESC LIMIT 200
  `).all();
  return json({ok:true,results:result.results||[]});
}

async function commercePayments(context) {
  const result=await context.env.ENQUIRIES_DB.prepare(`
    SELECT py.id,py.order_id,o.order_reference,o.customer_name,o.customer_email,o.sales_channel,
      py.provider,py.payment_method,py.provider_transaction_id,py.amount,py.gross_amount,py.provider_fee,
      py.net_amount,py.bank_received_amount,py.currency,py.status,py.settlement_date,py.verification_status,
      py.verified_at,py.customer_receipt_issuer,py.notes,py.paid_at,py.created_at,
      p.name_en product_name,p.sku
    FROM payments py
    JOIN orders o ON o.id=py.order_id
    LEFT JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN products p ON p.id=oi.product_id
    ORDER BY py.id DESC LIMIT 300
  `).all();
  return json({ok:true,results:result.results||[]});
}

async function savePayment(context) {
  let body; try{body=await context.request.json()}catch{return json({error:'Invalid request.'},400)}
  const orderId=Number(body.orderId), method=clean(body.paymentMethod,60), provider=clean(body.provider,80)||method,
    tx=clean(body.transactionReference,200), status=clean(body.status,30)||'Paid',
    currency=clean(body.currency,10)||'MYR', settlementDate=clean(body.settlementDate,20),
    verification=clean(body.verificationStatus,30)||'Unverified',
    issuer=clean(body.customerReceiptIssuer,100)||'Quantum YiJing', notes=clean(body.notes,1000);
  const gross=Number(body.grossAmount||0), fee=Number(body.providerFee||0),
    net=body.netAmount===''||body.netAmount==null ? gross-fee : Number(body.netAmount),
    bank=body.bankReceivedAmount===''||body.bankReceivedAmount==null ? net : Number(body.bankReceivedAmount);
  if(!Number.isInteger(orderId)||orderId<1)return json({error:'Select a valid order.'},400);
  if(!paymentMethods.has(method))return json({error:'Invalid payment method.'},400);
  if(!paymentStatuses.has(status))return json({error:'Invalid payment status.'},400);
  if(!verificationStatuses.has(verification))return json({error:'Invalid verification status.'},400);
  if([gross,fee,net,bank].some(v=>!Number.isFinite(v)||v<0))return json({error:'Payment amounts must be valid non-negative numbers.'},400);
  const db=context.env.ENQUIRIES_DB;
  const order=await db.prepare(`SELECT id,total,currency,payment_status FROM orders WHERE id=?`).bind(orderId).first();
  if(!order)return json({error:'Order not found.'},404);
  const paidAt=(status==='Paid'||status==='External')?new Date().toISOString():'';
  const verifiedAt=(verification==='Verified'||verification==='Reconciled')?new Date().toISOString():'';
  const insert=await db.prepare(`INSERT INTO payments(
    order_id,provider,provider_transaction_id,amount,currency,status,raw_reference,paid_at,
    payment_method,gross_amount,provider_fee,net_amount,settlement_date,bank_received_amount,
    verification_status,verified_at,customer_receipt_issuer,notes
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    orderId,provider,tx,gross,currency,status,tx,paidAt,
    method,gross,fee,net,settlementDate,bank,verification,verifiedAt,issuer,notes
  ).run();
  const orderStatus=status==='External'?'External':(status==='Paid'?'Paid':status);
  await db.prepare(`UPDATE orders SET payment_provider=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(provider,orderStatus,orderId).run();
  return json({ok:true,id:insert.meta?.last_row_id,netAmount:net,bankReceivedAmount:bank});
}

function makeOrderReference(){return `QY-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`}
async function createOrder(context) {
  let body; try{body=await context.request.json()}catch{return json({error:'Invalid request.'},400)}
  const productId=Number(body.productId), quantity=Math.max(1,Math.min(Number(body.quantity||1),100)), name=clean(body.customerName,160), email=clean(body.customerEmail,240), phone=clean(body.customerPhone,80), channel=clean(body.salesChannel,80)||'Website', provider=clean(body.paymentProvider,80)||'SenangPay', status=clean(body.paymentStatus,20)||'Pending', campaign=clean(body.campaignCode,120), affiliate=clean(body.affiliateCode,100);
  if(!Number.isInteger(productId)||productId<1||!name||!email)return json({error:'Customer name, email and product are required.'},400); if(!paymentStatuses.has(status))return json({error:'Invalid payment status.'},400);
  const db=context.env.ENQUIRIES_DB, product=await db.prepare(`SELECT id,price,currency,name_en FROM products WHERE id=?`).bind(productId).first(); if(!product)return json({error:'Product not found.'},404);
  const unit=Number(product.price||0), total=unit*quantity, ref=makeOrderReference();
  const order=await db.prepare(`INSERT INTO orders(order_reference,customer_name,customer_email,customer_phone,currency,subtotal,total,sales_channel,payment_provider,payment_status,campaign_code,affiliate_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ref,name,email,phone,product.currency||'MYR',total,total,channel,provider,status,campaign,affiliate).run(); const orderId=order.meta?.last_row_id;
  await db.prepare(`INSERT INTO order_items(order_id,product_id,quantity,unit_price,line_total) VALUES(?,?,?,?,?)`).bind(orderId,productId,quantity,unit,total).run();
  if(status==='Paid'||status==='External') await db.prepare(`INSERT INTO payments(order_id,provider,amount,currency,status,paid_at) VALUES(?,?,?,?,?,?)`).bind(orderId,provider,total,product.currency||'MYR',status,new Date().toISOString()).run();
  return json({ok:true,id:orderId,orderReference:ref,total,currency:product.currency||'MYR'});
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
    if (context.request.method === 'GET' && action === 'marketingstats') return await marketingStats(context);
    if (context.request.method === 'GET' && action === 'studentstats') return await studentStats(context);
    if (context.request.method === 'GET' && action === 'students') return await students(context, url);
    if (context.request.method === 'GET' && action === 'studentdetail') return await studentDetail(context, url);
    if (context.request.method === 'PATCH' && action === 'studentupdate') return await studentUpdate(context, url);
    if (context.request.method === 'GET' && action === 'studentexport') return await studentExport(context, url);
    if (context.request.method === 'GET' && action === 'commercestats') return await commerceStats(context);
    if (context.request.method === 'GET' && action === 'commerceproducts') return await commerceProducts(context);
    if ((context.request.method === 'POST' || context.request.method === 'PATCH') && action === 'productsave') return await saveProduct(context, url);
    if (context.request.method === 'GET' && action === 'commerceorders') return await commerceOrders(context);
    if (context.request.method === 'GET' && action === 'commercepayments') return await commercePayments(context);
    if (context.request.method === 'POST' && action === 'paymentsave') return await savePayment(context);
    if (context.request.method === 'POST' && action === 'ordercreate') return await createOrder(context);
    return json({ error: 'Unknown admin action.' }, 404);
  } catch (error) {
    console.error('Admin API failed', error);
    return json({ error: 'Academy Operating System request failed.' }, 500);
  }
}
