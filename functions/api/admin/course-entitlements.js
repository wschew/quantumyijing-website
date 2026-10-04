function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

function bearer(request) {
  const h = request.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ")
    ? h.slice(7).trim()
    : "";
}

function authorized(request, env) {
  const expected = String(env.ADMIN_TOKEN || "").trim();
  const supplied = bearer(request);
  return !!expected && !!supplied && supplied === expected;
}

function dbOf(env) {
  return (
    env.ENQUIRIES_DB ||
    env.DB ||
    env.D1 ||
    null
  );
}

function clean(value, max = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function integer(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0
    ? n
    : 0;
}

function bool(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

function nowIso() {
  return new Date().toISOString();
}

function reference() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);

  const suffix = [...bytes]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `QYCE-${Date.now()}-${suffix}`;
}

const STATUSES = new Set([
  "Pending",
  "Active",
  "Paused",
  "Expired",
  "Revoked"
]);

const SOURCE_TYPES = new Set([
  "Order",
  "Membership",
  "Admin",
  "Complimentary",
  "Migration"
]);

const TRANSITIONS = {
  Pending: new Set([
    "Active",
    "Revoked"
  ]),

  Active: new Set([
    "Paused",
    "Expired",
    "Revoked"
  ]),

  Paused: new Set([
    "Active",
    "Expired",
    "Revoked"
  ]),

  Expired: new Set([]),
  Revoked: new Set([])
};

function eventForTransition(from, to) {
  if (to === "Active" && from === "Paused") {
    return "resumed";
  }

  if (to === "Active") {
    return "activated";
  }

  if (to === "Paused") {
    return "paused";
  }

  if (to === "Expired") {
    return "expired";
  }

  if (to === "Revoked") {
    return "revoked";
  }

  return "updated";
}

async function loadCustomer(db, customerId) {
  return await db.prepare(`
    SELECT
      id,
      customer_reference,
      status
    FROM customers
    WHERE id=?
    LIMIT 1
  `)
    .bind(customerId)
    .first();
}

async function loadCourseProduct(db, productId) {
  return await db.prepare(`
    SELECT
      id,
      sku,
      slug,
      product_type,
      name_en,
      name_zh,
      status
    FROM products
    WHERE id=?
    LIMIT 1
  `)
    .bind(productId)
    .first();
}

async function loadStudent(db, studentId) {
  return await db.prepare(`
    SELECT
      id,
      enquiry_id,
      student_id,
      name,
      email,
      lifecycle_stage
    FROM students
    WHERE id=?
    LIMIT 1
  `)
    .bind(studentId)
    .first();
}

async function studentBelongsToCustomer(
  db,
  studentId,
  customerId
) {
  if (!studentId) return true;

  const row = await db.prepare(`
    SELECT
      s.id AS student_id,
      s.enquiry_id,
      cel.customer_id
    FROM students s
    JOIN customer_enquiry_links cel
      ON cel.enquiry_id=s.enquiry_id
    WHERE
      s.id=?
      AND cel.customer_id=?
    LIMIT 1
  `)
    .bind(
      studentId,
      customerId
    )
    .first();

  return !!row;
}

async function loadOrder(db, orderId) {
  if (!orderId) return null;

  return await db.prepare(`
    SELECT
      id,
      order_reference,
      enquiry_id,
      payment_status
    FROM orders
    WHERE id=?
    LIMIT 1
  `)
    .bind(orderId)
    .first();
}

async function loadMembership(
  db,
  membershipId
) {
  if (!membershipId) return null;

  return await db.prepare(`
    SELECT
      id,
      membership_reference,
      customer_id,
      status
    FROM memberships
    WHERE id=?
    LIMIT 1
  `)
    .bind(membershipId)
    .first();
}

async function loadEntitlement(
  db,
  entitlementId
) {
  return await db.prepare(`
    SELECT
      ce.*,
      c.customer_reference,
      c.display_name AS customer_name,
      p.sku,
      p.slug,
      p.product_type,
      p.name_en,
      p.name_zh,
      s.student_id AS student_reference
    FROM course_entitlements ce
    JOIN customers c
      ON c.id=ce.customer_id
    JOIN products p
      ON p.id=ce.product_id
    LEFT JOIN students s
      ON s.id=ce.student_id
    WHERE ce.id=?
    LIMIT 1
  `)
    .bind(entitlementId)
    .first();
}

async function event(
  db,
  entitlementId,
  eventType,
  source,
  sourceReference,
  notes
) {
  await db.prepare(`
    INSERT INTO course_entitlement_events(
      course_entitlement_id,
      event_type,
      source,
      source_reference,
      notes
    )
    VALUES(?,?,?,?,?)
  `)
    .bind(
      entitlementId,
      eventType,
      clean(source, 120),
      clean(sourceReference, 240),
      clean(notes, 2000)
    )
    .run();
}

