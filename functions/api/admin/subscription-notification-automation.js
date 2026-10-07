const FROM_ADDRESS =
  "Quantum YiJing International Academy <info@quantumyijing.com>";

const REPLY_ADDRESS = "info@quantumyijing.com";

const DAY_MS = 24 * 60 * 60 * 1000;

function json(data,status=200){
  return Response.json(data,{status});
}

function bearer(request){
  const value=request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ")
    ? value.slice(7).trim()
    : "";
}

function authorized(request,env){
  const expected=String(env.ADMIN_TOKEN || "").trim();
  const supplied=bearer(request);
  return Boolean(expected && supplied && supplied===expected);
}

function dbOf(env){
  return env.ENQUIRIES_DB || env.DB || env.D1 || null;
}

function clean(value,max=500){
  return String(value ?? "").trim().slice(0,max);
}

function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function isoMs(value){
  const n=Date.parse(String(value || ""));
  return Number.isFinite(n) ? n : NaN;
}

function isZh(language){
  return /^zh\b/i.test(String(language || "").trim());
}

function changes(result){
  return Number(result?.meta?.changes || 0);
}

function ageMs(value,nowMs){
  const n=isoMs(value);
  return Number.isFinite(n)
    ? Math.max(0,nowMs-n)
    : Number.POSITIVE_INFINITY;
}

function canAttempt(log,nowMs){
  if(!log) return true;

  const status=String(log.status || "");

  if(status==="Sent" || status==="Skipped"){
    return false;
  }

  if(status==="Failed"){
    return ageMs(log.updated_at,nowMs) >= 6 * 60 * 60 * 1000;
  }

  if(status==="Pending"){
    return ageMs(log.updated_at,nowMs) >= 2 * 60 * 60 * 1000;
  }

  return false;
}

async function sendEmail(apiKey,payload){
  const key=String(apiKey || "").trim();

  if(!key){
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${key}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(payload)
  });

  const raw=await response.text();

  let data=null;

  try{
    data=raw ? JSON.parse(raw) : {};
  }catch{
    data={};
  }

  if(!response.ok){
    throw new Error(
      clean(
        data?.message ||
        data?.error ||
        raw ||
        `Resend HTTP ${response.status}`,
        1000
      )
    );
  }

  return data || {};
}

async function loadReminderCandidates(db,runAt){
  const result=await db.prepare(`
    SELECT
      s.id AS subscription_id,
      s.subscription_reference,
      s.status AS subscription_status,
      s.current_period_end,
      s.grace_ends_at,
      s.cancel_at_period_end,

      c.id AS customer_id,
      c.display_name,
      c.email,
      c.language,
      c.status AS customer_status,

      p.id AS plan_id,
      p.plan_reference,
      p.plan_code,
      p.status AS plan_status,
      p.renewal_mode

    FROM subscriptions s

    JOIN customers c
      ON c.id=s.customer_id

    JOIN subscription_plans p
      ON p.id=s.plan_id

    WHERE
      s.status='Active'
      AND c.status='Active'
      AND trim(c.email)<>''
      AND p.status='Active'
      AND p.renewal_mode='Manual'
      AND s.cancel_at_period_end=0
      AND s.current_period_end<>''
      AND datetime(s.current_period_end)>datetime(?)
      AND datetime(s.current_period_end)<=datetime(?,'+30 days')

    ORDER BY datetime(s.current_period_end),s.id
    LIMIT 500
  `).bind(runAt,runAt).all();

  return Array.isArray(result?.results)
    ? result.results
    : [];
}

async function loadEventCandidates(db){
  const result=await db.prepare(`
    SELECT
      e.id AS source_event_id,
      e.event_type,
      e.event_at,

      s.id AS subscription_id,
      s.subscription_reference,
      s.status AS subscription_status,
      s.current_period_end,
      s.grace_ends_at,
      s.cancel_at_period_end,

      c.id AS customer_id,
      c.display_name,
      c.email,
      c.language,
      c.status AS customer_status,

      p.id AS plan_id,
      p.plan_reference,
      p.plan_code,
      p.status AS plan_status,
      p.renewal_mode

    FROM subscription_events e

    JOIN subscriptions s
      ON s.id=e.subscription_id

    JOIN customers c
      ON c.id=s.customer_id

    JOIN subscription_plans p
      ON p.id=s.plan_id

    WHERE
      e.event_type IN (
        'past_due',
        'expired',
        'cancel_scheduled'
      )

      AND c.status='Active'
      AND trim(c.email)<>''

      AND (
        (
          e.event_type='past_due'
          AND s.status='PastDue'
        )
        OR
        (
          e.event_type='expired'
          AND s.status='Expired'
        )
        OR
        (
          e.event_type='cancel_scheduled'
          AND s.cancel_at_period_end=1
          AND s.status IN ('Active','PastDue','Paused')
        )
      )

    ORDER BY e.id
    LIMIT 500
  `).all();

  return Array.isArray(result?.results)
    ? result.results
    : [];
}

