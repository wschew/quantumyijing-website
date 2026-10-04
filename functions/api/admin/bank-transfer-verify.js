import {
  provisionMembershipForVerifiedOrder
} from "./membership-provision.js";


function json(data,status=200){
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:{
        "content-type":
          "application/json; charset=utf-8",
        "cache-control":"no-store",
        "x-content-type-options":"nosniff"
      }
    }
  );
}


function dbOf(env){
  return env.ENQUIRIES_DB ||
    env.DB ||
    env.D1 ||
    null;
}


function clean(value,max=1000){
  return String(value ?? "")
    .trim()
    .slice(0,max);
}


function intId(value){
  const n=Number(value || 0);

  return Number.isInteger(n) &&
    n > 0
      ? n
      : 0;
}


function money(value){
  const n=Number(value || 0);

  return Number.isFinite(n)
    ? Math.round(n*100)/100
    : 0;
}


function bearer(req){
  const h=
    req.headers.get("authorization") ||
    "";

  return h.toLowerCase().startsWith("bearer ")
    ? h.slice(7).trim()
    : "";
}


function authorized(req,env){
  const expected=
    clean(env.ADMIN_TOKEN,1000);

  const supplied=
    bearer(req);

  return !!expected &&
    !!supplied &&
    supplied===expected;
}


function receiptNumber(paymentId){
  return `QYR-BT-${paymentId}`;
}


async function loadSubmission(db,id){

  return await db.prepare(`
    SELECT
      b.*,

      o.order_reference,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.currency AS order_currency,
      o.total AS order_total,
      o.payment_status AS order_payment_status,

      i.invoice_number,
      i.invoice_status

    FROM bank_transfer_submissions b

    JOIN orders o
      ON o.id=b.order_id

    LEFT JOIN invoices i
      ON i.id=b.invoice_id

    WHERE b.id=?
    LIMIT 1
  `)
    .bind(id)
    .first();
}


async function paymentState(db,orderId){

  const row=
    await db.prepare(`
      SELECT
        COUNT(
          CASE
            WHEN status='Paid'
             AND verification_status='Verified'
            THEN 1
          END
        ) AS verified_payment_count,

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
        ) AS verified_paid
      FROM payments
      WHERE order_id=?
    `)
      .bind(orderId)
      .first();

  return {
    verified_payment_count:
      Number(
        row?.verified_payment_count || 0
      ),

    verified_paid:
      money(
        row?.verified_paid || 0
      )
  };
}


async function receiptForPayment(
  db,
  paymentId
){
  return await db.prepare(`
    SELECT *
    FROM receipts
    WHERE payment_id=?
    ORDER BY id
    LIMIT 1
  `)
    .bind(paymentId)
    .first();
}


