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

  return Math.min(
    max,
    Math.max(min, n)
  );
}

function validDateLike(value) {
  if (!value) return true;

  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) ||
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  );
}

function makeMembershipReference() {
  const year =
    new Date().getUTCFullYear();

  const random =
    crypto.randomUUID()
      .replaceAll("-", "")
      .slice(0, 10)
      .toUpperCase();

  return `QYM-${year}-${random}`;
}

const transitions = {
  Pending: new Set([
    "Active",
    "Cancelled",
    "Refunded"
  ]),

  Active: new Set([
    "Paused",
    "Expired",
    "Cancelled",
    "Refunded"
  ]),

  Paused: new Set([
    "Active",
    "Expired",
    "Cancelled",
    "Refunded"
  ]),

  Expired: new Set([]),
  Cancelled: new Set([]),
  Refunded: new Set([])
};

function eventForTransition(
  fromStatus,
  toStatus
) {
  if (
    toStatus === "Active" &&
    fromStatus === "Pending"
  ) {
    return "activated";
  }

  if (
    toStatus === "Active" &&
    fromStatus === "Paused"
  ) {
    return "resumed";
  }

  if (toStatus === "Paused") {
    return "paused";
  }

  if (toStatus === "Expired") {
    return "expired";
  }

  if (toStatus === "Cancelled") {
    return "cancelled";
  }

  if (toStatus === "Refunded") {
    return "refunded";
  }

  return "updated";
}

async function getMembership(
  db,
  id
) {
  const membership =
    await db.prepare(`
      SELECT
        m.id,
        m.membership_reference,
        m.customer_id,
        m.product_id,
        m.source_order_id,
        m.status,
        m.starts_at,
        m.ends_at,
        m.activated_at,
        m.paused_at,
        m.cancelled_at,
        m.expired_at,
        m.source,
        m.notes,
        m.created_at,
        m.updated_at,

        c.customer_reference,
        c.display_name AS customer_name,
        c.email AS customer_email,
        c.phone AS customer_phone,
        c.status AS customer_status,

        p.sku,
        p.slug,
        p.name_en AS product_name_en,
        p.name_zh AS product_name_zh,
        p.product_type,
        p.status AS product_status,
        p.price,
        p.currency,

        o.order_reference,
        o.payment_status AS order_payment_status,
        o.total AS order_total,
        o.currency AS order_currency

      FROM memberships m

      JOIN customers c
        ON c.id = m.customer_id

      JOIN products p
        ON p.id = m.product_id

      LEFT JOIN orders o
        ON o.id = m.source_order_id

      WHERE m.id = ?
    `).bind(id).first();

  if (!membership) {
    return null;
  }

  const events =
    await db.prepare(`
      SELECT
        id,
        membership_id,
        event_type,
        from_status,
        to_status,
        source,
        source_reference,
        notes,
        event_at
      FROM membership_events
      WHERE membership_id = ?
      ORDER BY id DESC
    `).bind(id).all();

  return {
    ...membership,
    events:
      events.results || []
  };
}

async function listMemberships(
  context,
  url
) {
  const db =
    context.env.ENQUIRIES_DB;

  const page =
    integerParam(
      url.searchParams.get("page"),
      1,
      1,
      100000
    );

  const pageSize =
    integerParam(
      url.searchParams.get("pageSize"),
      25,
      10,
      100
    );

  const offset =
    (page - 1) * pageSize;

  const q =
    clean(
      url.searchParams.get("q"),
      200
    );

  const status =
    clean(
      url.searchParams.get("status"),
      30
    );

  const customerId =
    Number(
      url.searchParams.get("customerId") || 0
    );

  const conditions = [];
  const binds = [];

  if (q) {
    const like = `%${q}%`;

    conditions.push(`
      (
        m.membership_reference LIKE ?
        OR c.customer_reference LIKE ?
        OR c.display_name LIKE ?
        OR c.email LIKE ?
        OR p.sku LIKE ?
        OR p.name_en LIKE ?
      )
    `);

    binds.push(
      like,
      like,
      like,
      like,
      like,
      like
    );
  }

  if (status) {
    if (
      ![
        "Pending",
        "Active",
        "Paused",
        "Expired",
        "Cancelled",
        "Refunded"
      ].includes(status)
    ) {
      return json({
        ok: false,
        error: "Invalid membership status."
      }, 400);
    }

    conditions.push(
      "m.status = ?"
    );

    binds.push(status);
  }

  if (
    Number.isInteger(customerId) &&
    customerId > 0
  ) {
    conditions.push(
      "m.customer_id = ?"
    );

    binds.push(customerId);
  }

  const where =
    conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const count =
    await db.prepare(`
      SELECT COUNT(*) AS total

      FROM memberships m

      JOIN customers c
        ON c.id = m.customer_id

      JOIN products p
        ON p.id = m.product_id

      ${where}
    `).bind(...binds).first();

  const result =
    await db.prepare(`
      SELECT
        m.id,
        m.membership_reference,
        m.customer_id,
        m.product_id,
        m.source_order_id,
        m.status,
        m.starts_at,
        m.ends_at,
        m.activated_at,
        m.source,
        m.created_at,
        m.updated_at,

        c.customer_reference,
        c.display_name AS customer_name,
        c.email AS customer_email,

        p.sku,
        p.name_en AS product_name,
        p.name_zh AS product_name_zh,

        o.order_reference,
        o.payment_status AS order_payment_status

      FROM memberships m

      JOIN customers c
        ON c.id = m.customer_id

      JOIN products p
        ON p.id = m.product_id

      LEFT JOIN orders o
        ON o.id = m.source_order_id

      ${where}

      ORDER BY m.id DESC
      LIMIT ? OFFSET ?
    `).bind(
      ...binds,
      pageSize,
      offset
    ).all();

  return json({
    ok: true,
    page,
    pageSize,
    total:
      Number(count?.total || 0),
    results:
      result.results || []
  });
}

