import {
  provisionMembershipForVerifiedOrder
} from "./membership-provision.js";


function json(data,status=200){
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:{
        "content-type":"application/json; charset=utf-8",
        "cache-control":"no-store"
      }
    }
  );
}


function dbOf(env){
  return env.ENQUIRIES_DB || env.DB || env.D1 || null;
}


function clean(v,max=1000){
  return String(v ?? "").trim().slice(0,max);
}


function money(v){
  const n=Number(v || 0);

  return Number.isFinite(n)
    ? Math.round(n*100)/100
    : 0;
}


function bearer(req){
  const h=req.headers.get("authorization") || "";

  return h.toLowerCase().startsWith("bearer ")
    ? h.slice(7).trim()
    : "";
}


function authorized(req,env){
  const expected=clean(env.ADMIN_TOKEN,1000);
  const supplied=bearer(req);

  return !!expected && supplied===expected;
}


function randomSuffix(){
  const a=new Uint8Array(5);
  crypto.getRandomValues(a);

  return [...a]
    .map(v=>v.toString(16).padStart(2,"0"))
    .join("")
    .toUpperCase();
}


function nowReference(prefix){
  return `${prefix}-${Date.now()}-${randomSuffix()}`;
}


async function sha256Text(value){

  const bytes=
    new TextEncoder()
      .encode(
        String(value ?? "")
      );

  const digest=
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return [...new Uint8Array(digest)]
    .map(
      value=>
        value
          .toString(16)
          .padStart(2,"0")
    )
    .join("");
}


async function loadExecution(db,requestKey){

  return await db.prepare(`
    SELECT *
    FROM pos_sale_executions
    WHERE request_key=?
    LIMIT 1
  `)
    .bind(requestKey)
    .first();
}


async function completedExecutionResult(
  db,
  execution
){

  const order=
    execution.order_id
      ? await db.prepare(`
          SELECT
            id,
            order_reference,
            total,
            currency
          FROM orders
          WHERE id=?
          LIMIT 1
        `)
          .bind(execution.order_id)
          .first()
      : null;

  const fulfilment=
    execution.fulfilment_id
      ? await db.prepare(`
          SELECT
            id,
            fulfilment_reference,
            method,
            status
          FROM order_fulfilments
          WHERE id=?
          LIMIT 1
        `)
          .bind(
            execution.fulfilment_id
          )
          .first()
      : null;

  return {
    ok:true,
    idempotent:true,
    request_id:
      execution.request_key,
    order_id:
      execution.order_id
        ? Number(execution.order_id)
        : null,
    order_reference:
      order?.order_reference || "",
    payment_id:
      execution.payment_id
        ? Number(execution.payment_id)
        : null,
    invoice_id:
      execution.invoice_id
        ? Number(execution.invoice_id)
        : null,
    receipt_id:
      execution.receipt_id
        ? Number(execution.receipt_id)
        : null,
    fulfilment_id:
      execution.fulfilment_id
        ? Number(execution.fulfilment_id)
        : null,
    fulfilment:
      fulfilment || null,
    total:
      money(order?.total || 0),
    currency:
      order?.currency || "MYR"
  };
}


