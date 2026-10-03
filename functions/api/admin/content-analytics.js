function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function authorized(request, env) {
  const expected = clean(env.ADMIN_TOKEN, 1000);

  if (!expected) return false;

  const header =
    request.headers.get("authorization") || "";

  if (!header.toLowerCase().startsWith("bearer ")) {
    return false;
  }

  return header.slice(7).trim() === expected;
}

function integerParam(value, fallback, min, max) {
  const n = Number(value);

  if (!Number.isInteger(n)) return fallback;

  return Math.min(max, Math.max(min, n));
}

async function all(db, sql, ...binds) {
  const result =
    await db.prepare(sql)
      .bind(...binds)
      .all();

  return Array.isArray(result?.results)
    ? result.results
    : [];
}

async function first(db, sql, ...binds) {
  return await db.prepare(sql)
    .bind(...binds)
    .first();
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!authorized(request, env)) {
    return json({
      ok: false,
      error: "Unauthorized"
    }, 401);
  }

  if (!env.ENQUIRIES_DB) {
    return json({
      ok: false,
      error: "Database unavailable"
    }, 503);
  }

  const url =
    new URL(request.url);

  const days =
    integerParam(
      url.searchParams.get("days"),
      30,
      1,
      365
    );

  const limit =
    integerParam(
      url.searchParams.get("limit"),
      25,
      1,
      100
    );

  const sinceModifier =
    `-${days} days`;

  const db =
    env.ENQUIRIES_DB;

  try {

    const summary =
      await first(
        db,
        `
          SELECT
            COUNT(*) AS total_drafts,
            SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_count,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
            SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived_count,
            SUM(
              CASE
                WHEN datetime(created_at) >= datetime('now', ?)
                THEN 1 ELSE 0
              END
            ) AS created_in_window,
            SUM(
              CASE
                WHEN approved_at <> ''
                 AND datetime(approved_at) >= datetime('now', ?)
                THEN 1 ELSE 0
              END
            ) AS approved_in_window
          FROM ai_content_drafts
        `,
        sinceModifier,
        sinceModifier
      );

    const eventSummary =
      await first(
        db,
        `
          SELECT
            COUNT(*) AS total_events,
            SUM(
              CASE
                WHEN datetime(event_at) >= datetime('now', ?)
                THEN 1 ELSE 0
              END
            ) AS events_in_window
          FROM ai_content_events
        `,
        sinceModifier
      );

    const statusBreakdown =
      await all(
        db,
        `
          SELECT
            status,
            COUNT(*) AS total
          FROM ai_content_drafts
          GROUP BY status
          ORDER BY status
        `
      );

    const typeBreakdown =
      await all(
        db,
        `
          SELECT
            content_type,
            COUNT(*) AS total
          FROM ai_content_drafts
          GROUP BY content_type
          ORDER BY total DESC, content_type
        `
      );

    const platformBreakdown =
      await all(
        db,
        `
          SELECT
            CASE
              WHEN TRIM(platform) = '' THEN 'unspecified'
              ELSE platform
            END AS platform,
            COUNT(*) AS total
          FROM ai_content_drafts
          GROUP BY
            CASE
              WHEN TRIM(platform) = '' THEN 'unspecified'
              ELSE platform
            END
          ORDER BY total DESC, platform
        `
      );

    const modelBreakdown =
      await all(
        db,
        `
          SELECT
            CASE
              WHEN TRIM(model) = '' THEN 'manual / unspecified'
              ELSE model
            END AS model,
            COUNT(*) AS total
          FROM ai_content_drafts
          GROUP BY
            CASE
              WHEN TRIM(model) = '' THEN 'manual / unspecified'
              ELSE model
            END
          ORDER BY total DESC, model
        `
      );

    const eventTypes =
      await all(
        db,
        `
          SELECT
            event_type,
            COUNT(*) AS total
          FROM ai_content_events
          GROUP BY event_type
          ORDER BY total DESC, event_type
        `
      );

    const recentDrafts =
      await all(
        db,
        `
          SELECT
            id,
            content_type,
            language,
            title,
            source_type,
            source_reference,
            model,
            status,
            created_by,
            created_at,
            updated_at,
            approved_at,
            audience,
            objective,
            tone,
            platform,
            output_length
          FROM ai_content_drafts
          ORDER BY id DESC
          LIMIT ?
        `,
        limit
      );

    const recentEvents =
      await all(
        db,
        `
          SELECT
            e.id,
            e.content_draft_id,
            e.event_type,
            e.notes,
            e.event_at,
            d.title AS draft_title,
            d.content_type,
            d.status AS draft_status
          FROM ai_content_events e
          LEFT JOIN ai_content_drafts d
            ON d.id = e.content_draft_id
          ORDER BY e.id DESC
          LIMIT ?
        `,
        limit
      );

    return json({
      ok: true,

      generated_at:
        new Date().toISOString(),

      window: {
        days,
        limit
      },

      summary: {
        total_drafts:
          Number(summary?.total_drafts || 0),

        draft_count:
          Number(summary?.draft_count || 0),

        approved_count:
          Number(summary?.approved_count || 0),

        archived_count:
          Number(summary?.archived_count || 0),

        created_in_window:
          Number(summary?.created_in_window || 0),

        approved_in_window:
          Number(summary?.approved_in_window || 0),

        total_events:
          Number(eventSummary?.total_events || 0),

        events_in_window:
          Number(eventSummary?.events_in_window || 0)
      },

      breakdowns: {
        status: statusBreakdown,
        content_type: typeBreakdown,
        platform: platformBreakdown,
        model: modelBreakdown,
        event_type: eventTypes
      },

      recent_drafts:
        recentDrafts,

      recent_events:
        recentEvents
    });

  }
  catch (error) {

    console.error(
      "CONTENT ANALYTICS ERROR",
      error
    );

    return json({
      ok: false,
      error: "Content analytics unavailable"
    }, 500);
  }
}