async function membershipDetail(
  context,
  url
) {
  const id =
    Number(
      url.searchParams.get("id")
    );

  if (
    !Number.isInteger(id) ||
    id < 1
  ) {
    return json({
      ok: false,
      error: "Invalid membership ID."
    }, 400);
  }

  const membership =
    await getMembership(
      context.env.ENQUIRIES_DB,
      id
    );

  if (!membership) {
    return json({
      ok: false,
      error: "Membership not found."
    }, 404);
  }

  return json({
    ok: true,
    membership
  });
}

async function membershipProducts(
  context
) {
  const result =
    await context.env.ENQUIRIES_DB.prepare(`
      SELECT
        id,
        sku,
        slug,
        name_en,
        name_zh,
        status,
        price,
        currency,
        payment_provider
      FROM products
      WHERE product_type = 'membership'
      ORDER BY
        CASE status
          WHEN 'Active' THEN 1
          WHEN 'Draft' THEN 2
          ELSE 3
        END,
        id DESC
    `).all();

  return json({
    ok: true,
    results:
      result.results || []
  });
}

async function validateSourceOrder(
  db,
  sourceOrderId,
  customerId,
  productId
) {
  if (!sourceOrderId) {
    return {
      ok: true,
      order: null
    };
  }

  const order =
    await db.prepare(`
      SELECT
        o.id,
        o.order_reference,
        o.enquiry_id,
        o.customer_name,
        o.customer_email,
        o.customer_phone,
        o.payment_status
      FROM orders o
      WHERE o.id = ?
    `).bind(sourceOrderId).first();

  if (!order) {
    return {
      ok: false,
      status: 404,
      error: "Source order not found."
    };
  }

  const item =
    await db.prepare(`
      SELECT id
      FROM order_items
      WHERE order_id = ?
        AND product_id = ?
      LIMIT 1
    `).bind(
      sourceOrderId,
      productId
    ).first();

  if (!item) {
    return {
      ok: false,
      status: 409,
      error:
        "Source order does not contain the selected membership product."
    };
  }

  if (order.enquiry_id) {
    const linked =
      await db.prepare(`
        SELECT customer_id
        FROM customer_enquiry_links
        WHERE enquiry_id = ?
        LIMIT 1
      `).bind(
        order.enquiry_id
      ).first();

    if (
      linked &&
      Number(linked.customer_id) !==
        Number(customerId)
    ) {
      return {
        ok: false,
        status: 409,
        error:
          "Source order is linked to a different canonical customer."
      };
    }
  }

  return {
    ok: true,
    order
  };
}

