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

function intId(v){
  const n=Number(v);
  return Number.isInteger(n) && n>0 ? n : 0;
}

function clean(v,max=1000){
  return String(v ?? "").trim().slice(0,max);
}

function parseDate(v){
  const s=clean(v,80);
  if(!s) return null;

  const d=new Date(s);

  return Number.isFinite(d.getTime())
    ? d
    : null;
}

function isoLike(original,date){
  const src=clean(original,80);

  if(/^\d{4}-\d{2}-\d{2}$/.test(src)){
    return date.toISOString().slice(0,10);
  }

  return date.toISOString();
}

function daysInUtcMonth(year,month){
  return new Date(Date.UTC(year,month+1,0)).getUTCDate();
}

function addInterval(value,unit,count){
  const d=parseDate(value);

  if(!d){
    throw new Error("VALIDATION: Invalid renewal base date.");
  }

  const n=Number(count);

  if(!Number.isInteger(n) || n<1){
    throw new Error("VALIDATION: Invalid renewal duration.");
  }

  const result=new Date(d.getTime());

  if(unit==="Day"){
    result.setUTCDate(result.getUTCDate()+n);
    return isoLike(value,result);
  }

  if(unit==="Month"){
    const originalDay=result.getUTCDate();

    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth()+n);

    const maxDay=daysInUtcMonth(
      result.getUTCFullYear(),
      result.getUTCMonth()
    );

    result.setUTCDate(
      Math.min(originalDay,maxDay)
    );

    return isoLike(value,result);
  }

  if(unit==="Year"){
    const originalMonth=result.getUTCMonth();
    const originalDay=result.getUTCDate();

    result.setUTCDate(1);
    result.setUTCFullYear(
      result.getUTCFullYear()+n
    );
    result.setUTCMonth(originalMonth);

    const maxDay=daysInUtcMonth(
      result.getUTCFullYear(),
      originalMonth
    );

    result.setUTCDate(
      Math.min(originalDay,maxDay)
    );

    return isoLike(value,result);
  }

  throw new Error("VALIDATION: Unsupported membership duration unit.");
}

function addDays(value,days){
  const d=parseDate(value);

  if(!d){
    throw new Error("VALIDATION: Invalid grace-period base date.");
  }

  d.setUTCDate(
    d.getUTCDate()+Number(days || 0)
  );

  return isoLike(value,d);
}

async function loadRenewalState(db,orderId){
  return db.prepare(`
    SELECT
      so.id AS subscription_order_id,
      so.subscription_id,
      so.order_id,
      so.order_type,
      so.period_start AS linked_period_start,
      so.period_end AS linked_period_end,

      s.subscription_reference,
      s.customer_id,
      s.plan_id,
      s.membership_id,
      s.status AS subscription_status,
      s.current_period_start,
      s.current_period_end,
      s.next_renewal_at,
      s.grace_ends_at,
      s.auto_renew,
      s.cancel_at_period_end,

      sp.product_id,
      sp.status AS plan_status,
      sp.membership_duration_unit,
      sp.membership_duration_count,
      sp.grace_period_days,
      sp.renewal_mode,

      m.membership_reference,
      m.customer_id AS membership_customer_id,
      m.product_id AS membership_product_id,
      m.status AS membership_status,
      m.starts_at AS membership_starts_at,
      m.ends_at AS membership_ends_at,
      m.source_order_id,

      o.order_reference,
      o.payment_status,
      o.total,
      o.currency

    FROM subscription_orders so

    JOIN subscriptions s
      ON s.id=so.subscription_id

    JOIN subscription_plans sp
      ON sp.id=s.plan_id

    JOIN memberships m
      ON m.id=s.membership_id

    JOIN orders o
      ON o.id=so.order_id

    WHERE so.order_id=?
    LIMIT 1
  `).bind(orderId).first();
}