async function cleanupFailedOrder(
  db,
  orderId
){

  if(!orderId){
    return;
  }

  const stock=
    await db.prepare(`
      SELECT
        product_id,
        SUM(-quantity_delta) AS restore_quantity
      FROM inventory_movements
      WHERE
        order_id=?
        AND movement_type='POS Sale'
        AND quantity_delta<0
      GROUP BY product_id
    `)
      .bind(orderId)
      .all();

  for(
    const row of
    stock.results || []
  ){

    const restore=
      Number(
        row.restore_quantity || 0
      );

    if(restore>0){

      await db.prepare(`
        UPDATE inventory_balances
        SET
          stock_on_hand=
            stock_on_hand+?,
          updated_at=CURRENT_TIMESTAMP
        WHERE product_id=?
      `)
        .bind(
          restore,
          row.product_id
        )
        .run();
    }
  }

  const fulfilments=
    await db.prepare(`
      SELECT id
      FROM order_fulfilments
      WHERE order_id=?
    `)
      .bind(orderId)
      .all();

  for(
    const row of
    fulfilments.results || []
  ){

    await db.batch([
      db.prepare(`
        DELETE FROM fulfilment_events
        WHERE fulfilment_id=?
      `).bind(row.id),

      db.prepare(`
        DELETE FROM fulfilment_items
        WHERE fulfilment_id=?
      `).bind(row.id)
    ]);
  }

  const receipts=
    await db.prepare(`
      SELECT id
      FROM receipts
      WHERE order_id=?
    `)
      .bind(orderId)
      .all();

  for(
    const row of
    receipts.results || []
  ){

    await db.prepare(`
      DELETE FROM receipt_items
      WHERE receipt_id=?
    `)
      .bind(row.id)
      .run();
  }

  const invoices=
    await db.prepare(`
      SELECT id
      FROM invoices
      WHERE order_id=?
    `)
      .bind(orderId)
      .all();

  for(
    const row of
    invoices.results || []
  ){

    await db.prepare(`
      DELETE FROM invoice_items
      WHERE invoice_id=?
    `)
      .bind(row.id)
      .run();
  }

  await db.batch([
    db.prepare(`
      DELETE FROM order_fulfilments
      WHERE order_id=?
    `).bind(orderId),

    db.prepare(`
      DELETE FROM pos_sales
      WHERE order_id=?
    `).bind(orderId),

    db.prepare(`
      DELETE FROM receipts
      WHERE order_id=?
    `).bind(orderId),

    db.prepare(`
      DELETE FROM payment_verification_events
      WHERE order_id=?
    `).bind(orderId),

    db.prepare(`
      DELETE FROM payments
      WHERE order_id=?
    `).bind(orderId),

    db.prepare(`
      DELETE FROM invoices
      WHERE order_id=?
    `).bind(orderId),

    db.prepare(`
      DELETE FROM inventory_movements
      WHERE order_id=?
    `).bind(orderId),

    db.prepare(`
      DELETE FROM order_items
      WHERE order_id=?
    `).bind(orderId),

    db.prepare(`
      DELETE FROM orders
      WHERE id=?
    `).bind(orderId)
  ]);
}


async function voidSale(
  db,
  body
){

  const orderId=
    Number(
      body.order_id || 0
    );

  if(
    !Number.isInteger(orderId) ||
    orderId<=0
  ){
    return json({
      error:"Valid order_id required."
    },400);
  }

  const sale=
    await db.prepare(`
      SELECT
        ps.id AS pos_sale_id,
        ps.status AS pos_status,

        o.id AS order_id,
        o.order_reference,
        o.payment_status,

        p.id AS payment_id,
        p.status AS payment_record_status,
        p.verification_status,

        f.id AS fulfilment_id,
        f.status AS fulfilment_status

      FROM pos_sales ps

      JOIN orders o
        ON o.id=ps.order_id

      LEFT JOIN payments p
        ON p.id=(
          SELECT p2.id
          FROM payments p2
          WHERE p2.order_id=o.id
          ORDER BY p2.id DESC
          LIMIT 1
        )

      LEFT JOIN order_fulfilments f
        ON f.order_id=o.id

      WHERE ps.order_id=?
      LIMIT 1
    `)
      .bind(orderId)
      .first();

  if(!sale){
    return json({
      error:"POS sale not found."
    },404);
  }

  if(sale.pos_status==="Voided"){
    return json({
      ok:true,
      voided:true,
      idempotent:true
    });
  }

  /*
   * A completed cash payment is financial truth.
   * Phase E must not silently undo it or return stock.
   * Refund/credit handling belongs to an explicit
   * financial refund workflow.
   */
  if(
    sale.payment_record_status==="Paid" ||
    sale.payment_status==="Paid" ||
    sale.verification_status==="Verified"
  ){
    return json({
      error:
        "Paid POS sale cannot be voided directly. Complete the financial refund workflow first; inventory remains unchanged."
    },409);
  }

  if(
    sale.fulfilment_status==="Shipped" ||
    sale.fulfilment_status==="Delivered"
  ){
    return json({
      error:
        "Shipped or delivered fulfilment cannot be voided as an unsent POS sale."
    },409);
  }

  return json({
    error:
      "POS void is blocked until the related financial state is explicitly cancelled or refunded."
  },409);
}


