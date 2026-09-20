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

  if (!/^[1-9]\d{7,14}$/.test(phone)) {
    return "";
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
function formatCourseDate({
  startsOn,
  language
}) {
  const date =
    parseIsoDate(startsOn);

  if (!date) {
    return "";
  }

  const year =
    date.getUTCFullYear();
  const month =
    date.getUTCMonth();
  const day =
    date.getUTCDate();

  if (cleanLanguage(language) === "zh") {
    return `${year}年${month + 1}月${day}日`;
  }

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  return `${day} ${months[month]} ${year}`;
}

function buildCourseReminder7dPayload(
  registration
) {
  const language =
    registrationLanguage(registration);

  const phone =
    registrationPhone(registration);

  const name =
    String(
      registration.customer_name ||
      registration.enquiry_name ||
      ""
    ).trim();

  const isChinese =
    language === "zh";

  const courseName =
    String(
      isChinese
        ? registration.name_zh ||
          registration.name_en ||
          ""
        : registration.name_en ||
          registration.name_zh ||
          ""
    ).trim();

  const delivery =
    String(
      isChinese
        ? registration.delivery_zh ||
          registration.delivery_en ||
          ""
        : registration.delivery_en ||
          registration.delivery_zh ||
          ""
    ).trim();

  const courseDate =
    formatCourseDate({
      startsOn: registration.starts_on,
      language
    });

  if (
    !phone ||
    !name ||
    !courseName ||
    !courseDate ||
    !delivery
  ) {
    return null;
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: isChinese
        ? "course_class_reminder_7d_zh_v1"
        : "course_class_reminder_7d_v1",
      language: {
        code: isChinese
          ? "zh_CN"
          : "en"
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: name
            },
            {
              type: "text",
              text: courseName
            },
            {
              type: "text",
              text: courseDate
            },
            {
              type: "text",
              text: delivery
            }
          ]
        }
      ]
    }
  };
}
function renderCourseReminder7dText(
  registration
) {
  const language =
    registrationLanguage(registration);

  const name =
    String(
      registration.customer_name ||
      registration.enquiry_name ||
      ""
    ).trim();

  const isChinese =
    language === "zh";

  const courseName =
    String(
      isChinese
        ? registration.name_zh ||
          registration.name_en ||
          ""
        : registration.name_en ||
          registration.name_zh ||
          ""
    ).trim();

  const delivery =
    String(
      isChinese
        ? registration.delivery_zh ||
          registration.delivery_en ||
          ""
        : registration.delivery_en ||
          registration.delivery_zh ||
          ""
    ).trim();

  const courseDate =
    formatCourseDate({
      startsOn: registration.starts_on,
      language
    });

  if (
    !name ||
    !courseName ||
    !courseDate ||
    !delivery
  ) {
    return "";
  }

  if (isChinese) {
    return [
      `您好 ${name}，`,
      "",
      `温馨提醒：您报名的 ${courseName} 课程将在 7 天后开课。`,
      "",
      `课程日期：${courseDate}`,
      `上课方式：${delivery}`,
      "",
      "期待在课程中与您见面。",
      "",
      "量子易经国际学院"
    ].join("\n");
  }

  return [
    `Hello ${name},`,
    "",
    `This is a reminder that your ${courseName} course will begin in 7 days.`,
    "",
    `Course date: ${courseDate}`,
    `Delivery: ${delivery}`,
    "",
    "We look forward to welcoming you to the course.",
    "",
    "Quantum YiJing International Academy"
  ].join("\n");
}

async function sendWhatsAppTemplate({
  env,
  payload
}) {
  const token =
    env.WHATSAPP_ACCESS_TOKEN;

  const phoneNumberId =
    env.WHATSAPP_PHONE_NUMBER_ID;

  if (
    !token ||
    !phoneNumberId ||
    !payload
  ) {
    return {
      ok: false,
      skipped: true,
      error:
        "WhatsApp configuration or payload missing"
    };
  }

  try {
    const response =
      await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(payload)
        }
      );

    const result =
      await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {
      console.error(
        "WhatsApp automation send failed:",
        JSON.stringify(result)
      );

      return {
        ok: false,
        status: response.status,
        result
      };
    }

    const waMessageId =
      result?.messages?.[0]?.id || "";

    if (!waMessageId) {
      return {
        ok: false,
        status: response.status,
        result,
        error:
          "Meta accepted response without message id"
      };
    }

    return {
      ok: true,
      waMessageId,
      phoneNumberId,
      result
    };
  } catch (error) {
    console.error(
      "WhatsApp automation request failed:",
      error
    );

    return {
      ok: false,
      error:
        "WhatsApp request failed"
    };
  }
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

      e.name AS enquiry_name,
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

