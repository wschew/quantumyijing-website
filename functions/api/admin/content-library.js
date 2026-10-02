function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function getToken(request) {
  const auth = request.headers.get("authorization") || "";

  if (!auth.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return auth.slice(7).trim();
}

function authorized(request, env) {
  const expected =
    String(env.ADMIN_TOKEN || "").trim();

  const supplied =
    getToken(request);

  if (!expected || !supplied) {
    return false;
  }

  return supplied === expected;
}

function clean(value, max = 10000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

const LIBRARY_STATUSES = new Set([
  "approved",
  "archived"
]);

const STATUS_FILTERS = new Set([
  "approved",
  "archived",
  "all"
]);

async function getLibraryItem(db, id) {
  return await db.prepare(`
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
      AND status IN ('approved', 'archived')
  `).bind(id).first();
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

  const id =
    Number(
      url.searchParams.get("id") || 0
    );

  try {

    // --------------------------------------------------------
    // DETAIL VIEW
    // --------------------------------------------------------

    if (id > 0) {

      const item =
        await getLibraryItem(
          env.ENQUIRIES_DB,
          id
        );

      if (!item) {
        return json({
          ok: false,
          error: "Content Library item not found"
        }, 404);
      }

      const events =
        await env.ENQUIRIES_DB.prepare(`
          SELECT
            id,
            content_draft_id,
            event_type,
            notes,
            event_at
          FROM ai_content_events
          WHERE content_draft_id = ?
          ORDER BY id DESC
        `).bind(id).all();

      return json({
        ok: true,
        item,
        events: events.results || []
      });
    }


    // --------------------------------------------------------
    // LIST FILTERS
    // --------------------------------------------------------

    const status =
      clean(
        url.searchParams.get("status") || "approved",
        30
      ).toLowerCase();

    const contentType =
      clean(
        url.searchParams.get("content_type"),
        100
      );

    const language =
      clean(
        url.searchParams.get("language"),
        30
      );

    const platform =
      clean(
        url.searchParams.get("platform"),
        100
      ).toLowerCase();

    const objective =
      clean(
        url.searchParams.get("objective"),
        100
      ).toLowerCase();

    const tone =
      clean(
        url.searchParams.get("tone"),
        100
      ).toLowerCase();

    const search =
      clean(
        url.searchParams.get("search"),
        500
      );


    // --------------------------------------------------------
    // STATUS VALIDATION
    // --------------------------------------------------------

    if (!STATUS_FILTERS.has(status)) {
      return json({
        ok: false,
        error: "Invalid status filter"
      }, 400);
    }


    // --------------------------------------------------------
    // BUILD QUERY
    // --------------------------------------------------------

    const conditions = [];
    const bindings = [];

    if (status === "all") {
      conditions.push(
        "status IN ('approved', 'archived')"
      );
    }
    else {
      conditions.push(
        "status = ?"
      );

      bindings.push(
        status
      );
    }

    if (contentType) {
      conditions.push(
        "content_type = ?"
      );

      bindings.push(
        contentType
      );
    }

    if (language) {
      conditions.push(
        "language = ?"
      );

      bindings.push(
        language
      );
    }

    if (platform) {
      conditions.push(
        "platform = ?"
      );

      bindings.push(
        platform
      );
    }

    if (objective) {
      conditions.push(
        "objective = ?"
      );

      bindings.push(
        objective
      );
    }

    if (tone) {
      conditions.push(
        "tone = ?"
      );

      bindings.push(
        tone
      );
    }

    if (search) {

      const like =
        `%${search}%`;

      conditions.push(`
        (
          title LIKE ?
          OR content LIKE ?
          OR audience LIKE ?
          OR source_reference LIKE ?
          OR cta LIKE ?
        )
      `);

      bindings.push(
        like,
        like,
        like,
        like,
        like
      );
    }

    const where =
      conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";


    // --------------------------------------------------------
    // READ APPROVED / ARCHIVED CONTENT ONLY
    // --------------------------------------------------------

    const sql = `
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
      ${where}
      ORDER BY
        CASE
          WHEN approved_at IS NULL OR approved_at = ''
            THEN updated_at
          ELSE approved_at
        END DESC,
        id DESC
      LIMIT 100
    `;

    const result =
      await env.ENQUIRIES_DB
        .prepare(sql)
        .bind(...bindings)
        .all();

    return json({
      ok: true,

      filters: {
        status,
        content_type: contentType,
        language,
        platform,
        objective,
        tone,
        search
      },

      items:
        result.results || []
    });

  }
  catch (error) {

    console.error(
      "CONTENT LIBRARY GET ERROR",
      error
    );

    return json({
      ok: false,
      error: "Content Library read failed"
    }, 500);
  }
}
export async function onRequestPatch(context) {
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

  let body;

  try {
    body = await request.json();
  }
  catch {
    return json({
      ok: false,
      error: "Invalid JSON body"
    }, 400);
  }

  const id =
    Number(body?.id || 0);

  const action =
    clean(body?.action, 30)
      .toLowerCase();

  if (!Number.isInteger(id) || id <= 0) {
    return json({
      ok: false,
      error: "Valid content item id required"
    }, 400);
  }

  if (!["archive", "restore"].includes(action)) {
    return json({
      ok: false,
      error: "Action must be archive or restore"
    }, 400);
  }

  try {

    const current =
      await getLibraryItem(
        env.ENQUIRIES_DB,
        id
      );

    if (!current) {
      return json({
        ok: false,
        error: "Content Library item not found"
      }, 404);
    }


    // --------------------------------------------------------
    // ARCHIVE
    // approved -> archived
    // --------------------------------------------------------

    if (action === "archive") {

      if (current.status !== "approved") {
        return json({
          ok: false,
          error: "Only approved Content Library items can be archived"
        }, 409);
      }

      await env.ENQUIRIES_DB.batch([
        env.ENQUIRIES_DB.prepare(`
          UPDATE ai_content_drafts
          SET
            status = 'archived',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'approved'
        `).bind(id),

        env.ENQUIRIES_DB.prepare(`
          INSERT INTO ai_content_events (
            content_draft_id,
            event_type,
            notes
          )
          VALUES (?, 'archived', 'Content Library item archived')
        `).bind(id)
      ]);

      const item =
        await getLibraryItem(
          env.ENQUIRIES_DB,
          id
        );

      return json({
        ok: true,
        action: "archive",
        item
      });
    }


    // --------------------------------------------------------
    // RESTORE
    // archived -> approved
    //
    // approved_at is deliberately preserved.
    // Existing event schema has no "restored" event type,
    // so restoration is recorded as an edited lifecycle event.
    // --------------------------------------------------------

    if (current.status !== "archived") {
      return json({
        ok: false,
        error: "Only archived Content Library items can be restored"
      }, 409);
    }

    await env.ENQUIRIES_DB.batch([
      env.ENQUIRIES_DB.prepare(`
        UPDATE ai_content_drafts
        SET
          status = 'approved',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'archived'
      `).bind(id),

      env.ENQUIRIES_DB.prepare(`
        INSERT INTO ai_content_events (
          content_draft_id,
          event_type,
          notes
        )
        VALUES (?, 'edited', 'Content Library item restored')
      `).bind(id)
    ]);

    const item =
      await getLibraryItem(
        env.ENQUIRIES_DB,
        id
      );

    return json({
      ok: true,
      action: "restore",
      item
    });

  }
  catch (error) {

    console.error(
      "CONTENT LIBRARY PATCH ERROR",
      error
    );

    return json({
      ok: false,
      error: "Content Library update failed"
    }, 500);
  }
}