import { provisionCourseEntitlementsForVerifiedOrder } from "./course-entitlement-provision.js";
import { processVerifiedSubscriptionRenewal } from './subscription-renewal.js';
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

function money(value) {
  const n = Number(value || 0);

  return Number.isFinite(n)
    ? Math.round(n * 100) / 100
    : 0;
}

async function loadEligibility(
  db,
  orderId
) {
  const order =
    await db.prepare(`
      SELECT
        id,
        order_reference,
        enquiry_id,
        customer_name,
        customer_email,
        total,
        currency,
        payment_status,
        payment_provider
      FROM orders
      WHERE id = ?
      LIMIT 1
    `).bind(orderId).first();

  if (!order) {
    return {
      found: false,
      status: 404,
      error: "Order not found."
    };
  }

  const membershipItems =
    await db.prepare(`
      SELECT
        oi.id AS order_item_id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        oi.line_total,
        p.sku,
        p.slug,
        p.name_en,
        p.name_zh,
        p.product_type,
        p.status AS product_status
      FROM order_items oi
      JOIN products p
        ON p.id = oi.product_id
      WHERE oi.order_id = ?
        AND p.product_type = 'membership'
      ORDER BY oi.id
    `).bind(orderId).all();

  const items =
    membershipItems.results || [];

  const reasons = [];

  if (items.length === 0) {
    reasons.push(
      "Order does not contain a membership product."
    );
  }

  if (items.length > 1) {
    reasons.push(
      "Order contains multiple membership product lines; automatic provisioning is ambiguous."
    );
  }

  const item =
    items.length === 1
      ? items[0]
      : null;

  if (
    item &&
    Number(item.quantity || 0) !== 1
  ) {
    reasons.push(
      "Automatic provisioning currently requires membership quantity 1."
    );
  }

  if (
    item &&
    item.product_status !== "Active"
  ) {
    reasons.push(
      "Membership product is not active."
    );
  }

  let customer = null;

  if (!order.enquiry_id) {
    reasons.push(
      "Order is not linked to a CRM enquiry."
    );
  }
  else {
    customer =
      await db.prepare(`
        SELECT
          c.id,
          c.customer_reference,
          c.display_name,
          c.email,
          c.phone,
          c.status
        FROM customer_enquiry_links cel
        JOIN customers c
          ON c.id = cel.customer_id
        WHERE cel.enquiry_id = ?
        LIMIT 1
      `).bind(
        order.enquiry_id
      ).first();

    if (!customer) {
      reasons.push(
        "Order enquiry has not been resolved to a canonical customer."
      );
    }
    else if (customer.status !== "Active") {
      reasons.push(
        "Canonical customer is not active."
      );
    }
  }

  const paid =
    await db.prepare(`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN status IN ('Paid','External')
               AND verification_status = 'Verified'
              THEN COALESCE(
                NULLIF(gross_amount, 0),
                amount,
                0
              )
              ELSE 0
            END
          ),
          0
        ) AS verified_paid,

        SUM(
          CASE
            WHEN status IN ('Paid','External')
             AND verification_status = 'Verified'
            THEN 1
            ELSE 0
          END
        ) AS verified_payment_count

      FROM payments
      WHERE order_id = ?
    `).bind(orderId).first();

  const orderTotal =
    money(order.total);

  const verifiedPaid =
    money(paid?.verified_paid);

  const balanceDue =
    Math.max(
      Math.round(
        (orderTotal - verifiedPaid) * 100
      ) / 100,
      0
    );

  const fullyPaid =
    orderTotal > 0 &&
    verifiedPaid >= orderTotal - 0.005;

  if (orderTotal <= 0) {
    reasons.push(
      "Order total must be greater than zero."
    );
  }

  if (!fullyPaid) {
    reasons.push(
      "Order is not fully covered by verified Paid/External payments."
    );
  }

  if (
    [
      "Cancelled",
      "Refunded",
      "Failed"
    ].includes(
      clean(order.payment_status, 30)
    )
  ) {
    reasons.push(
      `Order payment status is ${order.payment_status}.`
    );
  }

  let existingMembership = null;
  let conflictingMembership = null;

  if (
    item &&
    customer
  ) {
    existingMembership =
      await db.prepare(`
        SELECT
          id,
          membership_reference,
          status,
          source_order_id,
          customer_id,
          product_id,
          starts_at,
          activated_at
        FROM memberships
        WHERE source_order_id = ?
          AND product_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).bind(
        orderId,
        item.product_id
      ).first();

    if (!existingMembership) {
      conflictingMembership =
        await db.prepare(`
          SELECT
            id,
            membership_reference,
            status,
            source_order_id
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
          customer.id,
          item.product_id
        ).first();

      if (conflictingMembership) {
        reasons.push(
          "Customer already has a current membership for this product from another membership lifecycle."
        );
      }
    }
  }

  if (
    existingMembership &&
    [
      "Expired",
      "Cancelled",
      "Refunded"
    ].includes(existingMembership.status)
  ) {
    reasons.push(
      `Existing order-linked membership is ${existingMembership.status} and will not be automatically reactivated.`
    );
  }

  const alreadyActive =
    existingMembership?.status === "Active";

  const canActivateExisting =
    existingMembership?.status === "Pending";

  const canCreate =
    !existingMembership &&
    !conflictingMembership;

  const eligible =
    reasons.length === 0 &&
    (
      alreadyActive ||
      canActivateExisting ||
      canCreate
    );

  return {
    found: true,

    eligible,

    already_provisioned:
      Boolean(alreadyActive),

    can_activate_existing:
      Boolean(canActivateExisting),

    can_create:
      Boolean(canCreate),

    order: {
      id: order.id,
      order_reference:
        order.order_reference,
      enquiry_id:
        order.enquiry_id,
      payment_status:
        order.payment_status,
      payment_provider:
        order.payment_provider,
      total:
        orderTotal,
      currency:
        order.currency
    },

    product:
      item
        ? {
            id: item.product_id,
            sku: item.sku,
            slug: item.slug,
            name_en: item.name_en,
            quantity:
              Number(item.quantity || 0)
          }
        : null,

    customer:
      customer
        ? {
            id: customer.id,
            customer_reference:
              customer.customer_reference,
            display_name:
              customer.display_name,
            email:
              customer.email,
            status:
              customer.status
          }
        : null,

    payment: {
      verified_paid:
        verifiedPaid,
      verified_payment_count:
        Number(
          paid?.verified_payment_count || 0
        ),
      balance_due:
        balanceDue,
      fully_paid:
        fullyPaid
    },

    existing_membership:
      existingMembership,

    conflicting_membership:
      conflictingMembership,

    reasons
  };
}