async function createReceipt(
  db,
  submission,
  paymentId,
  verifiedAt
){

  const existing=
    await receiptForPayment(
      db,
      paymentId
    );

  if(existing){
    return existing;
  }

  const number=
    receiptNumber(paymentId);

  const issueDate=
    String(verifiedAt || "")
      .slice(0,10);

  const inserted=
    await db.prepare(`
      INSERT INTO receipts(
        receipt_number,
        order_id,
        payment_id,
        issuer,
        document_type,
        customer_name,
        customer_email,
        amount,
        currency,
        issue_date,
        receipt_status,
        external_document_reference
      )
      VALUES(
        ?,?,?,
        'Quantum YiJing',
        'Receipt',
        ?,?,
        ?,?,
        ?,
        'Issued',
        ?
      )
      RETURNING id
    `)
      .bind(
        number,
        submission.order_id,
        paymentId,
        clean(
          submission.customer_name,
          300
        ),
        clean(
          submission.customer_email,
          500
        ),
        money(submission.amount),
        clean(
          submission.currency ||
          submission.order_currency ||
          "MYR",
          20
        ),
        issueDate,
        clean(
          submission.submission_reference,
          300
        )
      )
      .first();

  const receiptId=
    Number(inserted?.id || 0);

  if(!receiptId){
    throw new Error(
      "Unable to issue bank-transfer receipt."
    );
  }

  const items=
    await db.prepare(`
      SELECT
        oi.id AS order_item_id,
        oi.product_id,
        oi.quantity,
        oi.final_unit_price,
        oi.line_total,

        p.sku,
        p.name_en,
        p.name_zh

      FROM order_items oi

      LEFT JOIN products p
        ON p.id=oi.product_id

      WHERE oi.order_id=?

      ORDER BY oi.id
    `)
      .bind(
        submission.order_id
      )
      .all();

  /*
   * A receipt represents the actual payment received.
   * For partial payment we do not pretend each product line
   * was paid in full. The item snapshot remains descriptive;
   * the canonical receipt amount is receipts.amount.
   */
  for(const item of items.results || []){

    const description=
      clean(
        item.name_en ||
        item.name_zh ||
        item.sku ||
        `Product ${item.product_id || ""}`,
        500
      );

    await db.prepare(`
      INSERT INTO receipt_items(
        receipt_id,
        order_item_id,
        product_id,
        description,
        quantity,
        unit_price,
        line_total
      )
      VALUES(?,?,?,?,?,?,?)
    `)
      .bind(
        receiptId,
        item.order_item_id || null,
        item.product_id || null,
        description,
        Number(item.quantity || 1),
        money(item.final_unit_price),
        money(item.line_total)
      )
      .run();
  }

  return await db.prepare(`
    SELECT *
    FROM receipts
    WHERE id=?
    LIMIT 1
  `)
    .bind(receiptId)
    .first();
}


async function updateInvoiceStatus(
  db,
  submission,
  verifiedPaid
){

  if(!submission.invoice_id){
    return;
  }

  const total=
    money(
      submission.order_total
    );

  const paid=
    money(verifiedPaid);

  let status="Issued";

  if(
    paid > 0 &&
    paid + 0.01 < total
  ){
    status="Partially Paid";
  }

  if(
    total > 0 &&
    paid + 0.01 >= total
  ){
    status="Paid";
  }

  await db.prepare(`
    UPDATE invoices
    SET
      invoice_status=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `)
    .bind(
      status,
      submission.invoice_id
    )
    .run();
}


async function alreadyCompleted(
  db,
  submissionId
){

  return await db.prepare(`
    SELECT
      e.bank_transfer_submission_id,
      e.payment_id,
      e.execution_status,
      e.completed_at,

      p.status AS payment_status,
      p.verification_status,

      r.id AS receipt_id,
      r.receipt_number

    FROM bank_transfer_verification_executions e

    LEFT JOIN payments p
      ON p.id=e.payment_id

    LEFT JOIN receipts r
      ON r.payment_id=e.payment_id

    WHERE
      e.bank_transfer_submission_id=?
      AND e.execution_status='Completed'

    LIMIT 1
  `)
    .bind(submissionId)
    .first();
}


async function startReview(
  db,
  submission,
  body
){

  if(
    submission.status==="Verified" ||
    submission.status==="Rejected" ||
    submission.status==="Cancelled"
  ){
    return json({
      error:
        `Bank transfer is already ${submission.status}.`
    },409);
  }

  if(submission.status==="Under Review"){
    return json({
      ok:true,
      idempotent:true,
      submission:
        await loadSubmission(
          db,
          submission.id
        )
    });
  }

  await db.batch([
    db.prepare(`
      UPDATE bank_transfer_submissions
      SET
        status='Under Review',
        reviewed_by=?,
        reviewed_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `)
      .bind(
        clean(
          body.reviewed_by ||
          "Admin",
          200
        ),
        submission.id
      ),

    db.prepare(`
      INSERT INTO bank_transfer_events(
        bank_transfer_submission_id,
        event_type,
        from_status,
        to_status,
        source,
        source_reference,
        notes
      )
      VALUES(
        ?,
        'review_started',
        ?,
        'Under Review',
        'Admin',
        ?,
        ?
      )
    `)
      .bind(
        submission.id,
        submission.status,
        submission.submission_reference,
        clean(
          body.notes ||
          "Bank transfer review started.",
          2000
        )
      )
  ]);

  return json({
    ok:true,
    submission:
      await loadSubmission(
        db,
        submission.id
      )
  });
}


