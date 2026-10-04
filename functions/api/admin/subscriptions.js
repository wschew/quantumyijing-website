function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store"
    }
  });
}

function dbOf(env){
  return env.ENQUIRIES_DB || env.DB || env.D1 || null;
}

function bearer(req){
  const h=req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ")
    ? h.slice(7).trim()
    : "";
}

function authorized(req,env){
  const expected=String(env.ADMIN_TOKEN || "");
  const supplied=bearer(req);
  return !!expected && !!supplied && supplied===expected;
}

function cleanText(v,max=500){
  return String(v ?? "").trim().slice(0,max);
}

function intId(v){
  const n=Number(v);
  return Number.isInteger(n) && n>0 ? n : 0;
}

function bool01(v){
  return v===true || v===1 || String(v).toLowerCase()==="true" || String(v)==="1"
    ? 1
    : 0;
}

function ref(prefix){
  const year=new Date().getUTCFullYear();
  const rnd=crypto.randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();
  return `${prefix}-${year}-${rnd}`;
}

function actionOf(url,body){
  return cleanText(
    url.searchParams.get("action") ||
    body?.action ||
    "",
    80
  ).toLowerCase();
}

async function tableExists(db,name){
  const r=await db.prepare(
    `SELECT 1 AS ok
       FROM sqlite_master
      WHERE type='table' AND name=?
      LIMIT 1`
  ).bind(name).first();

  return !!r;
}

async function ensureFoundation(db){
  for(const table of [
    "subscription_plans",
    "subscriptions",
    "subscription_orders",
    "subscription_events"
  ]){
    if(!(await tableExists(db,table))){
      throw new Error(`Subscription foundation missing: ${table}`);
    }
  }
}

async function getPlan(db,id){
  return db.prepare(`
    SELECT
      sp.*,
      p.sku,
      p.slug,
      p.product_type,
      p.name_en,
      p.name_zh,
      p.status AS product_status,
      p.price,
      p.currency
    FROM subscription_plans sp
    JOIN products p ON p.id=sp.product_id
    WHERE sp.id=?
    LIMIT 1
  `).bind(id).first();
}

async function getSubscription(db,id){
  return db.prepare(`
    SELECT
      s.*,
      sp.plan_reference,
      sp.plan_code,
      sp.billing_interval_unit,
      sp.billing_interval_count,
      sp.membership_duration_unit,
      sp.membership_duration_count,
      sp.grace_period_days,
      sp.renewal_mode,
      sp.product_id,
      c.customer_reference,
      c.display_name,
      c.email,
      c.phone,
      m.membership_reference,
      m.status AS membership_status,
      m.starts_at AS membership_starts_at,
      m.ends_at AS membership_ends_at
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id=s.plan_id
    JOIN customers c ON c.id=s.customer_id
    JOIN memberships m ON m.id=s.membership_id
    WHERE s.id=?
    LIMIT 1
  `).bind(id).first();
}

async function listEvents(db,subscriptionId){
  const r=await db.prepare(`
    SELECT
      id,
      subscription_id,
      event_type,
      from_status,
      to_status,
      source,
      source_reference,
      notes,
      event_at
    FROM subscription_events
    WHERE subscription_id=?
    ORDER BY id
  `).bind(subscriptionId).all();

  return r.results || [];
}

async function handlePlansGet(db,url){
  const id=intId(url.searchParams.get("id"));

  if(id){
    const plan=await getPlan(db,id);
    if(!plan) return json({error:"Subscription plan not found."},404);
    return json({ok:true,plan});
  }

  const status=cleanText(url.searchParams.get("status"),30);

  const r=status
    ? await db.prepare(`
        SELECT
          sp.*,
          p.sku,
          p.name_en,
          p.name_zh,
          p.price,
          p.currency
        FROM subscription_plans sp
        JOIN products p ON p.id=sp.product_id
        WHERE sp.status=?
        ORDER BY sp.id DESC
      `).bind(status).all()
    : await db.prepare(`
        SELECT
          sp.*,
          p.sku,
          p.name_en,
          p.name_zh,
          p.price,
          p.currency
        FROM subscription_plans sp
        JOIN products p ON p.id=sp.product_id
        ORDER BY sp.id DESC
      `).all();

  return json({
    ok:true,
    plans:r.results || []
  });
}