async function createEntitlement(
  db,
  body
) {
  const customerId =
    integer(body.customer_id);

  const productId =
    integer(body.product_id);

  const studentId =
    integer(body.student_id);

  const sourceOrderId =
    integer(body.source_order_id);

  const sourceMembershipId =
    integer(body.source_membership_id);

  if (!customerId) {
    throw new Error(
      "VALIDATION: customer_id is required."
    );
  }

  if (!productId) {
    throw new Error(
      "VALIDATION: product_id is required."
    );
  }

  const customer =
    await loadCustomer(
      db,
      customerId
    );

  if (!customer) {
    throw new Error(
      "NOT_FOUND: Customer not found."
    );
  }

  if (
    String(customer.status || "") !==
    "Active"
  ) {
    throw new Error(
      "VALIDATION: Customer must be Active."
    );
  }

  const product =
    await loadCourseProduct(
      db,
      productId
    );

  if (!product) {
    throw new Error(
      "NOT_FOUND: Product not found."
    );
  }

  if (
    String(product.product_type || "")
      .toLowerCase() !==
    "course"
  ) {
    throw new Error(
      "VALIDATION: Only course products may receive course entitlements."
    );
  }

  if (studentId) {
    const student =
      await loadStudent(
        db,
        studentId
      );

    if (!student) {
      throw new Error(
        "NOT_FOUND: Student not found."
      );
    }

    const sameCustomer =
      await studentBelongsToCustomer(
        db,
        studentId,
        customerId
      );

    if (!sameCustomer) {
      throw new Error(
        "VALIDATION: Student does not belong to entitlement customer."
      );
    }
  }

  const sourceType =
    clean(
      body.source_type || "Admin",
      40
    );

  if (
    !SOURCE_TYPES.has(sourceType)
  ) {
    throw new Error(
      "VALIDATION: Invalid source_type."
    );
  }

  if (
    sourceType === "Order" &&
    !sourceOrderId
  ) {
    throw new Error(
      "VALIDATION: Order source requires source_order_id."
    );
  }

  if (
    sourceType === "Membership" &&
    !sourceMembershipId
  ) {
    throw new Error(
      "VALIDATION: Membership source requires source_membership_id."
    );
  }

  if (sourceOrderId) {
    const order =
      await loadOrder(
        db,
        sourceOrderId
      );

    if (!order) {
      throw new Error(
        "NOT_FOUND: Source order not found."
      );
    }
  }

  if (sourceMembershipId) {
    const membership =
      await loadMembership(
        db,
        sourceMembershipId
      );

    if (!membership) {
      throw new Error(
        "NOT_FOUND: Source membership not found."
      );
    }

    if (
      Number(membership.customer_id) !==
      Number(customerId)
    ) {
      throw new Error(
        "VALIDATION: Source membership customer does not match entitlement customer."
      );
    }
  }

  const requestedStatus =
    clean(
      body.status || "Pending",
      20
    );

  if (
    !STATUSES.has(requestedStatus)
  ) {
    throw new Error(
      "VALIDATION: Invalid entitlement status."
    );
  }

  if (
    ["Expired", "Revoked"].includes(
      requestedStatus
    )
  ) {
    throw new Error(
      "VALIDATION: New entitlements cannot start as Expired or Revoked."
    );
  }

  const entitlementReference =
    reference();

  const startsAt =
    clean(
      body.starts_at,
      80
    );

  const endsAt =
    clean(
      body.ends_at,
      80
    );

  const source =
    clean(
      body.source || "Admin",
      120
    );

  const notes =
    clean(
      body.notes,
      2000
    );

  const grantedAt =
    requestedStatus === "Active"
      ? nowIso()
      : "";

  const inserted =
    await db.prepare(`
      INSERT INTO course_entitlements(
        entitlement_reference,
        customer_id,
        product_id,
        student_id,
        source_order_id,
        source_membership_id,
        status,
        access_scope,
        starts_at,
        ends_at,
        granted_at,
        source_type,
        source,
        notes
      )
      VALUES(
        ?,?,?,?,?,?,
        ?,
        'FullCourse',
        ?,?,?,
        ?,?,?
      )
      RETURNING id
    `)
      .bind(
        entitlementReference,
        customerId,
        productId,
        studentId || null,
        sourceOrderId || null,
        sourceMembershipId || null,
        requestedStatus,
        startsAt,
        endsAt,
        grantedAt,
        sourceType,
        source,
        notes
      )
      .first();

  const entitlementId =
    Number(inserted?.id || 0);

  if (!entitlementId) {
    throw new Error(
      "Unable to create course entitlement."
    );
  }

  await event(
    db,
    entitlementId,
    "created",
    source,
    entitlementReference,
    notes
  );

  if (
    requestedStatus === "Active"
  ) {
    await event(
      db,
      entitlementId,
      "activated",
      source,
      entitlementReference,
      notes
    );
  }

  if (studentId) {
    await event(
      db,
      entitlementId,
      "student_linked",
      source,
      String(studentId),
      "Student linked during entitlement creation."
    );
  }

  return await loadEntitlement(
    db,
    entitlementId
  );
}