async function rejectTransfer(
  db,
  submission,
  body
){

  if(submission.status==="Verified"){
    return json({
      error:
        "Verified bank transfer cannot be rejected."
    },409);
  }

  if(submission.status==="Rejected"){
    return json({
      ok:true,
      idempotent:true,
      submission
    });
  }

  if(submission.payment_id){
    return json({
      error:
        "Bank transfer already has a linked payment."
    },409);
  }

  const reason=
    clean(
      body.rejection_reason ||
      body.notes ||
      "",
      2000
    );

  if(!reason){
    return json({
      error:
        "Rejection reason is required."
    },400);
  }

  await db.batch([
    db.prepare(`
      UPDATE bank_transfer_submissions
      SET
        status='Rejected',
        reviewed_by=?,
        reviewed_at=CURRENT_TIMESTAMP,
        rejection_reason=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `)
      .bind(
        clean(
          body.reviewed_by ||
          "Admin",
          200
        ),
        reason,
        submission.id
      ),

    db.prepare(`
      INSERT INTO bank_transfer_events(
        bank_transfer_submission_id,
        event_type,
        from_status,
        to_status,
        source,
        source_reference,
        notes
      )
      VALUES(
        ?,
        'rejected',
        ?,
        'Rejected',
        'Admin',
        ?,
        ?
      )
    `)
      .bind(
        submission.id,
        submission.status,
        submission.submission_reference,
        reason
      )
  ]);

  return json({
    ok:true,
    rejected:true,
    submission:
      await loadSubmission(
        db,
        submission.id
      )
  });
}


