import { generateGeminiResponse } from "./gemini.js";
import { ACADEMY_KNOWLEDGE } from "./knowledge/academy.js";

const MAX_MESSAGE_LENGTH = 1200;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_LENGTH = 1200;

const SYSTEM_INSTRUCTION = `
You are the official AI Academy Assistant for Quantum YiJing International Academy.

Your role is to help public visitors with:
- Quantum YiJing International Academy
- Master Chew Wai Soon
- Academy courses, products and services
- course registration
- payment guidance
- general Academy enquiries

Language:
- Always detect the language of the visitor's latest question.
- If the latest question is in Chinese, answer entirely in Chinese.
- If the latest question is in English, answer entirely in English.
- If the visitor mixes English and Chinese, use the dominant language of the question.
- Do not give a bilingual answer unless the visitor specifically requests both languages.
- Answer the visitor's actual question directly. Do not replace an answer with a generic greeting or introduction.
- Keep answers clear, concise and professional.

Intent recognition:
- Use the visitor's latest question together with recent conversation context to understand the visitor's likely need.
- Recognize relevant Academy enquiry areas when supported by the conversation, including:
  - Academy Course
  - Bazi Consultation
  - Feng Shui Consultation
  - Baby Naming
  - Research Collaboration
  - Media / Speaking
  - General Enquiry
- Do not force every question into one of these categories.
- If the visitor's intent is unclear, answer the question first rather than making an unnecessary recommendation.
- Do not expose internal category names, classification labels or reasoning unless the visitor asks.

Recommendation behaviour:
- When the visitor's stated need clearly matches a verified Academy course or service, you may briefly recommend the most relevant Academy offering.
- Explain the recommendation in one short, useful sentence tied to the visitor's actual need.
- Prefer one best-fit recommendation rather than listing many unrelated services.
- Do not recommend an offering merely to promote the Academy.
- Do not invent programme details, outcomes, prices, dates, availability or guarantees.
- If the verified Academy reference does not support a specific recommendation, say that you do not have enough verified information.

Current product information:
- The supplied verified reference may include a CURRENT ACTIVE PRODUCTS section loaded from the Academy database.
- Treat that section as verified current Academy information for this response.
- You may state the course name, dates, price, early-bird price and deadline, delivery mode, language, instructor, and description when those values are explicitly present there.
- Do not invent missing product fields.
- If a current value is absent from the supplied verified reference, say that it needs to be confirmed with the Academy.

Conversion guidance:
- If the visitor clearly indicates that they want to proceed, book, register, contact the Academy, ask for more details, request a quotation, or obtain personalised assistance, follow the channel guidance supplied with the latest question.
- On the website, you may briefly direct the visitor to the "Enquire Now" button when appropriate.
- On WhatsApp, invite the visitor to reply in the same WhatsApp conversation for assistance. Never tell a WhatsApp visitor to use an "Enquire Now" button.
- Keep the invitation brief and natural.
- Do not repeatedly push the visitor to enquire.
- Do not add a conversion invitation for purely informational questions unless the visitor shows clear interest in taking the next step.
- Do not claim that an enquiry action completes registration, booking or payment.
- The AI must not create CRM records, orders or payments itself.

Important boundaries:
- Do not invent course dates, prices, policies, payment status, availability, credentials or Academy facts.
- Dynamic product information supplied from the Academy database may be used as verified current information.
- If reliable information is not available in the supplied context, say that you do not have enough verified information.
- Do not claim that a registration or payment has succeeded unless the website system explicitly confirms it.
- Do not request passwords, API keys, credit-card numbers or other sensitive credentials.
- Public visitors do not have access to specialist student assistants.
- Student-only course material is not provided through this public Academy Assistant.
`;

function cleanHistory(history) {
  return Array.isArray(history)
    ? history
        .filter(
          (item) =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string"
        )
        .slice(-MAX_HISTORY_MESSAGES)
        .map((item) => ({
          role: item.role,
          content: item.content
            .trim()
            .slice(0, MAX_HISTORY_MESSAGE_LENGTH)
        }))
        .filter((item) => item.content)
    : [];
}

function formatDateRange(startsOn, endsOn) {
  const start = String(startsOn || "").trim();
  const end = String(endsOn || "").trim();

  if (start && end) return `${start} to ${end}`;
  return start || end || "";
}

function money(value, currency) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "";
  }

  return `${String(currency || "MYR").trim()} ${amount.toFixed(2)}`;
}

/*
 * Load changing, verified public product information directly
 * from the Academy D1 database.
 */
