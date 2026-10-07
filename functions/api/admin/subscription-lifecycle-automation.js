function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "x-content-type-options":"nosniff"
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

async function tableExists(db,name){
  const row=await db.prepare(`
    SELECT 1 AS ok
    FROM sqlite_master
    WHERE type='table'
      AND name=?
    LIMIT 1
  `).bind(name).first();

  return !!row;
}

async function ensureFoundation(db){
  for(const table of [
    "subscriptions",
    "subscription_events"
  ]){
    if(!(await tableExists(db,table))){
      throw new Error(`Subscription foundation missing: ${table}`);
    }
  }
}

function parsedTime(value){
  const text=cleanText(value,80);

  if(!text){
    return null;
  }

  const ms=Date.parse(text);

  return Number.isFinite(ms) ? ms : null;
}

function hasReached(value,nowMs){
  const ms=parsedTime(value);

  return ms!==null && ms<=nowMs;
}

/*
 * A6H AUTOMATION CONTRACT
 *
 * Priority:
 *
 * 1. Scheduled cancellation wins when current_period_end is reached.
 *
 * 2. Active subscription past current_period_end becomes PastDue.
 *
 * 3. PastDue subscription past grace_ends_at becomes Expired.
 *
 * If an Active subscription is discovered after both its period end
 * and grace end, the runner performs:
 *
 *   Active -> PastDue -> Expired
 *
 * This preserves complete subscription event history.
 *
 * Pending subscriptions are not changed automatically.
 * Paused subscriptions remain paused unless cancellation at period
 * end was explicitly scheduled.
 *
 * This endpoint does NOT:
 *
 * - renew subscriptions automatically
 * - create or modify orders
 * - create or modify payments
 * - change membership status or dates
 * - change course entitlements
 * - modify accounting
 */

function plannedTransitions(row,nowMs){
  const status=String(row.status || "");
  const cancelAtPeriodEnd=Number(row.cancel_at_period_end)===1;

  const periodReached=hasReached(
    row.current_period_end,
    nowMs
  );

  const graceReached=hasReached(
    row.grace_ends_at,
    nowMs
  );

  /*
   * Explicit period-end cancellation has highest priority.
   */
  if(
    cancelAtPeriodEnd &&
    periodReached &&
    ["Active","PastDue","Paused"].includes(status)
  ){
    return [{
      from:status,
      to:"Cancelled",
      eventType:"cancelled",
      reason:"Scheduled cancellation reached current period end."
    }];
  }

  /*
   * Active subscription reaches the end of its paid period.
   */
  if(status==="Active" && periodReached){
    const actions=[{
      from:"Active",
      to:"PastDue",
      eventType:"past_due",
      reason:"Current subscription period ended without renewal."
    }];

    /*
     * Catch-up processing:
     * preserve both lifecycle transitions when the scheduler
     * discovers the subscription after grace has already ended.
     */
    if(graceReached){
      actions.push({
        from:"PastDue",
        to:"Expired",
        eventType:"expired",
        reason:"Subscription grace period ended without renewal."
      });
    }

    return actions;
  }

  /*
   * Existing PastDue subscription reaches grace expiry.
   */
  if(status==="PastDue" && graceReached){
    return [{
      from:"PastDue",
      to:"Expired",
      eventType:"expired",
      reason:"Subscription grace period ended without renewal."
    }];
  }

  return [];
}

async function loadCandidates(db,nowIso){
  return await db.prepare(`
    SELECT
      id,
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
      cancelled_at,
      paused_at,
      expired_at,
      source,
      notes,
      created_at,
      updated_at
    FROM subscriptions
    WHERE
      (
        cancel_at_period_end=1
        AND status IN ('Active','PastDue','Paused')
        AND current_period_end<>''
        AND datetime(current_period_end)<=datetime(?)
      )
      OR
      (
        status='Active'
        AND current_period_end<>''
        AND datetime(current_period_end)<=datetime(?)
      )
      OR
      (
        status='PastDue'
        AND grace_ends_at<>''
        AND datetime(grace_ends_at)<=datetime(?)
      )
    ORDER BY id ASC
    LIMIT 500
  `).bind(nowIso,nowIso,nowIso).all();
}

