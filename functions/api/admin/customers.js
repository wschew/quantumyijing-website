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

function normalizeEmail(value) {
  const email =
    clean(value, 240).toLowerCase();

  if (!email) return "";

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return "";
  }

  return email;
}

function normalizePhone(value) {
  const phone =
    clean(value, 80).replace(/\D/g, "");

  if (!phone) return "";

  if (phone.length < 6 || phone.length > 20) {
    return "";
  }

  return phone;
}

function makeCustomerReference() {
  const year =
    new Date().getUTCFullYear();

  const random =
    crypto.randomUUID()
      .replaceAll("-", "")
      .slice(0, 10)
      .toUpperCase();

  return `QYC-${year}-${random}`;
}

function integerParam(value, fallback, min, max) {
  const n = Number(value);

  if (!Number.isInteger(n)) return fallback;

  return Math.min(max, Math.max(min, n));
}

async function findIdentifierOwner(
  db,
  type,
  normalizedValue
) {
  if (!normalizedValue) return null;

  return await db.prepare(`
    SELECT
      ci.customer_id,
      ci.identifier_type,
      ci.normalized_value,
      c.customer_reference,
      c.display_name,
      c.email,
      c.phone,
      c.status
    FROM customer_identifiers ci
    JOIN customers c
      ON c.id = ci.customer_id
    WHERE ci.identifier_type = ?
      AND ci.normalized_value = ?
    LIMIT 1
  `).bind(
    type,
    normalizedValue
  ).first();
}

async function resolveIdentity(
  db,
  email,
  phone
) {
  const emailOwner =
    email
      ? await findIdentifierOwner(
          db,
          "email",
          email
        )
      : null;

  const phoneOwner =
    phone
      ? await findIdentifierOwner(
          db,
          "phone",
          phone
        )
      : null;

  if (
    emailOwner &&
    phoneOwner &&
    Number(emailOwner.customer_id) !==
      Number(phoneOwner.customer_id)
  ) {
    return {
      conflict: true,
      emailOwner,
      phoneOwner
    };
  }

  return {
    conflict: false,
    customer:
      emailOwner ||
      phoneOwner ||
      null
  };
}

async function addMissingIdentifiers(
  db,
  customerId,
  email,
  phone,
  displayEmail,
  displayPhone
) {
  const statements = [];

  if (email) {
    const existing =
      await findIdentifierOwner(
        db,
        "email",
        email
      );

    if (
      existing &&
      Number(existing.customer_id) !==
        Number(customerId)
    ) {
      throw new Error(
        "EMAIL_IDENTITY_CONFLICT"
      );
    }

    if (!existing) {
      statements.push(
        db.prepare(`
          INSERT INTO customer_identifiers (
            customer_id,
            identifier_type,
            normalized_value,
            display_value,
            is_primary
          )
          VALUES (?, 'email', ?, ?, 1)
        `).bind(
          customerId,
          email,
          displayEmail || email
        )
      );
    }
  }

  if (phone) {
    const existing =
      await findIdentifierOwner(
        db,
        "phone",
        phone
      );

    if (
      existing &&
      Number(existing.customer_id) !==
        Number(customerId)
    ) {
      throw new Error(
        "PHONE_IDENTITY_CONFLICT"
      );
    }

    if (!existing) {
      statements.push(
        db.prepare(`
          INSERT INTO customer_identifiers (
            customer_id,
            identifier_type,
            normalized_value,
            display_value,
            is_primary
          )
          VALUES (?, 'phone', ?, ?, 1)
        `).bind(
          customerId,
          phone,
          displayPhone || phone
        )
      );
    }
  }

  if (statements.length) {
    await db.batch(statements);
  }
}

