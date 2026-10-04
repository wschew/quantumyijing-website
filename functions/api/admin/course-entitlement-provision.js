function intId(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0
    ? n
    : 0;
}

function clean(value, max = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function reference(orderId, productId) {
  return `QYCE-ORDER-${orderId}-${productId}`;
}

async function loadState(db, orderId) {
  const order = await db.prepare(`
    SELECT
      o.id,
      o.order_reference,
      o.enquiry_id,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.total,
      o.currency,
      o.payment_status
    FROM orders o
    WHERE o.id=?
    LIMIT 1
  `)
    .bind(orderId)
    .first();

  if (!order) {
    return null;
  }

  const payment = await db.prepare(`
    SELECT
      id,
      amount,
      gross_amount,
      currency,
      status,
      verification_status,
      verified_at
    FROM payments
    WHERE order_id=?
    ORDER BY id DESC
    LIMIT 1
  `)
    .bind(orderId)
    .first();

  const verifiedPayments = await db.prepare(`
    SELECT
      COUNT(*) AS verified_payment_count,
      COALESCE(
        SUM(
          CASE
            WHEN status='Paid'
             AND verification_status='Verified'
            THEN
              CASE
                WHEN COALESCE(gross_amount,0)>0
                THEN gross_amount
                ELSE amount
              END
            ELSE 0
          END
        ),
        0
      ) AS verified_paid_total
    FROM payments
    WHERE order_id=?
  `)
    .bind(orderId)
    .first();

  const items = await db.prepare(`
    SELECT
      oi.id AS order_item_id,
      oi.product_id,
      oi.quantity,
      oi.line_total,
      oi.final_unit_price,
      p.sku,
      p.slug,
      p.product_type,
      p.name_en,
      p.name_zh,
      p.status AS product_status,
      p.starts_on,
      p.ends_on
    FROM order_items oi
    JOIN products p
      ON p.id=oi.product_id
    WHERE oi.order_id=?
    ORDER BY oi.id
  `)
    .bind(orderId)
    .all();

  return {
    order,
    payment: payment || null,
    verified_paid_total:
      Number(
        verifiedPayments?.verified_paid_total || 0
      ),
    verified_payment_count:
      Number(
        verifiedPayments?.verified_payment_count || 0
      ),
    items: items.results || []
  };
}

async function loadCanonicalCustomer(
  db,
  enquiryId
) {
  const id = intId(enquiryId);

  if (!id) return null;

  return await db.prepare(`
    SELECT
      c.id,
      c.customer_reference,
      c.status
    FROM customer_enquiry_links cel
    JOIN customers c
      ON c.id=cel.customer_id
    WHERE cel.enquiry_id=?
    ORDER BY
      CASE
        WHEN cel.link_type='primary' THEN 0
        ELSE 1
      END,
      cel.id
    LIMIT 1
  `)
    .bind(id)
    .first();
}

async function latestStudentForCustomer(
  db,
  enquiryId,
  customerId
) {
  const eId = intId(enquiryId);
  const cId = intId(customerId);

  if (!eId || !cId) return null;

  return await db.prepare(`
    SELECT
      s.id,
      s.student_id,
      s.enquiry_id
    FROM students s
    JOIN customer_enquiry_links cel
      ON cel.enquiry_id=s.enquiry_id
    WHERE
      s.enquiry_id=?
      AND cel.customer_id=?
    ORDER BY s.id DESC
    LIMIT 1
  `)
    .bind(
      eId,
      cId
    )
    .first();
}

async function existingEntitlement(
  db,
  orderId,
  productId
) {
  return await db.prepare(`
    SELECT
      id,
      entitlement_reference,
      customer_id,
      product_id,
      student_id,
      source_order_id,
      status,
      starts_at,
      ends_at,
      granted_at
    FROM course_entitlements
    WHERE
      source_order_id=?
      AND product_id=?
      AND source_type='Order'
    ORDER BY id
    LIMIT 1
  `)
    .bind(
      orderId,
      productId
    )
    .first();
}

async function eventExists(
  db,
  entitlementId,
  eventType
) {
  const row = await db.prepare(`
    SELECT id
    FROM course_entitlement_events
    WHERE
      course_entitlement_id=?
      AND event_type=?
    LIMIT 1
  `)
    .bind(
      entitlementId,
      eventType
    )
    .first();

  return !!row;
}

async function addEvent(
  db,
  entitlementId,
  eventType,
  sourceReference,
  notes
) {
  if (
    await eventExists(
      db,
      entitlementId,
      eventType
    )
  ) {
    return;
  }

  await db.prepare(`
    INSERT INTO course_entitlement_events(
      course_entitlement_id,
      event_type,
      source,
      source_reference,
      notes
    )
    VALUES(
      ?,
      ?,
      'VerifiedPayment',
      ?,
      ?
    )
  `)
    .bind(
      entitlementId,
      eventType,
      clean(sourceReference, 240),
      clean(notes, 2000)
    )
    .run();
}

function paymentAmount(payment) {
  if (!payment) return 0;

  const gross =
    Number(payment.gross_amount || 0);

  if (gross > 0) {
    return gross;
  }

  return Number(payment.amount || 0);
}

function itemAccessDates(item) {
  const starts =
    clean(item.starts_on, 40);

  const ends =
    clean(item.ends_on, 40);

  return {
    starts_at:
      starts
        ? `${starts}T00:00:00.000Z`
        : "",

    ends_at:
      ends
        ? `${ends}T23:59:59.000Z`
        : ""
  };
}

export async function provisionCourseEntitlementsForVerifiedOrder(
  db,
  orderId
) {
  const id =
    intId(orderId);

  if (!id) {
    return {
      ok: false,
      handled: false,
      reason: "invalid_order_id"
    };
  }

  const state =
    await loadState(
      db,
      id
    );

  if (!state) {
    return {
      ok: false,
      handled: false,
      reason: "order_not_found"
    };
  }

  const courseItems =
    state.items.filter(
      item =>
        String(
          item.product_type || ""
        ).toLowerCase() === "course"
    );

  if (!courseItems.length) {
    return {
      ok: true,
      handled: false,
      reason: "no_course_product"
    };
  }

  if (
    state.order.payment_status !==
    "Paid"
  ) {
    return {
      ok: false,
      handled: true,
      reason: "order_not_paid"
    };
  }

  if (
    Number(
      state.verified_payment_count || 0
    ) < 1
  ) {
    return {
      ok: false,
      handled: true,
      reason: "payment_not_verified"
    };
  }

  const expectedAmount =
    Number(
      state.order.total || 0
    );

  const verifiedAmount =
    Number(
      state.verified_paid_total || 0
    );

  if (
    verifiedAmount + 0.01 <
    expectedAmount
  ) {
    return {
      ok: false,
      handled: true,
      reason: "verified_amount_mismatch",
      expected_amount:
        expectedAmount,
      verified_amount:
        verifiedAmount
    };
  }

  const customer =
    await loadCanonicalCustomer(
      db,
      state.order.enquiry_id
    );

  if (!customer) {
    throw new Error(
      "VALIDATION: Verified course order does not resolve to a canonical customer."
    );
  }

  if (
    String(customer.status || "") !==
    "Active"
  ) {
    throw new Error(
      "VALIDATION: Canonical customer must be Active for course entitlement provisioning."
    );
  }

  const student =
    await latestStudentForCustomer(
      db,
      state.order.enquiry_id,
      customer.id
    );

  const results = [];

  for (const item of courseItems) {
    if (
      String(item.product_status || "") !==
      "Active"
    ) {
      throw new Error(
        `VALIDATION: Course product ${item.sku || item.product_id} must be Active.`
      );
    }

    const existing =
      await existingEntitlement(
        db,
        id,
        item.product_id
      );

    if (existing) {
      results.push({
        product_id:
          Number(item.product_id),

        entitlement_id:
          Number(existing.id),

        entitlement_reference:
          existing.entitlement_reference,

        status:
          existing.status,

        idempotent: true
      });

      continue;
    }

    const ref =
      reference(
        id,
        item.product_id
      );

    const dates =
      itemAccessDates(item);

    let inserted;

    try {
      inserted =
        await db.prepare(`
          INSERT INTO course_entitlements(
            entitlement_reference,
            customer_id,
            product_id,
            student_id,
            source_order_id,
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
            ?,
            ?,
            ?,
            ?,
            ?,
            'Active',
            'FullCourse',
            ?,
            ?,
            CURRENT_TIMESTAMP,
            'Order',
            'VerifiedPayment',
            ?
          )
          RETURNING id
        `)
          .bind(
            ref,
            customer.id,
            item.product_id,
            student?.id || null,
            id,
            dates.starts_at,
            dates.ends_at,
            `Automatically provisioned from verified paid order ${state.order.order_reference}.`
          )
          .first();
    }
    catch (error) {
      const raced =
        await existingEntitlement(
          db,
          id,
          item.product_id
        );

      if (!raced) {
        throw error;
      }

      results.push({
        product_id:
          Number(item.product_id),

        entitlement_id:
          Number(raced.id),

        entitlement_reference:
          raced.entitlement_reference,

        status:
          raced.status,

        idempotent: true
      });

      continue;
    }

    const entitlementId =
      Number(
        inserted?.id || 0
      );

    if (!entitlementId) {
      throw new Error(
        "Unable to create verified course entitlement."
      );
    }

    await addEvent(
      db,
      entitlementId,
      "created",
      state.order.order_reference,
      "Course entitlement created from verified paid order."
    );

    await addEvent(
      db,
      entitlementId,
      "activated",
      state.order.order_reference,
      "Course entitlement activated from verified paid order."
    );

    if (student?.id) {
      await addEvent(
        db,
        entitlementId,
        "student_linked",
        student.student_id || String(student.id),
        "Existing student record linked during verified payment provisioning."
      );
    }

    results.push({
      product_id:
        Number(item.product_id),

      entitlement_id:
        entitlementId,

      entitlement_reference:
        ref,

      status:
        "Active",

      student_id:
        student?.id
          ? Number(student.id)
          : null,

      idempotent: false
    });
  }

  return {
    ok: true,
    handled: true,
    provisioning_type:
      "course_entitlement",

    order_id: id,

    customer_id:
      Number(customer.id),

    entitlements:
      results
  };
}