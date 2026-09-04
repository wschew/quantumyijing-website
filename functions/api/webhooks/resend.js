const ALLOWED_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed'
]);

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

  return json({
    ok: true,
    stored: Number(result?.meta?.changes || 0) > 0,
    matched: !!log
  });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