async function getCustomer(
  db,
  id
) {
  const customer =
    await db.prepare(`
      SELECT
        id,
        customer_reference,
        display_name,
        email,
        phone,
        country,
        language,
        status,
        created_source,
        created_at,
        updated_at
      FROM customers
      WHERE id = ?
    `).bind(id).first();

  if (!customer) return null;

  const identifiers =
    await db.prepare(`
      SELECT
        id,
        identifier_type,
        normalized_value,
        display_value,
        is_primary,
        verified_at,
        created_at
      FROM customer_identifiers
      WHERE customer_id = ?
      ORDER BY identifier_type, id
    `).bind(id).all();

  const enquiries =
    await db.prepare(`
      SELECT
        cel.id AS link_id,
        cel.link_type,
        cel.link_source,
        cel.linked_at,
        e.id AS enquiry_id,
        e.reference,
        e.name,
        e.email,
        e.phone,
        e.country,
        e.interest,
        e.status AS enquiry_status,
        e.lifecycle_stage,
        e.submitted_date
      FROM customer_enquiry_links cel
      JOIN enquiries e
        ON e.id = cel.enquiry_id
      WHERE cel.customer_id = ?
      ORDER BY e.id DESC
    `).bind(id).all();

  const memberships =
    await db.prepare(`
      SELECT
        m.id,
        m.membership_reference,
        m.product_id,
        p.sku,
        p.name_en,
        p.name_zh,
        m.source_order_id,
        m.status,
        m.starts_at,
        m.ends_at,
        m.activated_at,
        m.created_at
      FROM memberships m
      JOIN products p
        ON p.id = m.product_id
      WHERE m.customer_id = ?
      ORDER BY m.id DESC
    `).bind(id).all();


  const profileEvents =
    await db.prepare(`
      SELECT
        id,
        customer_id,
        event_type,
        field_name,
        old_value,
        new_value,
        source,
        source_reference,
        notes,
        event_at
      FROM customer_profile_events
      WHERE customer_id = ?
      ORDER BY id DESC
      LIMIT 100
    `)
      .bind(id)
      .all();

  return {
    ...customer,
    identifiers:
      identifiers.results || [],
    enquiries:
      enquiries.results || [],
    memberships:
      memberships.results || [],
    profile_events:
      profileEvents.results || []
  };
}