function reminderItem(row,runAtMs){
  const endMs=isoMs(row.current_period_end);

  if(!Number.isFinite(endMs)){
    return null;
  }

  const remaining=endMs-runAtMs;

  if(remaining<=0 || remaining>30*DAY_MS){
    return null;
  }

  const notificationType =
    remaining<=7*DAY_MS
      ? "RenewalReminder7d"
      : "RenewalReminder30d";

  return {
    subscription_id:Number(row.subscription_id),
    subscription_reference:clean(row.subscription_reference,120),
    notification_type:notificationType,
    recipient:clean(row.email,320),
    display_name:clean(row.display_name,200),
    language:clean(row.language,20),
    plan_code:clean(row.plan_code || row.plan_reference,120),
    current_period_end:clean(row.current_period_end,80),
    grace_ends_at:clean(row.grace_ends_at,80),
    source_event_id:null,
    scheduled_for:clean(row.current_period_end,80)
  };
}

function eventItem(row){
  let notificationType="";

  if(row.event_type==="past_due"){
    notificationType="PastDueNotice";
  }else if(row.event_type==="expired"){
    notificationType="ExpiredNotice";
  }else if(row.event_type==="cancel_scheduled"){
    notificationType="CancellationScheduledNotice";
  }else{
    return null;
  }

  return {
    subscription_id:Number(row.subscription_id),
    subscription_reference:clean(row.subscription_reference,120),
    notification_type:notificationType,
    recipient:clean(row.email,320),
    display_name:clean(row.display_name,200),
    language:clean(row.language,20),
    plan_code:clean(row.plan_code || row.plan_reference,120),
    current_period_end:clean(row.current_period_end,80),
    grace_ends_at:clean(row.grace_ends_at,80),
    source_event_id:Number(row.source_event_id),
    scheduled_for:clean(row.event_at,80)
  };
}

async function existingLog(db,item){
  return await db.prepare(`
    SELECT
      id,
      status,
      recipient,
      provider_message_id,
      last_error,
      scheduled_for,
      sent_at,
      created_at,
      updated_at
    FROM subscription_notification_logs
    WHERE
      subscription_id=?
      AND notification_type=?
      AND channel='email'
      AND scheduled_for=?
    LIMIT 1
  `).bind(
    item.subscription_id,
    item.notification_type,
    item.scheduled_for
  ).first();
}

async function claimLog(db,item,runAt){
  const insert=await db.prepare(`
    INSERT OR IGNORE INTO subscription_notification_logs(
      subscription_id,
      notification_type,
      channel,
      recipient,
      status,
      source_event_id,
      provider_message_id,
      last_error,
      scheduled_for,
      sent_at,
      created_at,
      updated_at
    )
    VALUES(
      ?,
      ?,
      'email',
      ?,
      'Pending',
      ?,
      '',
      '',
      ?,
      '',
      ?,
      ?
    )
  `).bind(
    item.subscription_id,
    item.notification_type,
    item.recipient,
    item.source_event_id,
    item.scheduled_for,
    runAt,
    runAt
  ).run();

  if(changes(insert)>0){
    return true;
  }

  const failedRetry=await db.prepare(`
    UPDATE subscription_notification_logs
    SET
      recipient=?,
      source_event_id=?,
      status='Pending',
      last_error='',
      updated_at=?
    WHERE
      subscription_id=?
      AND notification_type=?
      AND channel='email'
      AND scheduled_for=?
      AND status='Failed'
      AND datetime(updated_at)<=datetime(?,'-6 hours')
  `).bind(
    item.recipient,
    item.source_event_id,
    runAt,
    item.subscription_id,
    item.notification_type,
    item.scheduled_for,
    runAt
  ).run();

  if(changes(failedRetry)>0){
    return true;
  }

  const stalePending=await db.prepare(`
    UPDATE subscription_notification_logs
    SET
      recipient=?,
      source_event_id=?,
      updated_at=?
    WHERE
      subscription_id=?
      AND notification_type=?
      AND channel='email'
      AND scheduled_for=?
      AND status='Pending'
      AND datetime(updated_at)<=datetime(?,'-2 hours')
  `).bind(
    item.recipient,
    item.source_event_id,
    runAt,
    item.subscription_id,
    item.notification_type,
    item.scheduled_for,
    runAt
  ).run();

  return changes(stalePending)>0;
}