async function handleSubscriptionsGet(db,url){
  const action=actionOf(url,null);

  if(action==="detail"){
    const id=intId(url.searchParams.get("id"));
    if(!id) return json({error:"Valid subscription id required."},400);

    const subscription=await getSubscription(db,id);
    if(!subscription) return json({error:"Subscription not found."},404);

    const events=await listEvents(db,id);

    const orders=await db.prepare(`
      SELECT
        so.*,
        o.order_reference,
        o.payment_status,
        o.total,
        o.currency
      FROM subscription_orders so
      JOIN orders o ON o.id=so.order_id
      WHERE so.subscription_id=?
      ORDER BY so.id
    `).bind(id).all();

    return json({
      ok:true,
      subscription,
      events,
      orders:orders.results || []
    });
  }

  if(action==="plans"){
    return handlePlansGet(db,url);
  }

  const customerId=intId(url.searchParams.get("customerId"));
  const membershipId=intId(url.searchParams.get("membershipId"));
  const status=cleanText(url.searchParams.get("status"),30);

  const where=[];
  const binds=[];

  if(customerId){
    where.push("s.customer_id=?");
    binds.push(customerId);
  }

  if(membershipId){
    where.push("s.membership_id=?");
    binds.push(membershipId);
  }

  if(status){
    where.push("s.status=?");
    binds.push(status);
  }

  const sql=`
    SELECT
      s.*,
      sp.plan_code,
      sp.product_id,
      c.customer_reference,
      c.display_name,
      m.membership_reference,
      m.status AS membership_status
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id=s.plan_id
    JOIN customers c ON c.id=s.customer_id
    JOIN memberships m ON m.id=s.membership_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY s.id DESC
    LIMIT 500
  `;

  const r=await db.prepare(sql).bind(...binds).all();

  return json({
    ok:true,
    subscriptions:r.results || []
  });
}