async function listCustomers(
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

  const conditions = [];
  const bindings = [];

  if (q) {
    const like = `%${q}%`;

    conditions.push(`
      (
        c.customer_reference LIKE ?
        OR c.display_name LIKE ?
        OR c.email LIKE ?
        OR c.phone LIKE ?
        OR EXISTS (
          SELECT 1
          FROM customer_identifiers ci
          WHERE ci.customer_id = c.id
            AND ci.normalized_value LIKE ?
        )
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

  const count =
    await db.prepare(`
      SELECT COUNT(*) AS total
      FROM customers c
      ${where}
    `).bind(...bindings).first();

  const result =
    await db.prepare(`
      SELECT
        c.id,
        c.customer_reference,
        c.display_name,
        c.email,
        c.phone,
        c.country,
        c.language,
        c.status,
        c.created_source,
        c.created_at,
        c.updated_at,

        (
          SELECT COUNT(*)
          FROM customer_enquiry_links cel
          WHERE cel.customer_id = c.id
        ) AS enquiry_count,

        (
          SELECT COUNT(*)
          FROM memberships m
          WHERE m.customer_id = c.id
        ) AS membership_count

      FROM customers c
      ${where}
      ORDER BY c.id DESC
      LIMIT ? OFFSET ?
    `).bind(
      ...bindings,
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

async function customerDetail(
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
      error: "Invalid customer ID."
    }, 400);
  }

  const customer =
    await getCustomer(
      context.env.ENQUIRIES_DB,
      id
    );

  if (!customer) {
    return json({
      ok: false,
      error: "Customer not found."
    }, 404);
  }

  return json({
    ok: true,
    customer
  });
}

async function createCustomer(
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

  const name =
    clean(
      body.displayName ||
      body.name,
      160
    );

  const displayEmail =
    clean(body.email, 240);

  const displayPhone =
    clean(body.phone, 80);

  const email =
    normalizeEmail(displayEmail);

  const phone =
    normalizePhone(displayPhone);

  const country =
    clean(body.country, 100);

  const language =
    clean(body.language, 10) ||
    "en";

  const source =
    clean(body.source, 100) ||
    "Admin";

  if (!name) {
    return json({
      ok: false,
      error: "Customer name is required."
    }, 400);
  }

  if (
    displayEmail &&
    !email
  ) {
    return json({
      ok: false,
      error: "Invalid email address."
    }, 400);
  }

  if (
    displayPhone &&
    !phone
  ) {
    return json({
      ok: false,
      error: "Invalid phone number."
    }, 400);
  }

  if (!email && !phone) {
    return json({
      ok: false,
      error:
        "At least one valid email or phone number is required."
    }, 400);
  }

  const db =
    context.env.ENQUIRIES_DB;

  const resolved =
    await resolveIdentity(
      db,
      email,
      phone
    );

  if (resolved.conflict) {
    return json({
      ok: false,
      error:
        "Identity conflict: email and phone belong to different customers."
    }, 409);
  }

  if (resolved.customer) {
    return json({
      ok: true,
      created: false,
      matched: true,
      customer:
        await getCustomer(
          db,
          Number(
            resolved.customer.customer_id
          )
        )
    });
  }

  const customerReference =
    makeCustomerReference();

  const inserted =
    await db.prepare(`
      INSERT INTO customers (
        customer_reference,
        display_name,
        email,
        phone,
        country,
        language,
        status,
        created_source
      )
      VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)
      RETURNING id
    `).bind(
      customerReference,
      name,
      displayEmail,
      displayPhone,
      country,
      language,
      source
    ).first();

  const customerId =
    Number(inserted?.id || 0);

  if (!customerId) {
    throw new Error(
      "CUSTOMER_INSERT_FAILED"
    );
  }

  await addMissingIdentifiers(
    db,
    customerId,
    email,
    phone,
    displayEmail,
    displayPhone
  );

  return json({
    ok: true,
    created: true,
    matched: false,
    customer:
      await getCustomer(
        db,
        customerId
      )
  }, 201);
}

async function updateCustomerProfile(
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


  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return json({
      ok: false,
      error: "Valid profile object required."
    }, 400);
  }


  const allowedFields =
    new Set([
      "id",
      "display_name",
      "country",
      "language",
      "source",
      "source_reference",
      "notes"
    ]);


  const unsupported =
    Object.keys(body).filter(
      key =>
        !allowedFields.has(key)
    );


  if (unsupported.length) {
    return json({
      ok: false,
      error:
        "Unsupported profile field(s): " +
        unsupported.join(", ") +
        "."
    }, 400);
  }


  const id =
    Number(body.id);


  if (
    !Number.isInteger(id) ||
    id < 1
  ) {
    return json({
      ok: false,
      error: "Valid customer id is required."
    }, 400);
  }


  const hasDisplayName =
    Object.prototype.hasOwnProperty.call(
      body,
      "display_name"
    );

  const hasCountry =
    Object.prototype.hasOwnProperty.call(
      body,
      "country"
    );

  const hasLanguage =
    Object.prototype.hasOwnProperty.call(
      body,
      "language"
    );


  if (
    !hasDisplayName &&
    !hasCountry &&
    !hasLanguage
  ) {
    return json({
      ok: false,
      error:
        "At least one profile field is required."
    }, 400);
  }


  const requestedDisplayName =
    hasDisplayName
      ? clean(
          body.display_name,
          160
        )
      : null;


  const requestedCountry =
    hasCountry
      ? clean(
          body.country,
          100
        )
      : null;


  const requestedLanguage =
    hasLanguage
      ? clean(
          body.language,
          10
        )
      : null;


  if (
    hasDisplayName &&
    !requestedDisplayName
  ) {
    return json({
      ok: false,
      error:
        "Customer display name is required."
    }, 400);
  }


  if (
    hasLanguage &&
    !requestedLanguage
  ) {
    return json({
      ok: false,
      error:
        "Customer language is required."
    }, 400);
  }


  const source =
    clean(
      body.source ||
      "AdminCustomerProfile",
      120
    );


  const sourceReference =
    clean(
      body.source_reference ||
      "v4.1",
      240
    );


  const notes =
    clean(
      body.notes,
      2000
    );


  const db =
    context.env.ENQUIRIES_DB;


  const current =
    await db.prepare(`
      SELECT
        id,
        customer_reference,
        display_name,
        email,
        phone,
        country,
        language,
        status,
        updated_at
      FROM customers
      WHERE id=?
      LIMIT 1
    `)
      .bind(id)
      .first();


  if (!current) {
    return json({
      ok: false,
      error: "Customer not found."
    }, 404);
  }


  const nextDisplayName =
    hasDisplayName
      ? requestedDisplayName
      : String(
          current.display_name || ""
        );


  const nextCountry =
    hasCountry
      ? requestedCountry
      : String(
          current.country || ""
        );


  const nextLanguage =
    hasLanguage
      ? requestedLanguage
      : String(
          current.language || ""
        );


  const changes = [];


  if (
    nextDisplayName !==
    String(
      current.display_name || ""
    )
  ) {
    changes.push({
      field: "display_name",
      oldValue:
        String(
          current.display_name || ""
        ),
      newValue:
        nextDisplayName
    });
  }


  if (
    nextCountry !==
    String(
      current.country || ""
    )
  ) {
    changes.push({
      field: "country",
      oldValue:
        String(
          current.country || ""
        ),
      newValue:
        nextCountry
    });
  }


  if (
    nextLanguage !==
    String(
      current.language || ""
    )
  ) {
    changes.push({
      field: "language",
      oldValue:
        String(
          current.language || ""
        ),
      newValue:
        nextLanguage
    });
  }


  if (!changes.length) {
    return json({
      ok: true,
      changed: false,
      event_count: 0,
      customer:
        await getCustomer(
          db,
          id
        )
    });
  }


  const statements = [];


  statements.push(
    db.prepare(`
      UPDATE customers
      SET
        display_name=?,
        country=?,
        language=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      nextDisplayName,
      nextCountry,
      nextLanguage,
      id
    )
  );


  for (
    const change of changes
  ) {
    statements.push(
      db.prepare(`
        INSERT INTO customer_profile_events (
          customer_id,
          event_type,
          field_name,
          old_value,
          new_value,
          source,
          source_reference,
          notes
        )
        VALUES (
          ?,
          'profile_updated',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `).bind(
        id,
        change.field,
        change.oldValue,
        change.newValue,
        source,
        sourceReference,
        notes
      )
    );
  }


  await db.batch(
    statements
  );


  return json({
    ok: true,
    changed: true,
    event_count:
      changes.length,
    changed_fields:
      changes.map(
        change =>
          change.field
      ),
    customer:
      await getCustomer(
        db,
        id
      )
  });
}

