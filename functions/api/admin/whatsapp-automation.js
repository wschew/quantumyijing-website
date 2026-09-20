const GRAPH_API_VERSION = "v25.0";
const COURSE_REMINDER_HOUR_MYT = 9;
const MAX_RUN_BATCH = 20;

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

function cleanPhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 30);
}

function normalizeWhatsAppPhone(
  value,
  country
) {
  let phone = cleanPhone(value);

  if (!phone) {
    return "";
  }

  const countryName =
    String(country || "")
      .trim()
      .toLowerCase();

  if (
    countryName === "malaysia" &&
    phone.startsWith("0")
  ) {
    phone = `60${phone.slice(1)}`;
  }

  return phone;
}

function cleanLanguage(value) {
  const language =
    String(value || "")
      .trim()
      .toLowerCase();

  return language.startsWith("zh")
    ? "zh"
    : "en";
}

function compactDate(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);
}

function courseSequenceCode({
  sku,
  startsOn
}) {
  const cleanSku =
    String(sku || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");

  const date =
    compactDate(startsOn);

  if (!cleanSku || date.length !== 8) {
    return "";
  }

  return `COURSE-${cleanSku}-${date}`;
}

function parseIsoDate(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      String(value || "").trim()
    );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function reminderAtUtc({
  startsOn,
  daysBefore
}) {
  const courseDate =
    parseIsoDate(startsOn);

  if (!courseDate) {
    return "";
  }

  /*
   * Malaysia is UTC+8 year-round.
   * 09:00 MYT = 01:00 UTC.
   */
  const reminder =
    new Date(
      Date.UTC(
        courseDate.getUTCFullYear(),
        courseDate.getUTCMonth(),
        courseDate.getUTCDate() -
          Number(daysBefore || 0),
        COURSE_REMINDER_HOUR_MYT - 8,
        0,
        0
      )
    );

  return reminder.toISOString();
}
async function loadPaidCourseRegistrations({
  db
}) {
  const rows = await db.prepare(`
    SELECT DISTINCT
      o.id AS order_id,
      o.order_reference,
      o.enquiry_id,
      o.customer_name,
      o.customer_phone,
      o.customer_country,
      o.payment_status,

      e.phone AS enquiry_phone,
      e.country AS enquiry_country,
      e.language AS enquiry_language,

      p.id AS product_id,
      p.sku,
      p.name_en,
      p.name_zh,
      p.starts_on,
      p.ends_on,
      p.delivery_en,
      p.delivery_zh

    FROM orders o

    JOIN order_items oi
      ON oi.order_id = o.id

    JOIN products p
      ON p.id = oi.product_id

    LEFT JOIN enquiries e
      ON e.id = o.enquiry_id

    WHERE o.payment_status = 'Paid'
      AND o.enquiry_id IS NOT NULL
      AND LOWER(COALESCE(p.product_type, '')) = 'course'
      AND COALESCE(p.starts_on, '') <> ''
      AND COALESCE(p.sku, '') <> ''

    ORDER BY o.id ASC
  `).all();

  return rows.results || [];
}

function registrationPhone(row) {
  const orderPhone =
    normalizeWhatsAppPhone(
      row.customer_phone,
      row.customer_country || row.enquiry_country
    );

  if (orderPhone) {
    return orderPhone;
  }

  return normalizeWhatsAppPhone(
    row.enquiry_phone,
    row.enquiry_country
  );
}

function registrationLanguage(row) {
  return cleanLanguage(
    row.enquiry_language
  );
}

async function enrollPaidCourses({
  db
}) {
  const registrations =
    await loadPaidCourseRegistrations({
      db
    });

  let checked = 0;
  let enrolled = 0;
  let existing = 0;
  let skipped = 0;

  for (const row of registrations) {
    checked += 1;

    const enquiryId =
      Number(row.enquiry_id || 0);

    const phone =
      registrationPhone(row);

    const language =
      registrationLanguage(row);

    const sequenceCode =
      courseSequenceCode({
        sku: row.sku,
        startsOn: row.starts_on
      });

    const nextSendAt =
      reminderAtUtc({
        startsOn: row.starts_on,
        daysBefore: 7
      });

    if (
      !enquiryId ||
      !phone ||
      !sequenceCode ||
      !nextSendAt
    ) {
      skipped += 1;
      continue;
    }

    const result =
      await db.prepare(`
        INSERT OR IGNORE INTO whatsapp_automations (
          enquiry_id,
          sequence_code,
          status,
          current_step,
          started_at,
          next_send_at,
          last_send_at,
          stop_reason,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          ?,
          'Active',
          0,
          CURRENT_TIMESTAMP,
          ?,
          '',
          '',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `).bind(
        enquiryId,
        sequenceCode,
        nextSendAt
      ).run();

    const changes =
      Number(
        result?.meta?.changes || 0
      );

    if (changes > 0) {
      enrolled += 1;
    } else {
      existing += 1;
    }

    /*
     * Keep these values resolved here because
     * the delivery layer will use the same
     * recipient/language rules.
     */
    void phone;
    void language;
  }

  return {
    checked,
    enrolled,
    existing,
    skipped
  };
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

  const url =
    new URL(request.url);

  const action =
    String(
      url.searchParams.get("action") || ""
    )
      .trim()
      .toLowerCase();

  if (action !== "enroll") {
    return json(
      {
        ok: false,
        error: "Unsupported action"
      },
      400
    );
  }

  try {
    const result =
      await enrollPaidCourses({
        db
      });

    return json({
      ok: true,
      action: "enroll",
      ...result
    });
  } catch (error) {
    console.error(
      "WhatsApp automation enrollment failed:",
      error
    );

    return json(
      {
        ok: false,
        error:
          "Unable to enroll WhatsApp automations"
      },
      500
    );
  }
}