async function membershipSummary(
  db,
  membershipId
) {
  return await db.prepare(`
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

      p.sku,
      p.name_en AS product_name,

      o.order_reference,
      o.payment_status AS order_payment_status

    FROM memberships m

    JOIN customers c
      ON c.id = m.customer_id

    JOIN products p
      ON p.id = m.product_id

    LEFT JOIN orders o
      ON o.id = m.source_order_id

    WHERE m.id = ?
    LIMIT 1
  `).bind(
    membershipId
  ).first();
}

async function provision(
  db,
  orderId
) {
  const state =
    await loadEligibility(
      db,
      orderId
    );

  if (!state.found) {
    return {
      response:
        json({
          ok: false,
          error: state.error
        }, state.status || 404)
    };
  }

  if (!state.eligible) {
    return {
      response:
        json({
          ok: false,
          eligible: false,
          state,
          error:
            state.reasons[0] ||
            "Order is not eligible for membership provisioning."
        }, 409)
    };
  }

  if (state.already_provisioned) {
    return {
      response:
        json({
          ok: true,
          changed: false,
          already_provisioned: true,
          eligibility: state,
          membership:
            await membershipSummary(
              db,
              state.existing_membership.id
            )
        })
    };
  }

  const now =
    new Date().toISOString();

  const source =
    "Verified Payment Provisioning";

  const sourceReference =
    state.order.order_reference;

  if (state.can_activate_existing) {
    const membershipId =
      Number(
        state.existing_membership.id
      );

    await db.batch([
      db.prepare(`
        UPDATE memberships
        SET
          status = 'Active',
          starts_at =
            CASE
              WHEN starts_at = ''
              THEN ?
              ELSE starts_at
            END,
          activated_at =
            CASE
              WHEN activated_at = ''
              THEN ?
              ELSE activated_at
            END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'Pending'
      `).bind(
        now,
        now,
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
        VALUES (
          ?,
          'activated',
          'Pending',
          'Active',
          ?,
          ?,
          'Activated after full verified payment was confirmed.'
        )
      `).bind(
        membershipId,
        source,
        sourceReference
      )
    ]);

    return {
      response:
        json({
          ok: true,
          changed: true,
          created: false,
          activated: true,
          eligibility:
            await loadEligibility(
              db,
              orderId
            ),
          membership:
            await membershipSummary(
              db,
              membershipId
            )
        })
    };
  }

  const membershipReference =
    makeMembershipReference();

  await db.batch([
    db.prepare(`
      INSERT INTO memberships (
        membership_reference,
        customer_id,
        product_id,
        source_order_id,
        status,
        starts_at,
        activated_at,
        source,
        notes
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        'Pending',
        '',
        '',
        ?,
        'Created by verified-payment membership provisioning.'
      )
    `).bind(
      membershipReference,
      state.customer.id,
      state.product.id,
      orderId,
      source
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
      SELECT
        id,
        'created',
        '',
        'Pending',
        ?,
        ?,
        'Created from eligible membership order.'
      FROM memberships
      WHERE membership_reference = ?
    `).bind(
      source,
      sourceReference,
      membershipReference
    ),

    db.prepare(`
      UPDATE memberships
      SET
        status = 'Active',
        starts_at = ?,
        activated_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE membership_reference = ?
        AND status = 'Pending'
    `).bind(
      now,
      now,
      membershipReference
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
      SELECT
        id,
        'activated',
        'Pending',
        'Active',
        ?,
        ?,
        'Activated after full verified payment was confirmed.'
      FROM memberships
      WHERE membership_reference = ?
    `).bind(
      source,
      sourceReference,
      membershipReference
    )
  ]);

  const created =
    await db.prepare(`
      SELECT id
      FROM memberships
      WHERE membership_reference = ?
      LIMIT 1
    `).bind(
      membershipReference
    ).first();

  if (!created?.id) {
    throw new Error(
      "MEMBERSHIP_PROVISION_FAILED"
    );
  }

  return {
    response:
      json({
        ok: true,
        changed: true,
        created: true,
        activated: true,
        eligibility:
          await loadEligibility(
            db,
            orderId
          ),
        membership:
          await membershipSummary(
            db,
            created.id
          )
      }, 201)
  };
}

export async function provisionMembershipForVerifiedOrder(
  db,
  orderId
){
  // Phase B3B:
  // An explicitly linked subscription Renewal order is handled
  // by the renewal engine before normal initial-membership
  // provisioning. All non-renewal orders continue through the
  // original Phase A provisioning path unchanged.
  const subscriptionRenewal =
    await processVerifiedSubscriptionRenewal(
      db,
      orderId
    );

  if(subscriptionRenewal?.handled){
    return {
      ok:true,
      provisioning_type:"subscription_renewal",
      subscription_renewal:
        subscriptionRenewal
    };
  }

  const courseProvisioning =
    await provisionCourseEntitlementsForVerifiedOrder(
      db,
      orderId
    );

  if(courseProvisioning?.handled){
    return courseProvisioning;
  }

  try {
    const id =
      Number(orderId);

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {
      return {
        hook_ok: false,
        skipped: true,
        response_status: 400,
        reason: "Invalid order ID."
      };
    }

    const result =
      await provision(
        db,
        id
      );

    const response =
      result?.response;

    if (!response) {
      return {
        hook_ok: false,
        skipped: false,
        response_status: 500,
        reason:
          "Provisioning returned no response."
      };
    }

    let data = {};

    try {
      data =
        await response.clone().json();
    }
    catch {}

    /*
     * 409 is normally an expected "not eligible" result:
     * - not a membership product
     * - insufficient verified payment
     * - unresolved canonical customer
     * - conflicting/terminal membership
     *
     * Payment verification must remain successful.
     */
    if (response.status === 409) {
      return {
        hook_ok: true,
        skipped: true,
        response_status:
          response.status,
        reason:
          data?.error ||
          "Order is not eligible for membership provisioning.",
        result:
          data
      };
    }

    if (!response.ok) {
      return {
        hook_ok: false,
        skipped: false,
        response_status:
          response.status,
        reason:
          data?.error ||
          "Membership provisioning failed.",
        result:
          data
      };
    }

    return {
      hook_ok: true,
      skipped: false,
      response_status:
        response.status,
      result:
        data
    };
  }
  catch (error) {
    console.error(
      "MEMBERSHIP VERIFIED-PAYMENT HOOK FAILED",
      error
    );

    /*
     * Deliberately never throw back into the payment verifier.
     * A valid payment must not be rolled back because an
     * entitlement post-processing step failed.
     */
    return {
      hook_ok: false,
      skipped: false,
      response_status: 500,
      reason:
        clean(
          error?.message ||
          "Membership provisioning failed.",
          1000
        )
    };
  }
}

export async function onRequestGet(
  context
) {
  const {
    request,
    env
  } = context;

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

  const orderId =
    Number(
      url.searchParams.get("orderId")
    );

  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    return json({
      ok: false,
      error: "Invalid order ID."
    }, 400);
  }

  try {
const state =
      await loadEligibility(
        env.ENQUIRIES_DB,
        orderId
      );

    if (!state.found) {
      return json({
        ok: false,
        error: state.error
      }, state.status || 404);
    }

    return json({
      ok: true,
      state
    });
  }
  catch (error) {
    console.error(
      "MEMBERSHIP PROVISION ELIGIBILITY ERROR",
      error
    );

    return json({
      ok: false,
      error:
        "Membership eligibility check failed."
    }, 500);
  }
}

export async function onRequestPost(
  context
) {
  const {
    request,
    env
  } = context;

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
    body =
      await request.json();
  }
  catch {
    return json({
      ok: false,
      error: "Invalid request."
    }, 400);
  }

  const orderId =
    Number(body.orderId);

  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    return json({
      ok: false,
      error: "Invalid order ID."
    }, 400);
  }

  try {
    const result =
      await provision(
        env.ENQUIRIES_DB,
        orderId
      );

    return result.response;
  }
  catch (error) {
    console.error(
      "MEMBERSHIP PROVISION ERROR",
      error
    );

    return json({
      ok: false,
      error:
        "Membership provisioning failed."
    }, 500);
  }
}