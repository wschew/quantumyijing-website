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

function cleanSearch(value) {
  return String(value || "")
    .trim()
    .slice(0, 120);
}

function cleanFilter(value) {
  const filter = String(value || "")
    .trim()
    .toLowerCase();

  return [
    "unread",
    "manual",
    "ai",
    "open",
    "follow_up",
    "closed"
  ].includes(filter)
    ? filter
    : "all";
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

async function loadConversationStatus(db, phone) {
  const row = await db.prepare(`
    SELECT conversation_status
    FROM whatsapp_conversations
    WHERE sender_wa_id = ?
    LIMIT 1
  `).bind(phone).first();

  return ["follow_up", "closed"].includes(row?.conversation_status)
    ? row.conversation_status
    : "open";
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

  const conversationStatus =
    await loadConversationStatus(db, phone);

  return {
    sender_wa_id: phone,
    whatsapp_name: whatsappName,
    message_count: rows.length,
    enquiry_id: enquiryId,
    enquiry: enquiry || null,
    reply_mode: replyMode,
    conversation_status: conversationStatus,
    messages: rows
  };
}

async function loadConversationList(db, search = "", filter = "all") {
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

      CASE
        WHEN wc.conversation_status = 'follow_up'
        THEN 'follow_up'
        WHEN wc.conversation_status = 'closed'
        THEN 'closed'
        ELSE 'open'
      END AS conversation_status,

      (
        SELECT COUNT(*)
        FROM whatsapp_messages unread
        WHERE unread.sender_wa_id = c.sender_wa_id
          AND unread.direction = 'inbound'
          AND unread.id > COALESCE(
            wc.last_read_message_id,
            0
          )
      ) AS unread_count,

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

    WHERE (
      ? = ''
      OR c.sender_wa_id LIKE ?
      OR c.whatsapp_name LIKE ?
      OR e.name LIKE ?
      OR e.reference LIKE ?
    )
      AND (
        ? = 'all'
        OR (
          ? = 'manual'
          AND wc.reply_mode = 'manual'
        )
        OR (
          ? = 'ai'
          AND (
            wc.reply_mode = 'ai'
            OR wc.reply_mode IS NULL
          )
        )
        OR (
          ? = 'unread'
          AND (
            SELECT COUNT(*)
            FROM whatsapp_messages unread_filter
            WHERE unread_filter.sender_wa_id =
              c.sender_wa_id
              AND unread_filter.direction = 'inbound'
              AND unread_filter.id > COALESCE(
                wc.last_read_message_id,
                0
              )
          ) > 0
        )
        OR (
          ? = 'open'
          AND (
            wc.conversation_status = 'open'
            OR wc.conversation_status IS NULL
          )
        )
        OR (
          ? = 'follow_up'
          AND wc.conversation_status = 'follow_up'
        )
        OR (
          ? = 'closed'
          AND wc.conversation_status = 'closed'
        )
      )

    ORDER BY
      c.last_message_timestamp DESC,
      c.last_message_id DESC

    LIMIT 200
  `).bind(
    search,
    `%${search}%`,
    `%${search}%`,
    `%${search}%`,
    `%${search}%`,
    filter,
    filter,
    filter,
    filter,
    filter,
    filter,
    filter
  ).all();

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

    const search =
      cleanSearch(url.searchParams.get("q"));

    const filter =
      cleanFilter(url.searchParams.get("filter"));

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
      await loadConversationList(
        db,
        search,
        filter
      );

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

    if (!phone) {
      return json({
        ok: false,
        error: "Invalid WhatsApp number"
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

    if (body.action === "mark_read") {
      const latest = await db.prepare(`
        SELECT MAX(id) AS last_message_id
        FROM whatsapp_messages
        WHERE sender_wa_id = ?
      `).bind(phone).first();

      const lastReadMessageId =
        Number(latest?.last_message_id || 0);

      if (!Number.isInteger(lastReadMessageId) ||
          lastReadMessageId <= 0) {
        return json({
          ok: false,
          error: "WhatsApp conversation not found"
        }, 404);
      }

      await db.prepare(`
        INSERT INTO whatsapp_conversations (
          sender_wa_id,
          reply_mode,
          last_read_message_id,
          updated_at
        )
        VALUES (?, 'ai', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(sender_wa_id)
        DO UPDATE SET
          last_read_message_id =
            excluded.last_read_message_id,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        phone,
        lastReadMessageId
      ).run();

      const replyMode =
        await loadReplyMode(db, phone);

      return json({
        ok: true,
        sender_wa_id: phone,
        action: "mark_read",
        last_read_message_id: lastReadMessageId,
        reply_mode: replyMode
      });
    }

    if (body.action === "set_status") {
      const conversationStatus =
        ["open", "follow_up", "closed"].includes(
          body.conversation_status
        )
          ? body.conversation_status
          : "";

      if (!conversationStatus) {
        return json({
          ok: false,
          error: "Invalid WhatsApp conversation status"
        }, 400);
      }

      await db.prepare(`
        INSERT INTO whatsapp_conversations (
          sender_wa_id,
          reply_mode,
          conversation_status,
          updated_at
        )
        VALUES (?, 'ai', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(sender_wa_id)
        DO UPDATE SET
          conversation_status =
            excluded.conversation_status,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        phone,
        conversationStatus
      ).run();

      const replyMode =
        await loadReplyMode(db, phone);

      return json({
        ok: true,
        sender_wa_id: phone,
        action: "set_status",
        conversation_status: conversationStatus,
        reply_mode: replyMode
      });
    }

    const replyMode =
      body.reply_mode === "manual"
        ? "manual"
        : body.reply_mode === "ai"
          ? "ai"
          : "";

    if (!replyMode) {
      return json({
        ok: false,
        error: "Invalid WhatsApp reply mode"
      }, 400);
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
      "WhatsApp Inbox update failed:",
      error
    );

    return json({
      ok: false,
      error: "Unable to update WhatsApp Inbox"
    }, 500);
  }
}