async function loadDueAutomations({
  db,
  dueAt
}) {
  const rows = await db.prepare(`
    SELECT
      id,
      enquiry_id,
      sequence_code,
      status,
      current_step,
      started_at,
      next_send_at,
      last_send_at,
      stop_reason
    FROM whatsapp_automations
    WHERE status = 'Active'
      AND current_step = 0
      AND COALESCE(next_send_at, '') <> ''
      AND next_send_at <= ?
    ORDER BY next_send_at ASC, id ASC
    LIMIT ?
  `).bind(
    dueAt,
    MAX_RUN_BATCH
  ).all();

  return rows.results || [];
}

async function matchDueRegistrations({
  db,
  dueAutomations
}) {
  const registrations =
    await loadPaidCourseRegistrations({
      db
    });

  return dueAutomations.map((automation) => {
    const registration =
      registrations.find((row) => {
        const sequenceCode =
          courseSequenceCode({
            sku: row.sku,
            startsOn: row.starts_on
          });

        return (
          Number(row.enquiry_id || 0) ===
            Number(automation.enquiry_id || 0) &&
          sequenceCode === automation.sequence_code
        );
      }) || null;

    return {
      automation,
      registration
    };
  });
}
async function claimAutomationStep({
  db,
  automation,
  templateCode
}) {
  const automationId =
    Number(automation?.id || 0);

  const enquiryId =
    Number(automation?.enquiry_id || 0);

  const sequenceCode =
    String(
      automation?.sequence_code || ""
    ).trim();

  const cleanTemplateCode =
    String(templateCode || "").trim();

  if (
    !automationId ||
    !enquiryId ||
    !sequenceCode ||
    !cleanTemplateCode
  ) {
    return {
      ok: false,
      claimed: false,
      reason: "invalid_claim"
    };
  }

  const result =
    await db.prepare(`
      INSERT OR IGNORE INTO whatsapp_automation_logs (
        automation_id,
        enquiry_id,
        sequence_code,
        step_no,
        template_code,
        status,
        sent_at,
        wa_message_id,
        error_message,
        created_at
      )
      VALUES (
        ?,
        ?,
        ?,
        1,
        ?,
        'Pending',
        '',
        '',
        '',
        CURRENT_TIMESTAMP
      )
    `).bind(
      automationId,
      enquiryId,
      sequenceCode,
      cleanTemplateCode
    ).run();

  const changes =
    Number(
      result?.meta?.changes || 0
    );

  return {
    ok: true,
    claimed: changes > 0
  };
}
async function finishAutomationStep({
  db,
  automationId,
  sent,
  waMessageId = "",
  errorMessage = ""
}) {
  const cleanAutomationId =
    Number(automationId || 0);

  if (!cleanAutomationId) {
    return {
      ok: false,
      updated: false
    };
  }

  const status =
    sent ? "Sent" : "Failed";

  const cleanMessageId =
    String(waMessageId || "").trim();

  const cleanError =
    String(errorMessage || "")
      .trim()
      .slice(0, 2000);

  const result =
    await db.prepare(`
      UPDATE whatsapp_automation_logs
      SET
        status = ?,
        sent_at = ?,
        wa_message_id = ?,
        error_message = ?
      WHERE automation_id = ?
        AND step_no = 1
        AND status = 'Pending'
    `).bind(
      status,
      sent
        ? new Date().toISOString()
        : "",
      sent
        ? cleanMessageId
        : "",
      sent
        ? ""
        : cleanError,
      cleanAutomationId
    ).run();

  const changes =
    Number(
      result?.meta?.changes || 0
    );

  return {
    ok: true,
    updated: changes > 0,
    status
  };
}
async function storeAutomationOutboundMessage({
  db,
  env,
  registration,
  sendResult
}) {
  const waMessageId =
    String(
      sendResult?.waMessageId || ""
    ).trim();

  const phoneNumberId =
    String(
      sendResult?.phoneNumberId ||
      env.WHATSAPP_PHONE_NUMBER_ID ||
      ""
    ).trim();

  const businessAccountId =
    env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    null;

  const senderWaId =
    registrationPhone(registration);

  const enquiryId =
    Number(
      registration?.enquiry_id || 0
    );

  const message =
    renderCourseReminder7dText(
      registration
    );

  if (
    !waMessageId ||
    !phoneNumberId ||
    !senderWaId ||
    !enquiryId ||
    !message
  ) {
    return {
      ok: false,
      inserted: false
    };
  }

  const result =
    await db.prepare(`
      INSERT OR IGNORE INTO whatsapp_messages (
        wa_message_id,
        wa_phone_number_id,
        wa_business_account_id,
        sender_wa_id,
        sender_name,
        message_type,
        message_text,
        message_timestamp,
        raw_payload,
        direction,
        enquiry_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      waMessageId,
      phoneNumberId,
      businessAccountId,
      senderWaId,
      "Quantum YiJing Academy",
      "template",
      message,
      Math.floor(Date.now() / 1000),
      JSON.stringify(
        sendResult?.result || {}
      ),
      "outbound",
      enquiryId
    ).run();

  const changes =
    Number(
      result?.meta?.changes || 0
    );

  return {
    ok: true,
    inserted: changes > 0
  };
}
async function logAutomationCrmActivity({
  db,
  registration
}) {
  const enquiryId =
    Number(
      registration?.enquiry_id || 0
    );

  if (!enquiryId) {
    return {
      ok: false,
      inserted: false
    };
  }

  const courseName =
    String(
      registration?.name_en ||
      registration?.name_zh ||
      registration?.sku ||
      "course"
    ).trim();

  const activityDate =
    new Date().toISOString();

  await db.prepare(`
    INSERT INTO crm_activities (
      enquiry_id,
      activity_type,
      description,
      activity_date
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    enquiryId,
    "WhatsApp Template",
    `7-day course reminder sent for ${courseName}.`,
    activityDate
  ).run();

  return {
    ok: true,
    inserted: true
  };
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

    const reminderAlreadyPassed =
      nextSendAt &&
      new Date(nextSendAt).getTime() <= Date.now();

    if (
      !enquiryId ||
      !phone ||
      !sequenceCode ||
      !nextSendAt ||
      reminderAlreadyPassed
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

  if (action === "preview_due") {
    try {
      const requestedAt =
        String(
          url.searchParams.get("at") || ""
        ).trim();

      const parsedAt =
        new Date(requestedAt);

      if (
        !requestedAt ||
        Number.isNaN(parsedAt.getTime())
      ) {
        return json(
          {
            ok: false,
            error: "Valid at timestamp required"
          },
          400
        );
      }

      const dueAt =
        parsedAt.toISOString();

      const dueAutomations =
        await loadDueAutomations({
          db,
          dueAt
        });

      const matches =
        await matchDueRegistrations({
          db,
          dueAutomations
        });

      const items =
        matches.map((item) => {
          const registration =
            item.registration;

          return {
            automation:
              item.automation,
            matched:
              Boolean(registration),
            payload: registration
              ? buildCourseReminder7dPayload(
                  registration
                )
              : null,
            recipient: registration
              ? {
                  phone:
                    registrationPhone(
                      registration
                    ),
                  language:
                    registrationLanguage(
                      registration
                    ),
                  name:
                    registration.customer_name ||
                    ""
                }
              : null,
            course: registration
              ? {
                  sku:
                    registration.sku,
                  name_en:
                    registration.name_en,
                  name_zh:
                    registration.name_zh,
                  starts_on:
                    registration.starts_on,
                  delivery_en:
                    registration.delivery_en,
                  delivery_zh:
                    registration.delivery_zh
                }
              : null
          };
        });

      return json({
        ok: true,
        action: "preview_due",
        due_at: dueAt,
        count: items.length,
        items
      });
    } catch (error) {
      console.error(
        "WhatsApp automation preview failed:",
        error
      );

      return json(
        {
          ok: false,
          error:
            "Unable to preview due WhatsApp automations"
        },
        500
      );
    }
  }

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
