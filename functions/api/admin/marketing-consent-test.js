import {
  normalizeMarketingContact,
  getMarketingConsent,
  isMarketingEligible
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

  try {
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

    return json({
      ok: true,
      channel,
      supplied_contact:
        contactValue,
      normalized_contact:
        normalized,
      consent,
      marketing_eligible:
        eligible
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