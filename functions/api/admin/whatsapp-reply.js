function bearer(request) {
  const header =
    request.headers.get("authorization") || "";

  return header
    .toLowerCase()
    .startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
}

function authorized(request, env) {
  return (
    !!env.ADMIN_TOKEN &&
    bearer(request) === env.ADMIN_TOKEN
  );
}

function dbOf(env) {
  return (
    env.ENQUIRIES_DB ||
    env.DB ||
    env.D1 ||
    null
  );
}

function json(data, status = 200) {
  return Response.json(
    data,
    {
      status,
      headers: {
        "cache-control": "no-store"
      }
    }
  );
}

function cleanPhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 30);
}

function cleanMessage(value) {
  return String(value || "")
    .trim()
    .slice(0, 4096);
}

async function logCrmActivity({
  db,
  enquiryId,
  activityType,
  description
}) {
  if (!enquiryId) {
    return;
  }

  const activityDate =
    new Date().toISOString();

  await db.prepare(`
    INSERT INTO crm_activities (
      enquiry_id,
      activity_type,
      description,
      activity_date
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    enquiryId,
    activityType,
    description,
    activityDate
  ).run();
}

async function loadConversation({
  db,
  phone
}) {
  const exists = await db.prepare(`
    SELECT 1
    FROM whatsapp_messages
    WHERE sender_wa_id = ?
    LIMIT 1
  `).bind(
    phone
  ).first();

  if (!exists) {
    return null;
  }

  const modeRow = await db.prepare(`
    SELECT reply_mode
    FROM whatsapp_conversations
    WHERE sender_wa_id = ?
    LIMIT 1
  `).bind(
    phone
  ).first();

  const replyMode =
    modeRow?.reply_mode === "manual"
      ? "manual"
      : "ai";

  const enquiryRow = await db.prepare(`
    SELECT enquiry_id
    FROM whatsapp_messages
    WHERE sender_wa_id = ?
      AND enquiry_id IS NOT NULL
    ORDER BY
      COALESCE(
        message_timestamp,
        0
      ) DESC,
      id DESC
    LIMIT 1
  `).bind(
    phone
  ).first();

  return {
    replyMode,
    enquiryId:
      enquiryRow?.enquiry_id || null
  };
}

async function sendWhatsAppMessage({
  token,
  phoneNumberId,
  to,
  message
}) {
  const response = await fetch(
    `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${token}`,
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        messaging_product:
          "whatsapp",
        recipient_type:
          "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: message
        }
      })
    }
  );

  const result =
    await response.json();

  if (!response.ok) {
    console.error(
      "WhatsApp manual reply failed:",
      JSON.stringify(result)
    );

    return {
      ok: false,
      status: response.status,
      result
    };
  }

  return {
    ok: true,
    status: response.status,
    result
  };
}

async function storeOutboundReply({
  db,
  metaResult,
  phoneNumberId,
  businessAccountId,
  senderWaId,
  enquiryId,
  message
}) {
  const outboundMessageId =
    metaResult?.messages?.[0]?.id ||
    null;

  if (!outboundMessageId) {
    console.warn(
      "WhatsApp manual outbound message ID missing; reply not stored."
    );

    return false;
  }

  const now =
    Math.floor(Date.now() / 1000);

  const insertResult =
    await db.prepare(`
      INSERT OR IGNORE INTO whatsapp_messages (
        wa_message_id,
        wa_phone_number_id,
        wa_business_account_id,
        sender_wa_id,
        sender_name,
        message_type,
        message_text,
        message_timestamp,
        raw_payload,
        direction,
        enquiry_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      outboundMessageId,
      phoneNumberId,
      businessAccountId,
      senderWaId,
      "Quantum YiJing Academy",
      "text",
      message,
      now,
      JSON.stringify(metaResult),
      "outbound",
      enquiryId
    ).run();

  const inserted =
    Number(
      insertResult?.meta?.changes || 0
    ) > 0;

  if (
    inserted &&
    enquiryId
  ) {
    try {
      await logCrmActivity({
        db,
        enquiryId,
        activityType:
          "WhatsApp Manual Reply",
        description:
          "Academy staff WhatsApp reply sent."
      });
    } catch (error) {
      console.error(
        "WhatsApp manual reply CRM activity failed:",
        error instanceof Error
          ? error.message
          : "Unknown error"
      );
    }
  }

  return inserted;
}

export async function onRequestPost({
  request,
  env
}) {
  if (!authorized(request, env)) {
    return json(
      {
        ok: false,
        error: "Unauthorized"
      },
      401
    );
  }

  const db =
    dbOf(env);

  if (!db) {
    return json(
      {
        ok: false,
        error: "Database unavailable"
      },
      503
    );
  }

  const token =
    env.WHATSAPP_ACCESS_TOKEN;

  const phoneNumberId =
    env.WHATSAPP_PHONE_NUMBER_ID;

  const businessAccountId =
    env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    null;

  if (
    !token ||
    !phoneNumberId
  ) {
    return json(
      {
        ok: false,
        error:
          "WhatsApp configuration missing"
      },
      503
    );
  }

  let body;

  try {
    body =
      await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const phone =
    cleanPhone(body.phone);

  const message =
    cleanMessage(body.message);

  if (!phone) {
    return json(
      {
        ok: false,
        error:
          "Invalid WhatsApp number"
      },
      400
    );
  }

  if (!message) {
    return json(
      {
        ok: false,
        error:
          "Message is required"
      },
      400
    );
  }

  try {
    const conversation =
      await loadConversation({
        db,
        phone
      });

    if (!conversation) {
      return json(
        {
          ok: false,
          error:
            "WhatsApp conversation not found"
        },
        404
      );
    }

    if (
      conversation.replyMode !==
      "manual"
    ) {
      return json(
        {
          ok: false,
          error:
            "Conversation must be in Manual mode before sending a staff reply"
        },
        409
      );
    }

    const sent =
      await sendWhatsAppMessage({
        token,
        phoneNumberId,
        to: phone,
        message
      });

    if (!sent.ok) {
      return json(
        {
          ok: false,
          error:
            "WhatsApp API request failed",
          details: sent.result
        },
        sent.status
      );
    }

    const stored =
      await storeOutboundReply({
        db,
        metaResult: sent.result,
        phoneNumberId,
        businessAccountId,
        senderWaId: phone,
        enquiryId:
          conversation.enquiryId,
        message
      });

    if (!stored) {
      console.error(
        "WhatsApp manual reply was accepted by Meta but could not be stored."
      );

      return json(
        {
          ok: false,
          sent: true,
          stored: false,
          error:
            "Message sent but outbound history could not be stored"
        },
        500
      );
    }

    return json({
      ok: true,
      sent: true,
      stored: true,
      sender_wa_id: phone,
      enquiry_id:
        conversation.enquiryId,
      wa_message_id:
        sent.result?.messages?.[0]?.id ||
        null
    });

  } catch (error) {
    console.error(
      "WhatsApp Admin manual reply failed:",
      error
    );

    return json(
      {
        ok: false,
        error:
          "Unable to send WhatsApp manual reply"
      },
      500
    );
  }
}