async function changeStatus(
  db,
  body
) {
  const id =
    integer(body.id);

  if (!id) {
    throw new Error(
      "VALIDATION: Entitlement id is required."
    );
  }

  const current =
    await loadEntitlement(
      db,
      id
    );

  if (!current) {
    throw new Error(
      "NOT_FOUND: Entitlement not found."
    );
  }

  const next =
    clean(
      body.status,
      20
    );

  if (
    !STATUSES.has(next)
  ) {
    throw new Error(
      "VALIDATION: Invalid entitlement status."
    );
  }

  const from =
    String(current.status || "");

  if (next === from) {
    return {
      entitlement: current,
      idempotent: true
    };
  }

  const allowed =
    TRANSITIONS[from];

  if (
    !allowed ||
    !allowed.has(next)
  ) {
    throw new Error(
      `CONFLICT: Invalid entitlement transition ${from} -> ${next}.`
    );
  }

  const source =
    clean(
      body.source || "Admin",
      120
    );

  const notes =
    clean(
      body.notes,
      2000
    );

  const timestamp =
    nowIso();

  let grantedAt =
    current.granted_at || "";

  let pausedAt =
    current.paused_at || "";

  let expiredAt =
    current.expired_at || "";

  let revokedAt =
    current.revoked_at || "";

  if (next === "Active") {
    if (!grantedAt) {
      grantedAt = timestamp;
    }

    pausedAt = "";
  }

  if (next === "Paused") {
    pausedAt = timestamp;
  }

  if (next === "Expired") {
    expiredAt = timestamp;
  }

  if (next === "Revoked") {
    revokedAt = timestamp;
  }

  await db.prepare(`
    UPDATE course_entitlements
    SET
      status=?,
      granted_at=?,
      paused_at=?,
      expired_at=?,
      revoked_at=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `)
    .bind(
      next,
      grantedAt,
      pausedAt,
      expiredAt,
      revokedAt,
      id
    )
    .run();

  await event(
    db,
    id,
    eventForTransition(
      from,
      next
    ),
    source,
    String(id),
    notes
  );

  return {
    entitlement:
      await loadEntitlement(
        db,
        id
      ),

    idempotent: false
  };
}

async function linkStudent(
  db,
  body
) {
  const id =
    integer(body.id);

  if (!id) {
    throw new Error(
      "VALIDATION: Entitlement id is required."
    );
  }

  const current =
    await loadEntitlement(
      db,
      id
    );

  if (!current) {
    throw new Error(
      "NOT_FOUND: Entitlement not found."
    );
  }

  const unlink =
    bool(body.unlink);

  const source =
    clean(
      body.source || "Admin",
      120
    );

  const notes =
    clean(
      body.notes,
      2000
    );

  if (unlink) {
    if (!current.student_id) {
      return {
        entitlement: current,
        idempotent: true
      };
    }

    const oldStudentId =
      Number(current.student_id);

    await db.prepare(`
      UPDATE course_entitlements
      SET
        student_id=NULL,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `)
      .bind(id)
      .run();

    await event(
      db,
      id,
      "student_unlinked",
      source,
      String(oldStudentId),
      notes
    );

    return {
      entitlement:
        await loadEntitlement(
          db,
          id
        ),

      idempotent: false
    };
  }

  const studentId =
    integer(body.student_id);

  if (!studentId) {
    throw new Error(
      "VALIDATION: student_id is required."
    );
  }

  if (
    Number(current.student_id || 0) ===
    studentId
  ) {
    return {
      entitlement: current,
      idempotent: true
    };
  }

  const student =
    await loadStudent(
      db,
      studentId
    );

  if (!student) {
    throw new Error(
      "NOT_FOUND: Student not found."
    );
  }

  const sameCustomer =
    await studentBelongsToCustomer(
      db,
      studentId,
      current.customer_id
    );

  if (!sameCustomer) {
    throw new Error(
      "VALIDATION: Student does not belong to entitlement customer."
    );
  }

  await db.prepare(`
    UPDATE course_entitlements
    SET
      student_id=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `)
    .bind(
      studentId,
      id
    )
    .run();

  await event(
    db,
    id,
    "student_linked",
    source,
    String(studentId),
    notes
  );

  return {
    entitlement:
      await loadEntitlement(
        db,
        id
      ),

    idempotent: false
  };
}

