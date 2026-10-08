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
      s.cancelled_at,
      s.paused_at,
      s.expired_at,

      sp.product_id,
      sp.status AS plan_status,
      sp.membership_duration_unit,
      sp.membership_duration_count,
      sp.grace_period_days,
      sp.renewal_mode,
      sp.billing_interval_unit,
      sp.billing_interval_count,

      m.membership_reference,
      m.customer_id AS membership_customer_id,
      m.product_id AS membership_product_id,
      m.status AS membership_status,
      m.starts_at AS membership_starts_at,
      m.ends_at AS membership_ends_at,
      m.source_order_id,
      m.expired_at AS membership_expired_at,
      m.paused_at AS membership_paused_at,
      m.cancelled_at AS membership_cancelled_at,

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

function addSeconds(
  value,
  seconds
){
  const d=new Date(value);

  if(Number.isNaN(d.getTime())){
    throw new Error(
      "VALIDATION: Invalid renewal period boundary."
    );
  }

  d.setUTCSeconds(
    d.getUTCSeconds()+Number(seconds || 0)
  );

  return d.toISOString();
}


function idempotentRenewalResult(
  state,
  orderId,
  execution=null
){
  return {
    ok:true,
    handled:true,
    renewed:true,
    idempotent:true,

    order_id:
      Number(orderId),

    subscription_id:
      Number(
        execution?.subscription_id ||
        state.subscription_id
      ),

    membership_id:
      Number(
        execution?.membership_id ||
        state.membership_id
      ),

    previous_membership_end:
      execution?.previous_membership_end || "",

    period_start:
      execution?.period_start || "",

    new_membership_end:
      execution?.new_membership_end || "",

    renewal_execution:
      Boolean(execution)
  };
}


export async function processVerifiedSubscriptionRenewal(db,orderId){
  for(let attempt=0;attempt<RENEWAL_MAX_ATTEMPTS;attempt++){
    try{ return await processRenewalAttempt(db,orderId); }
    catch(error){
      // processRenewalAttempt rechecks completion before any retry.
      if(!isRenewalSnapshotConflict(error)) throw error;
    }
  }
  throw new Error("VALIDATION: Renewal state changed repeatedly. Retry this order.");
}

async function processRenewalAttempt(db,orderId){
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

  /*
   * Backward compatibility:
   * orders renewed before B3E are recognised from the
   * existing renewal event audit and must never renew again.
   */
  const completion=await findRenewalCompletion(db,id,state.subscription_id,state.membership_id);
  if(completion.completed){
    return idempotentRenewalResult(state,id,completion.execution);
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

  if(
    !["Active","PastDue"].includes(
      state.subscription_status
    )
  ){
    throw new Error(
      `VALIDATION: Subscription status ${state.subscription_status} cannot be renewed.`
    );
  }

  /*
   * B3E policy:
   * only a currently Active membership may be extended.
   *
   * Expired membership reactivation is a separate lifecycle
   * decision and must not happen implicitly through payment.
   */
  if(state.membership_status!=="Active"){
    throw new Error(
      `VALIDATION: Membership status ${state.membership_status} cannot be renewed. Active membership required.`
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

  const evidence=await validateRenewalOrder(db,{id,payment_status:state.payment_status,total:state.total},state.customer_id);
  if(!evidence.eligible) throw new Error(`VALIDATION: ${evidence.reason}`);
  await validateOrderItems(db,state);

  const baseEnd=
    clean(state.membership_ends_at,80) ||
    clean(state.current_period_end,80);

  if(!baseEnd){
    throw new Error(
      "VALIDATION: Renewal requires an existing membership/subscription end date."
    );
  }

  /*
   * Membership end timestamps are treated as inclusive.
   *
   * Example:
   * old end          2026-12-31T23:59:59Z
   * new period start 2027-01-01T00:00:00Z
   *
   * This removes the previous one-second overlap ambiguity.
   */
  const periodStart=
    addSeconds(
      baseEnd,
      1
    );

  const newEnd=
    addInterval(
      baseEnd,
      clean(
        state.membership_duration_unit,
        20
      ),
      Number(
        state.membership_duration_count
      )
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
    clean(
      state.membership_status,
      30
    );

  const subscriptionFrom=
    clean(
      state.subscription_status,
      30
    );

  const guard=renewalSnapshotGuard(
    {...state,id:state.subscription_id,status:state.subscription_status},
    {id:state.membership_id,customer_id:state.membership_customer_id,
      product_id:state.membership_product_id,status:state.membership_status,
      starts_at:state.membership_starts_at,ends_at:state.membership_ends_at,
      source_order_id:state.source_order_id,expired_at:state.membership_expired_at,
      paused_at:state.membership_paused_at,cancelled_at:state.membership_cancelled_at},
    {...state,id:state.plan_id,status:state.plan_status}
  );

  try{
    /*
     * Atomic renewal batch.
     *
     * order_id is the PRIMARY KEY of
     * subscription_renewal_executions.
     *
     * Therefore two concurrent callbacks for the same renewal
     * order cannot both commit an extension.
     */
    await db.batch([

      db.prepare(`
        INSERT INTO subscription_renewal_executions(
          order_id,
          subscription_id,
          membership_id,
          order_reference,
          previous_membership_end,
          period_start,
          new_membership_end,
          completed_at
        )
        VALUES(
          ?,?,?,?,CASE WHEN ${guard.sql} THEN ? ELSE NULL END,?,?,CURRENT_TIMESTAMP
        )
      `).bind(
        id,
        state.subscription_id,
        state.membership_id,
        state.order_reference,
        ...guard.params,
        baseEnd,
        periodStart,
        newEnd
      ),

      db.prepare(`
        UPDATE memberships
        SET
          status='Active',
          ends_at=?,
          expired_at='',
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
          AND status='Active'
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

          /*
           * Policy:
           * a fully verified MANUAL renewal payment is explicit
           * continuation intent and supersedes an earlier
           * cancel-at-period-end request.
           */
          cancel_at_period_end=0,

          cancelled_at='',
          expired_at='',
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
          AND status IN ('Active','PastDue')
      `).bind(
        periodStart,
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
        periodStart,
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
        `Verified paid renewal order ${state.order_reference}`
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
        `Verified paid renewal order ${state.order_reference}`
      )
    ]);
  }
  catch(e){
    /*
     * Concurrent retry:
     * if another request committed the same order while this
     * request was executing, return the committed execution as
     * an idempotent success.
     */
    const after=await findRenewalCompletion(db,id,state.subscription_id,state.membership_id);
    if(after.completed){
      return idempotentRenewalResult(state,id,after.execution);
    }

    throw e;
  }

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

    period_start:
      periodStart,

    new_membership_end:
      newEnd,

    next_renewal_at:
      newEnd,

    grace_ends_at:
      graceEnds,

    cancellation_policy:
      "verified_manual_renewal_supersedes_cancel_at_period_end"
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