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

  const action=clean(body.action || "sale",40).toLowerCase();

  if(action!=="sale"){
    return json({error:"Unsupported action."},400);
  }

  const suppliedItems=
    Array.isArray(body.items)
      ? body.items
      : [];

  if(!suppliedItems.length){
    return json({error:"At least one POS item is required."},400);
  }

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
      return json({error:`Product ${p.sku || productId} is not Active.`},409);
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
      error:"Phase E POS currently supports immediate Cash payment only."
    },409);
  }

  const orderReference=
    nowReference("QY-POS");

  const posReference=
    nowReference("QYPOS");

  const now=
    new Date().toISOString();

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
      clean(body.customer_name || "Walk-in Customer",300),
      clean(body.customer_email || "",500),
      clean(body.customer_phone || "",100),
      currency,
      subtotal,
      total,
      clean(body.customer_country || "",100)
    ).first();

  const orderId=Number(orderInsert?.id || 0);

  if(!orderId){
    return json({error:"Unable to create POS order."},500);
  }

  const orderItemIds=[];

  try{

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

      const updated=
        await db.prepare(`
          UPDATE inventory_balances
          SET
            stock_on_hand=stock_on_hand-?,
            updated_at=CURRENT_TIMESTAMP
          WHERE
            product_id=?
            AND stock_on_hand>=?
          RETURNING stock_on_hand
        `).bind(
          item.quantity,
          item.id,
          item.quantity
        ).first();

      if(!updated){
        throw new Error(
          `Insufficient stock during POS commit for ${item.sku || item.id}.`
        );
      }

      await db.prepare(`
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
          ?,?,
          ?,
          'Stock deducted by completed POS sale.',
          ?
        )
      `).bind(
        item.id,
        orderId,
        orderItemIds[i],
        -item.quantity,
        Number(updated.stock_on_hand),
        posReference,
        clean(body.staff_name || "Admin",200)
      ).run();
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


    return json({
      ok:true,
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

    /*
     * Financially safe response:
     * do not silently report success if any downstream
     * POS operation failed. E3 will add explicit execution
     * recovery/concurrency hardening before freeze.
     */
    return json({
      error:
        clean(
          error?.message ||
          "POS sale failed.",
          1000
        ),
      order_id:orderId
    },500);
  }
}