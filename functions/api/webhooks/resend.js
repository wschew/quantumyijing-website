const ALLOWED_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
  'email.received'
]);

const STOP_EVENTS = new Set([
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed'
]);

const RESEND_RECEIVING_ENDPOINT = 'https://api.resend.com/emails/receiving';

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

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

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function base64Bytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left[i] ^ right[i];
  }
  return difference === 0;
}

async function validSignature(payload, headers, secret) {
  const eventId = clean(headers.get('svix-id'), 300);
  const timestampText = clean(headers.get('svix-timestamp'), 30);
  const signatureHeader = clean(headers.get('svix-signature'), 4000);

  if (!eventId || !timestampText || !signatureHeader || !secret) return false;

  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_WEBHOOK_AGE_SECONDS) return false;

  const secretText = String(secret).startsWith('whsec_')
    ? String(secret).slice(6)
    : String(secret);

  let keyBytes;
  try {
    keyBytes = base64Bytes(secretText);
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signedContent = `${eventId}.${timestampText}.${payload}`;
  const expected = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedContent)
  ));

  const signatures = signatureHeader
    .split(/\s+/)
    .map((part) => part.split(',', 2))
    .filter(([version, value]) => version === 'v1' && value)
    .map(([, value]) => value);

  return signatures.some((signature) => {
    try {
      return constantTimeEqual(expected, base64Bytes(signature));
    } catch {
      return false;
    }
  });
}

function sqlDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function recipient(data) {
  return Array.isArray(data?.to) ? clean(data.to[0], 320) : clean(data?.to, 320);
}

function clickedUrl(data) {
  return clean(data?.click?.link || data?.link || '', 2000);
}

function values(value) {
  return Array.isArray(value) ? value : (value ? [value] : []);
}

function emailOnly(value) {
  const text = clean(value, 500);
  const bracketed = text.match(/<([^<>]+@[^<>]+)>/);
  return clean(bracketed ? bracketed[1] : text, 320).toLowerCase();
}

function replyRoute(data, env) {
  const domain = clean(env.RESEND_RECEIVING_DOMAIN || '', 253)
    .toLowerCase()
    .replace(/^@+/, '');

  if (!domain) return null;

  for (const value of values(data?.to)) {
    const address = emailOnly(value);
    const suffix = `@${domain}`;
    if (!address.endsWith(suffix)) continue;

    const local = address.slice(0, -suffix.length);
    const match = local.match(/^yj12-a(\d+)$/);
    if (match) {
      return {
        automationId: Number(match[1]),
        address
      };
    }
  }

  return null;
}

function malaysiaDate(value) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function textPreview(text, html) {
  let source = clean(text, 5000) || String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  source = source
    .replace(/\r\n?/g, '\n')
    .trim();

  const separators = [
    /\n\s*On[\s\S]{0,500}?wrote:\s*(?:\n|$)/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}\s*(?:\n|$)/i,
    /\n\s*From:\s.+(?:\n|$)/i,
    /\n\s*_{5,}\s*(?:\n|$)/
  ];

  let cutAt = source.length;
  for (const separator of separators) {
    const match = separator.exec(source);
    if (match && match.index < cutAt) cutAt = match.index;
  }

  return clean(
    source.slice(0, cutAt)
      .split('\n')
      .filter(line => !/^\s*>/.test(line))
      .join(' ')
      .replace(/\s+/g, ' '),
    500
  );
}

