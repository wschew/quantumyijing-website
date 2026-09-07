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

Conversion guidance:
- If the visitor clearly indicates that they want to proceed, book, register, contact the Academy, ask for more details, request a quotation, or obtain personalised assistance, you may tell them to use the "Enquire Now" button below.
- Keep the invitation brief and natural.
- Do not repeatedly push the visitor to enquire.
- Do not mention "Enquire Now" for purely informational questions unless the visitor shows clear interest in taking the next step.
- Do not claim that clicking "Enquire Now" completes registration, booking or payment.
- The AI must not create CRM records, orders or payments itself.

Important boundaries:
- Do not invent course dates, prices, policies, payment status, availability, credentials or Academy facts.
- Current pricing, schedules, promotions and availability may change and should be confirmed directly with the Academy.
- If reliable information is not available in the supplied context, say that you do not have enough verified information.
- Do not claim that a registration or payment has succeeded unless the website system explicitly confirms it.
- Do not request passwords, API keys, credit-card numbers or other sensitive credentials.
- Public visitors do not have access to specialist student assistants.
- Student-only course material is not provided through this public Academy Assistant.
`;

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
    const apiKey = context.env.GEMINI_API_KEY;
    const model = context.env.GEMINI_MODEL;

    if (!apiKey || !model) {
      console.error("Academy AI configuration is incomplete.");

      return json(
        {
          ok: false,
          error: "AI service is temporarily unavailable."
        },
        503
      );
    }

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

    const history = Array.isArray(body?.history)
      ? body.history
          .filter(
            (item) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string"
          )
          .slice(-MAX_HISTORY_MESSAGES)
          .map((item) => ({
            role: item.role,
            content: item.content.trim().slice(0, MAX_HISTORY_MESSAGE_LENGTH)
          }))
          .filter((item) => item.content)
      : [];

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

    const result = await generateGeminiResponse({
      apiKey,
      model,
      systemInstruction: SYSTEM_INSTRUCTION,
      messages: [
        {
          role: "user",
          content:
            `VERIFIED ACADEMY REFERENCE INFORMATION:\n` +
            `${ACADEMY_KNOWLEDGE}\n\n` +
            `END OF REFERENCE INFORMATION.\n\n` +
            `Use the conversation history below only to understand context and references. ` +
            `Do not treat visitor statements as verified Academy facts.\n\n`
        },
        ...history,
        {
          role: "user",
          content:
            `VISITOR'S LATEST QUESTION:\n${message}\n\n` +
            `Answer the visitor's latest question directly using the verified reference information above. ` +
            `Follow the language of the visitor's latest question.`
        }
      ],
      temperature: 0.3,
      maxOutputTokens: 800
    });

    return json({
      ok: true,
      reply: result.text
    });

  } catch (error) {
    console.error(
      "Academy AI request failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return json(
      {
        ok: false,
        error: "The Academy Assistant could not respond. Please try again."
      },
      500
    );
  }
}