async function verifiedPaidAmount(db,orderId){
  const row=await db.prepare(`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN status IN ('Paid','External')
             AND verification_status='Verified'
            THEN COALESCE(
              NULLIF(gross_amount,0),
              amount,
              0
            )
            ELSE 0
          END
        ),
        0
      ) AS verified_paid
    FROM payments
    WHERE order_id=?
  `).bind(orderId).first();

  return Number(row?.verified_paid || 0);
}

async function validateOrderItems(db,state){
  const row=await db.prepare(`
    SELECT
      COUNT(*) AS row_count,
      COALESCE(SUM(quantity),0) AS total_quantity,
      COALESCE(
        SUM(
          CASE
            WHEN product_id=? THEN quantity
            ELSE 0
          END
        ),
        0
      ) AS matching_quantity
    FROM order_items
    WHERE order_id=?
  `).bind(
    state.product_id,
    state.order_id
  ).first();

  if(Number(row?.row_count || 0)!==1){
    throw new Error(
      "VALIDATION: Renewal order must contain exactly one order item."
    );
  }

  if(Number(row?.total_quantity || 0)!==1){
    throw new Error(
      "VALIDATION: Renewal order quantity must be exactly one."
    );
  }

  if(Number(row?.matching_quantity || 0)!==1){
    throw new Error(
      "VALIDATION: Renewal order product does not match subscription plan."
    );
  }
}

async function alreadyProcessed(db,state){
  const ref=`RenewalOrder:${state.order_id}`;

  const row=await db.prepare(`
    SELECT id
    FROM subscription_events
    WHERE subscription_id=?
      AND event_type='renewed'
      AND source_reference=?
    LIMIT 1
  `).bind(
    state.subscription_id,
    ref
  ).first();

  return !!row;
}

