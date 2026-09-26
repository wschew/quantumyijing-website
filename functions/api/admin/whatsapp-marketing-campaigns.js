import {
  isMarketingEligible,
  normalizeMarketingContact
} from "../../lib/marketing-consent.js";

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
function parseStoredAudienceFilters(value) {
  let parsed;

  try {
    parsed = JSON.parse(value || "{}");
  } catch {
    throw new Error(
      "Invalid stored audience_filters JSON"
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "Invalid stored audience_filters"
    );
  }

  return parsed;
}
function buildAudienceCandidateFilters(filters) {
  const safe =
    filters &&
    typeof filters === "object" &&
    !Array.isArray(filters)
      ? filters
      : {};

  const conditions = [];
  const values = [];

  const q = cleanText(safe.q, 200);
  const status = cleanText(safe.status, 40);
  const lifecycle = cleanText(safe.lifecycle, 40);
  const interest = cleanText(safe.interest, 100);
  const priority = cleanText(safe.priority, 20);
  const source = cleanText(safe.source, 100);
  const campaign = cleanText(safe.campaign, 120);
  const affiliate = cleanText(safe.affiliate, 100);
  const from = cleanText(safe.from, 10);
  const to = cleanText(safe.to, 10);

  if (q) {
    conditions.push(`
      (
        e.name LIKE ?
        OR e.email LIKE ?
        OR e.phone LIKE ?
        OR e.country LIKE ?
        OR e.reference LIKE ?
        OR e.message LIKE ?
        OR s.student_id LIKE ?
      )
    `);

    const like = `%${q}%`;

    values.push(
      like, like, like, like,
      like, like, like
    );
  }

  if (status) {
    conditions.push("e.status = ?");
    values.push(status);
  }

  if (lifecycle) {
    conditions.push("e.lifecycle_stage = ?");
    values.push(lifecycle);
  }

  if (interest) {
    conditions.push("e.interest = ?");
    values.push(interest);
  }

  if (priority) {
    conditions.push("e.priority = ?");
    values.push(priority);
  }

  if (source) {
    conditions.push(`
      (
        a.marketing_source = ?
        OR a.utm_source = ?
      )
    `);
    values.push(source, source);
  }

  if (campaign) {
    conditions.push(`
      (
        a.campaign_code = ?
        OR a.utm_campaign = ?
      )
    `);
    values.push(campaign, campaign);
  }

  if (affiliate) {
    conditions.push("a.affiliate_code = ?");
    values.push(affiliate);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    conditions.push("e.submitted_date >= ?");
    values.push(from);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    conditions.push("e.submitted_date <= ?");
    values.push(to);
  }

  return {
    where:
      conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "",
    values
  };
}
async function previewAudience({
  db,
  campaign
}) {
  const filters =
    parseStoredAudienceFilters(
      campaign.audience_filters
    );

  const {
    where,
    values
  } =
    buildAudienceCandidateFilters(
      filters
    );

  const result =
    await db.prepare(`
      SELECT
        e.id,
        e.reference,
        e.name,
        e.phone,
        e.email,
        e.country,
        e.interest,
        e.language,
        e.status,
        e.lifecycle_stage,
        e.priority,
        e.submitted_date,
        s.student_id,
        s.programme,
        a.marketing_source,
        a.campaign_code,
        a.utm_source,
        a.utm_medium,
        a.utm_campaign,
        a.affiliate_code
      FROM enquiries e
      LEFT JOIN students s
        ON s.enquiry_id = e.id
      LEFT JOIN enquiry_attribution a
        ON a.enquiry_id = e.id
      ${where}
      ORDER BY e.id DESC
    `).bind(
      ...values
    ).all();

  const candidates =
    result.results || [];

  const recipients = [];
  const seenContacts =
    new Set();

  let noPhoneCount = 0;
  let notOptedInCount = 0;
  let duplicateContactCount = 0;

  for (const row of candidates) {
    const contactValue =
      normalizeMarketingContact(
        "whatsapp",
        row.phone,
        { country: row.country }
      );

    if (!contactValue) {
      noPhoneCount += 1;
      continue;
    }

    const eligible =
      await isMarketingEligible({
        db,
        channel: "whatsapp",
        contactValue
      });

    if (!eligible) {
      notOptedInCount += 1;
      continue;
    }

    if (
      seenContacts.has(contactValue)
    ) {
      duplicateContactCount += 1;
      continue;
    }

    seenContacts.add(contactValue);

    recipients.push({
      enquiry_id: Number(row.id),
      reference: row.reference || "",
      name: row.name || "",
      contact_value: contactValue,
      phone: row.phone || "",
      email: row.email || "",
      country: row.country || "",
      interest: row.interest || "",
      language: row.language || "",
      status: row.status || "",
      lifecycle_stage:
        row.lifecycle_stage || "",
      priority: row.priority || "",
      submitted_date:
        row.submitted_date || "",
      student_id:
        row.student_id || "",
      programme:
        row.programme || "",
      marketing_source:
        row.marketing_source || "",
      attribution_campaign_code:
        row.campaign_code || "",
      utm_source:
        row.utm_source || "",
      utm_medium:
        row.utm_medium || "",
      utm_campaign:
        row.utm_campaign || "",
      affiliate_code:
        row.affiliate_code || "",
      marketing_consent:
        "opted_in"
    });
  }

  return {
    filters,

    enforcement: {
      channel: "whatsapp",
      required_consent: "opted_in",
      contact_deduplication:
        "canonical_whatsapp_contact"
    },

    counts: {
      crm_candidates:
        candidates.length,

      eligible_unique_recipients:
        recipients.length,

      excluded_no_phone:
        noPhoneCount,

      excluded_not_opted_in:
        notOptedInCount,

      excluded_duplicate_contact:
        duplicateContactCount
    },

    recipients
  };
}