async function resolveEnquiry(
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

  const enquiryId =
    Number(body.enquiryId);

  if (
    !Number.isInteger(enquiryId) ||
    enquiryId < 1
  ) {
    return json({
      ok: false,
      error: "Invalid enquiry ID."
    }, 400);
  }

  const db =
    context.env.ENQUIRIES_DB;

  const enquiry =
    await db.prepare(`
      SELECT
        id,
        reference,
        name,
        email,
        phone,
        country,
        language
      FROM enquiries
      WHERE id = ?
    `).bind(enquiryId).first();

  if (!enquiry) {
    return json({
      ok: false,
      error: "Enquiry not found."
    }, 404);
  }

  const existingLink =
    await db.prepare(`
      SELECT
        cel.customer_id,
        c.customer_reference
      FROM customer_enquiry_links cel
      JOIN customers c
        ON c.id = cel.customer_id
      WHERE cel.enquiry_id = ?
      LIMIT 1
    `).bind(enquiryId).first();

  if (existingLink) {
    return json({
      ok: true,
      created: false,
      matched: true,
      linked: true,
      existingLink: true,
      customer:
        await getCustomer(
          db,
          Number(
            existingLink.customer_id
          )
        )
    });
  }

  const displayEmail =
    clean(enquiry.email, 240);

  const displayPhone =
    clean(enquiry.phone, 80);

  const email =
    normalizeEmail(displayEmail);

  const phone =
    normalizePhone(displayPhone);

  if (!email && !phone) {
    return json({
      ok: false,
      error:
        "Enquiry has no usable email or phone identifier."
    }, 409);
  }

  const resolved =
    await resolveIdentity(
      db,
      email,
      phone
    );

  if (resolved.conflict) {
    return json({
      ok: false,
      error:
        "Identity conflict: enquiry email and phone resolve to different customers.",
      conflict: true
    }, 409);
  }

  let customerId;
  let created = false;
  let matched = false;

  if (resolved.customer) {
    customerId =
      Number(
        resolved.customer.customer_id
      );

    matched = true;
  }
  else {
    const customerReference =
      makeCustomerReference();

    const inserted =
      await db.prepare(`
        INSERT INTO customers (
          customer_reference,
          display_name,
          email,
          phone,
          country,
          language,
          status,
          created_source
        )
        VALUES (?, ?, ?, ?, ?, ?, 'Active', 'CRM Enquiry')
        RETURNING id
      `).bind(
        customerReference,
        clean(enquiry.name, 160),
        displayEmail,
        displayPhone,
        clean(enquiry.country, 100),
        clean(enquiry.language, 10) || "en"
      ).first();

    customerId =
      Number(inserted?.id || 0);

    if (!customerId) {
      throw new Error(
        "CUSTOMER_INSERT_FAILED"
      );
    }

    created = true;
  }

  try {
    await addMissingIdentifiers(
      db,
      customerId,
      email,
      phone,
      displayEmail,
      displayPhone
    );
  }
  catch (error) {
    if (
      error?.message ===
        "EMAIL_IDENTITY_CONFLICT" ||
      error?.message ===
        "PHONE_IDENTITY_CONFLICT"
    ) {
      return json({
        ok: false,
        error:
          "Identity changed during resolution. No enquiry link was created."
      }, 409);
    }

    throw error;
  }

  try {
    await db.prepare(`
      INSERT INTO customer_enquiry_links (
        customer_id,
        enquiry_id,
        link_type,
        link_source,
        notes
      )
      VALUES (?, ?, 'primary', 'CRM Enquiry', ?)
    `).bind(
      customerId,
      enquiryId,
      `Linked from enquiry ${clean(enquiry.reference, 100)}`
    ).run();
  }
  catch (error) {
    const nowLinked =
      await db.prepare(`
        SELECT customer_id
        FROM customer_enquiry_links
        WHERE enquiry_id = ?
        LIMIT 1
      `).bind(enquiryId).first();

    if (
      nowLinked &&
      Number(nowLinked.customer_id) ===
        customerId
    ) {
      return json({
        ok: true,
        created,
        matched,
        linked: true,
        existingLink: true,
        customer:
          await getCustomer(
            db,
            customerId
          )
      });
    }

    throw error;
  }

  return json({
    ok: true,
    created,
    matched,
    linked: true,
    existingLink: false,
    customer:
      await getCustomer(
        db,
        customerId
      )
  }, created ? 201 : 200);
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
      return await listCustomers(
        context,
        url
      );
    }

    if (action === "detail") {
      return await customerDetail(
        context,
        url
      );
    }

    return json({
      ok: false,
      error: "Unknown customer action."
    }, 404);
  }
  catch (error) {
    console.error(
      "CUSTOMER GET ERROR",
      error
    );

    return json({
      ok: false,
      error: "Customer request failed."
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
    if (action === "profile") {
      return await updateCustomerProfile(
        context
      );
    }

    if (action === "create") {
      return await createCustomer(
        context
      );
    }

    if (
      action ===
      "resolve-enquiry"
    ) {
      return await resolveEnquiry(
        context
      );
    }

    return json({
      ok: false,
      error: "Unknown customer action."
    }, 404);
  }
  catch (error) {
    console.error(
      "CUSTOMER POST ERROR",
      error
    );

    return json({
      ok: false,
      error: "Customer update failed."
    }, 500);
  }
}