async function createPlan(db,b){
  const productId=intId(b.productId);
  const planCode=cleanText(b.planCode,64).toUpperCase();

  if(!productId) return json({error:"Valid productId required."},400);
  if(!/^[A-Z0-9_-]{2,64}$/.test(planCode)){
    return json({error:"Valid planCode required."},400);
  }

  const product=await db.prepare(`
    SELECT id,sku,product_type,status
    FROM products
    WHERE id=?
    LIMIT 1
  `).bind(productId).first();

  if(!product) return json({error:"Product not found."},404);

  if(String(product.product_type).toLowerCase()!=="membership"){
    return json({error:"Subscription plans require a membership product."},409);
  }

  if(String(product.status)!=="Active"){
    return json({error:"Membership product must be Active."},409);
  }

  const status=cleanText(b.status || "Draft",20);

  if(!["Draft","Active"].includes(status)){
    return json({error:"Plan status must be Draft or Active."},400);
  }

  const billingUnit=cleanText(b.billingIntervalUnit || "Year",20);
  const billingCount=Number(b.billingIntervalCount ?? 1);

  const durationUnit=cleanText(b.membershipDurationUnit || "Year",20);
  const durationCount=Number(b.membershipDurationCount ?? 1);

  const graceDays=Number(b.gracePeriodDays ?? 0);

  const renewalMode=cleanText(b.renewalMode || "Manual",20);

  if(!["Day","Month","Year"].includes(billingUnit)){
    return json({error:"Invalid billingIntervalUnit."},400);
  }

  if(!Number.isInteger(billingCount) || billingCount<1){
    return json({error:"billingIntervalCount must be a positive integer."},400);
  }

  if(!["Day","Month","Year"].includes(durationUnit)){
    return json({error:"Invalid membershipDurationUnit."},400);
  }

  if(!Number.isInteger(durationCount) || durationCount<1){
    return json({error:"membershipDurationCount must be a positive integer."},400);
  }

  if(!Number.isInteger(graceDays) || graceDays<0){
    return json({error:"gracePeriodDays must be zero or greater."},400);
  }

  if(renewalMode!=="Manual"){
    return json({
      error:"Automatic renewal is not enabled in Phase B3A. Use Manual."
    },409);
  }

  const dup=await db.prepare(`
    SELECT id
    FROM subscription_plans
    WHERE plan_code=?
    LIMIT 1
  `).bind(planCode).first();

  if(dup){
    return json({error:"planCode already exists."},409);
  }

  const planReference=ref("QYSP");

  const inserted=await db.prepare(`
    INSERT INTO subscription_plans(
      plan_reference,
      product_id,
      plan_code,
      status,
      billing_interval_unit,
      billing_interval_count,
      membership_duration_unit,
      membership_duration_count,
      grace_period_days,
      renewal_mode,
      notes,
      created_at,
      updated_at
    )
    VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(
    planReference,
    productId,
    planCode,
    status,
    billingUnit,
    billingCount,
    durationUnit,
    durationCount,
    graceDays,
    "Manual",
    cleanText(b.notes,1000)
  ).run();

  const id=Number(inserted.meta?.last_row_id || 0);
  const plan=await getPlan(db,id);

  return json({
    ok:true,
    created:true,
    plan
  },201);
}

async function createSubscription(db,b){
  const customerId=intId(b.customerId);
  const planId=intId(b.planId);
  const membershipId=intId(b.membershipId);

  if(!customerId || !planId || !membershipId){
    return json({
      error:"customerId, planId and membershipId are required."
    },400);
  }

  if(bool01(b.autoRenew)){
    return json({
      error:"Automatic renewal is not enabled in Phase B3A."
    },409);
  }

  const customer=await db.prepare(`
    SELECT id,status
    FROM customers
    WHERE id=?
    LIMIT 1
  `).bind(customerId).first();

  if(!customer) return json({error:"Customer not found."},404);

  if(String(customer.status)!=="Active"){
    return json({error:"Customer must be Active."},409);
  }

  const plan=await getPlan(db,planId);

  if(!plan) return json({error:"Subscription plan not found."},404);

  if(String(plan.status)!=="Active"){
    return json({error:"Subscription plan must be Active."},409);
  }

  if(String(plan.renewal_mode)!=="Manual"){
    return json({error:"Only Manual plans are supported in Phase B3A."},409);
  }

  const membership=await db.prepare(`
    SELECT id,customer_id,product_id,status
    FROM memberships
    WHERE id=?
    LIMIT 1
  `).bind(membershipId).first();

  if(!membership) return json({error:"Membership not found."},404);

  if(Number(membership.customer_id)!==customerId){
    return json({
      error:"Membership does not belong to the supplied customer."
    },409);
  }

  if(Number(membership.product_id)!==Number(plan.product_id)){
    return json({
      error:"Subscription plan product does not match membership product."
    },409);
  }

  const existing=await db.prepare(`
    SELECT id,status
    FROM subscriptions
    WHERE membership_id=?
      AND status IN ('Pending','Active','PastDue','Paused')
    LIMIT 1
  `).bind(membershipId).first();

  if(existing){
    return json({
      error:"A current subscription already exists for this membership.",
      subscriptionId:Number(existing.id),
      status:existing.status
    },409);
  }

  const subscriptionReference=ref("QYS");

  const start=cleanText(b.currentPeriodStart,40);
  const end=cleanText(b.currentPeriodEnd,40);
  const nextRenewal=cleanText(b.nextRenewalAt,40);
  const graceEnds=cleanText(b.graceEndsAt,40);

  const result=await db.prepare(`
    INSERT INTO subscriptions(
      subscription_reference,
      customer_id,
      plan_id,
      membership_id,
      status,
      current_period_start,
      current_period_end,
      next_renewal_at,
      grace_ends_at,
      auto_renew,
      cancel_at_period_end,
      source,
      notes,
      created_at,
      updated_at
    )
    VALUES(
      ?,?,?,?,
      'Pending',
      ?,?,?,?,
      0,
      0,
      ?,?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `).bind(
    subscriptionReference,
    customerId,
    planId,
    membershipId,
    start,
    end,
    nextRenewal,
    graceEnds,
    cleanText(b.source || "Admin",100),
    cleanText(b.notes,1000)
  ).run();

  const id=Number(result.meta?.last_row_id || 0);

  await db.prepare(`
    INSERT INTO subscription_events(
      subscription_id,
      event_type,
      from_status,
      to_status,
      source,
      source_reference,
      notes,
      event_at
    )
    VALUES(
      ?,
      'created',
      '',
      'Pending',
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP
    )
  `).bind(
    id,
    cleanText(b.source || "Admin",100),
    subscriptionReference,
    cleanText(b.notes,1000)
  ).run();

  const subscription=await getSubscription(db,id);

  return json({
    ok:true,
    created:true,
    subscription
  },201);
}

function validTransition(from,to){
  const map={
    Pending:["Active","Cancelled"],
    Active:["PastDue","Paused","Cancelled","Expired"],
    PastDue:["Active","Paused","Cancelled","Expired"],
    Paused:["Active","Cancelled","Expired"],
    Cancelled:[],
    Expired:[]
  };

  return (map[from] || []).includes(to);
}

function eventForTransition(from,to){
  if(to==="Active" && from==="Pending") return "activated";
  if(to==="Active" && from==="Paused") return "resumed";
  if(to==="Active" && from==="PastDue") return "updated";
  if(to==="PastDue") return "past_due";
  if(to==="Paused") return "paused";
  if(to==="Cancelled") return "cancelled";
  if(to==="Expired") return "expired";
  return "updated";
}

async function changeStatus(db,b){
  const id=intId(b.id);
  const target=cleanText(b.status,30);

  if(!id) return json({error:"Valid subscription id required."},400);

  if(![
    "Pending",
    "Active",
    "PastDue",
    "Paused",
    "Cancelled",
    "Expired"
  ].includes(target)){
    return json({error:"Invalid subscription status."},400);
  }

  const current=await db.prepare(`
    SELECT *
    FROM subscriptions
    WHERE id=?
    LIMIT 1
  `).bind(id).first();

  if(!current) return json({error:"Subscription not found."},404);

  const from=String(current.status);

  if(from===target){
    return json({
      ok:true,
      changed:false,
      idempotent:true,
      subscription:await getSubscription(db,id)
    });
  }

  if(!validTransition(from,target)){
    return json({
      error:`Invalid subscription transition ${from} -> ${target}.`
    },409);
  }

  const eventType=eventForTransition(from,target);

  const cancelledAt =
    target==="Cancelled" ? new Date().toISOString() : String(current.cancelled_at || "");

  const pausedAt =
    target==="Paused"
      ? new Date().toISOString()
      : target==="Active"
        ? ""
        : String(current.paused_at || "");

  const expiredAt =
    target==="Expired" ? new Date().toISOString() : String(current.expired_at || "");

  await db.batch([
    db.prepare(`
      UPDATE subscriptions
      SET
        status=?,
        cancelled_at=?,
        paused_at=?,
        expired_at=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      target,
      cancelledAt,
      pausedAt,
      expiredAt,
      id
    ),

    db.prepare(`
      INSERT INTO subscription_events(
        subscription_id,
        event_type,
        from_status,
        to_status,
        source,
        source_reference,
        notes,
        event_at
      )
      VALUES(
        ?,?,?,?,?,?,?,CURRENT_TIMESTAMP
      )
    `).bind(
      id,
      eventType,
      from,
      target,
      cleanText(b.source || "Admin",100),
      cleanText(b.sourceReference,200),
      cleanText(b.notes,1000)
    )
  ]);

  return json({
    ok:true,
    changed:true,
    subscription:await getSubscription(db,id)
  });
}

