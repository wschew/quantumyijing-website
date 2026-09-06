import { generateGeminiResponse } from "./gemini.js";
import { ACADEMY_KNOWLEDGE } from "./knowledge/academy.js";

const MAX_MESSAGE_LENGTH = 1200;

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
- If the visitor writes in English, reply in English.
- If the visitor writes in Chinese, reply in Chinese.
- If the visitor mixes English and Chinese, respond naturally in the most appropriate language.
- Keep answers clear, concise and professional.

Important boundaries:
- Do not invent course dates, prices, policies, payment status, availability, credentials or Academy facts.
- If reliable information is not available in the supplied context, say that you do not have enough verified information.
- Do not claim that a registration or payment has succeeded unless the website system explicitly confirms it.
- Do not request passwords, API keys, credit-card numbers or other sensitive credentials.
- Public visitors do not have access to specialist student assistants.
- Do not provide student-only Bazi, Feng Shui, Yijing Divination or Quantum Mechanics course material through this public assistant.
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
            `Use the following verified Academy knowledge when answering.\n\n` +
            `${ACADEMY_KNOWLEDGE}\n\n` +
            `Visitor question:\n${message}`
        }
      ],
      temperature: 0.3,
      maxOutputTokens: 800
    });

    return json({
      ok: true,
      reply: result.text,
      model: result.model,
      usage: result.usage
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