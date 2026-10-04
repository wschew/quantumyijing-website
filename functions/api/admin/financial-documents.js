function json(data,status=200){
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:{
        "content-type":"application/json; charset=utf-8",
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

function today(){
  return new Date()
    .toISOString()
    .slice(0,10);
}

function submissionReference(){
  const bytes=
    new Uint8Array(5);

  crypto.getRandomValues(bytes);

  const suffix=
    [...bytes]
      .map(v=>v.toString(16).padStart(2,"0"))
      .join("")
      .toUpperCase();

  return `QYBT-${Date.now()}-${suffix}`;
}


async function orderState(db,orderId){

  const order=
    await db.prepare(`
      SELECT
        id,
        order_reference,
        enquiry_id,
        customer_name,
        customer_email,
        customer_phone,
        currency,
        subtotal,
        total,
        sales_channel,
        payment_provider,
        payment_status
      FROM orders
      WHERE id=?
      LIMIT 1
    `)
      .bind(orderId)
      .first();

  if(!order){
    return null;
  }

  const items=
    await db.prepare(`
      SELECT
        oi.id AS order_item_id,
        oi.product_id,
        oi.quantity,
        oi.list_unit_price,
        oi.discount_amount,
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
      .bind(orderId)
      .all();

  const paid=
    await db.prepare(`
      SELECT
        COALESCE(
          SUM(amount),
          0
        ) AS verified_paid
      FROM payments
      WHERE
        order_id=?
        AND status='Paid'
        AND verification_status='Verified'
    `)
      .bind(orderId)
      .first();

  return {
    order,
    items:items.results || [],
    verified_paid:
      money(paid?.verified_paid || 0)
  };
}


async function createInvoice(db,body){

  const orderId=
    intId(body.order_id || body.orderId);

  if(!orderId){
    return json({
      error:"Valid order_id required."
    },400);
  }

  const state=
    await orderState(
      db,
      orderId
    );

  if(!state){
    return json({
      error:"Order not found."
    },404);
  }

  const latest=
    await db.prepare(`
      SELECT
        id,
        invoice_number,
        version_no,
        invoice_status
      FROM invoices
      WHERE order_id=?
      ORDER BY version_no DESC
      LIMIT 1
    `)
      .bind(orderId)
      .first();

  /*
   * Default behavior is idempotent:
   * if a non-void invoice already exists,
   * return it rather than issue another invoice.
   */
  if(
    latest &&
    latest.invoice_status!=="Void" &&
    body.force_new_version!==true
  ){
    return json({
      ok:true,
      existing:true,
      invoice:
        await invoiceSummary(
          db,
          latest.id
        )
    });
  }

  const version=
    Number(latest?.version_no || 0)+1;

  const invoiceNumber=
    `QYINV-${state.order.id}-${String(version).padStart(2,"0")}`;

  const total=
    money(state.order.total);

  const verifiedPaid=
    money(state.verified_paid);

  const balance=
    Math.max(
      0,
      money(
        total -
        verifiedPaid
      )
    );

  let status="Issued";

  if(
    verifiedPaid > 0 &&
    balance > 0
  ){
    status="Partially Paid";
  }

  if(
    total > 0 &&
    balance <= 0
  ){
    status="Paid";
  }

  const issueDate=
    clean(
      body.issue_date ||
      today(),
      20
    );

  const dueDate=
    clean(
      body.due_date || "",
      20
    );

  const inserted=
    await db.prepare(`
      INSERT INTO invoices(
        invoice_number,
        order_id,
        version_no,
        customer_name,
        customer_email,
        customer_phone,
        currency,
        subtotal,
        total_amount,
        verified_paid_at_issue,
        balance_due_at_issue,
        invoice_status,
        issue_date,
        due_date,
        sales_channel,
        payment_provider,
        notes,
        created_source
      )
      VALUES(
        ?,?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?,?,?,?
      )
      RETURNING id
    `)
      .bind(
        invoiceNumber,
        orderId,
        version,
        clean(state.order.customer_name,300),
        clean(state.order.customer_email,500),
        clean(state.order.customer_phone,100),
        clean(state.order.currency || "MYR",20),
        money(state.order.subtotal),
        total,
        verifiedPaid,
        balance,
        status,
        issueDate,
        dueDate,
        clean(state.order.sales_channel,100),
        clean(state.order.payment_provider,100),
        clean(body.notes || "",2000),
        clean(body.source || "Admin",100)
      )
      .first();

  const invoiceId=
    Number(inserted?.id || 0);

  if(!invoiceId){
    return json({
      error:"Unable to create invoice."
    },500);
  }

  for(const item of state.items){

    const description=
      clean(
        item.name_en ||
        item.name_zh ||
        item.sku ||
        `Product ${item.product_id || ""}`,
        500
      );

    await db.prepare(`
      INSERT INTO invoice_items(
        invoice_id,
        order_item_id,
        product_id,
        description,
        quantity,
        list_unit_price,
        discount_amount,
        final_unit_price,
        line_total
      )
      VALUES(?,?,?,?,?,?,?,?,?)
    `)
      .bind(
        invoiceId,
        item.order_item_id || null,
        item.product_id || null,
        description,
        Number(item.quantity || 1),
        money(item.list_unit_price),
        money(item.discount_amount),
        money(item.final_unit_price),
        money(item.line_total)
      )
      .run();
  }

  return json({
    ok:true,
    created:true,
    invoice:
      await invoiceSummary(
        db,
        invoiceId
      )
  },201);
}


async function invoiceSummary(db,id){

  const invoice=
    await db.prepare(`
      SELECT *
      FROM invoices
      WHERE id=?
      LIMIT 1
    `)
      .bind(id)
      .first();

  if(!invoice){
    return null;
  }

  const items=
    await db.prepare(`
      SELECT *
      FROM invoice_items
      WHERE invoice_id=?
      ORDER BY id
    `)
      .bind(id)
      .all();

  return {
    ...invoice,
    items:items.results || []
  };
}


async function submitBankTransfer(db,body){

  const orderId=
    intId(body.order_id || body.orderId);

  if(!orderId){
    return json({
      error:"Valid order_id required."
    },400);
  }

  const state=
    await orderState(
      db,
      orderId
    );

  if(!state){
    return json({
      error:"Order not found."
    },404);
  }

  const amount=
    money(body.amount);

  if(amount<=0){
    return json({
      error:"Bank transfer amount must be greater than zero."
    },400);
  }

  const currency=
    clean(
      body.currency ||
      state.order.currency ||
      "MYR",
      20
    ).toUpperCase();

  if(
    currency !==
    clean(
      state.order.currency || "MYR",
      20
    ).toUpperCase()
  ){
    return json({
      error:"Bank transfer currency must match the order currency."
    },409);
  }

  const invoiceId=
    intId(body.invoice_id || body.invoiceId);

  if(invoiceId){

    const invoice=
      await db.prepare(`
        SELECT id,order_id
        FROM invoices
        WHERE id=?
        LIMIT 1
      `)
        .bind(invoiceId)
        .first();

    if(!invoice){
      return json({
        error:"Invoice not found."
      },404);
    }

    if(
      Number(invoice.order_id)!==
      orderId
    ){
      return json({
        error:"Invoice does not belong to the supplied order."
      },409);
    }
  }

  const ref=
    submissionReference();

  const inserted=
    await db.prepare(`
      INSERT INTO bank_transfer_submissions(
        submission_reference,
        order_id,
        invoice_id,
        amount,
        currency,
        transfer_date,
        sender_name,
        sender_bank,
        sender_account_last4,
        transfer_reference,
        evidence_file_name,
        evidence_content_type,
        evidence_location,
        status,
        submitted_by,
        notes
      )
      VALUES(
        ?,?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,'Submitted',?,?
      )
      RETURNING id
    `)
      .bind(
        ref,
        orderId,
        invoiceId || null,
        amount,
        currency,
        clean(body.transfer_date || "",40),
        clean(body.sender_name || "",300),
        clean(body.sender_bank || "",300),
        clean(body.sender_account_last4 || "",4),
        clean(body.transfer_reference || "",300),
        clean(body.evidence_file_name || "",500),
        clean(body.evidence_content_type || "",200),
        clean(body.evidence_location || "",1000),
        clean(body.submitted_by || "Admin",200),
        clean(body.notes || "",2000)
      )
      .first();

  const submissionId=
    Number(inserted?.id || 0);

  if(!submissionId){
    return json({
      error:"Unable to create bank transfer submission."
    },500);
  }

  await db.batch([
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
        'created',
        '',
        'Submitted',
        'Admin',
        ?,
        'Bank transfer submission created.'
      )
    `)
      .bind(
        submissionId,
        ref
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
        'submitted',
        '',
        'Submitted',
        'Admin',
        ?,
        'Bank transfer evidence submitted for review.'
      )
    `)
      .bind(
        submissionId,
        ref
      )
  ]);

  return json({
    ok:true,
    created:true,
    submission:
      await bankTransferSummary(
        db,
        submissionId
      )
  },201);
}


async function bankTransferSummary(db,id){

  const row=
    await db.prepare(`
      SELECT *
      FROM bank_transfer_submissions
      WHERE id=?
      LIMIT 1
    `)
      .bind(id)
      .first();

  if(!row){
    return null;
  }

  const events=
    await db.prepare(`
      SELECT *
      FROM bank_transfer_events
      WHERE bank_transfer_submission_id=?
      ORDER BY id
    `)
      .bind(id)
      .all();

  return {
    ...row,
    events:events.results || []
  };
}


export async function onRequestGet(context){

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

  const url=
    new URL(
      context.request.url
    );

  const invoiceId=
    intId(
      url.searchParams.get("invoice_id")
    );

  const bankTransferId=
    intId(
      url.searchParams.get(
        "bank_transfer_id"
      )
    );

  if(invoiceId){

    const invoice=
      await invoiceSummary(
        db,
        invoiceId
      );

    if(!invoice){
      return json({
        error:"Invoice not found."
      },404);
    }

    return json({
      invoice
    });
  }

  if(bankTransferId){

    const submission=
      await bankTransferSummary(
        db,
        bankTransferId
      );

    if(!submission){
      return json({
        error:"Bank transfer submission not found."
      },404);
    }

    return json({
      submission
    });
  }

  const invoices=
    await db.prepare(`
      SELECT *
      FROM invoices
      ORDER BY id DESC
      LIMIT 200
    `).all();

  const transfers=
    await db.prepare(`
      SELECT *
      FROM bank_transfer_submissions
      ORDER BY id DESC
      LIMIT 200
    `).all();

  return json({
    invoices:invoices.results || [],
    bank_transfers:
      transfers.results || []
  });
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

  const action=
    clean(
      body.action,
      80
    ).toLowerCase();

  try{

    if(action==="create-invoice"){
      return await createInvoice(
        db,
        body
      );
    }

    if(action==="submit-bank-transfer"){
      return await submitBankTransfer(
        db,
        body
      );
    }

    return json({
      error:"Unsupported action.",
      supported:[
        "create-invoice",
        "submit-bank-transfer"
      ]
    },400);

  }
  catch(error){

    console.error(
      "financial documents",
      error
    );

    const msg=
      String(
        error?.message || ""
      );

    if(
      msg.includes(
        "UNIQUE constraint failed"
      ) ||
      msg.includes(
        "constraint failed"
      )
    ){
      return json({
        error:
          "Financial document constraint conflict."
      },409);
    }

    return json({
      error:
        "Financial document operation failed."
    },500);
  }
}