async function markSent(db,item,providerId,runAt){
  await db.prepare(`
    UPDATE subscription_notification_logs
    SET
      status='Sent',
      recipient=?,
      provider_message_id=?,
      last_error='',
      sent_at=?,
      updated_at=?
    WHERE
      subscription_id=?
      AND notification_type=?
      AND channel='email'
      AND scheduled_for=?
      AND status='Pending'
  `).bind(
    item.recipient,
    clean(providerId,300),
    runAt,
    runAt,
    item.subscription_id,
    item.notification_type,
    item.scheduled_for
  ).run();
}

async function markFailed(db,item,error,runAt){
  await db.prepare(`
    UPDATE subscription_notification_logs
    SET
      status='Failed',
      recipient=?,
      provider_message_id='',
      last_error=?,
      updated_at=?
    WHERE
      subscription_id=?
      AND notification_type=?
      AND channel='email'
      AND scheduled_for=?
      AND status='Pending'
  `).bind(
    item.recipient,
    clean(error,1000),
    runAt,
    item.subscription_id,
    item.notification_type,
    item.scheduled_for
  ).run();
}

function dateText(value){
  const ms=isoMs(value);

  if(!Number.isFinite(ms)){
    return clean(value,80);
  }

  return new Date(ms).toISOString().slice(0,10);
}

