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

function int(v){
  const n=Number(v);
  return Number.isInteger(n) ? n : null;
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

async function product(db,id){
  return db.prepare(`
    SELECT id,sku,name_en,name_zh,status,price,currency
    FROM products
    WHERE id=?
    LIMIT 1
  `).bind(id).first();
}

export async function onRequestGet({request,env}){

  if(!authorized(request,env)){
    return json({error:"Unauthorized"},401);
  }

  const db=dbOf(env);

  if(!db){
    return json({error:"Database unavailable"},503);
  }

  const url=new URL(request.url);
  const productId=Number(url.searchParams.get("product_id") || 0);

  if(productId){

    const row=await db.prepare(`
      SELECT
        p.id,
        p.sku,
        p.name_en,
        p.name_zh,
        p.status,
        pfs.fulfilment_required,
        pfs.inventory_tracked,
        pfs.default_method,
        pfs.allow_pickup,
        pfs.allow_delivery,
        pfs.allow_shipping,
        pfs.storage_location,
        COALESCE(ib.stock_on_hand,0) AS stock_on_hand,
        COALESCE(ib.reorder_level,0) AS reorder_level
      FROM products p
      LEFT JOIN product_fulfilment_settings pfs
        ON pfs.product_id=p.id
      LEFT JOIN inventory_balances ib
        ON ib.product_id=p.id
      WHERE p.id=?
      LIMIT 1
    `).bind(productId).first();

    if(!row){
      return json({error:"Product not found."},404);
    }

    return json({product:row});
  }

  const rows=await db.prepare(`
    SELECT
      p.id,
      p.sku,
      p.name_en,
      p.product_type,
      p.status,
      COALESCE(pfs.fulfilment_required,0) AS fulfilment_required,
      COALESCE(pfs.inventory_tracked,0) AS inventory_tracked,
      COALESCE(ib.stock_on_hand,0) AS stock_on_hand,
      COALESCE(ib.reorder_level,0) AS reorder_level
    FROM products p
    LEFT JOIN product_fulfilment_settings pfs
      ON pfs.product_id=p.id
    LEFT JOIN inventory_balances ib
      ON ib.product_id=p.id
    ORDER BY p.id
  `).all();

  return json({products:rows.results || []});
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

  const action=clean(body.action,80).toLowerCase();
  const productId=Number(body.product_id || 0);

  if(!productId){
    return json({error:"product_id is required."},400);
  }

  const p=await product(db,productId);

  if(!p){
    return json({error:"Product not found."},404);
  }


  if(action==="configure"){

    const required=body.fulfilment_required===true ? 1 : 0;
    const tracked=body.inventory_tracked===true ? 1 : 0;

    const method=clean(body.default_method || "Pickup",30);

    if(!["Pickup","Delivery","Shipping"].includes(method)){
      return json({error:"Invalid default_method."},400);
    }

    await db.prepare(`
      INSERT INTO product_fulfilment_settings(
        product_id,
        fulfilment_required,
        inventory_tracked,
        default_method,
        allow_pickup,
        allow_delivery,
        allow_shipping,
        storage_location,
        notes,
        updated_at
      )
      VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(product_id)
      DO UPDATE SET
        fulfilment_required=excluded.fulfilment_required,
        inventory_tracked=excluded.inventory_tracked,
        default_method=excluded.default_method,
        allow_pickup=excluded.allow_pickup,
        allow_delivery=excluded.allow_delivery,
        allow_shipping=excluded.allow_shipping,
        storage_location=excluded.storage_location,
        notes=excluded.notes,
        updated_at=CURRENT_TIMESTAMP
    `).bind(
      productId,
      required,
      tracked,
      method,
      body.allow_pickup===false ? 0 : 1,
      body.allow_delivery===true ? 1 : 0,
      body.allow_shipping===true ? 1 : 0,
      clean(body.storage_location || "",200),
      clean(body.notes || "",2000)
    ).run();

    if(tracked){
      await db.prepare(`
        INSERT INTO inventory_balances(
          product_id,
          stock_on_hand,
          reorder_level
        )
        VALUES(?,0,0)
        ON CONFLICT(product_id) DO NOTHING
      `).bind(productId).run();
    }

    return json({ok:true});
  }


  if(action==="set-stock"){

    const quantity=int(body.quantity);

    if(quantity===null || quantity<0){
      return json({error:"quantity must be a non-negative integer."},400);
    }

    const current=await db.prepare(`
      SELECT stock_on_hand
      FROM inventory_balances
      WHERE product_id=?
      LIMIT 1
    `).bind(productId).first();

    const before=Number(current?.stock_on_hand || 0);
    const delta=quantity-before;

    await db.batch([
      db.prepare(`
        INSERT INTO inventory_balances(
          product_id,
          stock_on_hand,
          reorder_level,
          updated_at
        )
        VALUES(?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(product_id)
        DO UPDATE SET
          stock_on_hand=excluded.stock_on_hand,
          reorder_level=excluded.reorder_level,
          updated_at=CURRENT_TIMESTAMP
      `).bind(
        productId,
        quantity,
        Math.max(0,Number(body.reorder_level || 0))
      ),

      db.prepare(`
        INSERT INTO inventory_movements(
          product_id,
          movement_type,
          quantity_delta,
          stock_after,
          reference,
          notes,
          created_by
        )
        VALUES(
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `).bind(
        productId,
        current ? "Adjustment" : "Opening",
        delta,
        quantity,
        clean(body.reference || "Admin Stock Set",200),
        clean(body.notes || "",2000),
        clean(body.created_by || "Admin",200)
      )
    ]);

    return json({
      ok:true,
      product_id:productId,
      stock_on_hand:quantity
    });
  }


  if(action==="adjust-stock"){

    const delta=int(body.quantity_delta);

    if(delta===null || delta===0){
      return json({error:"quantity_delta must be a non-zero integer."},400);
    }

    const current=await db.prepare(`
      SELECT stock_on_hand
      FROM inventory_balances
      WHERE product_id=?
      LIMIT 1
    `).bind(productId).first();

    if(!current){
      return json({error:"Inventory balance does not exist."},409);
    }

    const after=Number(current.stock_on_hand || 0)+delta;

    if(after<0){
      return json({error:"Insufficient stock."},409);
    }

    await db.batch([
      db.prepare(`
        UPDATE inventory_balances
        SET
          stock_on_hand=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE product_id=?
      `).bind(after,productId),

      db.prepare(`
        INSERT INTO inventory_movements(
          product_id,
          movement_type,
          quantity_delta,
          stock_after,
          reference,
          notes,
          created_by
        )
        VALUES(
          ?,
          'Adjustment',
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `).bind(
        productId,
        delta,
        after,
        clean(body.reference || "Admin Adjustment",200),
        clean(body.notes || "",2000),
        clean(body.created_by || "Admin",200)
      )
    ]);

    return json({
      ok:true,
      stock_on_hand:after
    });
  }


  return json({
    error:"Unsupported action.",
    supported:[
      "configure",
      "set-stock",
      "adjust-stock"
    ]
  },400);
}