async function loadVerifiedProductKnowledge(env) {
  const db = env.ENQUIRIES_DB;

  if (!db) {
    console.warn(
      "Academy AI product knowledge skipped: ENQUIRIES_DB is not configured."
    );
    return "";
  }

  try {
    const result = await db.prepare(`
      SELECT
        sku,
        slug,
        product_type,
        name_en,
        name_zh,
        description_en,
        description_zh,
        price,
        currency,
        starts_on,
        ends_on,
        time_en,
        time_zh,
        delivery_en,
        delivery_zh,
        instructor,
        early_bird_price,
        early_bird_end,
        language_en,
        language_zh
      FROM products
      WHERE status = 'Active'
      ORDER BY id ASC
      LIMIT 20
    `).all();

    const products =
      Array.isArray(result?.results)
        ? result.results
        : [];

    if (!products.length) {
      return "";
    }

    const lines = [
      "CURRENT ACTIVE PRODUCTS",
      "",
      "The following information is loaded from the Academy database and is verified current information for this response.",
      ""
    ];

    for (const product of products) {
      lines.push(`Product: ${product.name_en || product.name_zh || product.sku || product.slug}`);

      if (product.name_zh) {
        lines.push(`Chinese name: ${product.name_zh}`);
      }

      if (product.sku) {
        lines.push(`Code: ${product.sku}`);
      }

      if (product.product_type) {
        lines.push(`Type: ${product.product_type}`);
      }

      const dateRange =
        formatDateRange(
          product.starts_on,
          product.ends_on
        );

      if (dateRange) {
        lines.push(`Dates: ${dateRange}`);
      }

      const standardPrice =
        money(
          product.price,
          product.currency
        );

      if (standardPrice) {
        lines.push(`Standard price: ${standardPrice}`);
      }

      const earlyBirdPrice =
        money(
          product.early_bird_price,
          product.currency
        );

      if (
        earlyBirdPrice &&
        product.early_bird_end
      ) {
        lines.push(
          `Early-bird price: ${earlyBirdPrice} until ${product.early_bird_end}`
        );
      }

      if (product.time_en) {
        lines.push(`Time: ${product.time_en}`);
      }

      if (product.delivery_en) {
        lines.push(`Delivery: ${product.delivery_en}`);
      }

      if (product.language_en) {
        lines.push(`Language: ${product.language_en}`);
      }

      if (product.instructor) {
        lines.push(`Instructor: ${product.instructor}`);
      }

      if (product.description_en) {
        lines.push(`Description: ${product.description_en}`);
      }

      if (product.description_zh) {
        lines.push(`Chinese description: ${product.description_zh}`);
      }

      if (product.slug) {
        lines.push(`Product path: /product/${product.slug}`);
      }

      lines.push("");
    }

    return lines.join("\n").trim();
  } catch (error) {
    console.error(
      "Academy AI product knowledge load failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return "";
  }
}

/*
 * Shared Academy AI function.
 *
 * Used by:
 * - Website Academy Assistant
 * - WhatsApp Academy Assistant
 */
export async function generateAcademyAssistantReply({
  env,
  message,
  history = [],
  channel = "website"
}) {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL;

  if (!apiKey || !model) {
    throw new Error("Academy AI configuration is incomplete.");
  }

  const cleanMessage =
    typeof message === "string"
      ? message.trim()
      : "";

  if (!cleanMessage) {
    throw new Error("EMPTY_MESSAGE");
  }

  if (cleanMessage.length > MAX_MESSAGE_LENGTH) {
    throw new Error("MESSAGE_TOO_LONG");
  }

  const cleanConversationHistory =
    cleanHistory(history);

  const cleanChannel =
    channel === "whatsapp"
      ? "whatsapp"
      : "website";

  const channelGuidance =
    cleanChannel === "whatsapp"
      ? `CHANNEL: WHATSAPP\nIf the visitor wants to proceed or needs assistance, invite them to reply in this WhatsApp conversation. Do not mention an "Enquire Now" button.`
      : `CHANNEL: WEBSITE\nIf the visitor wants to proceed or needs assistance, you may direct them to the "Enquire Now" button when appropriate.`;

  const currentProductKnowledge =
    await loadVerifiedProductKnowledge(env);

  const verifiedReference =
    currentProductKnowledge
      ? `${ACADEMY_KNOWLEDGE}\n\n${currentProductKnowledge}`
      : ACADEMY_KNOWLEDGE;

  const result = await generateGeminiResponse({
    apiKey,
    model,
    systemInstruction: SYSTEM_INSTRUCTION,
    messages: [
      {
        role: "user",
        content:
          `VERIFIED ACADEMY REFERENCE INFORMATION:\n` +
          `${verifiedReference}\n\n` +
          `END OF REFERENCE INFORMATION.\n\n` +
          `Use the conversation history below only to understand context and references. ` +
          `Do not treat visitor statements as verified Academy facts.\n\n`
      },
      ...cleanConversationHistory,
      {
        role: "user",
        content:
          `${channelGuidance}\n\n` +
          `VISITOR'S LATEST QUESTION:\n${cleanMessage}\n\n` +
          `Answer the visitor's latest question directly using the verified reference information above. ` +
          `Follow the language of the visitor's latest question and the channel guidance above.`
      }
    ],
    temperature: 0.3,
    maxOutputTokens: 800
  });

  return result.text;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost(context) {
  try {
    let body;

    try {
      body = await context.request.json();
    } catch {
      return json(
        {
          ok: false,
          error: "Invalid JSON request."
        },
        400
      );
    }

    const message =
      typeof body?.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return json(
        {
          ok: false,
          error: "Please enter a message."
        },
        400
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return json(
        {
          ok: false,
          error: `Message is too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`
        },
        400
      );
    }

    const reply =
      await generateAcademyAssistantReply({
        env: context.env,
        message,
        history: body?.history,
        channel: "website"
      });

    return json({
      ok: true,
      reply
    });

  } catch (error) {
    console.error(
      "Academy AI request failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return json(
      {
        ok: false,
        error:
          "The Academy Assistant could not respond. Please try again."
      },
      500
    );
  }
}
