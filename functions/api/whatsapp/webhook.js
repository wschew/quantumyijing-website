import {
  generateAcademyAssistantReply
} from "../ai/academy.js";

const MAX_WHATSAPP_HISTORY = 6;

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

async function verifyMetaSignature(
  rawBody,
  signatureHeader,
  appSecret
) {
  if (
    !signatureHeader ||
    !signatureHeader.startsWith("sha256=")
  ) {
    return false;
  }

  const receivedSignature =
    signatureHeader.slice(7);

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

  const expectedSignature =
    toHex(signature);

  return safeEqual(
    receivedSignature,
    expectedSignature
  );
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

/*
 * Convert a phone number to digits only.
 *
 * Examples:
 * +60164199839 -> 60164199839
 * 60164199839  -> 60164199839
 * 0164199839   -> 0164199839
 */
function normalizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "");
}

/*
 * Generate common CRM representations of a WhatsApp number.
 *
 * WhatsApp supplies:
 * 60164199839
 *
 * Existing CRM data may contain:
 * +60164199839
 * 60164199839
 * 0164199839
 */
function phoneCandidates(senderWaId) {
  const digits =
    normalizePhone(senderWaId);

  if (!digits) {
    return [];
  }

  const values = new Set([
    digits,
    `+${digits}`
  ]);

  if (digits.startsWith("60")) {
    values.add(
      `0${digits.slice(2)}`
    );
  }

  return [...values];
}

/*
 * Resolve a WhatsApp sender against existing enquiries.
 *
 * Exactly one matching enquiry:
 *   automatically link.
 *
 * Zero or multiple matches:
 *   do not guess.
 */
async function resolveEnquiryByPhone(
  db,
  senderWaId
) {
  const candidates =
    phoneCandidates(senderWaId);

  if (!candidates.length) {
    return {
      enquiryId: null,
      status: "no-phone"
    };
  }

  const placeholders =
    candidates.map(() => "?").join(", ");

  const result = await db.prepare(`
    SELECT
      id,
      name,
      phone
    FROM enquiries
    WHERE phone IN (${placeholders})
    ORDER BY id DESC
  `).bind(
    ...candidates
  ).all();

  const rows =
    Array.isArray(result?.results)
      ? result.results
      : [];

  const uniqueIds =
    [...new Set(
      rows
        .map((row) => Number(row.id))
        .filter(Number.isFinite)
    )];

  if (uniqueIds.length === 1) {
    return {
      enquiryId: uniqueIds[0],
      status: "matched"
    };
  }

  if (uniqueIds.length > 1) {
    return {
      enquiryId: null,
      status: "ambiguous",
      matches: uniqueIds.length
    };
  }

  return {
    enquiryId: null,
    status: "not-found"
  };
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

/*
 * Load recent WhatsApp conversation history.
 *
 * Current inbound message is excluded because
 * it is passed separately as Gemini's latest question.
 */
async function loadConversationHistory(
  db,
  senderWaId,
  currentMessageId
) {
  const result = await db.prepare(`
    SELECT
      direction,
      message_text
    FROM whatsapp_messages
    WHERE sender_wa_id = ?
      AND wa_message_id <> ?
      AND message_text IS NOT NULL
      AND TRIM(message_text) <> ''
      AND direction IN ('inbound', 'outbound')
    ORDER BY id DESC
    LIMIT ?
  `).bind(
    senderWaId,
    currentMessageId,
    MAX_WHATSAPP_HISTORY
  ).all();

  const rows =
    Array.isArray(result?.results)
      ? result.results
      : [];

  return rows
    .reverse()
    .map((row) => ({
      role:
        row.direction === "outbound"
          ? "assistant"
          : "user",
      content: row.message_text
    }));
}

async function sendWhatsAppReply({
  accessToken,
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
          `Bearer ${accessToken}`,
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
      "WhatsApp AI reply failed:",
      JSON.stringify(result)
    );

    return {
      ok: false,
      result
    };
  }

  console.log(
    "WhatsApp AI reply sent:",
    JSON.stringify(result)
  );

  return {
    ok: true,
    result
  };
}

/*
 * Store outbound AI response only after Meta
 * successfully accepts the message.
 */
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
      "WhatsApp outbound message ID missing; reply not stored."
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

  if (inserted) {
    console.log(
      "WhatsApp outbound AI reply stored."
    );

    if (enquiryId) {
      try {
        await logCrmActivity({
          db,
          enquiryId,
          activityType:
            "WhatsApp AI Reply",
          description:
            "Academy AI WhatsApp reply sent."
        });

        console.log(
          "WhatsApp outbound CRM activity logged."
        );
      } catch (error) {
        console.error(
          "WhatsApp outbound CRM activity failed:",
          error instanceof Error
            ? error.message
            : "Unknown error"
        );
      }
    }
  }

  return inserted;
}

export async function onRequestGet(context) {
  const url =
    new URL(context.request.url);

  const mode =
    url.searchParams.get(
      "hub.mode"
    );

  const token =
    url.searchParams.get(
      "hub.verify_token"
    );

  const challenge =
    url.searchParams.get(
      "hub.challenge"
    );

  const verifyToken =
    context.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error(
      "WHATSAPP_VERIFY_TOKEN is not configured."
    );

    return new Response(
      "Server configuration error",
      {
        status: 500
      }
    );
  }

  if (
    mode === "subscribe" &&
    token === verifyToken
  ) {
    console.log(
      "WhatsApp webhook verified."
    );

    return new Response(
      challenge || "",
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/plain"
        }
      }
    );
  }

  return new Response(
    "Forbidden",
    {
      status: 403
    }
  );
}

