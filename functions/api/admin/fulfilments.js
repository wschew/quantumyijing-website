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

function bearer(req){
  const h=req.headers.get("authorization") || "";

  return h.toLowerCase().startsWith("bearer ")
    ? h.slice(7).trim()
    : "";
}

function authorized(req,env){
  const expected=clean(env.ADMIN_TOKEN,1000);
  return !!expected && bearer(req)===expected;
}

const transitions={
  Pending:[
    "Preparing",
    "Cancelled"
  ],

  Preparing:[
    "Ready",
    "Shipped",
    "Cancelled"
  ],

  Ready:[
    "Shipped",
    "Delivered",
    "Cancelled"
  ],

  Shipped:[
    "Delivered"
  ],

  Delivered:[],
  Cancelled:[]
};

function eventOf(status){
  return {
    Preparing:"preparing",
    Ready:"ready",
    Shipped:"shipped",
    Delivered:"delivered",
    Cancelled:"cancelled"
  }[status] || "updated";
}

function timeColumn(status){
  return {
    Preparing:"prepared_at",
    Ready:"ready_at",
    Shipped:"shipped_at",
    Delivered:"delivered_at",
    Cancelled:"cancelled_at"
  }[status] || "";
}


async function summary(db,id){

  const row=
    await db.prepare(`
      SELECT *
      FROM order_fulfilments
      WHERE id=?
      LIMIT 1
    `).bind(id).first();

  if(!row){
    return null;
  }

  const items=
    await db.prepare(`
      SELECT *
      FROM fulfilment_items
      WHERE fulfilment_id=?
      ORDER BY id
    `).bind(id).all();

  const events=
    await db.prepare(`
      SELECT *
      FROM fulfilment_events
      WHERE fulfilment_id=?
      ORDER BY id
    `).bind(id).all();

  return {
    ...row,
    items:items.results || [],
    events:events.results || []
  };
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
  const id=Number(url.searchParams.get("id") || 0);

  if(id){

    const row=await summary(db,id);

    if(!row){
      return json({error:"Fulfilment not found."},404);
    }

    return json({fulfilment:row});
  }

  const rows=
    await db.prepare(`
      SELECT
        f.*,
        o.order_reference,
        o.customer_name
      FROM order_fulfilments f
      JOIN orders o
        ON o.id=f.order_id
      ORDER BY f.id DESC
      LIMIT 200
    `).all();

  return json({
    fulfilments:rows.results || []
  });
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

  const id=Number(body.fulfilment_id || 0);

  if(!id){
    return json({error:"fulfilment_id is required."},400);
  }

  const current=
    await db.prepare(`
      SELECT *
      FROM order_fulfilments
      WHERE id=?
      LIMIT 1
    `).bind(id).first();

  if(!current){
    return json({error:"Fulfilment not found."},404);
  }

  const action=clean(body.action,60).toLowerCase();


  if(action==="tracking"){

    if(current.status==="Cancelled"){
      return json({error:"Cancelled fulfilment cannot be updated."},409);
    }

    await db.batch([
      db.prepare(`
        UPDATE order_fulfilments
        SET
          courier=?,
          tracking_number=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(
        clean(body.courier || "",200),
        clean(body.tracking_number || "",300),
        id
      ),

      db.prepare(`
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
          'tracking_updated',
          ?,?,
          'Admin',
          ?,
          ?
        )
      `).bind(
        id,
        current.status,
        current.status,
        clean(body.tracking_number || "",300),
        clean(body.notes || "",2000)
      )
    ]);

    return json({
      ok:true,
      fulfilment:await summary(db,id)
    });
  }


  if(action==="status"){

    const next=clean(body.status,40);

    if(next===current.status){
      return json({
        ok:true,
        idempotent:true,
        fulfilment:await summary(db,id)
      });
    }

    if(
      !transitions[current.status] ||
      !transitions[current.status].includes(next)
    ){
      return json({
        error:
          `Invalid fulfilment transition ${current.status} -> ${next}.`
      },409);
    }

    const column=timeColumn(next);
    const now=new Date().toISOString();

    const sql=
      column
        ? `UPDATE order_fulfilments
           SET status=?,${column}=?,updated_at=CURRENT_TIMESTAMP
           WHERE id=?`
        : `UPDATE order_fulfilments
           SET status=?,updated_at=CURRENT_TIMESTAMP
           WHERE id=?`;

    const stmt=
      column
        ? db.prepare(sql).bind(next,now,id)
        : db.prepare(sql).bind(next,id);

    await db.batch([
      stmt,

      db.prepare(`
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
          ?,?,?,?,
          'Admin',
          ?,
          ?
        )
      `).bind(
        id,
        eventOf(next),
        current.status,
        next,
        current.fulfilment_reference,
        clean(body.notes || "",2000)
      )
    ]);

    return json({
      ok:true,
      fulfilment:await summary(db,id)
    });
  }


  return json({
    error:"Unsupported action.",
    supported:[
      "status",
      "tracking"
    ]
  },400);
}