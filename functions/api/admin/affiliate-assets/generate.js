function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
}


function clean(value, max = 1000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}


function authorized(request, env) {
  const expected =
    clean(env.ADMIN_TOKEN, 1000);

  if (!expected) {
    return false;
  }

  const header =
    request.headers.get("authorization") || "";

  if (!header.toLowerCase().startsWith("bearer ")) {
    return false;
  }

  const supplied =
    header.slice(7).trim();

  return supplied === expected;
}


const ALLOWED_LANGUAGES =
  new Set([
    "en",
    "zh"
  ]);


const ALLOWED_FORMATS =
  new Set([
    "social_post",
    "whatsapp_copy",
    "short_promo",
    "long_promo",
    "headline_cta",
    "affiliate_caption"
  ]);


const ALLOWED_PLATFORMS =
  new Set([
    "general",
    "facebook",
    "instagram",
    "whatsapp",
    "email",
    "website",
    "affiliate"
  ]);


const ALLOWED_TONES =
  new Set([
    "professional",
    "educational",
    "warm",
    "conversational",
    "inspirational",
    "concise"
  ]);


const ALLOWED_LENGTHS =
  new Set([
    "short",
    "medium",
    "long"
  ]);


function formatInstruction(format) {

  switch (format) {

    case "social_post":
      return "Create a complete social-media promotional post.";

    case "whatsapp_copy":
      return "Create concise WhatsApp-ready promotional copy suitable for an affiliate to send manually.";

    case "short_promo":
      return "Create short promotional copy focused on the strongest verified product benefits.";

    case "long_promo":
      return "Create a fuller promotional explanation while remaining concise and factual.";

    case "headline_cta":
      return "Create a strong promotional headline followed by a short call-to-action.";

    case "affiliate_caption":
      return "Create a reusable affiliate caption suitable for sharing with an affiliate tracking link.";

    default:
      return "";
  }
}


function languageInstruction(language) {

  if (language === "zh") {
    return "Write the final output in Simplified Chinese.";
  }

  return "Write the final output in English.";
}


function safeProductFacts(product) {

  const facts = [];

  const add = (label, value) => {
    const text =
      clean(value, 5000);

    if (text) {
      facts.push(`${label}: ${text}`);
    }
  };

  add("SKU", product.sku);
  add("Product type", product.product_type);
  add("English name", product.name_en);
  add("Chinese name", product.name_zh);
  add("English description", product.description_en);
  add("Chinese description", product.description_zh);

  if (
    product.price !== null &&
    product.price !== undefined
  ) {
    add(
      "Price",
      `${product.currency || ""} ${product.price}`.trim()
    );
  }

  add("Start date", product.starts_on);
  add("End date", product.ends_on);
  add("English time", product.time_en);
  add("Chinese time", product.time_zh);
  add("English delivery", product.delivery_en);
  add("Chinese delivery", product.delivery_zh);
  add("Instructor", product.instructor);
  add("English language information", product.language_en);
  add("Chinese language information", product.language_zh);
  add("Affiliate destination path", product.affiliate_public_path);

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const earlyBirdEnd =
    clean(product.early_bird_end, 30);

  const earlyBirdActive =
    product.early_bird_price !== null &&
    product.early_bird_price !== undefined &&
    earlyBirdEnd &&
    earlyBirdEnd >= today;

  if (earlyBirdActive) {

    add(
      "Early bird price",
      `${product.currency || ""} ${product.early_bird_price}`.trim()
    );

    add(
      "Early bird deadline",
      earlyBirdEnd
    );
  }

  return facts.join("\n");
}


function extractGeminiText(data) {

  const candidates =
    Array.isArray(data?.candidates)
      ? data.candidates
      : [];

  for (const candidate of candidates) {

    const parts =
      Array.isArray(candidate?.content?.parts)
        ? candidate.content.parts
        : [];

    for (const part of parts) {

      if (
        typeof part?.text === "string" &&
        part.text.trim()
      ) {
        return part.text.trim();
      }
    }
  }

  return "";
}


