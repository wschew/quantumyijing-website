function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const receivedSignature = signatureHeader.slice(7);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );

  const expectedSignature = toHex(signature);

  return safeEqual(receivedSignature, expectedSignature);
}

function extractText(message) {
  if (!message) return null;

  if (message.type === "text") {
    return message.text?.body || null;
  }

  if (message.type === "button") {
    return message.button?.text || null;
  }

  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      null
    );
  }

  return null;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = context.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("WHATSAPP_VERIFY_TOKEN is not configured.");

    return new Response("Server configuration error", {
      status: 500
    });
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("WhatsApp webhook verified.");

    return new Response(challenge || "", {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }

  return new Response("Forbidden", {
    status: 403
  });
}

export async function onRequestPost(context) {
  const appSecret = context.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    console.error("WHATSAPP_APP_SECRET is not configured.");

    return new Response("Server configuration error", {
      status: 500
    });
  }

  const rawBody = await context.request.text();

  const signatureHeader =
    context.request.headers.get("x-hub-signature-256") || "";

  const validSignature = await verifyMetaSignature(
    rawBody,
    signatureHeader,
    appSecret
  );

  if (!validSignature) {
    console.warn("Rejected WhatsApp webhook with invalid signature.");

    return new Response("Forbidden", {
      status: 403
    });
  }

  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error("Invalid WhatsApp webhook JSON.", error);

    return new Response("Bad Request", {
      status: 400
    });
  }

  const db = context.env.ENQUIRIES_DB;

  if (!db) {
    console.error("ENQUIRIES_DB is not configured.");

    return new Response("Server configuration error", {
      status: 500
    });
  }

  let stored = 0;

  for (const entry of payload.entry || []) {
    const businessAccountId = entry.id || null;

    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;

      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id || null;

      const contactMap = new Map(
        (value.contacts || []).map((contact) => [
          contact.wa_id,
          contact.profile?.name || null
        ])
      );

      for (const message of value.messages || []) {
        const messageId = message.id;

        if (!messageId) continue;

        const senderWaId = message.from || null;
        const senderName = contactMap.get(senderWaId) || null;
        const messageType = message.type || null;
        const messageText = extractText(message);
        const messageTimestamp = message.timestamp
          ? Number(message.timestamp)
          : null;

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
            raw_payload
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          messageId,
          phoneNumberId,
          businessAccountId,
          senderWaId,
          senderName,
          messageType,
          messageText,
          messageTimestamp,
          rawBody
        ).run();

        stored += 1;
      }
    }
  }

  console.log("Verified WhatsApp webhook processed.", {
    stored
  });

  return new Response("EVENT_RECEIVED", {
    status: 200,
    headers: {
      "Content-Type": "text/plain"
    }
  });
}