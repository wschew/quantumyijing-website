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

async function loadReplyMode(db, phone) {
  const row = await db.prepare(`
    SELECT reply_mode
    FROM whatsapp_conversations
    WHERE sender_wa_id = ?
    LIMIT 1
  `).bind(phone).first();

  return row?.reply_mode === "manual"
    ? "manual"
    : "ai";
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

  const replyMode =
    await loadReplyMode(db, phone);

  return {
    sender_wa_id: phone,
    whatsapp_name: whatsappName,
    message_count: rows.length,
    enquiry_id: enquiryId,
    enquiry: enquiry || null,
    reply_mode: replyMode,
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

      CASE
        WHEN wc.reply_mode = 'manual'
        THEN 'manual'
        ELSE 'ai'
      END AS reply_mode,

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

    LEFT JOIN whatsapp_conversations wc
      ON wc.sender_wa_id = c.sender_wa_id

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

export async function onRequestPost({
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
    const body =
      await request.json().catch(() => ({}));

    const phone =
      cleanPhone(body.phone);

    const replyMode =
      body.reply_mode === "manual"
        ? "manual"
        : body.reply_mode === "ai"
          ? "ai"
          : "";

    if (!phone) {
      return json({
        ok: false,
        error: "Invalid WhatsApp number"
      }, 400);
    }

    if (!replyMode) {
      return json({
        ok: false,
        error: "Invalid WhatsApp reply mode"
      }, 400);
    }

    const exists = await db.prepare(`
      SELECT 1
      FROM whatsapp_messages
      WHERE sender_wa_id = ?
      LIMIT 1
    `).bind(phone).first();

    if (!exists) {
      return json({
        ok: false,
        error: "WhatsApp conversation not found"
      }, 404);
    }

    await db.prepare(`
      INSERT INTO whatsapp_conversations (
        sender_wa_id,
        reply_mode,
        updated_at
      )
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(sender_wa_id)
      DO UPDATE SET
        reply_mode = excluded.reply_mode,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      phone,
      replyMode
    ).run();

    return json({
      ok: true,
      sender_wa_id: phone,
      reply_mode: replyMode
    });

  } catch (error) {
    console.error(
      "WhatsApp Inbox reply mode update failed:",
      error
    );

    return json({
      ok: false,
      error: "Unable to update WhatsApp reply mode"
    }, 500);
  }
}