async function transition(db,row,action,runAt){
  const id=Number(row.id);

  if(!Number.isInteger(id) || id<=0){
    throw new Error("Invalid subscription id.");
  }

  const from=String(action.from || "");
  const to=String(action.to || "");
  const eventType=String(action.eventType || "");

  let cancelledAt=String(row.cancelled_at || "");
  let expiredAt=String(row.expired_at || "");

  if(to==="Cancelled"){
    cancelledAt=runAt;
  }

  if(to==="Expired"){
    expiredAt=runAt;
  }

  const statements=[
    db.prepare(`
      UPDATE subscriptions
      SET
        status=?,
        cancelled_at=?,
        expired_at=?,
        updated_at=?
      WHERE id=?
        AND status=?
    `).bind(
      to,
      cancelledAt,
      expiredAt,
      runAt,
      id,
      from
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
      SELECT
        ?,
        ?,
        ?,
        ?,
        'A6H Subscription Lifecycle Automation',
        'scheduled-lifecycle-run',
        ?,
        ?
      WHERE EXISTS(
        SELECT 1
        FROM subscriptions
        WHERE id=?
          AND status=?
          AND updated_at=?
      )
    `).bind(
      id,
      eventType,
      from,
      to,
      cleanText(action.reason,1000),
      runAt,
      id,
      to,
      runAt
    )
  ];

  const results=await db.batch(statements);

  const updateResult=results?.[0] || {};
  const changes=Number(
    updateResult?.meta?.changes ??
    updateResult?.changes ??
    0
  );

  return changes>0;
}

async function execute(context,mode){
  const db=dbOf(context.env);

  if(!db){
    return json({
      error:"Database binding is not configured."
    },503);
  }

  await ensureFoundation(db);

  const now=new Date();
  const nowMs=now.getTime();
  const runAt=now.toISOString();

  const candidates=await loadCandidates(db,runAt);

  const summary={
    ok:true,
    mode,
    runAt,
    checked:candidates.length,
    planned:0,
    transitioned:0,
    pastDue:0,
    cancelled:0,
    expired:0,
    unchanged:0,
    failed:0,
    failures:[],
    preview:[]
  };

  for(const row of candidates){
    const actions=plannedTransitions(row,nowMs);

    if(actions.length===0){
      summary.unchanged+=1;
      continue;
    }

    summary.planned+=actions.length;

    if(mode==="preview"){
      summary.preview.push({
        id:Number(row.id),
        subscriptionReference:
          String(row.subscription_reference || ""),
        currentStatus:String(row.status || ""),
        currentPeriodEnd:
          String(row.current_period_end || ""),
        graceEndsAt:
          String(row.grace_ends_at || ""),
        cancelAtPeriodEnd:
          Number(row.cancel_at_period_end)===1,
        transitions:actions
      });

      continue;
    }

    /*
     * Each action is applied in sequence.
     *
     * For Active -> PastDue -> Expired catch-up processing,
     * the in-memory status is advanced after the first
     * successful transition.
     */
    const working={
      ...row
    };

    for(const action of actions){
      try{
        const changed=await transition(
          db,
          working,
          action,
          runAt
        );

        if(!changed){
          /*
           * Another process may already have changed the row.
           * Do not manufacture an event.
           */
          break;
        }

        summary.transitioned+=1;

        if(action.to==="PastDue"){
          summary.pastDue+=1;
        }

        if(action.to==="Cancelled"){
          summary.cancelled+=1;
          working.cancelled_at=runAt;
        }

        if(action.to==="Expired"){
          summary.expired+=1;
          working.expired_at=runAt;
        }

        working.status=action.to;
      }
      catch(error){
        summary.failed+=1;

        summary.failures.push({
          id:Number(row.id),
          subscriptionReference:
            String(row.subscription_reference || ""),
          from:action.from,
          to:action.to,
          error:cleanText(
            error?.message || "Lifecycle transition failed.",
            500
          )
        });

        break;
      }
    }
  }

  /*
   * Keep scheduler responses bounded.
   */
  if(summary.preview.length>100){
    summary.preview=summary.preview.slice(0,100);
    summary.previewTruncated=true;
  }

  if(summary.failures.length>50){
    summary.failures=summary.failures.slice(0,50);
    summary.failuresTruncated=true;
  }

  return json(summary);
}

export async function onRequestPost(context){
  try{
    if(!context.env.ADMIN_TOKEN){
      return json({
        error:"ADMIN_TOKEN is not configured."
      },503);
    }

    if(!authorized(context.request,context.env)){
      return json({
        error:"Unauthorized."
      },401);
    }

    const url=new URL(context.request.url);

    let body={};

    try{
      const type=String(
        context.request.headers.get("content-type") || ""
      ).toLowerCase();

      if(type.includes("application/json")){
        body=await context.request.json();
      }
    }
    catch{
      return json({
        error:"Invalid JSON request body."
      },400);
    }

    const action=cleanText(
      url.searchParams.get("action") ||
      body?.action ||
      "",
      40
    ).toLowerCase();

    if(action==="preview"){
      return await execute(context,"preview");
    }

    if(action==="run"){
      return await execute(context,"run");
    }

    return json({
      error:
        "Unknown lifecycle automation action. " +
        "Use preview or run."
    },404);
  }
  catch(error){
    console.error(
      "Subscription lifecycle automation failed",
      error
    );

    return json({
      error:
        error?.message ||
        "Subscription lifecycle automation request failed."
    },500);
  }
}