async function createMembership(
  context
) {
  let body;

  try {
    body =
      await context.request.json();
  }
  catch {
    return json({
      ok: false,
      error: "Invalid request."
    }, 400);
  }

  const customerId =
    Number(body.customerId);

  const productId =
    Number(body.productId);

  const sourceOrderId =
    body.sourceOrderId
      ? Number(body.sourceOrderId)
      : null;

  const startsAt =
    clean(body.startsAt, 40);

  const endsAt =
    clean(body.endsAt, 40);

  const source =
    clean(body.source, 100) ||
    "Admin";

  const notes =
    clean(body.notes, 4000);

  if (
    !Number.isInteger(customerId) ||
    customerId < 1
  ) {
    return json({
      ok: false,
      error: "Invalid customer ID."
    }, 400);
  }

  if (
    !Number.isInteger(productId) ||
    productId < 1
  ) {
    return json({
      ok: false,
      error: "Invalid product ID."
    }, 400);
  }

  if (
    sourceOrderId !== null &&
    (
      !Number.isInteger(sourceOrderId) ||
      sourceOrderId < 1
    )
  ) {
    return json({
      ok: false,
      error: "Invalid source order ID."
    }, 400);
  }

  if (
    !validDateLike(startsAt) ||
    !validDateLike(endsAt)
  ) {
    return json({
      ok: false,
      error: "Invalid membership date."
    }, 400);
  }

  const db =
    context.env.ENQUIRIES_DB;

  const customer =
    await db.prepare(`
      SELECT
        id,
        customer_reference,
        status
      FROM customers
      WHERE id = ?
    `).bind(customerId).first();

  if (!customer) {
    return json({
      ok: false,
      error: "Customer not found."
    }, 404);
  }

  if (customer.status !== "Active") {
    return json({
      ok: false,
      error:
        "Membership can only be created for an active customer."
    }, 409);
  }

  const product =
    await db.prepare(`
      SELECT
        id,
        sku,
        product_type,
        status
      FROM products
      WHERE id = ?
    `).bind(productId).first();

  if (!product) {
    return json({
      ok: false,
      error: "Product not found."
    }, 404);
  }

  if (product.product_type !== "membership") {
    return json({
      ok: false,
      error:
        "Selected product is not a membership product."
    }, 409);
  }

  if (product.status !== "Active") {
    return json({
      ok: false,
      error:
        "Selected membership product is not active."
    }, 409);
  }

  const orderValidation =
    await validateSourceOrder(
      db,
      sourceOrderId,
      customerId,
      productId
    );

  if (!orderValidation.ok) {
    return json({
      ok: false,
      error: orderValidation.error
    }, orderValidation.status);
  }

  if (sourceOrderId) {
    const existingOrderMembership =
      await db.prepare(`
        SELECT id, membership_reference
        FROM memberships
        WHERE source_order_id = ?
          AND product_id = ?
        LIMIT 1
      `).bind(
        sourceOrderId,
        productId
      ).first();

    if (existingOrderMembership) {
      return json({
        ok: false,
        error:
          "A membership already exists for this source order and product.",
        membershipId:
          existingOrderMembership.id,
        membershipReference:
          existingOrderMembership.membership_reference
      }, 409);
    }
  }

  const activeExisting =
    await db.prepare(`
      SELECT
        id,
        membership_reference,
        status
      FROM memberships
      WHERE customer_id = ?
        AND product_id = ?
        AND status IN (
          'Pending',
          'Active',
          'Paused'
        )
      ORDER BY id DESC
      LIMIT 1
    `).bind(
      customerId,
      productId
    ).first();

  if (activeExisting) {
    return json({
      ok: false,
      error:
        "Customer already has a current membership for this product.",
      membershipId:
        activeExisting.id,
      membershipReference:
        activeExisting.membership_reference,
      membershipStatus:
        activeExisting.status
    }, 409);
  }

  const membershipReference =
    makeMembershipReference();

  const inserted =
    await db.prepare(`
      INSERT INTO memberships (
        membership_reference,
        customer_id,
        product_id,
        source_order_id,
        status,
        starts_at,
        ends_at,
        source,
        notes
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        'Pending',
        ?,
        ?,
        ?,
        ?
      )
      RETURNING id
    `).bind(
      membershipReference,
      customerId,
      productId,
      sourceOrderId,
      startsAt,
      endsAt,
      source,
      notes
    ).first();

  const membershipId =
    Number(inserted?.id || 0);

  if (!membershipId) {
    throw new Error(
      "MEMBERSHIP_INSERT_FAILED"
    );
  }

  await db.prepare(`
    INSERT INTO membership_events (
      membership_id,
      event_type,
      from_status,
      to_status,
      source,
      source_reference,
      notes
    )
    VALUES (
      ?,
      'created',
      '',
      'Pending',
      ?,
      ?,
      ?
    )
  `).bind(
    membershipId,
    source,
    sourceOrderId
      ? String(sourceOrderId)
      : "",
    notes
  ).run();

  return json({
    ok: true,
    created: true,
    membership:
      await getMembership(
        db,
        membershipId
      )
  }, 201);
}

