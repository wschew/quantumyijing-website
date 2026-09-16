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

function cleanPhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 30);
}

async function loadConversation(db, phone) {
  const messages = await db.prepare(`
    SELECT
      id,
      wa_message_id,
      sender_wa_id,
      sender_name,
      direction,
      enquiry_id,
      message_type,
      message_text,
      message_timestamp,
      received_at

    FROM whatsapp_messages

    WHERE sender_wa_id = ?

    ORDER BY
      message_timestamp ASC,
      id ASC
  `).bind(phone).all();

  const rows = messages.results || [];

  if (!rows.length) {
    return null;
  }

  /*
   * A conversation may contain older messages that were received
   * before CRM linkage existed. Use the newest available enquiry_id
   * rather than requiring every historical message to be linked.
   */
  let enquiryId = null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const id = Number(rows[i].enquiry_id);

    if (Number.isInteger(id) && id > 0) {
      enquiryId = id;
      break;
    }
  }

  let enquiry = null;

  if (enquiryId) {
    enquiry = await db.prepare(`
      SELECT
        id,
        reference,
        name,
        email,
        phone,
        country,
        interest,
        language,
        status,
        source,
        lifecycle_stage,
        priority,
        contact_preference,
        follow_up_date,
        next_action,
        last_contacted_at,
        updated_at

      FROM enquiries

      WHERE id = ?
    `).bind(enquiryId).first();
  }

  let whatsappName = "";

  for (let i = rows.length - 1; i >= 0; i--) {
    if (
      rows[i].direction === "inbound" &&
      String(rows[i].sender_name || "").trim()
    ) {
      whatsappName =
        String(rows[i].sender_name).trim();

      break;
    }
  }

  return {
    sender_wa_id: phone,
    whatsapp_name: whatsappName,
    message_count: rows.length,
    enquiry_id: enquiryId,
    enquiry: enquiry || null,
    messages: rows
  };
}

async function loadConversationList(db) {
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

  return result.results || [];
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
    const url = new URL(request.url);
    const requestedPhone =
      url.searchParams.get("phone");

    /*
     * Detail mode:
     * GET /api/admin/whatsapp-inbox?phone=601...
     */
    if (requestedPhone !== null) {
      const phone = cleanPhone(requestedPhone);

      if (!phone) {
        return json({
          ok: false,
          error: "Invalid WhatsApp number"
        }, 400);
      }

      const conversation =
        await loadConversation(db, phone);

      if (!conversation) {
        return json({
          ok: false,
          error: "WhatsApp conversation not found"
        }, 404);
      }

      return json({
        ok: true,
        conversation
      });
    }

    /*
     * List mode:
     * GET /api/admin/whatsapp-inbox
     */
    const conversations =
      await loadConversationList(db);

    return json({
      ok: true,
      conversations
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