async function listEntitlements(
  db,
  url
) {
  const customerId =
    integer(
      url.searchParams.get(
        "customer_id"
      )
    );

  const productId =
    integer(
      url.searchParams.get(
        "product_id"
      )
    );

  const status =
    clean(
      url.searchParams.get(
        "status"
      ),
      20
    );

  const id =
    integer(
      url.searchParams.get(
        "id"
      )
    );

  if (id) {
    const entitlement =
      await loadEntitlement(
        db,
        id
      );

    if (!entitlement) {
      throw new Error(
        "NOT_FOUND: Entitlement not found."
      );
    }

    const events =
      await db.prepare(`
        SELECT *
        FROM course_entitlement_events
        WHERE course_entitlement_id=?
        ORDER BY id DESC
      `)
        .bind(id)
        .all();

    return {
      entitlement,
      events:
        events.results || []
    };
  }

  const where = [];
  const values = [];

  if (customerId) {
    where.push(
      "ce.customer_id=?"
    );

    values.push(
      customerId
    );
  }

  if (productId) {
    where.push(
      "ce.product_id=?"
    );

    values.push(
      productId
    );
  }

  if (status) {
    if (!STATUSES.has(status)) {
      throw new Error(
        "VALIDATION: Invalid status filter."
      );
    }

    where.push(
      "ce.status=?"
    );

    values.push(
      status
    );
  }

  const clause =
    where.length
      ? `WHERE ${where.join(" AND ")}`
      : "";

  const result =
    await db.prepare(`
      SELECT
        ce.*,
        c.customer_reference,
        c.display_name AS customer_name,
        p.sku,
        p.slug,
        p.name_en,
        p.name_zh,
        s.student_id AS student_reference
      FROM course_entitlements ce
      JOIN customers c
        ON c.id=ce.customer_id
      JOIN products p
        ON p.id=ce.product_id
      LEFT JOIN students s
        ON s.id=ce.student_id
      ${clause}
      ORDER BY ce.id DESC
      LIMIT 500
    `)
      .bind(...values)
      .all();

  return {
    entitlements:
      result.results || []
  };
}

function mapError(error) {
  const message =
    String(
      error?.message ||
      error ||
      "Unknown error"
    );

  if (
    message.startsWith(
      "VALIDATION:"
    )
  ) {
    return {
      status: 400,
      message:
        message.replace(
          /^VALIDATION:\s*/,
          ""
        )
    };
  }

  if (
    message.startsWith(
      "NOT_FOUND:"
    )
  ) {
    return {
      status: 404,
      message:
        message.replace(
          /^NOT_FOUND:\s*/,
          ""
        )
    };
  }

  if (
    message.startsWith(
      "CONFLICT:"
    )
  ) {
    return {
      status: 409,
      message:
        message.replace(
          /^CONFLICT:\s*/,
          ""
        )
    };
  }

  return {
    status: 500,
    message
  };
}

export async function onRequestGet({
  request,
  env
}) {
  if (!authorized(request, env)) {
    return json(
      {
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
        error:
          "Database binding unavailable."
      },
      503
    );
  }

  try {
    const url =
      new URL(request.url);

    return json(
      await listEntitlements(
        db,
        url
      )
    );
  }
  catch (error) {
    const mapped =
      mapError(error);

    return json(
      {
        error:
          mapped.message
      },
      mapped.status
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
        error:
          "Database binding unavailable."
      },
      503
    );
  }

  let body;

  try {
    body =
      await request.json();
  }
  catch {
    return json(
      {
        error:
          "Valid JSON body required."
      },
      400
    );
  }

  const action =
    clean(
      body.action,
      40
    );

  try {
    if (action === "create") {
      const entitlement =
        await createEntitlement(
          db,
          body
        );

      return json({
        ok: true,
        entitlement
      });
    }

    if (action === "status") {
      const result =
        await changeStatus(
          db,
          body
        );

      return json({
        ok: true,
        ...result
      });
    }

    if (
      action === "link-student"
    ) {
      const result =
        await linkStudent(
          db,
          body
        );

      return json({
        ok: true,
        ...result
      });
    }

    return json(
      {
        error:
          "Unknown action."
      },
      400
    );
  }
  catch (error) {
    const mapped =
      mapError(error);

    return json(
      {
        error:
          mapped.message
      },
      mapped.status
    );
  }
}