async function generateCampaignRecipients({ db, campaign }) {
  if (
    Number(campaign.sent_count || 0) > 0 ||
    Number(campaign.skipped_count || 0) > 0 ||
    Number(campaign.failed_count || 0) > 0
  ) {
    const error = new Error(
      "Recipient generation is blocked because this campaign already has delivery activity"
    );
    error.code = "CAMPAIGN_HAS_DELIVERY_ACTIVITY";
    throw error;
  }

  const nonPending = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM whatsapp_marketing_recipients
    WHERE campaign_id = ?
      AND status <> 'Pending'
  `).bind(campaign.id).first();

  if (Number(nonPending?.count || 0) > 0) {
    const error = new Error(
      "Recipient generation is blocked because this campaign has non-pending recipients"
    );
    error.code = "CAMPAIGN_HAS_NON_PENDING_RECIPIENTS";
    throw error;
  }

  const preview = await previewAudience({ db, campaign });
  const recipients = preview.recipients || [];

  const statements = [
    db.prepare(`
      DELETE FROM whatsapp_marketing_recipients
      WHERE campaign_id = ?
    `).bind(campaign.id)
  ];

  for (const recipient of recipients) {
    statements.push(
      db.prepare(`
        INSERT INTO whatsapp_marketing_recipients (
          campaign_id, enquiry_id, contact_value, recipient_name,
          status, consent_status_at_selection, consent_checked_at
        )
        VALUES (?, ?, ?, ?, 'Pending', 'opted_in', CURRENT_TIMESTAMP)
      `).bind(
        campaign.id,
        recipient.enquiry_id,
        recipient.contact_value,
        recipient.name || ""
      )
    );
  }

  statements.push(
    db.prepare(`
      UPDATE whatsapp_marketing_campaigns
      SET total_recipients = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'Draft'
    `).bind(recipients.length, campaign.id)
  );

  await db.batch(statements);

  const generated = await db.prepare(`
    SELECT
      id, campaign_id, enquiry_id, contact_value, recipient_name,
      status, consent_status_at_selection, consent_checked_at,
      skip_reason, error_message, wa_message_id, sent_at,
      created_at, updated_at
    FROM whatsapp_marketing_recipients
    WHERE campaign_id = ?
    ORDER BY id ASC
  `).bind(campaign.id).all();

  const refreshedCampaign = await loadCampaign(db, campaign.id);

  return {
    preview_counts: preview.counts,
    generated_count: recipients.length,
    campaign: campaignResponse(refreshedCampaign),
    recipients: generated.results || []
  };
}


async function checkRecipientSendEligibility({
  db,
  campaign,
  recipientId
}) {
  const id = Number(recipientId);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return {
      ok: false,
      eligible: false,
      reason: "invalid_recipient_id"
    };
  }

  const recipient =
    await db.prepare(`
      SELECT
        id,
        campaign_id,
        enquiry_id,
        contact_value,
        recipient_name,
        status,
        consent_status_at_selection,
        consent_checked_at,
        skip_reason,
        error_message,
        wa_message_id,
        sent_at
      FROM whatsapp_marketing_recipients
      WHERE id = ?
        AND campaign_id = ?
      LIMIT 1
    `).bind(
      id,
      campaign.id
    ).first();

  if (!recipient) {
    return {
      ok: false,
      eligible: false,
      reason: "recipient_not_found"
    };
  }

  if (recipient.status !== "Pending") {
    return {
      ok: true,
      eligible: false,
      reason: "recipient_not_pending",
      recipient
    };
  }

  const contactValue =
    normalizeMarketingContact(
      "whatsapp",
      recipient.contact_value
    );

  if (
    !contactValue ||
    contactValue !== recipient.contact_value
  ) {
    return {
      ok: true,
      eligible: false,
      reason: "invalid_canonical_contact",
      recipient
    };
  }

  const eligible =
    await isMarketingEligible({
      db,
      channel: "whatsapp",
      contactValue
    });

  return {
    ok: true,
    eligible,
    reason:
      eligible
        ? "current_consent_opted_in"
        : "current_consent_not_opted_in",
    current_consent_required:
      "opted_in",
    contact_value:
      contactValue,
    recipient
  };
}

async function claimRecipientForSending({
  db,
  campaign,
  recipientId
}) {
  const id =
    parseCampaignId(recipientId);

  if (!id) {
    return {
      ok: false,
      claimed: false,
      reason: "recipient_id_required"
    };
  }

  const updateResult =
    await db.prepare(`
      UPDATE whatsapp_marketing_recipients
      SET
        status = 'Processing',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND campaign_id = ?
        AND status = 'Pending'
    `).bind(
      id,
      campaign.id
    ).run();

  const changed =
    Number(updateResult?.meta?.changes || 0);

  const recipient =
    await db.prepare(`
      SELECT
        id,
        campaign_id,
        enquiry_id,
        contact_value,
        recipient_name,
        status,
        consent_status_at_selection,
        consent_checked_at,
        skip_reason,
        error_message,
        wa_message_id,
        sent_at
      FROM whatsapp_marketing_recipients
      WHERE id = ?
        AND campaign_id = ?
      LIMIT 1
    `).bind(
      id,
      campaign.id
    ).first();

  if (!recipient) {
    return {
      ok: false,
      claimed: false,
      reason: "recipient_not_found"
    };
  }

  return {
    ok: true,
    claimed: changed === 1,
    reason:
      changed === 1
        ? "recipient_claimed"
        : "recipient_not_pending",
    recipient
  };
}

async function skipRecipientIfCurrentlyNotOptedIn({
  db,
  campaign,
  recipientId
}) {
  const eligibility =
    await checkRecipientSendEligibility({
      db,
      campaign,
      recipientId
    });

  if (
    !eligibility.ok &&
    eligibility.reason === "recipient_not_found"
  ) {
    return eligibility;
  }

  if (
    !eligibility.ok ||
    eligibility.eligible ||
    eligibility.reason !==
      "current_consent_not_opted_in"
  ) {
    return {
      ...eligibility,
      skipped: false
    };
  }

  const updateResult =
    await db.prepare(`
      UPDATE whatsapp_marketing_recipients
      SET
        status = 'Skipped',
        consent_checked_at = CURRENT_TIMESTAMP,
        skip_reason = 'current_consent_not_opted_in',
        error_message = '',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND campaign_id = ?
        AND status = 'Pending'
    `).bind(
      recipientId,
      campaign.id
    ).run();

  const changed =
    Number(updateResult?.meta?.changes || 0);

  if (changed === 1) {
    await db.prepare(`
      UPDATE whatsapp_marketing_campaigns
      SET
        skipped_count = skipped_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      campaign.id
    ).run();
  }

  const recipient =
    await db.prepare(`
      SELECT
        id,
        campaign_id,
        enquiry_id,
        contact_value,
        recipient_name,
        status,
        consent_status_at_selection,
        consent_checked_at,
        skip_reason,
        error_message,
        wa_message_id,
        sent_at
      FROM whatsapp_marketing_recipients
      WHERE id = ?
        AND campaign_id = ?
      LIMIT 1
    `).bind(
      recipientId,
      campaign.id
    ).first();

  const refreshedCampaign =
    await loadCampaign(
      db,
      campaign.id
    );

  return {
    ok: true,
    eligible: false,
    skipped: changed === 1,
    reason:
      changed === 1
        ? "current_consent_not_opted_in"
        : "recipient_not_pending",
    current_consent_required:
      "opted_in",
    contact_value:
      eligibility.contact_value || "",
    recipient,
    campaign:
      campaignResponse(refreshedCampaign)
  };
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

  const action =
    cleanText(
      body?.action,
      50
    ).toLowerCase();

  if (action === "preview_audience") {
    const campaignId =
      parseCampaignId(
        body?.campaign_id
      );

    if (!campaignId) {
      return json(
        {
          ok: false,
          error:
            "campaign_id is required"
        },
        400
      );
    }

    try {
      const campaign =
        await loadCampaign(
          db,
          campaignId
        );

      if (!campaign) {
        return json(
          {
            ok: false,
            error:
              "Campaign not found"
          },
          404
        );
      }

      if (
        campaign.status !== "Draft"
      ) {
        return json(
          {
            ok: false,
            error:
              "Audience preview is allowed only for Draft campaigns"
          },
          409
        );
      }

      const preview =
        await previewAudience({
          db,
          campaign
        });

      return json({
        ok: true,
        action:
          "preview_audience",
        campaign:
          campaignResponse(campaign),
        preview
      });
    } catch (error) {
      console.error(
        "WhatsApp marketing audience preview failed",
        error
      );

      return json(
        {
          ok: false,
          error:
            "Unable to preview campaign audience"
        },
        500
      );
    }
  }


  if (
    action ===
    "check_recipient_send_eligibility"
  ) {
    const campaignId =
      parseCampaignId(
        body?.campaign_id
      );

    const recipientId =
      Number(body?.recipient_id);

    if (!campaignId) {
      return json(
        {
          ok: false,
          error:
            "campaign_id is required"
        },
        400
      );
    }

    if (
      !Number.isInteger(recipientId) ||
      recipientId <= 0
    ) {
      return json(
        {
          ok: false,
          error:
            "recipient_id is required"
        },
        400
      );
    }

    try {
      const campaign =
        await loadCampaign(
          db,
          campaignId
        );

      if (!campaign) {
        return json(
          {
            ok: false,
            error:
              "Campaign not found"
          },
          404
        );
      }

      if (
        campaign.status !== "Draft"
      ) {
        return json(
          {
            ok: false,
            error:
              "Recipient send eligibility check is allowed only for Draft campaigns"
          },
          409
        );
      }

      const eligibility =
        await checkRecipientSendEligibility({
          db,
          campaign,
          recipientId
        });

      if (
        !eligibility.ok &&
        eligibility.reason ===
          "recipient_not_found"
      ) {
        return json(
          {
            ok: false,
            error:
              "Recipient not found for campaign"
          },
          404
        );
      }

      return json({
        ok: true,
        action:
          "check_recipient_send_eligibility",
        campaign:
          campaignResponse(campaign),
        eligibility
      });
    } catch (error) {
      console.error(
        "WhatsApp marketing recipient send eligibility check failed",
        error
      );

      return json(
        {
          ok: false,
          error:
            "Unable to check recipient send eligibility"
        },
        500
      );
    }
  }

  if (
    action ===
    "skip_recipient_if_not_opted_in"
  ) {
    const campaignId =
      parseCampaignId(
        body?.campaign_id
      );

    const recipientId =
      Number(body?.recipient_id);

    if (!campaignId) {
      return json(
        {
          ok: false,
          error:
            "campaign_id is required"
        },
        400
      );
    }

    if (
      !Number.isInteger(recipientId) ||
      recipientId <= 0
    ) {
      return json(
        {
          ok: false,
          error:
            "recipient_id is required"
        },
        400
      );
    }

    try {
      const campaign =
        await loadCampaign(
          db,
          campaignId
        );

      if (!campaign) {
        return json(
          {
            ok: false,
            error:
              "Campaign not found"
          },
          404
        );
      }

      if (
        campaign.status !== "Draft"
      ) {
        return json(
          {
            ok: false,
            error:
              "Recipient skip test is allowed only for Draft campaigns"
          },
          409
        );
      }

      const result =
        await skipRecipientIfCurrentlyNotOptedIn({
          db,
          campaign,
          recipientId
        });

      if (
        !result.ok &&
        result.reason ===
          "recipient_not_found"
      ) {
        return json(
          {
            ok: false,
            error:
              "Recipient not found for campaign"
          },
          404
        );
      }

      return json({
        ok: true,
        action:
          "skip_recipient_if_not_opted_in",
        result
      });
    } catch (error) {
      console.error(
        "WhatsApp marketing recipient skip test failed",
        error
      );

      return json(
        {
          ok: false,
          error:
            "Unable to process recipient skip test"
        },
        500
      );
    }
  }
  if (
    action ===
    "claim_recipient_for_sending"
  ) {
    const campaignId =
      parseCampaignId(
        body?.campaign_id
      );

    const recipientId =
      Number(body?.recipient_id);

    if (!campaignId) {
      return json(
        {
          ok: false,
          error:
            "campaign_id is required"
        },
        400
      );
    }

    if (
      !Number.isInteger(recipientId) ||
      recipientId <= 0
    ) {
      return json(
        {
          ok: false,
          error:
            "recipient_id is required"
        },
        400
      );
    }

    try {
      const campaign =
        await loadCampaign(
          db,
          campaignId
        );

      if (!campaign) {
        return json(
          {
            ok: false,
            error:
              "Campaign not found"
          },
          404
        );
      }

      if (
        campaign.status !== "Draft"
      ) {
        return json(
          {
            ok: false,
            error:
              "Recipient claim test is allowed only for Draft campaigns"
          },
          409
        );
      }

      const result =
        await claimRecipientForSending({
          db,
          campaign,
          recipientId
        });

      if (
        !result.ok &&
        result.reason ===
          "recipient_not_found"
      ) {
        return json(
          {
            ok: false,
            error:
              "Recipient not found for campaign"
          },
          404
        );
      }

      return json({
        ok: true,
        action:
          "claim_recipient_for_sending",
        result
      });
    } catch (error) {
      console.error(
        "WhatsApp marketing recipient claim test failed",
        error
      );

      return json(
        {
          ok: false,
          error:
            "Unable to process recipient claim test"
        },
        500
      );
    }
  }

  if (action === "generate_recipients") {
    const campaignId = parseCampaignId(body?.campaign_id);

    if (!campaignId) {
      return json({ ok: false, error: "campaign_id is required" }, 400);
    }

    try {
      const campaign = await loadCampaign(db, campaignId);

      if (!campaign) {
        return json({ ok: false, error: "Campaign not found" }, 404);
      }

      if (campaign.status !== "Draft") {
        return json(
          {
            ok: false,
            error: "Recipient generation is allowed only for Draft campaigns"
          },
          409
        );
      }

      const generation = await generateCampaignRecipients({ db, campaign });

      return json({
        ok: true,
        action: "generate_recipients",
        generation
      });
    } catch (error) {
      if (
        error?.code === "CAMPAIGN_HAS_DELIVERY_ACTIVITY" ||
        error?.code === "CAMPAIGN_HAS_NON_PENDING_RECIPIENTS"
      ) {
        return json(
          {
            ok: false,
            error: error.message
          },
          409
        );
      }

      console.error(
        "WhatsApp marketing recipient generation failed",
        error
      );

      return json(
        {
          ok: false,
          error: "Unable to generate campaign recipients"
        },
        500
      );
    }
  }

  if (action) {
    return json(
      {
        ok: false,
        error: "Unsupported action"
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