async function changeMembershipStatus(
  context
) {
  let body;

  try {
    body =
      await context.request.json();
  }
  catch {
    return json({
      ok: false,
      error: "Invalid request."
    }, 400);
  }

  const membershipId =
    Number(body.membershipId);

  const nextStatus =
    clean(body.status, 30);

  const source =
    clean(body.source, 100) ||
    "Admin";

  const sourceReference =
    clean(
      body.sourceReference,
      200
    );

  const notes =
    clean(body.notes, 4000);

  if (
    !Number.isInteger(membershipId) ||
    membershipId < 1
  ) {
    return json({
      ok: false,
      error: "Invalid membership ID."
    }, 400);
  }

  const allowedStatuses =
    new Set([
      "Pending",
      "Active",
      "Paused",
      "Expired",
      "Cancelled",
      "Refunded"
    ]);

  if (!allowedStatuses.has(nextStatus)) {
    return json({
      ok: false,
      error: "Invalid membership status."
    }, 400);
  }

  const db =
    context.env.ENQUIRIES_DB;

  const current =
    await db.prepare(`
      SELECT *
      FROM memberships
      WHERE id = ?
    `).bind(membershipId).first();

  if (!current) {
    return json({
      ok: false,
      error: "Membership not found."
    }, 404);
  }

  if (current.status === nextStatus) {
    return json({
      ok: true,
      changed: false,
      membership:
        await getMembership(
          db,
          membershipId
        )
    });
  }

  const allowed =
    transitions[current.status];

  if (
    !allowed ||
    !allowed.has(nextStatus)
  ) {
    return json({
      ok: false,
      error:
        `Invalid membership transition from ${current.status} to ${nextStatus}.`
    }, 409);
  }

  const now =
    new Date().toISOString();

  const eventType =
    eventForTransition(
      current.status,
      nextStatus
    );

  let activatedAt =
    current.activated_at || "";

  let pausedAt =
    current.paused_at || "";

  let cancelledAt =
    current.cancelled_at || "";

  let expiredAt =
    current.expired_at || "";

  let startsAt =
    current.starts_at || "";

  if (nextStatus === "Active") {
    if (!activatedAt) {
      activatedAt = now;
    }

    if (!startsAt) {
      startsAt = now;
    }
  }

  if (nextStatus === "Paused") {
    pausedAt = now;
  }

  if (nextStatus === "Cancelled") {
    cancelledAt = now;
  }

  if (nextStatus === "Expired") {
    expiredAt = now;
  }

  await db.batch([
    db.prepare(`
      UPDATE memberships
      SET
        status = ?,
        starts_at = ?,
        activated_at = ?,
        paused_at = ?,
        cancelled_at = ?,
        expired_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      nextStatus,
      startsAt,
      activatedAt,
      pausedAt,
      cancelledAt,
      expiredAt,
      membershipId
    ),

    db.prepare(`
      INSERT INTO membership_events (
        membership_id,
        event_type,
        from_status,
        to_status,
        source,
        source_reference,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      membershipId,
      eventType,
      current.status,
      nextStatus,
      source,
      sourceReference,
      notes
    )
  ]);

  return json({
    ok: true,
    changed: true,
    eventType,
    membership:
      await getMembership(
        db,
        membershipId
      )
  });
}

export async function onRequestGet(
  context
) {
  const { request, env } =
    context;

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

  const action =
    clean(
      url.searchParams.get("action"),
      50
    );

  try {
    if (
      !action ||
      action === "list"
    ) {
      return await listMemberships(
        context,
        url
      );
    }

    if (action === "detail") {
      return await membershipDetail(
        context,
        url
      );
    }

    if (action === "products") {
      return await membershipProducts(
        context
      );
    }

    return json({
      ok: false,
      error:
        "Unknown membership action."
    }, 404);
  }
  catch (error) {
    console.error(
      "MEMBERSHIP GET ERROR",
      error
    );

    return json({
      ok: false,
      error:
        "Membership request failed."
    }, 500);
  }
}

export async function onRequestPost(
  context
) {
  const { request, env } =
    context;

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

  const action =
    clean(
      url.searchParams.get("action"),
      50
    );

  try {
    if (action === "create") {
      return await createMembership(
        context
      );
    }

    if (action === "status") {
      return await changeMembershipStatus(
        context
      );
    }

    return json({
      ok: false,
      error:
        "Unknown membership action."
    }, 404);
  }
  catch (error) {
    console.error(
      "MEMBERSHIP POST ERROR",
      error
    );

    return json({
      ok: false,
      error:
        "Membership update failed."
    }, 500);
  }
}