function emailContent(item){
  const zh=isZh(item.language);

  const name=item.display_name || (zh ? "学员" : "Customer");
  const plan=item.plan_code || item.subscription_reference;
  const end=dateText(item.current_period_end);
  const grace=dateText(item.grace_ends_at);

  let subject="";
  let heading="";
  let message="";
  let text="";

  if(item.notification_type==="RenewalReminder30d"){
    if(zh){
      subject=`订阅续期提醒 — ${plan}`;
      heading="订阅续期提醒";
      message=`
        <p>${esc(name)} 您好：</p>
        <p>您的 Quantum YiJing 订阅将于
        <strong>${esc(end)}</strong> 到期。</p>
        <p>如需继续订阅，请在到期日前联系我们办理续期。</p>
      `;
      text=
        `${name} 您好：\n\n`+
        `您的 Quantum YiJing 订阅将于 ${end} 到期。\n`+
        `如需继续订阅，请在到期日前联系我们办理续期。`;
    }else{
      subject=`Subscription Renewal Reminder — ${plan}`;
      heading="Subscription Renewal Reminder";
      message=`
        <p>Dear ${esc(name)},</p>
        <p>Your Quantum YiJing subscription is due to end on
        <strong>${esc(end)}</strong>.</p>
        <p>Please contact the Academy before the end date if you
        would like to renew your subscription.</p>
      `;
      text=
        `Dear ${name},\n\n`+
        `Your Quantum YiJing subscription is due to end on ${end}.\n`+
        `Please contact the Academy before the end date if you would like to renew.`;
    }
  }

  if(item.notification_type==="RenewalReminder7d"){
    if(zh){
      subject=`订阅即将到期 — ${plan}`;
      heading="订阅即将到期";
      message=`
        <p>${esc(name)} 您好：</p>
        <p>温馨提醒：您的 Quantum YiJing 订阅预计于
        <strong>${esc(end)}</strong> 到期。</p>
        <p>如需继续订阅，请尽快联系我们办理续期。</p>
      `;
      text=
        `${name} 您好：\n\n`+
        `您的 Quantum YiJing 订阅预计于 ${end} 到期。\n`+
        `如需继续订阅，请尽快联系我们办理续期。`;
    }else{
      subject=`Subscription Expiring Soon — ${plan}`;
      heading="Subscription Expiring Soon";
      message=`
        <p>Dear ${esc(name)},</p>
        <p>This is a reminder that your Quantum YiJing subscription
        is due to end on <strong>${esc(end)}</strong>.</p>
        <p>Please contact the Academy soon if you wish to renew.</p>
      `;
      text=
        `Dear ${name},\n\n`+
        `Your Quantum YiJing subscription is due to end on ${end}.\n`+
        `Please contact the Academy soon if you wish to renew.`;
    }
  }

  if(item.notification_type==="PastDueNotice"){
    if(zh){
      subject=`订阅已进入宽限期 — ${plan}`;
      heading="订阅已进入宽限期";
      message=`
        <p>${esc(name)} 您好：</p>
        <p>您的 Quantum YiJing 订阅已到期，并已进入宽限期。</p>
        ${grace ? `<p>当前宽限期至 <strong>${esc(grace)}</strong>。</p>` : ""}
        <p>如需继续订阅，请联系我们办理续期。</p>
      `;
      text=
        `${name} 您好：\n\n`+
        `您的 Quantum YiJing 订阅已到期，并已进入宽限期。`+
        `${grace ? `\n当前宽限期至 ${grace}。` : ""}\n`+
        `如需继续订阅，请联系我们办理续期。`;
    }else{
      subject=`Subscription Past Due — ${plan}`;
      heading="Subscription Past Due";
      message=`
        <p>Dear ${esc(name)},</p>
        <p>Your Quantum YiJing subscription has reached its end date
        and is now in its grace period.</p>
        ${grace ? `<p>The current grace period ends on <strong>${esc(grace)}</strong>.</p>` : ""}
        <p>Please contact the Academy if you wish to renew.</p>
      `;
      text=
        `Dear ${name},\n\n`+
        `Your Quantum YiJing subscription is now in its grace period.`+
        `${grace ? `\nThe current grace period ends on ${grace}.` : ""}\n`+
        `Please contact the Academy if you wish to renew.`;
    }
  }

  if(item.notification_type==="ExpiredNotice"){
    if(zh){
      subject=`订阅已结束 — ${plan}`;
      heading="订阅已结束";
      message=`
        <p>${esc(name)} 您好：</p>
        <p>您的 Quantum YiJing 订阅已结束。</p>
        <p>如需重新订阅或了解后续安排，请联系我们。</p>
      `;
      text=
        `${name} 您好：\n\n`+
        `您的 Quantum YiJing 订阅已结束。\n`+
        `如需重新订阅或了解后续安排，请联系我们。`;
    }else{
      subject=`Subscription Ended — ${plan}`;
      heading="Subscription Ended";
      message=`
        <p>Dear ${esc(name)},</p>
        <p>Your Quantum YiJing subscription has ended.</p>
        <p>Please contact the Academy if you would like assistance
        with renewal or future subscription arrangements.</p>
      `;
      text=
        `Dear ${name},\n\n`+
        `Your Quantum YiJing subscription has ended.\n`+
        `Please contact the Academy if you would like assistance with renewal.`;
    }
  }

  if(item.notification_type==="CancellationScheduledNotice"){
    if(zh){
      subject=`订阅取消安排确认 — ${plan}`;
      heading="订阅取消安排确认";
      message=`
        <p>${esc(name)} 您好：</p>
        <p>我们已记录您的订阅将在当前周期结束时取消。</p>
        <p>当前订阅周期结束日期为
        <strong>${esc(end)}</strong>。</p>
        <p>如需更改此安排，请联系我们。</p>
      `;
      text=
        `${name} 您好：\n\n`+
        `我们已记录您的订阅将在当前周期结束时取消。\n`+
        `当前订阅周期结束日期为 ${end}。\n`+
        `如需更改此安排，请联系我们。`;
    }else{
      subject=`Subscription Cancellation Scheduled — ${plan}`;
      heading="Subscription Cancellation Scheduled";
      message=`
        <p>Dear ${esc(name)},</p>
        <p>Your request to cancel the subscription at the end of the
        current period has been recorded.</p>
        <p>The current subscription period ends on
        <strong>${esc(end)}</strong>.</p>
        <p>Please contact the Academy if you need to change this
        arrangement.</p>
      `;
      text=
        `Dear ${name},\n\n`+
        `Your subscription is scheduled to cancel at the end of the current period.\n`+
        `The current period ends on ${end}.\n`+
        `Please contact the Academy if you need to change this arrangement.`;
    }
  }

  const html=`<!doctype html>
<html>
<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2638">
  <div style="max-width:680px;margin:30px auto;background:#ffffff;border:1px solid #dce7f4;border-radius:18px;overflow:hidden">
    <div style="background:#0b2f66;color:#ffffff;padding:22px 30px">
      <div style="font-size:12px;letter-spacing:1.5px;font-weight:700">
        QUANTUM YIJING INTERNATIONAL ACADEMY
      </div>
      <div style="font-size:22px;font-weight:700;margin-top:8px">
        ${esc(heading)}
      </div>
    </div>

    <div style="padding:30px;line-height:1.65">
      ${message}

      <p style="margin-top:26px">
        <strong>Subscription:</strong>
        ${esc(item.subscription_reference)}
      </p>

      <p>
        ${zh
          ? "如需协助，请回复此邮件联系我们。"
          : "If you need assistance, please reply to this email."
        }
      </p>

      <p style="margin-top:28px">
        Quantum YiJing International Academy
      </p>
    </div>
  </div>
</body>
</html>`;

  return {
    subject,
    html,
    text:
      `${text}\n\n`+
      `Subscription: ${item.subscription_reference}\n\n`+
      `Quantum YiJing International Academy`
  };
}

