const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const ACADEMY_NAME = 'Quantum YiJing International Academy';
const FROM_ADDRESS = `${ACADEMY_NAME} <info@quantumyijing.com>`;
const DEFAULT_REPLY_ADDRESS = 'info@quantumyijing.com';

const DEFAULT_SEQUENCE = 'YJ12-NURTURE';
const YJ12_PRODUCT_SLUG = 'yj12-yijing-science-of-prediction';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

/* =========================================================
   AUTHENTICATION
   Uses the same ADMIN_TOKEN pattern as existing QY admin APIs.
   ========================================================= */

function bearer(req) {
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ')
    ? h.slice(7).trim()
    : '';
}

function auth(req, env) {
  return !!env.ADMIN_TOKEN && bearer(req) === env.ADMIN_TOKEN;
}

/* =========================================================
   COMMON HELPERS
   ========================================================= */

function clean(v, n = 300) {
  return String(v ?? '').trim().slice(0, n);
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}

function replyAddress(env, automationId) {
  const domain = clean(env.RESEND_RECEIVING_DOMAIN || '', 253)
    .toLowerCase()
    .replace(/^@+/, '');

  return domain && Number.isInteger(Number(automationId))
    ? `yj12-a${Number(automationId)}@${domain}`
    : DEFAULT_REPLY_ADDRESS;
}