async function scheduleCancel(db,b){
  const id=intId(b.id);

  if(!id) return json({error:"Valid subscription id required."},400);

  const current=await db.prepare(`
    SELECT *
    FROM subscriptions
    WHERE id=?
    LIMIT 1
  `).bind(id).first();

  if(!current) return json({error:"Subscription not found."},404);

  if(!["Pending","Active","PastDue","Paused"].includes(String(current.status))){
    return json({
      error:"Cancellation at period end cannot be scheduled for a terminal subscription."
    },409);
  }

  if(Number(current.cancel_at_period_end)===1){
    return json({
      ok:true,
      changed:false,
      idempotent:true,
      subscription:await getSubscription(db,id)
    });
  }

  await db.batch([
    db.prepare(`
      UPDATE subscriptions
      SET
        cancel_at_period_end=1,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(id),

    db.prepare(`
      INSERT INTO subscription_events(
        subscription_id,
        event_type,
        from_status,
        to_status,
        source,
        source_reference,
        notes,
        event_at
      )
      VALUES(
        ?,
        'cancel_scheduled',
        ?,
        ?,
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP
      )
    `).bind(
      id,
      String(current.status),
      String(current.status),
      cleanText(b.source || "Admin",100),
      cleanText(b.sourceReference,200),
      cleanText(b.notes,1000)
    )
  ]);

  return json({
    ok:true,
    changed:true,
    subscription:await getSubscription(db,id)
  });
}

export async function onRequestGet(context){
  if(!authorized(context.request,context.env)){
    return json({error:"Unauthorized."},401);
  }

  const db=dbOf(context.env);
  if(!db) return json({error:"Database unavailable."},503);

  try{
    await ensureFoundation(db);
    return await handleSubscriptionsGet(
      db,
      new URL(context.request.url)
    );
  }catch(e){
    console.error("subscriptions GET",e);
    return json({error:"Subscription service failed."},500);
  }
}

export async function onRequestPost(context){
  if(!authorized(context.request,context.env)){
    return json({error:"Unauthorized."},401);
  }

  const db=dbOf(context.env);
  if(!db) return json({error:"Database unavailable."},503);

  let body={};

  try{
    body=await context.request.json();
  }catch{
    return json({error:"Valid JSON body required."},400);
  }

  const url=new URL(context.request.url);
  const action=actionOf(url,body);

  try{
    await ensureFoundation(db);

    if(action==="create-plan"){
      return await createPlan(db,body);
    }

    if(action==="create"){
      return await createSubscription(db,body);
    }

    if(action==="status"){
      return await changeStatus(db,body);
    }

    if(action==="cancel-at-period-end"){
      return await scheduleCancel(db,body);
    }

    return json({
      error:"Unsupported action.",
      supported:[
        "create-plan",
        "create",
        "status",
        "cancel-at-period-end"
      ]
    },400);

  }catch(e){
    console.error("subscriptions POST",e);

    const msg=String(e?.message || "");

    if(
      msg.includes("UNIQUE constraint failed") ||
      msg.includes("constraint failed")
    ){
      return json({error:"Subscription constraint conflict."},409);
    }

    return json({error:"Subscription service failed."},500);
  }
}