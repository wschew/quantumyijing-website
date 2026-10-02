import { generateGeminiResponse } from "../ai/gemini.js";

const MAX_PROMPT_LENGTH = 10000;
const MAX_TITLE_LENGTH = 500;
const MAX_SOURCE_REFERENCE_LENGTH = 1000;
const MAX_AUDIENCE_LENGTH = 500;
const MAX_CTA_LENGTH = 500;

const ALLOWED_OBJECTIVES = new Set([
  "",
  "educate",
  "awareness",
  "engagement",
  "enquiry",
  "registration",
  "download",
  "affiliate_promotion"
]);

const ALLOWED_TONES = new Set([
  "",
  "professional",
  "educational",
  "warm",
  "conversational",
  "inspirational",
  "concise"
]);

const ALLOWED_PLATFORMS = new Set([
  "",
  "general",
  "facebook",
  "instagram",
  "whatsapp",
  "email",
  "website",
  "affiliate"
]);

const ALLOWED_OUTPUT_LENGTHS = new Set([
  "",
  "short",
  "medium",
  "long"
]);

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


function objectiveGuidance(objective) {
  switch (objective) {
    case "educate":
      return "Educate the audience clearly without unnecessary promotion.";

    case "awareness":
      return "Build awareness and understanding of the subject.";

    case "engagement":
      return "Encourage thoughtful audience engagement without making unsupported claims.";

    case "enquiry":
      return "Encourage interested readers to make an enquiry. Do not claim that an enquiry has already occurred.";

    case "registration":
      return "Encourage registration only when the administrator has supplied sufficient factual registration information.";

    case "download":
      return "Encourage the reader to access or download the referenced resource without inventing availability or results.";

    case "affiliate_promotion":
      return "Create reusable affiliate-oriented promotional copy without inventing commissions, incentives or affiliate terms.";

    default:
      return "Follow the administrator's stated objective without inventing one.";
  }
}


function toneGuidance(tone) {
  switch (tone) {
    case "professional":
      return "Use a polished and professional tone.";

    case "educational":
      return "Use a clear, informative and teaching-oriented tone.";

    case "warm":
      return "Use a warm and approachable tone.";

    case "conversational":
      return "Use natural, conversational language.";

    case "inspirational":
      return "Use an encouraging and reflective tone without exaggeration.";

    case "concise":
      return "Use direct, economical wording with minimal unnecessary detail.";

    default:
      return "Use an appropriate neutral professional tone.";
  }
}


function platformGuidance(platform) {
  switch (platform) {
    case "facebook":
      return "Format the draft for Facebook readability with short paragraphs and natural spacing.";

    case "instagram":
      return "Format the draft for Instagram-style readability. Keep the opening engaging and avoid excessive formatting.";

    case "whatsapp":
      return "Format the draft as concise WhatsApp copy. Do not imply that it has been sent.";

    case "email":
      return "Format the draft as email-ready body copy. Do not invent recipient details or send status.";

    case "website":
      return "Format the draft as polished website copy.";

    case "affiliate":
      return "Format the draft as reusable affiliate marketing material for later human distribution.";

    default:
      return "Use platform-neutral formatting suitable for later adaptation.";
  }
}


function lengthGuidance(outputLength) {
  switch (outputLength) {
    case "short":
      return "Keep the output short and focused.";

    case "medium":
      return "Use moderate detail while remaining easy to scan.";

    case "long":
      return "Provide a fuller treatment while avoiding repetition.";

    default:
      return "Use an appropriate practical length for the requested content type.";
  }
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
  language,
  objective,
  tone,
  platform,
  outputLength
}) {

  return `
You are the internal AI Content Studio writer for Quantum YiJing International Academy.

Your task is to draft marketing or educational content for review by an Academy administrator.

IMPORTANT WORKFLOW BOUNDARIES:
- You generate draft text only.
- You do not publish, send, post, message, register, book, charge, refund, pay commissions, or modify customer records.
- Every output will be reviewed by a human before any external use.

FACTUAL ACCURACY:
- Use only facts explicitly supplied in the administrator's prompt or structured brief.
- Do not invent course dates, prices, deadlines, availability, credentials, policies, statistics, testimonials, guarantees, payment status, affiliate terms or business claims.
- If a requested factual detail is not supplied, omit it rather than inventing it.
- Do not claim that any campaign, registration, payment, booking, enquiry or transaction has occurred.

STYLE:
- Produce polished text ready for human editing.
- Follow the requested audience, objective, tone, platform and output length.
- Do not include meta-commentary such as "Here is your draft".
- Return only the draft content itself.

CONTENT TYPE:
${contentTypeGuidance(contentType)}

OBJECTIVE:
${objectiveGuidance(objective)}

TONE:
${toneGuidance(tone)}

PLATFORM:
${platformGuidance(platform)}

OUTPUT LENGTH:
${lengthGuidance(outputLength)}

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

  const audience =
    cleanText(
      body?.audience,
      MAX_AUDIENCE_LENGTH
    );

  const objective =
    cleanText(
      body?.objective,
      100
    ).toLowerCase();

  const tone =
    cleanText(
      body?.tone,
      100
    ).toLowerCase();

  const platform =
    cleanText(
      body?.platform,
      100
    ).toLowerCase();

  const outputLength =
    cleanText(
      body?.output_length,
      100
    ).toLowerCase();

  const cta =
    cleanText(
      body?.cta,
      MAX_CTA_LENGTH
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


  if (!ALLOWED_OBJECTIVES.has(objective)) {
    return json(
      {
        ok: false,
        error: "Unsupported marketing objective."
      },
      400
    );
  }

  if (!ALLOWED_TONES.has(tone)) {
    return json(
      {
        ok: false,
        error: "Unsupported tone."
      },
      400
    );
  }

  if (!ALLOWED_PLATFORMS.has(platform)) {
    return json(
      {
        ok: false,
        error: "Unsupported platform."
      },
      400
    );
  }

  if (!ALLOWED_OUTPUT_LENGTHS.has(outputLength)) {
    return json(
      {
        ok: false,
        error: "Unsupported output length."
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
            language,
            objective,
            tone,
            platform,
            outputLength
          }),

        messages: [
          {
            role: "user",
            content:
              `CONTENT TITLE:\n${title || "Untitled draft"}\n\n` +
              `TARGET AUDIENCE:\n${audience || "Not specified"}\n\n` +
              `MARKETING OBJECTIVE:\n${objective || "Not specified"}\n\n` +
              `TONE:\n${tone || "Not specified"}\n\n` +
              `PLATFORM:\n${platform || "general"}\n\n` +
              `OUTPUT LENGTH:\n${outputLength || "Not specified"}\n\n` +
              `CALL TO ACTION:\n${cta || "No specific CTA requested"}\n\n` +
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
          created_by,
          audience,
          objective,
          tone,
          platform,
          output_length,
          cta
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'admin', ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        contentType,
        language,
        title || "AI Generated Draft",
        result.text,
        "ai",
        sourceReference,
        prompt,
        result.model,
        audience,
        objective,
        tone,
        platform,
        outputLength,
        cta
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
          audience,
          objective,
          tone,
          platform,
          output_length,
          cta,
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