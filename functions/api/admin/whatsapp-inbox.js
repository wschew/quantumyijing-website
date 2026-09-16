function bearer(req) {
  const h = req.headers.get("authorization") || "";

  return h.toLowerCase().startsWith("bearer ")
    ? h.slice(7).trim()
    : "";
}

function authorized(req, env) {
  return !!env.ADMIN_TOKEN &&
    bearer(req) === env.ADMIN_TOKEN;
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

function dbOf(env) {
  return env.ENQUIRIES_DB ||
    env.DB ||
    env.D1 ||
    null;
}

export async function onRequestGet({
  request,
  env
}) {
  if (!authorized(request, env)) {
    return json({
      error: "Unauthorized"
    }, 401);
  }

  const db = dbOf(env);

  if (!db) {
    return json({
      error: "Database unavailable"
    }, 503);
  }

  try {
    const result = await db.prepare(`
      WITH conversations AS (
        SELECT
          sender_wa_id,

          MAX(
            CASE
              WHEN direction = 'inbound'
              THEN sender_name
              ELSE NULL
            END
          ) AS whatsapp_name,

          COUNT(*) AS message_count,

          MAX(enquiry_id) AS enquiry_id,

          MAX(message_timestamp)
            AS last_message_timestamp,

          MAX(id) AS last_message_id

        FROM whatsapp_messages

        WHERE sender_wa_id IS NOT NULL
          AND TRIM(sender_wa_id) <> ''

        GROUP BY sender_wa_id
      )

      SELECT
        c.sender_wa_id,
        c.whatsapp_name,
        c.message_count,
        c.enquiry_id,
        c.last_message_timestamp,

        m.direction AS last_direction,
        m.message_type AS last_message_type,
        m.message_text AS last_message,

        e.reference AS crm_reference,
        e.name AS crm_name,
        e.email AS crm_email,
        e.phone AS crm_phone,
        e.interest AS crm_interest,
        e.language AS crm_language,
        e.status AS crm_status,
        e.lifecycle_stage AS crm_lifecycle_stage,
        e.priority AS crm_priority,
        e.follow_up_date AS crm_follow_up_date,
        e.next_action AS crm_next_action

      FROM conversations c

      LEFT JOIN whatsapp_messages m
        ON m.id = c.last_message_id

      LEFT JOIN enquiries e
        ON e.id = c.enquiry_id

      ORDER BY
        c.last_message_timestamp DESC,
        c.last_message_id DESC

      LIMIT 200
    `).all();

    return json({
      ok: true,
      conversations:
        result.results || []
    });

  } catch (error) {
    console.error(
      "WhatsApp Inbox load failed:",
      error
    );

    return json({
      ok: false,
      error: "Unable to load WhatsApp Inbox"
    }, 500);
  }
}