function parseGeneratedJson(text) {

  let cleaned =
    clean(text, 20000);

  cleaned =
    cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

  try {

    const parsed =
      JSON.parse(cleaned);

    return {
      title:
        clean(parsed?.title, 500),

      content:
        clean(parsed?.content, 15000)
    };

  }
  catch {

    return {
      title: "",
      content: cleaned
    };
  }
}


async function generateWithGemini(env, prompt) {

  const apiKey =
    clean(env.GEMINI_API_KEY, 2000);

  const model =
    clean(
      env.GEMINI_MODEL ||
      "gemini-2.5-flash-lite",
      200
    );

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured"
    );
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1400
          }
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      clean(
        data?.error?.message ||
        `Gemini request failed with status ${response.status}`,
        1000
      )
    );
  }

  const text =
    extractGeminiText(data);

  if (!text) {
    throw new Error(
      "Gemini returned no usable text"
    );
  }

  return {
    model,
    text
  };
}


export async function onRequestPost(context) {

  const { request, env } =
    context;

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
        error: "Database unavailable"
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
        error: "Invalid JSON body"
      },
      400
    );
  }


  const productId =
    Number(body?.product_id || 0);

  const language =
    clean(body?.language || "en", 10)
      .toLowerCase();

  const assetFormat =
    clean(
      body?.asset_format || "social_post",
      100
    )
      .toLowerCase();

  const platform =
    clean(
      body?.platform || "general",
      100
    )
      .toLowerCase();

  const tone =
    clean(
      body?.tone || "professional",
      100
    )
      .toLowerCase();

  const outputLength =
    clean(
      body?.output_length || "medium",
      100
    )
      .toLowerCase();

  const objective =
    clean(
      body?.objective || "affiliate_promotion",
      100
    )
      .toLowerCase();

  const cta =
    clean(body?.cta, 500);

  const additionalInstructions =
    clean(
      body?.additional_instructions,
      2000
    );


  if (
    !Number.isInteger(productId) ||
    productId <= 0
  ) {
    return json(
      {
        ok: false,
        error: "Valid product_id required"
      },
      400
    );
  }


  if (!ALLOWED_LANGUAGES.has(language)) {
    return json(
      {
        ok: false,
        error: "Invalid language"
      },
      400
    );
  }


  if (!ALLOWED_FORMATS.has(assetFormat)) {
    return json(
      {
        ok: false,
        error: "Invalid asset_format"
      },
      400
    );
  }


  if (!ALLOWED_PLATFORMS.has(platform)) {
    return json(
      {
        ok: false,
        error: "Invalid platform"
      },
      400
    );
  }


  if (!ALLOWED_TONES.has(tone)) {
    return json(
      {
        ok: false,
        error: "Invalid tone"
      },
      400
    );
  }


  if (!ALLOWED_LENGTHS.has(outputLength)) {
    return json(
      {
        ok: false,
        error: "Invalid output_length"
      },
      400
    );
  }


  try {

    const product =
      await env.ENQUIRIES_DB
        .prepare(`
          SELECT
            id,
            sku,
            slug,
            product_type,
            name_en,
            name_zh,
            description_en,
            description_zh,
            status,
            price,
            currency,
            affiliate_enabled,
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
            language_zh,
            affiliate_public_path
          FROM products
          WHERE id = ?
          LIMIT 1
        `)
        .bind(productId)
        .first();


    if (!product) {
      return json(
        {
          ok: false,
          error: "Product not found"
        },
        404
      );
    }


    if (
      Number(product.affiliate_enabled) !== 1
    ) {
      return json(
        {
          ok: false,
          error: "Product is not enabled for affiliate promotion"
        },
        409
      );
    }


    if (
      clean(product.status, 50)
        .toLowerCase() !== "active"
    ) {
      return json(
        {
          ok: false,
          error: "Product is not active"
        },
        409
      );
    }


    const publicPath =
      clean(
        product.affiliate_public_path,
        1000
      );

    if (!publicPath) {
      return json(
        {
          ok: false,
          error: "Product has no affiliate public path"
        },
        409
      );
    }


    const productFacts =
      safeProductFacts(product);

    const formatText =
      formatInstruction(assetFormat);

    const prompt =
`You are the Quantum YiJing Academy Affiliate Marketing Asset Generator.

Your task is to create reusable affiliate promotional copy using ONLY the verified product facts supplied below.

STRICT RULES:
1. Never invent prices, dates, times, instructors, delivery modes, languages, product benefits, policies, guarantees, bonuses, discounts, commission rates, affiliate incentives or affiliate terms.
2. If a fact is not supplied below, do not state it as fact.
3. Do not mention affiliate commission rates or earnings.
4. Do not claim guaranteed financial, spiritual, health or personal outcomes.
5. Do not create or infer a personalized affiliate URL.
6. Use the placeholder {{AFFILIATE_LINK}} wherever a destination link is appropriate.
7. The administrator must review and approve this draft before distribution.
8. Output valid JSON only.
9. JSON format:
{
  "title": "short internal title",
  "content": "final reusable promotional copy"
}

LANGUAGE:
${languageInstruction(language)}

ASSET FORMAT:
${assetFormat}
${formatText}

PLATFORM:
${platform}

TONE:
${tone}

OBJECTIVE:
${objective}

OUTPUT LENGTH:
${outputLength}

CALL TO ACTION:
${cta || "Use an appropriate factual call-to-action."}

ADDITIONAL ADMIN INSTRUCTIONS:
${additionalInstructions || "None."}

VERIFIED PRODUCT FACTS:
${productFacts}

Remember:
Use only verified facts.
Use {{AFFILIATE_LINK}} rather than constructing an affiliate URL.
Return JSON only.`;


    const generated =
      await generateWithGemini(
        env,
        prompt
      );


    const parsed =
      parseGeneratedJson(
        generated.text
      );


    if (!parsed.content) {
      throw new Error(
        "Generated affiliate content is empty"
      );
    }


    const defaultTitle =
      language === "zh"
        ? `${clean(product.name_zh || product.name_en, 300)} 联盟推广素材`
        : `${clean(product.name_en || product.name_zh, 300)} Affiliate Asset`;

    const title =
      parsed.title ||
      defaultTitle;


    const audience =
      "affiliate audiences";


    const sourceReference =
      `product:${product.id}`;


    const insert =
      await env.ENQUIRIES_DB
        .prepare(`
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
          VALUES (
            'affiliate_asset',
            ?,
            ?,
            ?,
            'product',
            ?,
            ?,
            ?,
            'draft',
            'admin',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `)
        .bind(
          language,
          title,
          parsed.content,
          sourceReference,
          prompt,
          generated.model,
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
        insert?.meta?.last_row_id || 0
      );


    if (!draftId) {
      throw new Error(
        "Unable to determine generated draft id"
      );
    }


    await env.ENQUIRIES_DB
      .prepare(`
        INSERT INTO ai_content_events (
          content_draft_id,
          event_type,
          notes
        )
        VALUES (
          ?,
          'generated',
          ?
        )
      `)
      .bind(
        draftId,
        `Affiliate asset generated from product ${product.id}; format=${assetFormat}`
      )
      .run();


    const draft =
      await env.ENQUIRIES_DB
        .prepare(`
          SELECT
            id,
            content_type,
            language,
            title,
            content,
            source_type,
            source_reference,
            model,
            status,
            created_by,
            created_at,
            updated_at,
            audience,
            objective,
            tone,
            platform,
            output_length,
            cta
          FROM ai_content_drafts
          WHERE id = ?
          LIMIT 1
        `)
        .bind(draftId)
        .first();


    return json({
      ok: true,

      asset_format:
        assetFormat,

      product: {
        id: product.id,
        sku: product.sku,
        slug: product.slug,
        name_en: product.name_en,
        name_zh: product.name_zh,
        affiliate_public_path:
          product.affiliate_public_path
      },

      draft
    });

  }
  catch (error) {

    console.error(
      "Affiliate asset generation failed",
      error
    );

    return json(
      {
        ok: false,
        error:
          clean(
            error?.message ||
            "Affiliate asset generation failed",
            1000
          )
      },
      500
    );
  }
}