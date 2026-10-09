import { lifecycleSnapshotGuard, lifecycleUpdateChanged } from "../../lib/subscription-lifecycle-concurrency.js";
import { validateRenewalOrder, renewalSnapshotGuard, isRenewalSnapshotConflict, RENEWAL_MAX_ATTEMPTS } from "../../lib/subscription-renewal-validation.js";
import { findRenewalCompletion } from "../../lib/subscription-renewal-completion.js";

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

  const guard=lifecycleSnapshotGuard(current);
  const results=await db.batch([
    db.prepare(`
      UPDATE subscriptions
      SET
        status=?,
        cancelled_at=?,
        paused_at=?,
        expired_at=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE ${guard.sql}
    `).bind(
      target,
      cancelledAt,
      pausedAt,
      expiredAt,
      ...guard.params
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
      SELECT ?,?,?,?,?,?,?,CURRENT_TIMESTAMP
      WHERE changes()=1
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

  if(!lifecycleUpdateChanged(results)){
    return json({error:"Subscription state changed. Refresh before retrying this lifecycle action."},409);
  }

  return json({
    ok:true,
    changed:true,
    subscription:await getSubscription(db,id)
  });
}


/* =========================================================
   v4.1 A6D MANUAL SUBSCRIPTION RENEWAL
   ========================================================= */

function parseIsoDateA6D(value){
  const text=cleanText(value,60);

  if(!text) return null;

  const date=new Date(text);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function daysInUtcMonthA6D(year,month){
  return new Date(
    Date.UTC(
      year,
      month+1,
      0
    )
  ).getUTCDate();
}

function addUtcIntervalA6D(date,unit,count){
  const source=
    new Date(date.getTime());

  if(unit==="Day"){
    source.setUTCDate(
      source.getUTCDate()+count
    );

    return source;
  }

  const originalDay=
    source.getUTCDate();

  if(unit==="Month"){
    const targetMonthIndex=
      source.getUTCMonth()+count;

    const targetYear=
      source.getUTCFullYear()+
      Math.floor(targetMonthIndex/12);

    const targetMonth=
      (
        (targetMonthIndex%12)+12
      )%12;

    const targetDay=
      Math.min(
        originalDay,
        daysInUtcMonthA6D(
          targetYear,
          targetMonth
        )
      );

    source.setUTCFullYear(
      targetYear,
      targetMonth,
      targetDay
    );

    return source;
  }

  if(unit==="Year"){
    const targetYear=
      source.getUTCFullYear()+count;

    const targetMonth=
      source.getUTCMonth();

    const targetDay=
      Math.min(
        originalDay,
        daysInUtcMonthA6D(
          targetYear,
          targetMonth
        )
      );

    source.setUTCFullYear(
      targetYear,
      targetMonth,
      targetDay
    );

    return source;
  }

  throw new Error(
    "Unsupported interval unit."
  );
}

function addUtcDaysA6D(date,days){
  const result=new Date(date.getTime());

  result.setUTCDate(
    result.getUTCDate()+days
  );

  return result;
}

async function manualCompletionResponse(db,id,orderId){
  const link=await db.prepare(`SELECT * FROM subscription_orders WHERE order_id=?`).bind(orderId).first();
  return json({ok:true,changed:false,idempotent:true,
    subscription:await getSubscription(db,id),
    renewalOrder:{id:Number(link?.id || 0),orderId:Number(orderId),
      periodStart:String(link?.period_start || ""),periodEnd:String(link?.period_end || "")}});
}

async function renewSubscription(db,b){
  for(let attempt=0;attempt<RENEWAL_MAX_ATTEMPTS;attempt++){
    try{ return await renewSubscriptionAttempt(db,b); }
    catch(error){
      // The attempt checks completion before propagating a conflict.
      if(!isRenewalSnapshotConflict(error)) throw error;
    }
  }
  return json({error:"Renewal state changed repeatedly. Retry this order."},409);
}

async function renewSubscriptionAttempt(db,b){
  const id=intId(b.id);
  const orderId=intId(b.orderId);

  if(!id){
    return json({
      error:"Valid subscription id required."
    },400);
  }

  if(!orderId){
    return json({
      error:"Valid renewal order id required."
    },400);
  }

  const subscription=
    await getSubscription(db,id);

  if(!subscription){
    return json({
      error:"Subscription not found."
    },404);
  }

  const completion=await findRenewalCompletion(db,orderId,id,subscription.membership_id);
  if(completion.completed) return manualCompletionResponse(db,id,orderId);

  if(String(subscription.status)!=="Active"){
    return json({
      error:"Only an Active subscription can be renewed."
    },409);
  }

  if(String(subscription.renewal_mode)!=="Manual"){
    return json({
      error:"Only Manual subscription plans can be renewed."
    },409);
  }

  const customer=
    await db.prepare(`
      SELECT id,status
      FROM customers
      WHERE id=?
      LIMIT 1
    `).bind(
      Number(subscription.customer_id)
    ).first();

  if(!customer){
    return json({
      error:"Customer not found."
    },404);
  }

  if(String(customer.status)!=="Active"){
    return json({
      error:"Customer must be Active."
    },409);
  }

  const plan=
    await getPlan(
      db,
      Number(subscription.plan_id)
    );

  if(!plan){
    return json({
      error:"Subscription plan not found."
    },404);
  }

  if(String(plan.status)!=="Active"){
    return json({
      error:"Subscription plan must be Active."
    },409);
  }

  if(String(plan.renewal_mode)!=="Manual"){
    return json({
      error:"Subscription plan must use Manual renewal."
    },409);
  }

  const billingUnit=
    cleanText(
      plan.billing_interval_unit,
      20
    );

  const billingCount=
    Number(
      plan.billing_interval_count
    );

  const graceDays=
    Number(
      plan.grace_period_days || 0
    );

  const membershipDurationUnit=
    cleanText(
      plan.membership_duration_unit,
      20
    );

  const membershipDurationCount=
    Number(
      plan.membership_duration_count
    );

  if(
    !["Day","Month","Year"].includes(
      billingUnit
    )
  ){
    return json({
      error:"Subscription plan billing interval is invalid."
    },409);
  }

  if(
    !Number.isInteger(billingCount) ||
    billingCount<1
  ){
    return json({
      error:"Subscription plan billing interval count is invalid."
    },409);
  }

  if(
    !Number.isInteger(graceDays) ||
    graceDays<0
  ){
    return json({
      error:"Subscription plan grace period is invalid."
    },409);
  }

  if(
    !["Day","Month","Year"].includes(
      membershipDurationUnit
    )
  ){
    return json({
      error:"Subscription plan membership duration unit is invalid."
    },409);
  }

  if(
    !Number.isInteger(
      membershipDurationCount
    ) ||
    membershipDurationCount<1
  ){
    return json({
      error:"Subscription plan membership duration count is invalid."
    },409);
  }

  const membership=
    await db.prepare(`
      SELECT *
      FROM memberships
      WHERE id=?
      LIMIT 1
    `).bind(
      Number(subscription.membership_id)
    ).first();

  if(!membership){
    return json({
      error:"Membership not found."
    },404);
  }

  if(
    Number(membership.customer_id)!==
    Number(subscription.customer_id)
  ){
    return json({
      error:"Subscription membership belongs to a different customer."
    },409);
  }

  if(
    Number(membership.product_id)!==
    Number(plan.product_id)
  ){
    return json({
      error:"Subscription membership product does not match plan product."
    },409);
  }

  if(String(membership.status)!=="Active"){
    return json({
      error:"Membership must be Active for renewal."
    },409);
  }

  const existingLink=
    await db.prepare(`
      SELECT
        id,
        subscription_id,
        order_id,
        order_type,
        period_start,
        period_end
      FROM subscription_orders
      WHERE order_id=?
      LIMIT 1
    `).bind(orderId).first();

  if(existingLink){
    if(Number(existingLink.subscription_id)===id && existingLink.order_type==="Renewal"){
      // Another request may have completed renewal after our first completion read.
      const latest=await findRenewalCompletion(db,orderId,id,subscription.membership_id);
      if(latest.completed) return manualCompletionResponse(db,id,orderId);
    }
    return json({error:Number(existingLink.subscription_id)===id && existingLink.order_type==="Renewal"
      ? "Renewal order is linked but has no recognized completion. Use the verified-order renewal engine."
      : "Order is already linked to another subscription operation."},409);
  }

  const order=
    await db.prepare(`
      SELECT
        id,
        order_reference,
        payment_status,
        total,
        currency
      FROM orders
      WHERE id=?
      LIMIT 1
    `).bind(orderId).first();

  if(!order){
    return json({
      error:"Renewal order not found."
    },404);
  }

  if(String(order.payment_status)!=="Paid"){
    return json({
      error:"Renewal order must be Paid."
    },409);
  }

  const evidence=await validateRenewalOrder(db,order,subscription.customer_id);
  if(!evidence.eligible) return json({error:evidence.reason},409);

  const matchingItem=
    await db.prepare(`
      SELECT
        id,
        product_id,
        quantity
      FROM order_items
      WHERE order_id=?
        AND product_id=?
        AND quantity>0
      LIMIT 1
    `).bind(
      orderId,
      Number(plan.product_id)
    ).first();

  if(!matchingItem){
    return json({
      error:"Renewal order does not contain the subscription membership product."
    },409);
  }

  const currentEnd=
    parseIsoDateA6D(
      subscription.current_period_end
    );

  if(!currentEnd){
    return json({
      error:"Subscription current period end is required for renewal."
    },409);
  }

  const newPeriodStart=
    new Date(
      currentEnd.getTime()
    );

  const newPeriodEnd=
    addUtcIntervalA6D(
      newPeriodStart,
      billingUnit,
      billingCount
    );

  const graceEnd=
    addUtcDaysA6D(
      newPeriodEnd,
      graceDays
    );

  const periodStartIso=
    newPeriodStart.toISOString();

  const periodEndIso=
    newPeriodEnd.toISOString();

  const graceEndIso=
    graceEnd.toISOString();

  const existingMembershipEnd=
    parseIsoDateA6D(
      membership.ends_at
    );

  /*
    Membership entitlement duration is independent
    from the subscription billing interval.

    Extend from the later of:
      - current membership end
      - current subscription period end
  */

  const membershipBase=
    existingMembershipEnd &&
    existingMembershipEnd.getTime()>
      currentEnd.getTime()
      ? existingMembershipEnd
      : currentEnd;

  const calculatedMembershipEnd=
    addUtcIntervalA6D(
      membershipBase,
      membershipDurationUnit,
      membershipDurationCount
    );

  const membershipEndIso=
    calculatedMembershipEnd.toISOString();

  const source=
    cleanText(
      b.source ||
      "SubscriptionRenewal",
      100
    );

  const sourceReference=
    cleanText(
      b.sourceReference ||
      `RenewalOrder:${orderId}`,
      200
    );

  const notes=
    cleanText(
      b.notes ||
      `Verified renewal order ${order.order_reference}`,
      1000
    );

  const guard=renewalSnapshotGuard(subscription,membership,plan);

  try{
  await db.batch([
    db.prepare(`
      INSERT INTO subscription_renewal_executions(
        order_id,subscription_id,membership_id,order_reference,
        previous_membership_end,period_start,new_membership_end,completed_at
      ) VALUES(?,?,?,?,CASE WHEN ${guard.sql} THEN ? ELSE NULL END,?,?,CURRENT_TIMESTAMP)
    `).bind(orderId,id,subscription.membership_id,order.order_reference,
      ...guard.params,String(membership.ends_at || ""),periodStartIso,membershipEndIso),

    db.prepare(`
      INSERT INTO subscription_orders(
        subscription_id,
        order_id,
        order_type,
        period_start,
        period_end,
        linked_at,
        notes
      )
      VALUES(
        ?,?,
        'Renewal',
        ?,?,
        CURRENT_TIMESTAMP,
        ?
      )
    `).bind(
      id,
      orderId,
      periodStartIso,
      periodEndIso,
      notes
    ),

    db.prepare(`
      UPDATE subscriptions
      SET
        current_period_start=?,
        current_period_end=?,
        next_renewal_at=?,
        grace_ends_at=?,
        cancel_at_period_end=0,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      periodStartIso,
      periodEndIso,
      periodEndIso,
      graceEndIso,
      id
    ),

    db.prepare(`
      UPDATE memberships
      SET
        ends_at=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      membershipEndIso,
      Number(subscription.membership_id)
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
        ?,
        'renewed',
        'Active',
        'Active',
        ?,?,?,
        CURRENT_TIMESTAMP
      )
    `).bind(
      id,
      source,
      sourceReference,
      notes
    ),

    db.prepare(`
      INSERT INTO membership_events(
        membership_id,
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
        'renewed',
        'Active',
        'Active',
        ?,?,?,
        CURRENT_TIMESTAMP
      )
    `).bind(
      Number(subscription.membership_id),
      source,
      sourceReference,
      notes
    )

  ]);

  }catch(error){
    // D1 rolls back the entire batch on a duplicate ledger/link collision.
    const after=await findRenewalCompletion(db,orderId,id,subscription.membership_id);
    if(after.completed) return manualCompletionResponse(db,id,orderId);
    throw error;
  }

  return json({
    ok:true,
    changed:true,
    renewed:true,

    order:{
      id:Number(order.id),
      orderReference:
        String(order.order_reference || ""),
      paymentStatus:
        String(order.payment_status || "")
    },

    period:{
      start:periodStartIso,
      end:periodEndIso,
      graceEndsAt:graceEndIso
    },

    membership:{
      id:Number(subscription.membership_id),
      endsAt:membershipEndIso
    },

    subscription:
      await getSubscription(db,id)
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

  const guard=lifecycleSnapshotGuard(current);
  const results=await db.batch([
    db.prepare(`
      UPDATE subscriptions
      SET
        cancel_at_period_end=1,
        updated_at=CURRENT_TIMESTAMP
      WHERE ${guard.sql}
    `).bind(...guard.params),

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
      SELECT
        ?,
        'cancel_scheduled',
        ?,
        ?,
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP
      WHERE changes()=1
    `).bind(
      id,
      String(current.status),
      String(current.status),
      cleanText(b.source || "Admin",100),
      cleanText(b.sourceReference,200),
      cleanText(b.notes,1000)
    )
  ]);

  if(!lifecycleUpdateChanged(results)){
    return json({error:"Subscription state changed. Refresh before retrying this lifecycle action."},409);
  }

  return json({
    ok:true,
    changed:true,
    subscription:await getSubscription(db,id)
  });
}

/* =========================================================
   v4.1 A6E RENEWAL PREVIEW
   READ ONLY — NO SUBSCRIPTION / ORDER / PAYMENT MUTATION
   ========================================================= */

async function previewRenewalA6E(db,url){
  const subscriptionId=intId(
    url.searchParams.get("id") ||
    url.searchParams.get("subscriptionId")
  );

  const orderId=intId(
    url.searchParams.get("orderId")
  );

  if(!subscriptionId){
    return json({
      error:"Valid subscription id required."
    },400);
  }

  if(!orderId){
    return json({
      error:"Valid renewal order id required."
    },400);
  }

  const subscription=
    await getSubscription(
      db,
      subscriptionId
    );

  if(!subscription){
    return json({
      error:"Subscription not found."
    },404);
  }

  const planState=
    await db.prepare(`
      SELECT
        id,
        status,
        renewal_mode,
        product_id
      FROM subscription_plans
      WHERE id=?
      LIMIT 1
    `).bind(
      subscription.plan_id
    ).first();

  const customerState=
    await db.prepare(`
      SELECT
        id,
        customer_reference,
        display_name,
        email,
        status
      FROM customers
      WHERE id=?
      LIMIT 1
    `).bind(
      subscription.customer_id
    ).first();

  const membership=
    await db.prepare(`
      SELECT
        id,
        membership_reference,
        customer_id,
        product_id,
        status,
        starts_at,
        ends_at
      FROM memberships
      WHERE id=?
      LIMIT 1
    `).bind(
      subscription.membership_id
    ).first();

  const order=
    await db.prepare(`
      SELECT
        id,
        order_reference,
        payment_status,
        customer_name,
        customer_email,
        customer_phone,
        currency,
        total,
        created_at
      FROM orders
      WHERE id=?
      LIMIT 1
    `).bind(
      orderId
    ).first();

  if(!order){
    return json({
      error:"Renewal order not found."
    },404);
  }

  const matchingItem=
    await db.prepare(`
      SELECT
        id,
        order_id,
        product_id,
        quantity,
        unit_price,
        line_total
      FROM order_items
      WHERE order_id=?
        AND product_id=?
        AND quantity>0
      ORDER BY id
      LIMIT 1
    `).bind(
      orderId,
      subscription.product_id
    ).first();

  const existingLink=
    await db.prepare(`
      SELECT
        id,
        subscription_id,
        order_id,
        order_type,
        period_start,
        period_end,
        linked_at
      FROM subscription_orders
      WHERE order_id=?
      ORDER BY id
      LIMIT 1
    `).bind(
      orderId
    ).first();

  const result={
    ok:true,
    eligible:false,
    alreadyApplied:false,
    reason:"",
    subscription,
    customer:customerState || null,
    plan:planState || null,
    membership:membership || null,
    order,
    matchingOrderItem:matchingItem || null,
    existingOrderLink:existingLink || null,
    preview:null
  };

  const completion=await findRenewalCompletion(db,orderId,subscriptionId,subscription.membership_id);
  if(completion.completed){
    result.alreadyApplied=true;
    result.reason="This Paid order has already been applied to this subscription renewal.";
    return json(result);
  }

  if(subscription.status!=="Active"){
    result.reason=
      "Only an Active subscription can be renewed.";
    return json(result);
  }

  if(
    !planState ||
    planState.status!=="Active"
  ){
    result.reason=
      "Subscription plan must be Active.";
    return json(result);
  }

  if(planState.renewal_mode!=="Manual"){
    result.reason=
      "Only Manual subscription plans can be renewed.";
    return json(result);
  }

  if(
    !customerState ||
    customerState.status!=="Active"
  ){
    result.reason=
      "Customer must be Active for renewal.";
    return json(result);
  }

  if(!membership){
    result.reason=
      "Subscription membership not found.";
    return json(result);
  }

  if(
    Number(membership.customer_id)!==
    Number(subscription.customer_id)
  ){
    result.reason=
      "Membership customer does not match subscription.";
    return json(result);
  }

  if(
    Number(membership.product_id)!==
    Number(subscription.product_id)
  ){
    result.reason=
      "Membership product does not match subscription plan.";
    return json(result);
  }

  if(membership.status!=="Active"){
    result.reason=
      "Membership must be Active for renewal.";
    return json(result);
  }

  if(existingLink){
    result.reason=Number(existingLink.subscription_id)===Number(subscriptionId) && existingLink.order_type==="Renewal"
      ? "Renewal order is linked but has no recognized completion. Use the verified-order renewal engine."
      : "Order is already linked to another subscription operation.";
    return json(result);
  }

  if(order.payment_status!=="Paid"){
    result.reason=
      "Renewal order must be Paid.";
    return json(result);
  }

  const evidence=await validateRenewalOrder(db,order,subscription.customer_id);
  if(!evidence.eligible){ result.reason=evidence.reason; return json(result); }

  if(!matchingItem){
    result.reason=
      "Renewal order does not contain the subscription plan product.";
    return json(result);
  }

  const currentEnd=
    parseIsoDateA6D(
      subscription.current_period_end
    );

  if(!currentEnd){
    result.reason=
      "Subscription current period end is invalid.";
    return json(result);
  }

  const billingUnit=
    cleanText(
      subscription.billing_interval_unit,
      20
    );

  const billingCount=
    Number(
      subscription.billing_interval_count
    );

  const membershipUnit=
    cleanText(
      subscription.membership_duration_unit,
      20
    );

  const membershipCount=
    Number(
      subscription.membership_duration_count
    );

  const graceDays=
    Number(
      subscription.grace_period_days || 0
    );

  if(
    !billingUnit ||
    !Number.isInteger(billingCount) ||
    billingCount<1
  ){
    result.reason=
      "Subscription plan billing interval is invalid.";
    return json(result);
  }

  if(
    !membershipUnit ||
    !Number.isInteger(membershipCount) ||
    membershipCount<1
  ){
    result.reason=
      "Subscription plan membership duration is invalid.";
    return json(result);
  }

  if(
    !Number.isInteger(graceDays) ||
    graceDays<0
  ){
    result.reason=
      "Subscription plan grace period is invalid.";
    return json(result);
  }

  let newPeriodEnd;

  try{
    newPeriodEnd=
      addUtcIntervalA6D(
        currentEnd,
        billingUnit,
        billingCount
      );
  }
  catch{
    result.reason=
      "Subscription billing interval cannot be calculated.";
    return json(result);
  }

  const membershipEnd=
    parseIsoDateA6D(
      membership.ends_at
    );

  let membershipBase=
    currentEnd;

  if(
    membershipEnd &&
    membershipEnd.getTime() >
      membershipBase.getTime()
  ){
    membershipBase=
      membershipEnd;
  }

  let newMembershipEnd;

  try{
    newMembershipEnd=
      addUtcIntervalA6D(
        membershipBase,
        membershipUnit,
        membershipCount
      );
  }
  catch{
    result.reason=
      "Membership duration cannot be calculated.";
    return json(result);
  }

  const graceEnd=
    addUtcDaysA6D(
      newPeriodEnd,
      graceDays
    );

  result.eligible=true;
  result.reason="Eligible for manual renewal.";

  result.preview={
    currentPeriodEnd:
      currentEnd.toISOString(),

    newPeriodStart:
      currentEnd.toISOString(),

    newPeriodEnd:
      newPeriodEnd.toISOString(),

    currentMembershipEnd:
      membershipEnd
        ? membershipEnd.toISOString()
        : "",

    membershipExtensionBase:
      membershipBase.toISOString(),

    newMembershipEnd:
      newMembershipEnd.toISOString(),

    graceEndsAt:
      graceEnd.toISOString(),

    billingIntervalUnit:
      billingUnit,

    billingIntervalCount:
      billingCount,

    membershipDurationUnit:
      membershipUnit,

    membershipDurationCount:
      membershipCount,

    gracePeriodDays:
      graceDays
  };

  return json(result);
}

export async function onRequestGet(context){
  if(!authorized(context.request,context.env)){
    return json({error:"Unauthorized."},401);
  }

  const db=dbOf(context.env);
  if(!db) return json({error:"Database unavailable."},503);

  try{
    await ensureFoundation(db);

    const url=
      new URL(context.request.url);

    const action=
      cleanText(
        url.searchParams.get("action"),
        50
      ).toLowerCase();

    if(action==="renewal-preview"){
      return await previewRenewalA6E(
        db,
        url
      );
    }

    return await handleSubscriptionsGet(
      db,
      url
    );
  }catch(e){
    if(String(e?.message || "").startsWith("VALIDATION:")) return json({error:e.message.replace(/^VALIDATION:\s*/,"")},409);
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

    if(action==="renew"){
      return await renewSubscription(db,body);
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
        "renew",
        "cancel-at-period-end"
      ]
    },400);

  }catch(e){
    console.error("subscriptions POST",e);

    const msg=String(e?.message || "");
    if(msg.startsWith("VALIDATION:")) return json({error:msg.replace(/^VALIDATION:\s*/,"")},409);

    if(
      msg.includes("UNIQUE constraint failed") ||
      msg.includes("constraint failed")
    ){
      return json({error:"Subscription constraint conflict."},409);
    }

    return json({error:"Subscription service failed."},500);
  }
}