async function verifyTransfer(
  db,
  submission,
  body
){

  const completed=
    await alreadyCompleted(
      db,
      submission.id
    );

  if(completed){
    const state=
      await paymentState(
        db,
        submission.order_id
      );

    return json({
      ok:true,
      verified:true,
      idempotent:true,
      payment_id:
        Number(completed.payment_id),
      receipt_id:
        completed.receipt_id
          ? Number(completed.receipt_id)
          : null,
      receipt_number:
        completed.receipt_number || "",
      verified_paid:
        state.verified_paid,
      order_total:
        money(
          submission.order_total
        ),
      fully_paid:
        state.verified_paid + 0.01 >=
        money(submission.order_total)
    });
  }

  if(submission.status==="Rejected"){
    return json({
      error:
        "Rejected bank transfer cannot be verified."
    },409);
  }

  if(submission.status==="Cancelled"){
    return json({
      error:
        "Cancelled bank transfer cannot be verified."
    },409);
  }

  const amount=
    money(submission.amount);

  if(amount<=0){
    return json({
      error:
        "Bank transfer amount must be greater than zero."
    },409);
  }

  const orderCurrency=
    clean(
      submission.order_currency ||
      "MYR",
      20
    ).toUpperCase();

  const transferCurrency=
    clean(
      submission.currency ||
      "MYR",
      20
    ).toUpperCase();

  if(
    orderCurrency !==
    transferCurrency
  ){
    return json({
      error:
        "Bank transfer currency does not match order currency."
    },409);
  }

  /*
   * Atomic claim.
   * Only one verifier can create the execution row.
   */
  try{
    await db.prepare(`
      INSERT INTO bank_transfer_verification_executions(
        bank_transfer_submission_id,
        execution_status,
        verified_by
      )
      VALUES(
        ?,
        'Processing',
        ?
      )
    `)
      .bind(
        submission.id,
        clean(
          body.reviewed_by ||
          "Admin",
          200
        )
      )
      .run();
  }
  catch(error){

    const existing=
      await alreadyCompleted(
        db,
        submission.id
      );

    if(existing){
      const state=
        await paymentState(
          db,
          submission.order_id
        );

      return json({
        ok:true,
        verified:true,
        idempotent:true,
        payment_id:
          Number(existing.payment_id),
        receipt_id:
          existing.receipt_id
            ? Number(existing.receipt_id)
            : null,
        receipt_number:
          existing.receipt_number || "",
        verified_paid:
          state.verified_paid,
        order_total:
          money(
            submission.order_total
          ),
        fully_paid:
          state.verified_paid + 0.01 >=
          money(submission.order_total)
      });
    }

    return json({
      error:
        "Bank transfer verification is already being processed."
    },409);
  }

  const now=
    new Date().toISOString();

  const transferRef=
    clean(
      submission.transfer_reference ||
      submission.submission_reference,
      300
    );

  let paymentId=0;

  try{

    const inserted=
      await db.prepare(`
        INSERT INTO payments(
          order_id,
          provider,
          provider_transaction_id,
          amount,
          currency,
          status,
          raw_reference,
          paid_at,
          payment_method,
          gross_amount,
          provider_fee,
          net_amount,
          settlement_date,
          bank_received_amount,
          verification_status,
          verified_at,
          customer_receipt_issuer,
          notes,
          gateway_mode,
          gateway_message,
          gateway_hash_verified,
          settlement_status,
          accounting_eligible,
          accounting_eligible_at
        )
        VALUES(
          ?,
          'BankTransfer',
          ?,
          ?,
          ?,
          'Paid',
          ?,
          ?,
          'Bank Transfer',
          ?,
          0,
          ?,
          ?,
          ?,
          'Verified',
          ?,
          'Quantum YiJing',
          ?,
          'Manual',
          'Bank transfer verified by QY Admin.',
          0,
          'Pending',
          1,
          ?
        )
        RETURNING id
      `)
        .bind(
          submission.order_id,
          transferRef,
          amount,
          transferCurrency,
          `BANKTRANSFER:${submission.submission_reference}`,
          clean(
            submission.transfer_date || now,
            50
          ),
          amount,
          amount,
          clean(
            submission.transfer_date || "",
            50
          ),
          amount,
          now,
          `Verified bank transfer ${submission.submission_reference}.`,
          now
        )
        .first();

    paymentId=
      Number(
        inserted?.id || 0
      );

    if(!paymentId){
      throw new Error(
        "Payment creation failed."
      );
    }

    await db.prepare(`
      INSERT INTO payment_verification_events(
        order_id,
        payment_id,
        verification_method,
        verification_source,
        verified_by,
        verification_status,
        notes
      )
      VALUES(
        ?,
        ?,
        'Manual',
        'Bank Transfer',
        ?,
        'Verified',
        ?
      )
    `)
      .bind(
        submission.order_id,
        paymentId,
        clean(
          body.reviewed_by ||
          "Admin",
          200
        ),
        clean(
          body.notes ||
          `Bank transfer ${submission.submission_reference} independently verified by QY Admin.`,
          2000
        )
      )
      .run();

    const state=
      await paymentState(
        db,
        submission.order_id
      );

    const orderTotal=
      money(
        submission.order_total
      );

    const fullyPaid=
      state.verified_paid + 0.01 >=
      orderTotal;

    await db.batch([
      db.prepare(`
        UPDATE bank_transfer_submissions
        SET
          payment_id=?,
          status='Verified',
          reviewed_by=?,
          reviewed_at=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `)
        .bind(
          paymentId,
          clean(
            body.reviewed_by ||
            "Admin",
            200
          ),
          now,
          submission.id
        ),

      db.prepare(`
        INSERT INTO bank_transfer_events(
          bank_transfer_submission_id,
          event_type,
          from_status,
          to_status,
          source,
          source_reference,
          notes
        )
        VALUES(
          ?,
          'verified',
          ?,
          'Verified',
          'Admin',
          ?,
          ?
        )
      `)
        .bind(
          submission.id,
          submission.status,
          submission.submission_reference,
          clean(
            body.notes ||
            "Bank transfer verified and posted to payment ledger.",
            2000
          )
        ),

      db.prepare(`
        UPDATE bank_transfer_verification_executions
        SET
          payment_id=?,
          execution_status='Completed',
          completed_at=?
        WHERE bank_transfer_submission_id=?
      `)
        .bind(
          paymentId,
          now,
          submission.id
        ),

      db.prepare(`
        UPDATE orders
        SET
          payment_status=?,
          payment_provider=
            CASE
              WHEN ?=1
              THEN 'BankTransfer'
              ELSE payment_provider
            END,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `)
        .bind(
          fullyPaid
            ? "Paid"
            : "Pending",
          fullyPaid
            ? 1
            : 0,
          submission.order_id
        )
    ]);

    const refreshed=
      await loadSubmission(
        db,
        submission.id
      );

    await updateInvoiceStatus(
      db,
      refreshed,
      state.verified_paid
    );

    const receipt=
      await createReceipt(
        db,
        refreshed,
        paymentId,
        now
      );

    let provisioning=null;

    /*
     * Access is never granted for a merely partial payment.
     * Once cumulative verified payment reaches the order total,
     * use the established Phase B/C provisioning orchestrator.
     */
    if(fullyPaid){
      provisioning=
        await provisionMembershipForVerifiedOrder(
          db,
          submission.order_id
        );
    }

    return json({
      ok:true,
      verified:true,
      idempotent:false,

      payment_id:
        paymentId,

      receipt_id:
        Number(receipt?.id || 0),

      receipt_number:
        receipt?.receipt_number || "",

      verified_paid:
        state.verified_paid,

      order_total:
        orderTotal,

      balance_due:
        Math.max(
          0,
          money(
            orderTotal -
            state.verified_paid
          )
        ),

      fully_paid:
        fullyPaid,

      provisioning
    });

  }
  catch(error){

    console.error(
      "BANK TRANSFER VERIFY FAILED",
      error
    );

    /*
     * Keep the execution row as Processing.
     * This deliberately blocks blind duplicate payment creation.
     * A failed verification therefore requires inspection
     * rather than silently retrying money movement.
     */

    return json({
      error:
        clean(
          error?.message ||
          "Bank transfer verification failed.",
          1000
        )
    },500);
  }
}


