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

function cleanText(value, maxLength = 200) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function cleanLanguage(value) {
  const language =
    String(value || "")
      .trim();

  if (language === "zh-CN") {
    return "zh-CN";
  }

  return "en";
}

function cleanCampaignCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 80);
}

function parseCampaignId(value) {
  const id = Number(value);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return 0;
  }

  return id;
}

function normalizeAudienceFilters(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "{}";
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "audience_filters must be an object"
    );
  }

  return JSON.stringify(value);
}

async function loadCampaign(db, id) {
  return db.prepare(`
    SELECT
      id,
      campaign_code,
      name,
      status,
      language,
      template_name,
      template_language,
      audience_filters,
      scheduled_at,
      started_at,
      completed_at,
      total_recipients,
      sent_count,
      skipped_count,
      failed_count,
      created_at,
      updated_at
    FROM whatsapp_marketing_campaigns
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();
}

function campaignResponse(row) {
  if (!row) {
    return null;
  }

  let audienceFilters = {};

  try {
    audienceFilters =
      JSON.parse(
        row.audience_filters || "{}"
      );
  } catch {
    audienceFilters = {};
  }

  return {
    id: row.id,
    campaign_code: row.campaign_code,
    name: row.name,
    status: row.status,
    language: row.language,
    template_name: row.template_name,
    template_language:
      row.template_language,
    audience_filters:
      audienceFilters,
    scheduled_at: row.scheduled_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    total_recipients:
      Number(row.total_recipients || 0),
    sent_count:
      Number(row.sent_count || 0),
    skipped_count:
      Number(row.skipped_count || 0),
    failed_count:
      Number(row.failed_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function onRequestGet({
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

  const db = dbOf(env);

  if (!db) {
    return json(
      {
        ok: false,
        error: "Database unavailable"
      },
      503
    );
  }

  const url =
    new URL(request.url);

  const id =
    parseCampaignId(
      url.searchParams.get("id")
    );

  try {
    if (id) {
      const campaign =
        await loadCampaign(db, id);

      if (!campaign) {
        return json(
          {
            ok: false,
            error: "Campaign not found"
          },
          404
        );
      }

      return json({
        ok: true,
        campaign:
          campaignResponse(campaign)
      });
    }

    const result =
      await db.prepare(`
        SELECT
          id,
          campaign_code,
          name,
          status,
          language,
          template_name,
          template_language,
          audience_filters,
          scheduled_at,
          started_at,
          completed_at,
          total_recipients,
          sent_count,
          skipped_count,
          failed_count,
          created_at,
          updated_at
        FROM whatsapp_marketing_campaigns
        ORDER BY id DESC
        LIMIT 100
      `).all();

    return json({
      ok: true,
      campaigns:
        (result.results || [])
          .map(campaignResponse)
    });
  } catch (error) {
    console.error(
      "WhatsApp marketing campaign GET failed",
      error
    );

    return json(
      {
        ok: false,
        error:
          "Unable to load campaigns"
      },
      500
    );
  }
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

  const db = dbOf(env);

  if (!db) {
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
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "Invalid JSON body"
      },
      400
    );
  }

  const campaignCode =
    cleanCampaignCode(
      body?.campaign_code
    );

  const name =
    cleanText(
      body?.name,
      200
    );

  const language =
    cleanLanguage(
      body?.language
    );

  const templateName =
    cleanText(
      body?.template_name,
      200
    );

  const templateLanguage =
    cleanText(
      body?.template_language,
      50
    );

  if (!campaignCode) {
    return json(
      {
        ok: false,
        error:
          "campaign_code is required"
      },
      400
    );
  }

  if (!name) {
    return json(
      {
        ok: false,
        error: "name is required"
      },
      400
    );
  }

  let audienceFilters;

  try {
    audienceFilters =
      normalizeAudienceFilters(
        body?.audience_filters
      );
  } catch (error) {
    return json(
      {
        ok: false,
        error: error.message
      },
      400
    );
  }

  try {
    const existing =
      await db.prepare(`
        SELECT id
        FROM whatsapp_marketing_campaigns
        WHERE campaign_code = ?
        LIMIT 1
      `).bind(
        campaignCode
      ).first();

    if (existing) {
      return json(
        {
          ok: false,
          error:
            "campaign_code already exists"
        },
        409
      );
    }

    const result =
      await db.prepare(`
        INSERT INTO whatsapp_marketing_campaigns (
          campaign_code,
          name,
          status,
          language,
          template_name,
          template_language,
          audience_filters
        )
        VALUES (?, ?, 'Draft', ?, ?, ?, ?)
      `).bind(
        campaignCode,
        name,
        language,
        templateName,
        templateLanguage,
        audienceFilters
      ).run();

    const id =
      Number(
        result?.meta?.last_row_id || 0
      );

    if (!id) {
      throw new Error(
        "Campaign insert returned no ID"
      );
    }

    const campaign =
      await loadCampaign(
        db,
        id
      );

    return json(
      {
        ok: true,
        campaign:
          campaignResponse(campaign)
      },
      201
    );
  } catch (error) {
    console.error(
      "WhatsApp marketing campaign create failed",
      error
    );

    return json(
      {
        ok: false,
        error:
          "Unable to create campaign"
      },
      500
    );
  }
}