async function buildItems(db,runAt){
  const runAtMs=isoMs(runAt);

  const reminders=await loadReminderCandidates(db,runAt);
  const events=await loadEventCandidates(db);

  const items=[];

  for(const row of reminders){
    const item=reminderItem(row,runAtMs);
    if(item) items.push(item);
  }

  for(const row of events){
    const item=eventItem(row);
    if(item) items.push(item);
  }

  return items;
}

async function execute(request,env){
  if(!authorized(request,env)){
    return json({error:"Unauthorized"},401);
  }

  const db=dbOf(env);

  if(!db){
    return json({error:"Database binding unavailable"},503);
  }

  const action=
    new URL(request.url).searchParams.get("action") || "preview";

  if(!["preview","run"].includes(action)){
    return json({
      error:"Unsupported action. Use preview or run."
    },400);
  }

  if(action==="run" && !String(env.RESEND_API_KEY || "").trim()){
    return json({
      error:"RESEND_API_KEY is not configured."
    },503);
  }

  const runAt=new Date().toISOString();
  const runAtMs=Date.parse(runAt);

  const candidates=await buildItems(db,runAt);

  const summary={
    ok:true,
    mode:action,
    runAt,
    checked:candidates.length,
    planned:0,
    sent:0,
    skipped:0,
    failed:0,
    failures:[],
    preview:[]
  };

  for(const item of candidates){
    const log=await existingLog(db,item);

    if(!canAttempt(log,runAtMs)){
      summary.skipped+=1;
      continue;
    }

    summary.planned+=1;

    if(action==="preview"){
      summary.preview.push({
        subscription_id:item.subscription_id,
        subscription_reference:item.subscription_reference,
        notification_type:item.notification_type,
        recipient:item.recipient,
        scheduled_for:item.scheduled_for,
        source_event_id:item.source_event_id
      });

      continue;
    }

    const claimed=await claimLog(db,item,runAt);

    if(!claimed){
      summary.skipped+=1;
      summary.planned-=1;
      continue;
    }

    try{
      const content=emailContent(item);

      const result=await sendEmail(
        env.RESEND_API_KEY,
        {
          from:FROM_ADDRESS,
          to:[item.recipient],
          reply_to:REPLY_ADDRESS,
          subject:content.subject,
          html:content.html,
          text:content.text
        }
      );

      await markSent(
        db,
        item,
        result?.id || "",
        runAt
      );

      summary.sent+=1;
    }catch(error){
      const message=clean(
        error?.message || String(error),
        1000
      );

      await markFailed(
        db,
        item,
        message,
        runAt
      );

      summary.failed+=1;

      summary.failures.push({
        subscription_id:item.subscription_id,
        notification_type:item.notification_type,
        recipient:item.recipient,
        error:message
      });
    }
  }

  return json(summary,summary.failed ? 207 : 200);
}

export async function onRequestPost({request,env}){
  try{
    return await execute(request,env);
  }catch(error){
    console.error(
      "Subscription notification automation failed",
      error
    );

    return json({
      error:clean(
        error?.message ||
        "Subscription notification automation failed.",
        1000
      )
    },500);
  }
}