export async function onRequestPost(context){

  if(
    !authorized(
      context.request,
      context.env
    )
  ){
    return json({
      error:"Unauthorized"
    },401);
  }

  const db=
    dbOf(context.env);

  if(!db){
    return json({
      error:"Database unavailable"
    },503);
  }

  let body={};

  try{
    body=
      await context.request.json();
  }
  catch{
    return json({
      error:"Valid JSON body required."
    },400);
  }

  const id=
    intId(
      body.bank_transfer_id ||
      body.id
    );

  if(!id){
    return json({
      error:
        "Valid bank_transfer_id required."
    },400);
  }

  const submission=
    await loadSubmission(
      db,
      id
    );

  if(!submission){
    return json({
      error:
        "Bank transfer submission not found."
    },404);
  }

  const action=
    clean(
      body.action,
      80
    ).toLowerCase();

  if(action==="start-review"){
    return await startReview(
      db,
      submission,
      body
    );
  }

  if(action==="reject"){
    return await rejectTransfer(
      db,
      submission,
      body
    );
  }

  if(action==="verify"){
    return await verifyTransfer(
      db,
      submission,
      body
    );
  }

  return json({
    error:"Unsupported action.",
    supported:[
      "start-review",
      "verify",
      "reject"
    ]
  },400);
}