async function loadProduct(db,id){

  return db.prepare(`
    SELECT
      p.id,
      p.sku,
      p.name_en,
      p.name_zh,
      p.product_type,
      p.price,
      p.currency,
      p.status,

      COALESCE(fs.fulfilment_required,0) AS fulfilment_required,
      COALESCE(fs.inventory_tracked,0) AS inventory_tracked,
      COALESCE(fs.default_method,'Pickup') AS default_method,

      COALESCE(ib.stock_on_hand,0) AS stock_on_hand

    FROM products p

    LEFT JOIN product_fulfilment_settings fs
      ON fs.product_id=p.id

    LEFT JOIN inventory_balances ib
      ON ib.product_id=p.id

    WHERE p.id=?
    LIMIT 1
  `).bind(id).first();
}


export async function onRequestPost({request,env}){

  if(!authorized(request,env)){
    return json({error:"Unauthorized"},401);
  }

  const db=dbOf(env);

  if(!db){
    return json({error:"Database unavailable"},503);
  }

  let body={};

  try{
    body=await request.json();
  }
  catch{
    return json({error:"Valid JSON required."},400);
  }

  const action=
    clean(
      body.action || "sale",
      40
    ).toLowerCase();

  if(action==="void"){
    return await voidSale(
      db,
      body
    );
  }

  if(action!=="sale"){
    return json({
      error:"Unsupported action.",
      supported:[
        "sale",
        "void"
      ]
    },400);
  }

  const requestKey=
    clean(
      body.request_id || "",
      200
    );

  if(!requestKey){
    return json({
      error:
        "request_id is required for POS sale idempotency."
    },400);
  }

  const rawItems=
    Array.isArray(body.items)
      ? body.items
      : [];

  if(!rawItems.length){
    return json({
      error:
        "At least one POS item is required."
    },400);
  }

  /*
   * Normalize duplicate product rows so stock validation
   * always evaluates the true requested quantity.
   */
  const grouped=
    new Map();

  for(const input of rawItems){

    const productId=
      Number(
        input.product_id || 0
      );

    const quantity=
      Number(
        input.quantity || 0
      );

    if(
      !Number.isInteger(productId) ||
      productId<=0 ||
      !Number.isInteger(quantity) ||
      quantity<=0
    ){
      return json({
        error:
          "Each POS item requires valid product_id and positive integer quantity."
      },400);
    }

    grouped.set(
      productId,
      (
        grouped.get(productId) ||
        0
      ) + quantity
    );
  }

  const suppliedItems=
    [...grouped.entries()]
      .map(
        ([product_id,quantity])=>({
          product_id,
          quantity
        })
      );

  const items=[];

  for(const input of suppliedItems){

    const productId=Number(input.product_id || 0);
    const quantity=Number(input.quantity || 0);

    if(
      !Number.isInteger(productId) ||
      productId<=0 ||
      !Number.isInteger(quantity) ||
      quantity<=0
    ){
      return json({error:"Each POS item requires valid product_id and positive integer quantity."},400);
    }

    const p=await loadProduct(db,productId);

    if(!p){
      return json({error:`Product ${productId} not found.`},404);
    }

    if(p.status!=="Active"){
      return json({
        error:
          `Product ${p.sku || productId} is not Active.`
      },409);
    }

    /*
     * Course and membership payments trigger the frozen
     * entitlement engines, which require canonical customer
     * identity. Anonymous walk-in POS must not bypass that.
     */
    if(
      ["course","membership"]
        .includes(
          String(
            p.product_type || ""
          ).toLowerCase()
        )
    ){
      return json({
        error:
          "Course and membership POS sales require canonical customer identity and are not enabled in Phase E."
      },409);
    }

    if(
      Number(p.inventory_tracked || 0)===1 &&
      Number(p.stock_on_hand || 0)<quantity
    ){
      return json({
        error:`Insufficient stock for ${p.sku || productId}.`
      },409);
    }

    items.push({
      ...p,
      quantity,
      unit_price:money(p.price),
      line_total:money(
        money(p.price)*quantity
      )
    });
  }

  const currencies=
    [...new Set(
      items.map(
        x=>String(x.currency || "MYR").toUpperCase()
      )
    )];

  if(currencies.length!==1){
    return json({
      error:"All POS items must use the same currency."
    },409);
  }

  const currency=currencies[0];

  const subtotal=
    money(
      items.reduce(
        (sum,x)=>sum+x.line_total,
        0
      )
    );

  const total=subtotal;

  const paymentMethod=
    clean(body.payment_method || "Cash",40);

  /*
   * E1+E2 supports immediate verified POS Cash.
   * Other payment channels retain their established workflows.
   */
  if(paymentMethod!=="Cash"){
    return json({
      error:
        "Phase E POS currently supports immediate Cash payment only."
    },409);
  }

  const fingerprint=
    await sha256Text(
      JSON.stringify({
        items:
          items
            .map(item=>({
              product_id:
                Number(item.id),
              quantity:
                Number(item.quantity)
            }))
            .sort(
              (a,b)=>
                a.product_id-b.product_id
            ),

        customer_name:
          clean(
            body.customer_name || "",
            300
          ),

        customer_email:
          clean(
            body.customer_email || "",
            500
          ).toLowerCase(),

        customer_phone:
          clean(
            body.customer_phone || "",
            100
          ),

        payment_method:
          paymentMethod,

        fulfilment_method:
          clean(
            body.fulfilment_method || "",
            30
          ),

        recipient_name:
          clean(
            body.recipient_name || "",
            300
          ),

        recipient_phone:
          clean(
            body.recipient_phone || "",
            100
          ),

        address_line1:
          clean(
            body.address_line1 || "",
            500
          ),

        postcode:
          clean(
            body.postcode || "",
            50
          )
      })
    );

  let existingExecution=
    await loadExecution(
      db,
      requestKey
    );

  if(existingExecution){

    if(
      existingExecution.request_fingerprint !==
      fingerprint
    ){
      return json({
        error:
          "request_id was already used for a different POS sale."
      },409);
    }

    if(
      existingExecution.execution_status ===
      "Completed"
    ){
      return json(
        await completedExecutionResult(
          db,
          existingExecution
        ),
        200
      );
    }

    if(
      existingExecution.execution_status ===
      "Processing"
    ){
      const started=
        new Date(
          existingExecution.started_at ||
          0
        );

      const age=
        Date.now() -
        started.getTime();

      /*
       * Fresh Processing means another identical request may
       * still be executing. Do not race it.
       */
      if(
        !Number.isNaN(age) &&
        age < 300000
      ){
        return json({
          error:
            "This POS request is already being processed."
        },409);
      }

      /*
       * Stale Processing is recoverable. Any partial order
       * attached to the execution is cleaned before reclaim.
       */
      await cleanupFailedOrder(
        db,
        Number(
          existingExecution.order_id || 0
        )
      );
    }

    if(
      existingExecution.execution_status ===
      "Failed" ||
      existingExecution.execution_status ===
      "Processing"
    ){
      await db.prepare(`
        UPDATE pos_sale_executions
        SET
          execution_status='Processing',
          order_id=NULL,
          payment_id=NULL,
          invoice_id=NULL,
          receipt_id=NULL,
          fulfilment_id=NULL,
          error_message='',
          started_at=CURRENT_TIMESTAMP,
          completed_at='',
          updated_at=CURRENT_TIMESTAMP
        WHERE request_key=?
      `)
        .bind(requestKey)
        .run();
    }
  }
  else {

    try{

      await db.prepare(`
        INSERT INTO pos_sale_executions(
          request_key,
          request_fingerprint,
          execution_status
        )
        VALUES(
          ?,?,
          'Processing'
        )
      `)
        .bind(
          requestKey,
          fingerprint
        )
        .run();

    }
    catch(error){

      existingExecution=
        await loadExecution(
          db,
          requestKey
        );

      if(
        existingExecution &&
        existingExecution.request_fingerprint ===
          fingerprint &&
        existingExecution.execution_status ===
          "Completed"
      ){
        return json(
          await completedExecutionResult(
            db,
            existingExecution
          ),
          200
        );
      }

      return json({
        error:
          "This POS request is already being processed."
      },409);
    }
  }

  const orderReference=
    nowReference("QY-POS");

  const posReference=
    nowReference("QYPOS");

  const now=
    new Date().toISOString();

  let orderId=0;

  const orderItemIds=[];

  try{

    const orderInsert=
      await db.prepare(`
        INSERT INTO orders(
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
          payment_status,
          customer_country
        )
        VALUES(
          ?,
          NULL,
          ?,?,?,?,
          ?,?,
          'POS',
          'POS',
          'Paid',
          ?
        )
        RETURNING id
      `).bind(
        orderReference,
        clean(
          body.customer_name ||
          "Walk-in Customer",
          300
        ),
        clean(
          body.customer_email || "",
          500
        ),
        clean(
          body.customer_phone || "",
          100
        ),
        currency,
        subtotal,
        total,
        clean(
          body.customer_country || "",
          100
        )
      ).first();

    orderId=
      Number(
        orderInsert?.id || 0
      );

    if(!orderId){
      throw new Error(
        "Unable to create POS order."
      );
    }

    await db.prepare(`
      UPDATE pos_sale_executions
      SET
        order_id=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE request_key=?
    `)
      .bind(
        orderId,
        requestKey
      )
      .run();

    for(const item of items){

      const inserted=
        await db.prepare(`
          INSERT INTO order_items(
            order_id,
            product_id,
            quantity,
            unit_price,
            line_total,
            list_unit_price,
            discount_amount,
            final_unit_price,
            pricing_rule
          )
          VALUES(
            ?,?,?,?,?,?,?,?,?
          )
          RETURNING id
        `).bind(
          orderId,
          item.id,
          item.quantity,
          item.unit_price,
          item.line_total,
          item.unit_price,
          0,
          item.unit_price,
          "POS"
        ).first();

      orderItemIds.push(
        Number(inserted?.id || 0)
      );
    }


    /*
     * Deduct inventory after all item rows exist.
     * Each inventory-tracked item uses an atomic conditional
     * UPDATE so a concurrent sale cannot oversell it.
     */
    for(let i=0;i<items.length;i++){

      const item=items[i];

      if(Number(item.inventory_tracked || 0)!==1){
        continue;
      }

      /*
       * D1 batch is transactional. The second statement uses
       * SQLite changes() from the immediately preceding UPDATE.
       * If the conditional stock UPDATE did not affect exactly
       * one row, stock_after becomes NULL and the NOT NULL
       * constraint aborts and rolls back the whole batch.
       *
       * Therefore a committed stock deduction always has its
       * corresponding POS Sale inventory movement.
       */
      await db.batch([
        db.prepare(`
          UPDATE inventory_balances
          SET
            stock_on_hand=
              stock_on_hand-?,
            updated_at=CURRENT_TIMESTAMP
          WHERE
            product_id=?
            AND stock_on_hand>=?
        `).bind(
          item.quantity,
          item.id,
          item.quantity
        ),

        db.prepare(`
          INSERT INTO inventory_movements(
            product_id,
            order_id,
            order_item_id,
            movement_type,
            quantity_delta,
            stock_after,
            reference,
            notes,
            created_by
          )
          VALUES(
            ?,?,?,
            'POS Sale',
            ?,
            CASE
              WHEN changes()=1
              THEN (
                SELECT stock_on_hand
                FROM inventory_balances
                WHERE product_id=?
              )
              ELSE NULL
            END,
            ?,
            'Stock deducted by completed POS sale.',
            ?
          )
        `).bind(
          item.id,
          orderId,
          orderItemIds[i],
          -item.quantity,
          item.id,
          posReference,
          clean(
            body.staff_name ||
            "Admin",
            200
          )
        )
      ]);
    }


    const payment=
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
          'POS',
          ?,
          ?,
          ?,
          'Paid',
          ?,
          ?,
          'Cash',
          ?,
          0,
          ?,
          ?,
          ?,
          'Verified',
          ?,
          'Quantum YiJing',
          'POS cash payment.',
          'POS',
          'Cash received at POS.',
          1,
          'Settled',
          1,
          ?
        )
        RETURNING id
      `).bind(
        orderId,
        posReference,
        total,
        currency,
        `POS:${posReference}`,
        now,
        total,
        total,
        now.slice(0,10),
        total,
        now,
        now
      ).first();

    const paymentId=Number(payment?.id || 0);

    if(!paymentId){
      throw new Error("POS payment creation failed.");
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
        ?,?,
        'Manual',
        'POS Cash',
        ?,
        'Verified',
        'Cash received and verified at POS.'
      )
    `).bind(
      orderId,
      paymentId,
      clean(body.staff_name || "Admin",200)
    ).run();


    const invoiceNumber=
      `QYINV-${orderId}-01`;

    const invoice=
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
          ?,?,
          1,
          ?,?,?,?,
          ?,?,
          ?,
          0,
          'Paid',
          ?,
          '',
          'POS',
          'POS',
          'Generated by POS sale.',
          'POS'
        )
        RETURNING id
      `).bind(
        invoiceNumber,
        orderId,
        clean(body.customer_name || "Walk-in Customer",300),
        clean(body.customer_email || "",500),
        clean(body.customer_phone || "",100),
        currency,
        subtotal,
        total,
        total,
        now.slice(0,10)
      ).first();

    const invoiceId=Number(invoice?.id || 0);

    for(let i=0;i<items.length;i++){

      const item=items[i];

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
        VALUES(
          ?,?,?,?,?,?,?,?,?
        )
      `).bind(
        invoiceId,
        orderItemIds[i],
        item.id,
        clean(
          item.name_en ||
          item.name_zh ||
          item.sku ||
          `Product ${item.id}`,
          500
        ),
        item.quantity,
        item.unit_price,
        0,
        item.unit_price,
        item.line_total
      ).run();
    }


    const receiptNumber=
      `QYR-POS-${paymentId}`;

    const receipt=
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
      `).bind(
        receiptNumber,
        orderId,
        paymentId,
        clean(body.customer_name || "Walk-in Customer",300),
        clean(body.customer_email || "",500),
        total,
        currency,
        now.slice(0,10),
        posReference
      ).first();

    const receiptId=Number(receipt?.id || 0);

    for(let i=0;i<items.length;i++){

      const item=items[i];

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
        VALUES(
          ?,?,?,?,?,?,?
        )
      `).bind(
        receiptId,
        orderItemIds[i],
        item.id,
        clean(
          item.name_en ||
          item.name_zh ||
          item.sku ||
          `Product ${item.id}`,
          500
        ),
        item.quantity,
        item.unit_price,
        item.line_total
      ).run();
    }


    await db.prepare(`
      INSERT INTO pos_sales(
        pos_reference,
        order_id,
        status,
        location,
        staff_name
      )
      VALUES(
        ?,?,
        'Completed',
        ?,?
      )
    `).bind(
      posReference,
      orderId,
      clean(body.location || "",200),
      clean(body.staff_name || "Admin",200)
    ).run();


    const fulfilmentItems=
      items
        .map((item,index)=>({
          ...item,
          order_item_id:orderItemIds[index]
        }))
        .filter(
          item=>
            Number(item.fulfilment_required || 0)===1
        );

    let fulfilment=null;

    if(fulfilmentItems.length){

      const requestedMethod=
        clean(body.fulfilment_method || "",30);

      const method=
        requestedMethod ||
        fulfilmentItems[0].default_method ||
        "Pickup";

      if(!["Pickup","Delivery","Shipping"].includes(method)){
        throw new Error("Invalid fulfilment method.");
      }

      const fulfilmentReference=
        nowReference("QYFUL");

      const f=
        await db.prepare(`
          INSERT INTO order_fulfilments(
            fulfilment_reference,
            order_id,
            method,
            status,
            recipient_name,
            recipient_phone,
            recipient_email,
            address_line1,
            address_line2,
            city,
            state_region,
            postcode,
            country,
            notes
          )
          VALUES(
            ?,?,?,
            'Pending',
            ?,?,?,?,?,?,?,?,?,?
          )
          RETURNING id
        `).bind(
          fulfilmentReference,
          orderId,
          method,
          clean(body.recipient_name || body.customer_name || "Walk-in Customer",300),
          clean(body.recipient_phone || body.customer_phone || "",100),
          clean(body.recipient_email || body.customer_email || "",500),
          clean(body.address_line1 || "",500),
          clean(body.address_line2 || "",500),
          clean(body.city || "",200),
          clean(body.state_region || "",200),
          clean(body.postcode || "",50),
          clean(body.country || body.customer_country || "",100),
          clean(body.fulfilment_notes || "",2000)
        ).first();

      const fulfilmentId=Number(f?.id || 0);

      for(const item of fulfilmentItems){

        await db.prepare(`
          INSERT INTO fulfilment_items(
            fulfilment_id,
            order_item_id,
            product_id,
            quantity
          )
          VALUES(?,?,?,?)
        `).bind(
          fulfilmentId,
          item.order_item_id,
          item.id,
          item.quantity
        ).run();
      }

      await db.prepare(`
        INSERT INTO fulfilment_events(
          fulfilment_id,
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
          'Pending',
          'POS',
          ?,
          'Fulfilment created from POS sale.'
        )
      `).bind(
        fulfilmentId,
        posReference
      ).run();

      fulfilment={
        id:fulfilmentId,
        fulfilment_reference:fulfilmentReference,
        method,
        status:"Pending"
      };
    }


    const provisioning=
      await provisionMembershipForVerifiedOrder(
        db,
        orderId
      );

    await db.prepare(`
      UPDATE pos_sale_executions
      SET
        execution_status='Completed',
        payment_id=?,
        invoice_id=?,
        receipt_id=?,
        fulfilment_id=?,
        completed_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
      WHERE request_key=?
    `)
      .bind(
        paymentId,
        invoiceId,
        receiptId,
        fulfilment?.id || null,
        requestKey
      )
      .run();

    return json({
      ok:true,
      idempotent:false,
      request_id:requestKey,
      pos_reference:posReference,
      order_id:orderId,
      order_reference:orderReference,
      payment_id:paymentId,
      invoice_id:invoiceId,
      receipt_id:receiptId,
      total,
      currency,
      fulfilment,
      provisioning
    },201);

  }
  catch(error){

    console.error(
      "POS SALE FAILED",
      error
    );

    const errorMessage=
      clean(
        error?.message ||
        "POS sale failed.",
        1000
      );

    let cleanupError="";

    try{

      await cleanupFailedOrder(
        db,
        orderId
      );

    }
    catch(cleanupFailure){

      cleanupError=
        clean(
          cleanupFailure?.message ||
          "POS failed-sale cleanup failed.",
          1000
        );

      console.error(
        "POS FAILED-SALE CLEANUP FAILED",
        cleanupError
      );
    }

    if(cleanupError){

      await db.prepare(`
        UPDATE pos_sale_executions
        SET
          execution_status='Failed',
          error_message=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE request_key=?
      `)
        .bind(
          `${errorMessage}; cleanup: ${cleanupError}`,
          requestKey
        )
        .run();

    }
    else {

      await db.prepare(`
        UPDATE pos_sale_executions
        SET
          execution_status='Failed',
          order_id=NULL,
          payment_id=NULL,
          invoice_id=NULL,
          receipt_id=NULL,
          fulfilment_id=NULL,
          error_message=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE request_key=?
      `)
        .bind(
          errorMessage,
          requestKey
        )
        .run();
    }

    return json({
      error:errorMessage,
      cleanup_ok:
        !cleanupError,
      cleanup_error:
        cleanupError,
      order_id:
        orderId || null
    },500);
  }
}