export async function processVerifiedSubscriptionRenewal(
  db,
  orderId
){
  const id=intId(orderId);

  if(!id){
    return {
      ok:false,
      handled:false,
      reason:"invalid_order_id"
    };
  }

  const state=await loadRenewalState(db,id);

  if(!state){
    return {
      ok:true,
      handled:false,
      reason:"not_subscription_order"
    };
  }

  if(state.order_type!=="Renewal"){
    return {
      ok:true,
      handled:false,
      reason:"not_renewal_order",
      subscription_id:
        Number(state.subscription_id)
    };
  }

  if(await alreadyProcessed(db,state)){
    return {
      ok:true,
      handled:true,
      renewed:true,
      idempotent:true,
      subscription_id:
        Number(state.subscription_id),
      membership_id:
        Number(state.membership_id),
      order_id:id
    };
  }

  if(state.plan_status!=="Active"){
    throw new Error(
      "VALIDATION: Subscription plan must be Active."
    );
  }

  if(state.renewal_mode!=="Manual"){
    throw new Error(
      "VALIDATION: Only Manual renewal is supported."
    );
  }

  if(!["Active","PastDue"].includes(state.subscription_status)){
    throw new Error(
      `VALIDATION: Subscription status ${state.subscription_status} cannot be renewed automatically.`
    );
  }

  if(!["Active","Expired"].includes(state.membership_status)){
    throw new Error(
      `VALIDATION: Membership status ${state.membership_status} cannot be renewed.`
    );
  }

  if(
    Number(state.customer_id)!==
    Number(state.membership_customer_id)
  ){
    throw new Error(
      "VALIDATION: Subscription customer does not match membership customer."
    );
  }

  if(
    Number(state.product_id)!==
    Number(state.membership_product_id)
  ){
    throw new Error(
      "VALIDATION: Subscription product does not match membership product."
    );
  }

  if(state.payment_status!=="Paid"){
    throw new Error(
      "VALIDATION: Renewal order is not Paid."
    );
  }

  await validateOrderItems(db,state);

  const paid=await verifiedPaidAmount(
    db,
    id
  );

  const required=Number(state.total || 0);

  if(paid + 0.005 < required){
    throw new Error(
      "VALIDATION: Renewal order is not fully verified paid."
    );
  }

  const baseEnd=
    clean(state.membership_ends_at,80) ||
    clean(state.current_period_end,80);

  if(!baseEnd){
    throw new Error(
      "VALIDATION: Renewal requires an existing membership/subscription end date."
    );
  }

  const newEnd=addInterval(
    baseEnd,
    clean(state.membership_duration_unit,20),
    Number(state.membership_duration_count)
  );

  const graceEnds=
    Number(state.grace_period_days || 0)>0
      ? addDays(
          newEnd,
          Number(state.grace_period_days)
        )
      : "";

  const renewalRef=
    `RenewalOrder:${id}`;

  const membershipFrom=
    clean(state.membership_status,30);

  const subscriptionFrom=
    clean(state.subscription_status,30);

  await db.batch([

    db.prepare(`
      UPDATE memberships
      SET
        status='Active',
        ends_at=?,
        expired_at='',
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      newEnd,
      state.membership_id
    ),

    db.prepare(`
      UPDATE subscriptions
      SET
        status='Active',
        current_period_start=?,
        current_period_end=?,
        next_renewal_at=?,
        grace_ends_at=?,
        cancel_at_period_end=0,
        cancelled_at='',
        expired_at='',
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      baseEnd,
      newEnd,
      newEnd,
      graceEnds,
      state.subscription_id
    ),

    db.prepare(`
      UPDATE subscription_orders
      SET
        period_start=?,
        period_end=?
      WHERE id=?
    `).bind(
      baseEnd,
      newEnd,
      state.subscription_order_id
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
        ?,
        'Active',
        'SubscriptionRenewal',
        ?,
        ?,
        CURRENT_TIMESTAMP
      )
    `).bind(
      state.membership_id,
      membershipFrom,
      renewalRef,
      `Verified renewal order ${state.order_reference}`
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
        ?,
        'Active',
        'SubscriptionRenewal',
        ?,
        ?,
        CURRENT_TIMESTAMP
      )
    `).bind(
      state.subscription_id,
      subscriptionFrom,
      renewalRef,
      `Verified renewal order ${state.order_reference}`
    )
  ]);

  return {
    ok:true,
    handled:true,
    renewed:true,
    idempotent:false,

    order_id:id,

    subscription_id:
      Number(state.subscription_id),

    membership_id:
      Number(state.membership_id),

    previous_membership_end:
      baseEnd,

    new_membership_end:
      newEnd,

    next_renewal_at:
      newEnd,

    grace_ends_at:
      graceEnds
  };
}


export async function onRequestPost(context){
  if(!authorized(context.request,context.env)){
    return json(
      {error:"Unauthorized."},
      401
    );
  }

  const db=dbOf(context.env);

  if(!db){
    return json(
      {error:"Database unavailable."},
      503
    );
  }

  let body={};

  try{
    body=await context.request.json();
  }catch{
    return json(
      {error:"Valid JSON body required."},
      400
    );
  }

  const action=
    clean(body.action,80).toLowerCase();

  if(action!=="process-order"){
    return json(
      {error:"Unsupported action."},
      400
    );
  }

  const orderId=intId(body.orderId);

  if(!orderId){
    return json(
      {error:"Valid orderId required."},
      400
    );
  }

  try{
    const result=
      await processVerifiedSubscriptionRenewal(
        db,
        orderId
      );

    return json({
      ok:true,
      renewal:result
    });

  }catch(e){
    console.error(
      "subscription renewal",
      e
    );

    const msg=String(
      e?.message || ""
    );

    if(msg.startsWith("VALIDATION:")){
      return json(
        {
          error:
            msg.replace(
              /^VALIDATION:\s*/,
              ""
            )
        },
        409
      );
    }

    return json(
      {error:"Subscription renewal failed."},
      500
    );
  }
}