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
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

function authorized(request, env) {
  const expected = String(env.ADMIN_TOKEN || "").trim();
  const supplied = getToken(request);

  if (!expected || !supplied) return false;
  return supplied === expected;
}

function clean(value, max = 10000) {
  return String(value ?? "").trim().slice(0, max);
}

const ALLOWED_STATUS = new Set([
  "draft",
  "approved",
  "archived"
]);

async function getDraft(db, id) {
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
      created_at,
      updated_at,
      approved_at
    FROM ai_content_drafts
    WHERE id = ?
  `).bind(id).first();
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!authorized(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id") || 0);

  try {
    if (id > 0) {
      const draft = await getDraft(env.DB, id);

      if (!draft) {
        return json({ ok: false, error: "Draft not found" }, 404);
      }

      const events = await env.DB.prepare(`
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
        draft,
        events: events.results || []
      });
    }

    const status = clean(url.searchParams.get("status"), 30);
    const language = clean(url.searchParams.get("language"), 30);
    const contentType = clean(url.searchParams.get("content_type"), 100);

    const conditions = [];
    const bindings = [];

    if (status) {
      if (!ALLOWED_STATUS.has(status)) {
        return json({ ok: false, error: "Invalid status filter" }, 400);
      }

      conditions.push("status = ?");
      bindings.push(status);
    }

    if (language) {
      conditions.push("language = ?");
      bindings.push(language);
    }

    if (contentType) {
      conditions.push("content_type = ?");
      bindings.push(contentType);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

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
        created_at,
        updated_at,
        approved_at
      FROM ai_content_drafts
      ${where}
      ORDER BY id DESC
      LIMIT 100
    `;

    const result = await env.DB.prepare(sql).bind(...bindings).all();

    return json({
      ok: true,
      drafts: result.results || []
    });

  } catch (error) {
    console.error("CONTENT STUDIO GET ERROR", error);
    return json({ ok: false, error: "Content Studio read failed" }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!authorized(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const contentType = clean(body.content_type, 100);
  const language = clean(body.language, 30);
  const title = clean(body.title, 500);
  const content = clean(body.content, 50000);
  const sourceType = clean(body.source_type || "manual", 100);
  const sourceReference = clean(body.source_reference, 1000);
  const prompt = clean(body.prompt, 10000);
  const model = clean(body.model, 200);
  const createdBy = clean(body.created_by || "admin", 200);

  if (!contentType) {
    return json({ ok: false, error: "content_type is required" }, 400);
  }

  if (!language) {
    return json({ ok: false, error: "language is required" }, 400);
  }

  try {
    const insert = await env.DB.prepare(`
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
        created_at,
        updated_at,
        approved_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
    `).bind(
      contentType,
      language,
      title,
      content,
      sourceType,
      sourceReference,
      prompt,
      model,
      createdBy
    ).run();

    const id = Number(insert.meta?.last_row_id || 0);

    if (!id) {
      throw new Error("Unable to determine inserted draft ID");
    }

    await env.DB.prepare(`
      INSERT INTO ai_content_events (
        content_draft_id,
        event_type,
        notes,
        event_at
      )
      VALUES (?, 'created', ?, CURRENT_TIMESTAMP)
    `).bind(
      id,
      "Content Studio draft created"
    ).run();

    const draft = await getDraft(env.DB, id);

    return json({
      ok: true,
      draft
    }, 201);

  } catch (error) {
    console.error("CONTENT STUDIO POST ERROR", error);
    return json({ ok: false, error: "Content Studio create failed" }, 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;

  if (!authorized(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const id = Number(body.id || 0);

  if (!id) {
    return json({ ok: false, error: "Valid draft id is required" }, 400);
  }

  try {
    const existing = await getDraft(env.DB, id);

    if (!existing) {
      return json({ ok: false, error: "Draft not found" }, 404);
    }

    const nextTitle =
      body.title === undefined
        ? existing.title
        : clean(body.title, 500);

    const nextContent =
      body.content === undefined
        ? existing.content
        : clean(body.content, 50000);

    const nextSourceReference =
      body.source_reference === undefined
        ? existing.source_reference
        : clean(body.source_reference, 1000);

    const nextPrompt =
      body.prompt === undefined
        ? existing.prompt
        : clean(body.prompt, 10000);

    const nextStatus =
      body.status === undefined
        ? existing.status
        : clean(body.status, 30);

    if (!ALLOWED_STATUS.has(nextStatus)) {
      return json({ ok: false, error: "Invalid status" }, 400);
    }

    let eventType = "edited";
    let eventNotes = "Content Studio draft edited";

    if (nextStatus !== existing.status) {
      if (nextStatus === "approved") {
        eventType = "approved";
        eventNotes = "Content Studio draft approved";
      } else if (nextStatus === "archived") {
        eventType = "archived";
        eventNotes = "Content Studio draft archived";
      } else {
        eventType = "edited";
        eventNotes = "Content Studio draft returned to draft status";
      }
    }

    const approvedAt =
      nextStatus === "approved"
        ? (existing.approved_at || new Date().toISOString())
        : "";

    await env.DB.prepare(`
      UPDATE ai_content_drafts
      SET
        title = ?,
        content = ?,
        source_reference = ?,
        prompt = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP,
        approved_at = ?
      WHERE id = ?
    `).bind(
      nextTitle,
      nextContent,
      nextSourceReference,
      nextPrompt,
      nextStatus,
      approvedAt,
      id
    ).run();

    await env.DB.prepare(`
      INSERT INTO ai_content_events (
        content_draft_id,
        event_type,
        notes,
        event_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      id,
      eventType,
      eventNotes
    ).run();

    const draft = await getDraft(env.DB, id);

    return json({
      ok: true,
      draft,
      event_type: eventType
    });

  } catch (error) {
    console.error("CONTENT STUDIO PATCH ERROR", error);
    return json({ ok: false, error: "Content Studio update failed" }, 500);
  }
}