function sqlDate(date = new Date()) {
  return date.toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

function addHours(date, hours) {
  const d = new Date(date);
  d.setTime(d.getTime() + (hours * 60 * 60 * 1000));
  return d;
}

function addDays(date, days) {
  return addHours(date, days * 24);
}

function malaysiaNow() {
  return new Date().toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function siteBase(env) {
  return clean(env.PUBLIC_SITE_URL || '', 300)
    .replace(/\/+$/, '') ||
    'https://quantumyijing.com';
}

function trackedProductUrl(env, row) {
  const url = new URL(
    `${siteBase(env)}/product/${YJ12_PRODUCT_SLUG}`
  );

  if (row.affiliate_code) {
    url.searchParams.set('aff', row.affiliate_code);
  }

  url.searchParams.set('utm_source', 'crm');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', 'YJ12-NURTURE');

  return url.href;
}

/* =========================================================
   YJ12 NURTURE SEQUENCE

   Step 1 : immediately
   Step 2 : 1 day later
   Step 3 : 2 days after Step 2
   Step 4 : 2 days after Step 3

   This first stable version uses EMAIL only.
   WhatsApp automation can be added separately later.
   ========================================================= */

const YJ12_STEPS = [
  {
    stepNo: 1,
    templateCode: 'YJ12-NURTURE-01',
    nextDelayDays: 1
  },
  {
    stepNo: 2,
    templateCode: 'YJ12-NURTURE-02',
    nextDelayDays: 2
  },
  {
    stepNo: 3,
    templateCode: 'YJ12-NURTURE-03',
    nextDelayDays: 2
  },
  {
    stepNo: 4,
    templateCode: 'YJ12-NURTURE-04',
    nextDelayDays: null
  }
];

function getStep(stepNo) {
  return YJ12_STEPS.find(x => x.stepNo === Number(stepNo));
}

/* =========================================================
   EMAIL CONTENT
   ========================================================= */

function emailContent(stepNo, row, env) {
  const isZh = String(row.language || '')
    .toLowerCase()
    .startsWith('zh');

  const name = clean(row.name, 100) || 'there';
  const productUrl = trackedProductUrl(env, row);

  if (isZh) {
    if (stepNo === 1) {
      return {
        subject: 'YJ12 易经预测科学课程资料',
        headline: '感谢您对 YJ12 的关注',
        body: `
          <p>尊敬的 ${esc(name)}：</p>

          <p>
            感谢您索取 <strong>YJ12 易经：预测科学</strong> 的课程资料。
          </p>

          <p>
            YJ12 并不是单纯学习预测技巧，而是帮助学员建立一套
            <strong>观察规律、理解变化、判断时机与分析选择</strong>
            的系统思维框架。
          </p>

          <p>
            如果您正在面对事业、家庭、投资、人生方向或其他重要决定，
            这套方法可以帮助您从不同角度重新理解问题。
          </p>
        `,
        button: '查看完整 YJ12 课程',
        productUrl
      };
    }

    if (stepNo === 2) {
      return {
        subject: '当事情不确定时，我们应该如何判断？',
        headline: '真正困难的，往往不是“没有选择”',
        body: `
          <p>尊敬的 ${esc(name)}：</p>

          <p>
            很多人面对重要决定时，最大的困难并不是没有选择，
            而是<strong>无法判断不同选择背后的趋势、时机与后果</strong>。
          </p>

          <p>
            易经真正有价值的地方，并不只是“算一个结果”，而是帮助我们理解：
          </p>

          <p>
            • 事情目前处于什么状态<br>
            • 哪些力量正在推动变化<br>
            • 什么时机适合行动<br>
            • 不同决定可能带来什么发展
          </p>

          <p>
            这也是 YJ12 课程特别强调的核心能力。
          </p>
        `,
        button: '进一步了解 YJ12',
        productUrl
      };
    }

    if (stepNo === 3) {
      return {
        subject: 'YJ12 学习的不是死记答案，而是一套思考系统',
        headline: '从卦象走向结构化判断',
        body: `
          <p>尊敬的 ${esc(name)}：</p>

          <p>
            在 YJ12 中，我们不会把易经当作一套需要背诵的神秘答案。
          </p>

          <p>
            学习重点是把卦象、变化、时间和关系，
            转化成一套<strong>可以反复练习和应用的分析框架</strong>。
          </p>

          <p>
            您会逐步学习如何：
          </p>

          <p>
            • 看出隐藏在事件背后的规律<br>
            • 理解事物正在如何变化<br>
            • 判断较有利的行动时机<br>
            • 将卦象应用在真实的人生问题
          </p>

          <p>
            如果您希望学习的是“方法”，而不只是得到一次答案，
            YJ12 会比较适合您。
          </p>
        `,
        button: '查看课程内容',
        productUrl
      };
    }

    return {
      subject: 'YJ12：如果您仍在考虑，这里是最后一个提醒',
      headline: '准备好之后，再决定是否加入',
      body: `
        <p>尊敬的 ${esc(name)}：</p>

        <p>
          过去几天，我们向您介绍了 YJ12 的学习理念和方法。
        </p>

        <p>
          如果您希望建立一套能够长期运用的
          <strong>易经预测与决策思维框架</strong>，
          欢迎您进一步查看课程详情。
        </p>

        <p>
          如果现在还不是适合您的时间，也完全没有问题。
          您可以保留这封邮件，未来需要时再回来了解。
        </p>

        <p>
          感谢您关注量子易经国际学院。
        </p>
      `,
      button: '查看 YJ12 报名详情',
      productUrl
    };
  }

  /* ===========================
     ENGLISH
     =========================== */

  if (stepNo === 1) {
    return {
      subject: 'Your YJ12 Yijing: Science of Prediction information',
      headline: 'Thank you for your interest in YJ12',
      body: `
        <p>Dear ${esc(name)},</p>

        <p>
          Thank you for requesting information about
          <strong>YJ12 Yijing: Science of Prediction</strong>.
        </p>

        <p>
          YJ12 is not simply about learning prediction techniques.
          It is designed to develop a structured way of
          <strong>recognising patterns, understanding change,
          assessing timing and evaluating choices</strong>.
        </p>

        <p>
          If you are facing uncertainty in business, career,
          relationships, investment or personal direction,
          this framework can help you look at the situation
          from a wider perspective.
        </p>
      `,
      button: 'Explore the full YJ12 programme',
      productUrl
    };
  }

  if (stepNo === 2) {
    return {
      subject: 'How do we make decisions when the situation is uncertain?',
      headline: 'The difficult part is often not the lack of choices',
      body: `
        <p>Dear ${esc(name)},</p>

        <p>
          Many difficult decisions arise not because we have no options,
          but because we cannot clearly see the
          <strong>pattern, timing and consequences</strong>
          behind those options.
        </p>

        <p>
          The practical value of the Yijing is not simply to
          “predict an answer”. It can help us examine:
        </p>

        <p>
          • the present state of a situation<br>
          • the forces influencing change<br>
          • whether the timing favours action<br>
          • the possible consequences of different choices
        </p>

        <p>
          These are some of the core capabilities developed in YJ12.
        </p>
      `,
      button: 'See how YJ12 works',
      productUrl
    };
  }

  if (stepNo === 3) {
    return {
      subject: 'YJ12 teaches a framework, not answers to memorise',
      headline: 'From hexagrams to structured judgement',
      body: `
        <p>Dear ${esc(name)},</p>

        <p>
          In YJ12, the Yijing is not treated as a collection of
          mysterious answers that students simply memorise.
        </p>

        <p>
          The emphasis is on turning patterns, change, timing and
          relationships into a
          <strong>structured analytical framework</strong>
          that can be practised repeatedly.
        </p>

        <p>
          You will progressively learn how to:
        </p>

        <p>
          • identify patterns behind events<br>
          • recognise how a situation is changing<br>
          • consider the timing of action<br>
          • apply Yijing reasoning to real decisions
        </p>

        <p>
          If you want to learn a method rather than receive
          a one-time answer, YJ12 may be a good fit.
        </p>
      `,
      button: 'View the programme',
      productUrl
    };
  }

  return {
    subject: 'YJ12: a final note while you consider the programme',
    headline: 'Join when the timing is right for you',
    body: `
      <p>Dear ${esc(name)},</p>

      <p>
        Over the past few days, we have introduced the thinking
        and learning approach behind YJ12.
      </p>

      <p>
        If you would like to develop a practical,
        repeatable framework for
        <strong>Yijing-based prediction and decision analysis</strong>,
        you are welcome to review the programme details.
      </p>

      <p>
        If this is not the right time for you, that is perfectly fine.
        Keep this message and return whenever the timing feels appropriate.
      </p>

      <p>
        Thank you for your interest in
        Quantum YiJing International Academy.
      </p>
    `,
    button: 'View YJ12 registration details',
    productUrl
  };
}

function emailHtml(content) {
  const logo =
    `${content.productUrl.startsWith('https://') ? 'https://quantumyijing.com' : ''}` +
    '/images/quantum-yijing-3d-logo.png';

  return `<!doctype html>
<html>
<body style="
  margin:0;
  padding:0;
  background:#f4f7fb;
  font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;
  color:#17243a;
">
  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="background:#f4f7fb"
  >
    <tr>
      <td align="center" style="padding:28px 12px">

        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            max-width:680px;
            background:#ffffff;
            border:1px solid #dce7f4;
            border-radius:20px;
            overflow:hidden;
          "
        >

          <tr>
            <td
              style="
                padding:24px 30px;
                background:#edf5ff;
                border-bottom:4px solid #d3a62c;
              "
            >
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
              >
                <tr>
                  <td width="78">
                    <img
                      src="${logo}"
                      width="64"
                      alt="Quantum YiJing"
                      style="display:block;border:0"
                    >
                  </td>

                  <td>
                    <div
                      style="
                        font-size:21px;
                        font-weight:800;
                        color:#082b63;
                      "
                    >
                      Quantum YiJing
                    </div>

                    <div
                      style="
                        margin-top:4px;
                        font-size:11px;
                        letter-spacing:2px;
                        font-weight:700;
                        color:#45688f;
                      "
                    >
                      INTERNATIONAL ACADEMY
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:34px">

              <div
                style="
                  font-size:12px;
                  font-weight:800;
                  letter-spacing:1.7px;
                  color:#1768c4;
                "
              >
                YJ12 · YIJING: SCIENCE OF PREDICTION
              </div>

              <h1
                style="
                  margin:10px 0 24px;
                  font-size:26px;
                  line-height:1.35;
                  color:#0b2f66;
                "
              >
                ${content.headline}
              </h1>

              <div
                style="
                  font-size:15px;
                  line-height:1.8;
                  color:#263d59;
                "
              >
                ${content.body}
              </div>

              <div style="margin:30px 0">

                <a
                  href="${esc(content.productUrl)}"
                  style="
                    display:inline-block;
                    background:#1768c4;
                    color:#ffffff;
                    text-decoration:none;
                    padding:14px 22px;
                    border-radius:9px;
                    font-weight:700;
                    font-size:15px;
                  "
                >
                  ${content.button}
                </a>

              </div>

              <p
                style="
                  margin:30px 0 0;
                  font-size:15px;
                  line-height:1.8;
                "
              >
                Warm regards / 敬祝安好<br>
                <strong>Master Chew Wai Soon / 赵辉顺导师</strong><br>
                <span style="color:#60758d">
                  Founder &amp; Chief Instructor
                </span>
              </p>

            </td>
          </tr>

          <tr>
            <td
              align="center"
              style="
                padding:22px 26px;
                background:#f7f9fc;
                border-top:1px solid #e0e8f2;
                color:#71839a;
                font-size:12px;
                line-height:1.8;
              "
            >
              Quantum YiJing International Academy<br>
              info@quantumyijing.com<br>
              Where Ancient Wisdom Meets Modern Scientific Thinking
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* =========================================================
   RESEND
   ========================================================= */

async function sendEmail(apiKey, payload) {
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing.');
  }

  const r = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(
      `Resend ${r.status}: ${JSON.stringify(body)}`
    );
  }

  return body;
}

/* =========================================================
   DATABASE LOOKUPS
   ========================================================= */

async function enquiryRow(db, enquiryId) {
  return await db.prepare(`
    SELECT
      e.id,
      e.reference,
      e.name,
      e.email,
      e.phone,
      e.country,
      e.interest,
      e.language,
      e.status,
      e.lifecycle_stage,
      e.follow_up_date,
      e.priority,
      e.next_action,

      COALESCE(a.marketing_source,'') AS marketing_source,
      COALESCE(a.campaign_code,'') AS campaign_code,
      COALESCE(a.utm_source,'') AS utm_source,
      COALESCE(a.utm_medium,'') AS utm_medium,
      COALESCE(a.utm_campaign,'') AS utm_campaign,
      COALESCE(a.affiliate_code,'') AS affiliate_code,
      COALESCE(a.product_slug,'') AS product_slug,

      COALESCE((
        SELECT COUNT(*)
        FROM orders o
        WHERE o.enquiry_id=e.id
          AND o.payment_status IN ('Paid','External')
      ),0) AS paid_orders

    FROM enquiries e

    LEFT JOIN enquiry_attribution a
      ON a.enquiry_id=e.id

    WHERE e.id=?

    LIMIT 1
  `).bind(enquiryId).first();
}

async function automationRow(db, enquiryId, sequenceCode) {
  return await db.prepare(`
    SELECT *
    FROM marketing_automations
    WHERE enquiry_id=?
      AND sequence_code=?
    ORDER BY id DESC
    LIMIT 1
  `).bind(enquiryId, sequenceCode).first();
}

/* =========================================================
   STOP RULES

   The automation must NOT continue marketing when:
   - CRM is Closed
   - Converted
   - Registered
   - Active Student
   - Graduate
   - Alumni
   - customer has already paid
   ========================================================= */

function stopReasonFor(row) {
  if (!row) return 'Enquiry no longer exists';

  if (row.status === 'Closed') {
    return 'CRM record closed';
  }

  if (row.status === 'Converted') {
    return 'Lead converted';
  }

  if (
    [
      'Registered',
      'Active Student',
      'Graduate',
      'Alumni',
      'Closed'
    ].includes(row.lifecycle_stage)
  ) {
    return `Lifecycle: ${row.lifecycle_stage}`;
  }

  if (Number(row.paid_orders || 0) > 0) {
    return 'Customer already paid';
  }

  return '';
}

async function stopAutomation(db, automationId, reason) {
  await db.prepare(`
    UPDATE marketing_automations
    SET
      status='Stopped',
      stop_reason=?,
      next_send_at='',
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    clean(reason, 300),
    automationId
  ).run();
}

/* =========================================================
   ENROL ONE LEAD
   ========================================================= */

async function enrol(context, url) {
  const db = context.env.ENQUIRIES_DB;

  let body;

  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const enquiryId = Number(body.enquiryId);
  const sequenceCode =
    clean(body.sequenceCode, 80) ||
    DEFAULT_SEQUENCE;

  if (!Number.isInteger(enquiryId) || enquiryId < 1) {
    return json({
      error: 'Valid enquiryId is required.'
    }, 400);
  }

  const lead = await enquiryRow(db, enquiryId);

  if (!lead) {
    return json({
      error: 'Enquiry not found.'
    }, 404);
  }

  if (!validEmail(lead.email)) {
    return json({
      error: 'Lead does not have a valid email address.'
    }, 400);
  }

  const reason = stopReasonFor(lead);

  if (reason) {
    return json({
      error: `Lead cannot enter automation: ${reason}.`
    }, 409);
  }

  const existing = await automationRow(
    db,
    enquiryId,
    sequenceCode
  );

  if (existing) {
    return json({
      ok: true,
      alreadyExists: true,
      automation: existing
    });
  }

  const now = sqlDate();

  const inserted = await db.prepare(`
    INSERT INTO marketing_automations (
      enquiry_id,
      sequence_code,
      status,
      current_step,
      started_at,
      next_send_at,
      last_send_at,
      stop_reason
    )
    VALUES (?, ?, 'Active', 0, ?, ?, '', '')
  `).bind(
    enquiryId,
    sequenceCode,
    now,
    now
  ).run();

  const id = Number(
    inserted.meta?.last_row_id || 0
  );

  await db.prepare(`
    INSERT INTO crm_activities (
      enquiry_id,
      activity_type,
      description,
      activity_date
    )
    VALUES (?, 'System', ?, ?)
  `).bind(
    enquiryId,
    `Marketing automation ${sequenceCode} started.`,
    malaysiaNow()
  ).run();

  return json({
    ok: true,
    automationId: id,
    enquiryId,
    sequenceCode,
    nextSendAt: now
  });
}

/* =========================================================
   AUTO-ENROL EXISTING YJ12 FUNNEL LEADS

   Useful initially for testing.

   It only picks:
   marketing_source = YJ12 Funnel
   OR product_slug = YJ12 product slug

   It does NOT touch already-enrolled leads.
   ========================================================= */

async function autoEnrol(context) {
  const db = context.env.ENQUIRIES_DB;

  const result = await db.prepare(`
    SELECT DISTINCT
      e.id
    FROM enquiries e

    LEFT JOIN enquiry_attribution a
      ON a.enquiry_id=e.id

    WHERE
      (
        a.marketing_source='YJ12 Funnel'
        OR
        a.product_slug=?
      )

      AND e.status NOT IN ('Converted','Closed')

      AND e.lifecycle_stage NOT IN (
        'Registered',
        'Active Student',
        'Graduate',
        'Alumni',
        'Closed'
      )

      AND trim(e.email) != ''

      AND NOT EXISTS (
        SELECT 1
        FROM marketing_automations m
        WHERE m.enquiry_id=e.id
          AND m.sequence_code=?
      )

    ORDER BY e.id DESC
    LIMIT 100
  `).bind(
    YJ12_PRODUCT_SLUG,
    DEFAULT_SEQUENCE
  ).all();

  let enrolled = 0;
  let skipped = 0;

  for (const item of result.results || []) {
    const lead = await enquiryRow(db, item.id);

    if (!lead || !validEmail(lead.email)) {
      skipped++;
      continue;
    }

    const reason = stopReasonFor(lead);

    if (reason) {
      skipped++;
      continue;
    }

    const now = sqlDate();

    await db.prepare(`
      INSERT INTO marketing_automations (
        enquiry_id,
        sequence_code,
        status,
        current_step,
        started_at,
        next_send_at,
        last_send_at,
        stop_reason
      )
      VALUES (?, ?, 'Active', 0, ?, ?, '', '')
    `).bind(
      lead.id,
      DEFAULT_SEQUENCE,
      now,
      now
    ).run();

    await db.prepare(`
      INSERT INTO crm_activities (
        enquiry_id,
        activity_type,
        description,
        activity_date
      )
      VALUES (?, 'System', ?, ?)
    `).bind(
      lead.id,
      `Marketing automation ${DEFAULT_SEQUENCE} automatically started.`,
      malaysiaNow()
    ).run();

    enrolled++;
  }

  return json({
    ok: true,
    enrolled,
    skipped
  });
}

/* =========================================================
   SEND ONE AUTOMATION STEP
   ========================================================= */

async function sendStep(context, automation) {
  const db = context.env.ENQUIRIES_DB;

  const lead = await enquiryRow(
    db,
    automation.enquiry_id
  );

  if (!lead) {
    await stopAutomation(
      db,
      automation.id,
      'Enquiry not found'
    );

    return {
      ok: false,
      stopped: true,
      reason: 'Enquiry not found'
    };
  }

  const stopReason = stopReasonFor(lead);

  if (stopReason) {
    await stopAutomation(
      db,
      automation.id,
      stopReason
    );

    return {
      ok: true,
      stopped: true,
      reason: stopReason
    };
  }

  if (!validEmail(lead.email)) {
    await stopAutomation(
      db,
      automation.id,
      'Invalid email address'
    );

    return {
      ok: false,
      stopped: true,
      reason: 'Invalid email address'
    };
  }

  const stepNo =
    Number(automation.current_step || 0) + 1;

  const step = getStep(stepNo);

  if (!step) {
    await db.prepare(`
      UPDATE marketing_automations
      SET
        status='Completed',
        next_send_at='',
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(automation.id).run();

    return {
      ok: true,
      completed: true
    };
  }

  /* Avoid duplicate successful send */
  const previous = await db.prepare(`
    SELECT id,status
    FROM marketing_automation_logs
    WHERE automation_id=?
      AND step_no=?
      AND status='Sent'
    LIMIT 1
  `).bind(
    automation.id,
    stepNo
  ).first();

  if (previous) {
    const nextStepNo = stepNo + 1;
    const nextStep = getStep(nextStepNo);

    await db.prepare(`
      UPDATE marketing_automations
      SET
        current_step=?,
        status=?,
        next_send_at=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      stepNo,
      nextStep ? 'Active' : 'Completed',
      nextStep ? sqlDate() : '',
      automation.id
    ).run();

    return {
      ok: true,
      duplicateSkipped: true
    };
  }

  const pending = await db.prepare(`
    INSERT INTO marketing_automation_logs (
      automation_id,
      enquiry_id,
      sequence_code,
      step_no,
      channel,
      template_code,
      status,
      sent_at,
      provider_message_id,
      error_message
    )
    VALUES (?, ?, ?, ?, 'Email', ?, 'Pending', '', '', '')
  `).bind(
    automation.id,
    lead.id,
    automation.sequence_code,
    stepNo,
    step.templateCode
  ).run();

  const logId = Number(
    pending.meta?.last_row_id || 0
  );

  try {
    const content = emailContent(
      stepNo,
      lead,
      context.env
    );

    const sent = await sendEmail(
      context.env.RESEND_API_KEY,
      {
        from: FROM_ADDRESS,
        to: [lead.email],
        reply_to: replyAddress(context.env, automation.id),
        subject: content.subject,
        html: emailHtml(content)
      }
    );

    const sentAt = sqlDate();

    await db.prepare(`
      UPDATE marketing_automation_logs
      SET
        status='Sent',
        sent_at=?,
        provider_message_id=?,
        error_message=''
      WHERE id=?
    `).bind(
      sentAt,
      clean(sent?.id, 200),
      logId
    ).run();

    const nextStep = getStep(stepNo + 1);

    let nextSendAt = '';
    let newStatus = 'Completed';

    if (nextStep && step.nextDelayDays != null) {
      nextSendAt = sqlDate(
        addDays(
          new Date(),
          step.nextDelayDays
        )
      );

      newStatus = 'Active';
    }

    await db.prepare(`
      UPDATE marketing_automations
      SET
        current_step=?,
        status=?,
        last_send_at=?,
        next_send_at=?,
        stop_reason='',
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      stepNo,
      newStatus,
      sentAt,
      nextSendAt,
      automation.id
    ).run();

    await db.prepare(`
      INSERT INTO crm_activities (
        enquiry_id,
        activity_type,
        description,
        activity_date
      )
      VALUES (?, 'Email', ?, ?)
    `).bind(
      lead.id,
      `Automated YJ12 nurture email sent: ${step.templateCode}.`,
      malaysiaNow()
    ).run();

    return {
      ok: true,
      automationId: automation.id,
      enquiryId: lead.id,
      stepNo,
      templateCode: step.templateCode,
      status: newStatus,
      nextSendAt
    };

  } catch (error) {

    const message = clean(
      error?.message || String(error),
      1000
    );

    await db.prepare(`
      UPDATE marketing_automation_logs
      SET
        status='Failed',
        error_message=?
      WHERE id=?
    `).bind(
      message,
      logId
    ).run();

    /*
      Retry after 2 hours rather than repeatedly retrying
      whenever the runner is called.
    */
    const retryAt = sqlDate(
      addHours(new Date(), 2)
    );

    await db.prepare(`
      UPDATE marketing_automations
      SET
        next_send_at=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      retryAt,
      automation.id
    ).run();

    console.error(
      'Marketing automation email failed',
      automation.id,
      error
    );

    return {
      ok: false,
      automationId: automation.id,
      enquiryId: lead.id,
      stepNo,
      error: message,
      retryAt
    };
  }
}

/* =========================================================
   RUN ALL DUE AUTOMATIONS

   Maximum 20 at a time for safety.
   ========================================================= */

async function runDue(context) {
  const db = context.env.ENQUIRIES_DB;

  const now = sqlDate();

  const due = await db.prepare(`
    SELECT *
    FROM marketing_automations
    WHERE status='Active'
      AND next_send_at != ''
      AND next_send_at <= ?
    ORDER BY next_send_at ASC, id ASC
    LIMIT 20
  `).bind(now).all();

  const results = [];

  for (const automation of due.results || []) {
    results.push(
      await sendStep(context, automation)
    );
  }

  const sent = results.filter(
    x => x.ok && x.stepNo
  ).length;

  const stopped = results.filter(
    x => x.stopped
  ).length;

  const failed = results.filter(
    x => !x.ok && !x.stopped
  ).length;

  return json({
    ok: true,
    checked: (due.results || []).length,
    sent,
    stopped,
    failed,
    results
  });
}

/* =========================================================
   MANUAL STOP
   ========================================================= */

async function manualStop(context) {
  const db = context.env.ENQUIRIES_DB;

  let body;

  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const id = Number(body.automationId);
  const reason =
    clean(body.reason, 300) ||
    'Stopped manually by administrator';

  if (!Number.isInteger(id) || id < 1) {
    return json({
      error: 'Valid automationId is required.'
    }, 400);
  }

  const automation = await db.prepare(`
    SELECT *
    FROM marketing_automations
    WHERE id=?
  `).bind(id).first();

  if (!automation) {
    return json({
      error: 'Automation not found.'
    }, 404);
  }

  await stopAutomation(
    db,
    id,
    reason
  );

  await db.prepare(`
    INSERT INTO crm_activities (
      enquiry_id,
      activity_type,
      description,
      activity_date
    )
    VALUES (?, 'System', ?, ?)
  `).bind(
    automation.enquiry_id,
    `Marketing automation stopped. ${reason}`,
    malaysiaNow()
  ).run();

  return json({
    ok: true,
    automationId: id,
    status: 'Stopped'
  });
}

/* =========================================================
   RESUME
   ========================================================= */

async function resume(context) {
  const db = context.env.ENQUIRIES_DB;

  let body;

  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const id = Number(body.automationId);

  if (!Number.isInteger(id) || id < 1) {
    return json({
      error: 'Valid automationId is required.'
    }, 400);
  }

  const automation = await db.prepare(`
    SELECT *
    FROM marketing_automations
    WHERE id=?
  `).bind(id).first();

  if (!automation) {
    return json({
      error: 'Automation not found.'
    }, 404);
  }

  const lead = await enquiryRow(
    db,
    automation.enquiry_id
  );

  const reason = stopReasonFor(lead);

  if (reason) {
    return json({
      error:
        `Automation cannot resume: ${reason}.`
    }, 409);
  }

  if (Number(automation.current_step || 0) >= YJ12_STEPS.length) {
    return json({
      error:
        'This automation has already completed all sequence steps.'
    }, 409);
  }

  const now = sqlDate();

  await db.prepare(`
    UPDATE marketing_automations
    SET
      status='Active',
      stop_reason='',
      next_send_at=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    now,
    id
  ).run();

  await db.prepare(`
    INSERT INTO crm_activities (
      enquiry_id,
      activity_type,
      description,
      activity_date
    )
    VALUES (?, 'System', ?, ?)
  `).bind(
    automation.enquiry_id,
    'Marketing automation resumed by administrator.',
    malaysiaNow()
  ).run();

  return json({
    ok: true,
    automationId: id,
    status: 'Active',
    nextSendAt: now
  });
}

/* =========================================================
   SUMMARY
   ========================================================= */

async function summary(context) {
  const db = context.env.ENQUIRIES_DB;

  const counts = await db.prepare(`
    SELECT

      COUNT(*) AS total,

      SUM(
        CASE WHEN status='Active'
        THEN 1 ELSE 0 END
      ) AS active,

      SUM(
        CASE WHEN status='Completed'
        THEN 1 ELSE 0 END
      ) AS completed,

      SUM(
        CASE WHEN status='Stopped'
        THEN 1 ELSE 0 END
      ) AS stopped,

      SUM(
        CASE
          WHEN status='Active'
           AND next_send_at != ''
           AND next_send_at <= CURRENT_TIMESTAMP
          THEN 1
          ELSE 0
        END
      ) AS due

    FROM marketing_automations
  `).first();

  const logs = await db.prepare(`
    SELECT

      COUNT(*) AS total,

      SUM(
        CASE WHEN status='Sent'
        THEN 1 ELSE 0 END
      ) AS sent,

      SUM(
        CASE WHEN status='Failed'
        THEN 1 ELSE 0 END
      ) AS failed

    FROM marketing_automation_logs
  `).first();

  return json({
    ok: true,

    automations: {
      total: Number(counts?.total || 0),
      active: Number(counts?.active || 0),
      completed: Number(counts?.completed || 0),
      stopped: Number(counts?.stopped || 0),
      due: Number(counts?.due || 0)
    },

    emails: {
      total: Number(logs?.total || 0),
      sent: Number(logs?.sent || 0),
      failed: Number(logs?.failed || 0)
    }
  });
}

/* =========================================================
   LIST AUTOMATIONS
   ========================================================= */

async function listAutomations(context, url) {
  const db = context.env.ENQUIRIES_DB;

  const status = clean(
    url.searchParams.get('status'),
    30
  );

  let result;

  if (status) {
    result = await db.prepare(`
      SELECT
        m.*,
        e.reference,
        e.name,
        e.email,
        e.phone,
        e.status AS crm_status,
        e.lifecycle_stage,
        e.priority
      FROM marketing_automations m

      JOIN enquiries e
        ON e.id=m.enquiry_id

      WHERE m.status=?

      ORDER BY m.id DESC
      LIMIT 200
    `).bind(status).all();

  } else {

    result = await db.prepare(`
      SELECT
        m.*,
        e.reference,
        e.name,
        e.email,
        e.phone,
        e.status AS crm_status,
        e.lifecycle_stage,
        e.priority
      FROM marketing_automations m

      JOIN enquiries e
        ON e.id=m.enquiry_id

      ORDER BY m.id DESC
      LIMIT 200
    `).all();
  }

  return json({
    ok: true,
    results: result.results || []
  });
}

/* =========================================================
   LOGS
   ========================================================= */

async function logs(context, url) {
  const db = context.env.ENQUIRIES_DB;

  const automationId = Number(
    url.searchParams.get('automationId') || 0
  );

  let result;

  if (
    Number.isInteger(automationId) &&
    automationId > 0
  ) {

    result = await db.prepare(`
      SELECT *
      FROM marketing_automation_logs
      WHERE automation_id=?
      ORDER BY id DESC
      LIMIT 200
    `).bind(automationId).all();

  } else {

    result = await db.prepare(`
      SELECT *
      FROM marketing_automation_logs
      ORDER BY id DESC
      LIMIT 200
    `).all();
  }

  return json({
    ok: true,
    results: result.results || []
  });
}

/* =========================================================
   MAIN ROUTER
   ========================================================= */

export async function onRequest(context) {

  if (!context.env.ENQUIRIES_DB) {
    return json({
      error: 'ENQUIRIES_DB is not configured.'
    }, 503);
  }

  if (!context.env.ADMIN_TOKEN) {
    return json({
      error: 'ADMIN_TOKEN is not configured.'
    }, 503);
  }

  if (!auth(context.request, context.env)) {
    return json({
      error: 'Unauthorized.'
    }, 401);
  }

  const url = new URL(context.request.url);
  const action =
    clean(url.searchParams.get('action'), 50);

  try {

    /* ---------- READ ONLY ---------- */

    if (
      context.request.method === 'GET' &&
      action === 'summary'
    ) {
      return await summary(context);
    }

    if (
      context.request.method === 'GET' &&
      action === 'list'
    ) {
      return await listAutomations(
        context,
        url
      );
    }

    if (
      context.request.method === 'GET' &&
      action === 'logs'
    ) {
      return await logs(
        context,
        url
      );
    }

    /* ---------- WRITE ---------- */

    if (
      context.request.method === 'POST' &&
      action === 'enrol'
    ) {
      return await enrol(
        context,
        url
      );
    }

    if (
      context.request.method === 'POST' &&
      action === 'autoenrol'
    ) {
      return await autoEnrol(context);
    }

    if (
      context.request.method === 'POST' &&
      action === 'run'
    ) {
      return await runDue(context);
    }

    if (
      context.request.method === 'POST' &&
      action === 'stop'
    ) {
      return await manualStop(context);
    }

    if (
      context.request.method === 'POST' &&
      action === 'resume'
    ) {
      return await resume(context);
    }

    return json({
      error: 'Unknown marketing automation action.'
    }, 404);

  } catch (error) {

    console.error(
      'Marketing automation API failed',
      error
    );

    return json({
      error:
        error?.message ||
        'Marketing automation request failed.'
    }, 500);
  }
}