export async function onRequestPost(context) {
  const appSecret =
    context.env.WHATSAPP_APP_SECRET;

  const accessToken =
    context.env.WHATSAPP_ACCESS_TOKEN;

  const outboundPhoneNumberId =
    context.env.WHATSAPP_PHONE_NUMBER_ID ||
    null;

  if (!appSecret) {
    console.error(
      "WHATSAPP_APP_SECRET is not configured."
    );

    return new Response(
      "Server configuration error",
      {
        status: 500
      }
    );
  }

  const rawBody =
    await context.request.text();

  const signatureHeader =
    context.request.headers.get(
      "x-hub-signature-256"
    ) || "";

  const validSignature =
    await verifyMetaSignature(
      rawBody,
      signatureHeader,
      appSecret
    );

  if (!validSignature) {
    console.warn(
      "Rejected WhatsApp webhook with invalid signature."
    );

    return new Response(
      "Forbidden",
      {
        status: 403
      }
    );
  }

  let payload;

  try {
    payload =
      JSON.parse(rawBody);
  } catch (error) {
    console.error(
      "Invalid WhatsApp webhook JSON.",
      error
    );

    return new Response(
      "Bad Request",
      {
        status: 400
      }
    );
  }

  const db =
    context.env.ENQUIRIES_DB;

  if (!db) {
    console.error(
      "ENQUIRIES_DB is not configured."
    );

    return new Response(
      "Server configuration error",
      {
        status: 500
      }
    );
  }

  let stored = 0;

  for (
    const entry of payload.entry || []
  ) {
    const businessAccountId =
      entry.id || null;

    for (
      const change of entry.changes || []
    ) {
      if (
        change.field !== "messages"
      ) {
        continue;
      }

      const value =
        change.value || {};

      const incomingPhoneNumberId =
        value.metadata?.phone_number_id ||
        null;

      const contactMap =
        new Map(
          (value.contacts || []).map(
            (contact) => [
              contact.wa_id,
              contact.profile?.name ||
                null
            ]
          )
        );

      for (
        const message of value.messages ||
        []
      ) {
        const messageId =
          message.id;

        if (!messageId) {
          continue;
        }

        const senderWaId =
          message.from || null;

        const senderName =
          contactMap.get(senderWaId) ||
          null;

        const messageType =
          message.type || null;

        const messageText =
          extractText(message);

        const messageTimestamp =
          message.timestamp
            ? Number(message.timestamp)
            : null;

        /*
         * Resolve CRM enquiry before storing
         * the inbound WhatsApp message.
         */
        let enquiryId = null;

        if (senderWaId) {
          try {
            const crmMatch =
              await resolveEnquiryByPhone(
                db,
                senderWaId
              );

            enquiryId =
              crmMatch.enquiryId ||
              null;

            if (
              crmMatch.status ===
              "matched"
            ) {
              console.log(
                "WhatsApp CRM enquiry matched:",
                enquiryId
              );
            } else if (
              crmMatch.status ===
              "ambiguous"
            ) {
              console.warn(
                "WhatsApp CRM match ambiguous:",
                crmMatch.matches
              );
            } else {
              console.log(
                "WhatsApp CRM enquiry not matched."
              );
            }
          } catch (error) {
            console.error(
              "WhatsApp CRM matching failed:",
              error instanceof Error
                ? error.message
                : "Unknown error"
            );
          }
        }

        /*
         * Store inbound customer message.
         */
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
            messageId,
            incomingPhoneNumberId,
            businessAccountId,
            senderWaId,
            senderName,
            messageType,
            messageText,
            messageTimestamp,
            rawBody,
            "inbound",
            enquiryId
          ).run();

        const inserted =
          Number(
            insertResult?.meta?.changes ||
              0
          ) > 0;

        if (inserted) {
          stored += 1;

          /*
           * Log inbound WhatsApp CRM activity
           * only when we have an unambiguous
           * enquiry link.
           */
          if (enquiryId) {
            try {
              await logCrmActivity({
                db,
                enquiryId,
                activityType:
                  "WhatsApp",
                description:
                  "Inbound WhatsApp message received."
              });

              console.log(
                "WhatsApp inbound CRM activity logged."
              );
            } catch (error) {
              console.error(
                "WhatsApp inbound CRM activity failed:",
                error instanceof Error
                  ? error.message
                  : "Unknown error"
              );
            }
          }
        }

        if (
          inserted &&
          messageType === "text" &&
          messageText &&
          senderWaId &&
          accessToken &&
          outboundPhoneNumberId
        ) {
          try {
            const history =
              await loadConversationHistory(
                db,
                senderWaId,
                messageId
              );

            console.log(
              "WhatsApp conversation history loaded:",
              history.length
            );

            const aiReply =
              await generateAcademyAssistantReply({
                env: context.env,
                message: messageText,
                history
              });

            console.log(
              "Academy AI reply generated."
            );

            const sendResult =
              await sendWhatsAppReply({
                accessToken,
                phoneNumberId:
                  outboundPhoneNumberId,
                to: senderWaId,
                message: aiReply
              });

            if (sendResult.ok) {
              await storeOutboundReply({
                db,
                metaResult:
                  sendResult.result,
                phoneNumberId:
                  outboundPhoneNumberId,
                businessAccountId,
                senderWaId,
                enquiryId,
                message: aiReply
              });
            }

          } catch (error) {
            console.error(
              "WhatsApp Academy AI processing failed:",
              error instanceof Error
                ? error.message
                : "Unknown error"
            );
          }
        }
      }
    }
  }

  console.log(
    "Verified WhatsApp webhook processed.",
    {
      stored
    }
  );

  return new Response(
    "EVENT_RECEIVED",
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/plain"
      }
    }
  );
}