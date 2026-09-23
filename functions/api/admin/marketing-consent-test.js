import {
  normalizeMarketingContact,
  getMarketingConsent,
  isMarketingEligible,
  setMarketingConsent
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

  const db =
    dbOf(env);

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
    body =
      await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const action =
    String(body.action || "read")
      .trim()
      .toLowerCase();

  const channel =
    String(body.channel || "")
      .trim()
      .toLowerCase();

  const contactValue =
    String(body.contact_value || "")
      .trim();

  const normalized =
    normalizeMarketingContact(
      channel,
      contactValue
    );

  if (
    action !== "read" &&
    action !== "opt_in" &&
    action !== "opt_out"
  ) {
    return json(
      {
        ok: false,
        error: "Invalid action"
      },
      400
    );
  }

  if (!normalized) {
    return json(
      {
        ok: false,
        error: "Invalid channel or contact"
      },
      400
    );
  }

  try {
    let writtenConsent = null;

    if (
      action === "opt_in" ||
      action === "opt_out"
    ) {
      writtenConsent =
        await setMarketingConsent({
          db,
          channel,
          contactValue,
          status:
            action === "opt_in"
              ? "opted_in"
              : "opted_out",
          enquiryId:
            body.enquiry_id ?? null,
          source:
            body.source ||
            "v3.9-preview-test",
          consentTextVersion:
            body.consent_text_version ||
            "test-v1",
          notes:
            body.notes ||
            "Temporary v3.9 Preview consent test"
        });
    }

    const consent =
      await getMarketingConsent({
        db,
        channel,
        contactValue
      });

    const eligible =
      await isMarketingEligible({
        db,
        channel,
        contactValue
      });

    let events = [];

    if (consent?.id) {
      const eventRows =
        await db.prepare(`
          SELECT
            id,
            marketing_consent_id,
            enquiry_id,
            channel,
            contact_value,
            event_type,
            source,
            consent_text_version,
            notes,
            created_at
          FROM marketing_consent_events
          WHERE marketing_consent_id = ?
          ORDER BY id ASC
        `).bind(
          consent.id
        ).all();

      events =
        eventRows.results || [];
    }

    return json({
      ok: true,
      action,
      channel,
      supplied_contact:
        contactValue,
      normalized_contact:
        normalized,
      written_consent:
        writtenConsent,
      consent,
      marketing_eligible:
        eligible,
      consent_events:
        events
    });

  } catch (error) {
    console.error(
      "Marketing consent test failed:",
      error
    );

    return json(
      {
        ok: false,
        error:
          "Unable to test marketing consent"
      },
      500
    );
  }
}
