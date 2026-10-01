import { generateGeminiResponse } from "../ai/gemini.js";

const MAX_PROMPT_LENGTH = 10000;
const MAX_TITLE_LENGTH = 500;
const MAX_SOURCE_REFERENCE_LENGTH = 1000;

const ALLOWED_CONTENT_TYPES = new Set([
  "social_post",
  "whatsapp_copy",
  "email_copy",
  "course_promotion",
  "educational_post",
  "lead_magnet_promotion",
  "affiliate_asset"
]);

const ALLOWED_LANGUAGES = new Set([
  "en",
  "zh"
]);


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}


function bearerToken(request) {
  const header =
    request.headers.get("authorization") || "";

  return header
    .toLowerCase()
    .startsWith("bearer ")
      ? header.slice(7).trim()
      : "";
}


function authorized(request, env) {
  const supplied =
    bearerToken(request);

  const expected =
    String(env.ADMIN_TOKEN || "").trim();

  return Boolean(
    expected &&
    supplied &&
    supplied === expected
  );
}


function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}


function languageName(language) {
  return language === "zh"
    ? "Simplified Chinese"
    : "English";
}


function contentTypeGuidance(contentType) {
  switch (contentType) {

    case "whatsapp_copy":
      return (
        "Write concise WhatsApp marketing copy suitable for human review. " +
        "Do not imply that the message has been sent."
      );

    case "email_copy":
      return (
        "Write professional email marketing copy suitable for human review. " +
        "Do not invent a recipient, send status, or campaign result."
      );

    case "course_promotion":
      return (
        "Write course-promotion copy. " +
        "Do not invent dates, prices, availability, outcomes, credentials, or guarantees."
      );

    case "educational_post":
      return (
        "Write an educational post that is clear, accessible and informative. " +
        "Avoid unsupported factual claims."
      );

    case "lead_magnet_promotion":
      return (
        "Write promotional copy for a lead magnet. " +
        "Do not invent download statistics, testimonials or outcomes."
      );

    case "affiliate_asset":
      return (
        "Write reusable affiliate marketing copy for later human review. " +
        "Do not invent commissions, affiliate terms, prices or promotional conditions."
      );

    default:
      return (
        "Write social-media content suitable for later human review."
      );
  }
}


function buildSystemInstruction({
  contentType,
  language
}) {

  return `
You are the internal AI Content Studio writer for Quantum YiJing International Academy.

Your task is to draft marketing or educational content for review by an Academy administrator.

IMPORTANT WORKFLOW BOUNDARIES:
- You generate draft text only.
- You do not publish, send, post, message, register, book, charge, refund, pay commissions, or modify customer records.
- Every output will be reviewed by a human before any external use.

FACTUAL ACCURACY:
- Use only facts explicitly supplied in the administrator's prompt.
- Do not invent course dates, prices, deadlines, availability, credentials, policies, statistics, testimonials, guarantees, payment status, affiliate terms or business claims.
- If a requested factual detail is not supplied, omit it rather than inventing it.
- Do not claim that any campaign, registration, payment, booking, enquiry or transaction has occurred.

STYLE:
- Produce polished text ready for human editing.
- Keep the requested purpose and audience in mind.
- Do not include meta-commentary such as "Here is your draft".
- Return only the draft content itself.

CONTENT TYPE:
${contentTypeGuidance(contentType)}

REQUIRED OUTPUT LANGUAGE:
${languageName(language)}
`.trim();
}


export async function onRequestPost(context) {

  const {
    request,
    env
  } = context;


  if (!authorized(request, env)) {
    return json(
      {
        ok: false,
        error: "Unauthorized"
      },
      401
    );
  }


  if (!env.ENQUIRIES_DB) {
    return json(
      {
        ok: false,
        error: "Content Studio database is not configured."
      },
      503
    );
  }


  if (
    !env.GEMINI_API_KEY ||
    !env.GEMINI_MODEL
  ) {
    return json(
      {
        ok: false,
        error: "Gemini configuration is incomplete."
      },
      503
    );
  }


  let body;

  try {
    body =
      await request.json();
  }
  catch {
    return json(
      {
        ok: false,
        error: "Invalid JSON request."
      },
      400
    );
  }


  const contentType =
    cleanText(
      body?.content_type,
      100
    );

  const language =
    cleanText(
      body?.language,
      20
    );

  const title =
    cleanText(
      body?.title,
      MAX_TITLE_LENGTH
    );

  const prompt =
    cleanText(
      body?.prompt,
      MAX_PROMPT_LENGTH
    );

  const sourceReference =
    cleanText(
      body?.source_reference,
      MAX_SOURCE_REFERENCE_LENGTH
    );


  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return json(
      {
        ok: false,
        error: "Unsupported content type."
      },
      400
    );
  }


  if (!ALLOWED_LANGUAGES.has(language)) {
    return json(
      {
        ok: false,
        error: "Unsupported language."
      },
      400
    );
  }


  if (!prompt) {
    return json(
      {
        ok: false,
        error: "Please provide a generation prompt."
      },
      400
    );
  }


  try {

    const result =
      await generateGeminiResponse({
        apiKey:
          env.GEMINI_API_KEY,

        model:
          env.GEMINI_MODEL,

        systemInstruction:
          buildSystemInstruction({
            contentType,
            language
          }),

        messages: [
          {
            role: "user",
            content:
              `CONTENT TITLE:\n${title || "Untitled draft"}\n\n` +
              `ADMINISTRATOR BRIEF:\n${prompt}`
          }
        ],

        temperature: 0.4,
        maxOutputTokens: 1200
      });


    const db =
      env.ENQUIRIES_DB;


    const insert =
      await db.prepare(`
        INSERT INTO ai_content_drafts (
          content_type,
          language,
          title,
          content,
          source_type,
          source_reference,
          prompt,
          model,
          status,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'admin')
      `)
      .bind(
        contentType,
        language,
        title || "AI Generated Draft",
        result.text,
        "ai",
        sourceReference,
        prompt,
        result.model
      )
      .run();


    const draftId =
      Number(
        insert?.meta?.last_row_id ||
        0
      );


    if (!draftId) {
      throw new Error(
        "Generated draft could not be identified after insert."
      );
    }


    await db.prepare(`
      INSERT INTO ai_content_events (
        content_draft_id,
        event_type,
        notes
      )
      VALUES (?, 'generated', ?)
    `)
    .bind(
      draftId,
      `Draft generated with Gemini model ${result.model}`
    )
    .run();


    const draft =
      await db.prepare(`
        SELECT
          id,
          content_type,
          language,
          title,
          content,
          source_type,
          source_reference,
          prompt,
          model,
          status,
          created_by,
          created_at,
          updated_at,
          approved_at
        FROM ai_content_drafts
        WHERE id = ?
        LIMIT 1
      `)
      .bind(draftId)
      .first();


    return json({
      ok: true,
      draft,
      generation: {
        model:
          result.model,

        usage:
          result.usage || null
      }
    });

  }
  catch (error) {

    console.error(
      "Content Studio Gemini generation failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );


    return json(
      {
        ok: false,
        error:
          "Content Studio AI generation failed."
      },
      500
    );
  }
}