async function receivedEmail(apiKey, emailId) {
  if (!apiKey) throw new Error('RESEND_API_KEY is unavailable.');

  const response = await fetch(
    `${RESEND_RECEIVING_ENDPOINT}/${encodeURIComponent(emailId)}?html_format=cid`,
    { headers: { authorization: `Bearer ${apiKey}` } }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend receiving ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function handleReceived(event, payload, webhookEventId, env, db) {
  const data = event?.data || {};
  const resendEmailId = clean(data.email_id, 300);
  if (!resendEmailId || !webhookEventId) {
    return json({ ok: false, error: 'Missing inbound event identifiers' }, 400);
  }

  const route = replyRoute(data, env);
  let automation = null;

  if (route?.automationId) {
    automation = await db.prepare(`
      SELECT
        a.id AS automation_id,
        a.enquiry_id,
        e.email AS enquiry_email,
        (
          SELECT l.id
          FROM marketing_automation_logs l
          WHERE l.automation_id=a.id AND l.status='Sent'
          ORDER BY l.id DESC
          LIMIT 1
        ) AS automation_log_id
      FROM marketing_automations a
      JOIN enquiries e ON e.id=a.enquiry_id
      WHERE a.id=?
      LIMIT 1
    `).bind(route.automationId).first();
  }

  let content;
  try {
    content = await receivedEmail(env.RESEND_API_KEY, resendEmailId);
  } catch (error) {
    console.error('Unable to retrieve received email content.', error);
    return json({ ok: false, error: 'Unable to retrieve inbound content' }, 502);
  }

  const fromEmail = emailOnly(content?.from || data.from);
  const matchedAutomation = automation &&
    emailOnly(automation.enquiry_email) === fromEmail
    ? automation
    : null;
  const toEmail = route?.address || emailOnly(values(content?.to || data.to)[0]);
  const subject = clean(content?.subject || data.subject, 500);
  const textBody = clean(content?.text, 100000);
  const htmlBody = clean(content?.html, 100000);
  const receivedAt = sqlDate(content?.created_at || data.created_at || event.created_at);

  const stored = await db.prepare(`
    INSERT OR IGNORE INTO marketing_email_replies (
      webhook_event_id,
      resend_email_id,
      message_id,
      automation_id,
      automation_log_id,
      enquiry_id,
      from_email,
      to_email,
      subject,
      text_body,
      html_body,
      received_at,
      status,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unread', ?)
  `).bind(
    webhookEventId,
    resendEmailId,
    clean(content?.message_id || data.message_id, 1000),
    matchedAutomation?.automation_id ?? null,
    matchedAutomation?.automation_log_id ?? null,
    matchedAutomation?.enquiry_id ?? null,
    fromEmail,
    toEmail,
    subject,
    textBody,
    htmlBody,
    receivedAt,
    payload.slice(0, 20000)
  ).run();

  const inserted = Number(stored?.meta?.changes || 0) > 0;
  let stopped = false;

  if (inserted && matchedAutomation?.enquiry_id) {
    const stoppedResult = await db.prepare(`
      UPDATE marketing_automations
      SET
        status='Stopped',
        next_send_at='',
        stop_reason='Customer replied; human follow-up required',
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='Active'
    `).bind(matchedAutomation.automation_id).run();

    stopped = Number(stoppedResult?.meta?.changes || 0) > 0;

    const preview = textPreview(textBody, htmlBody);
    const description = clean(
      `Customer email reply received${subject ? `: ${subject}` : ''}.${preview ? ` ${preview}` : ''}`,
      1000
    );

    await db.prepare(`
      INSERT INTO crm_activities (
        enquiry_id,
        activity_type,
        description,
        activity_date
      ) VALUES (?, 'Email Reply', ?, ?)
    `).bind(
      matchedAutomation.enquiry_id,
      description,
      malaysiaDate(receivedAt)
    ).run();
  }

  return json({
    ok: true,
    stored: inserted,
    matched: !!matchedAutomation,
    senderMatched: !!matchedAutomation,
    automationStopped: stopped
  });
}

async function stopForDeliveryProblem(db, log, eventType) {
  if (!log?.automation_id || !STOP_EVENTS.has(eventType)) return false;

  const reason = `Automation stopped after ${eventType.replace('email.', '')} event`;
  const result = await db.prepare(`
    UPDATE marketing_automations
    SET
      status='Stopped',
      next_send_at='',
      stop_reason=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='Active'
  `).bind(reason, log.automation_id).run();

  const stopped = Number(result?.meta?.changes || 0) > 0;
  if (stopped && log.enquiry_id) {
    await db.prepare(`
      INSERT INTO crm_activities (
        enquiry_id,
        activity_type,
        description,
        activity_date
      ) VALUES (?, 'Email Delivery', ?, ?)
    `).bind(
      log.enquiry_id,
      reason,
      malaysiaDate(new Date())
    ).run();
  }

  return stopped;
}

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    console.error('RESEND_WEBHOOK_SECRET is not configured.');
    return json({ ok: false, error: 'Webhook unavailable' }, 503);
  }

  const payload = await request.text();

  let verified = false;
  try {
    verified = await validSignature(
      payload,
      request.headers,
      env.RESEND_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('Resend webhook signature verification failed.', error);
  }

  if (!verified) {
    return json({ ok: false, error: 'Invalid webhook signature' }, 401);
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const eventType = clean(event?.type, 100);
  if (!ALLOWED_EVENTS.has(eventType)) {
    return json({ ok: true, ignored: true });
  }

  const providerMessageId = clean(event?.data?.email_id, 300);
  const webhookEventId = clean(request.headers.get('svix-id'), 300);

  if (!providerMessageId || !webhookEventId) {
    return json({ ok: false, error: 'Missing event identifiers' }, 400);
  }

  const db = env.ENQUIRIES_DB;
  if (!db) {
    console.error('ENQUIRIES_DB binding is unavailable.');
    return json({ ok: false, error: 'Database unavailable' }, 503);
  }

  if (eventType === 'email.received') {
    return handleReceived(event, payload, webhookEventId, env, db);
  }

  const log = await db.prepare(`
    SELECT
      id,
      automation_id,
      enquiry_id,
      sequence_code,
      step_no,
      template_code
    FROM marketing_automation_logs
    WHERE provider_message_id=?
    ORDER BY id DESC
    LIMIT 1
  `).bind(providerMessageId).first();

  const result = await db.prepare(`
    INSERT OR IGNORE INTO marketing_email_events (
      webhook_event_id,
      provider_message_id,
      automation_log_id,
      enquiry_id,
      automation_id,
      sequence_code,
      step_no,
      template_code,
      event_type,
      event_at,
      recipient_email,
      clicked_url,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    webhookEventId,
    providerMessageId,
    log?.id ?? null,
    log?.enquiry_id ?? null,
    log?.automation_id ?? null,
    clean(log?.sequence_code, 100),
    log?.step_no ?? null,
    clean(log?.template_code, 100),
    eventType,
    sqlDate(event?.created_at),
    recipient(event?.data),
    clickedUrl(event?.data),
    payload.slice(0, 20000)
  ).run();

  const automationStopped = await stopForDeliveryProblem(db, log, eventType);

  return json({
    ok: true,
    stored: Number(result?.meta?.changes || 0) > 0,
    matched: !!log,
    automationStopped
  });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
