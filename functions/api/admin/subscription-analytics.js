function json(data,status=200){
  return Response.json(data,{status});
}

function bearer(request){
  const value=request.headers.get("authorization") || "";

  return value.toLowerCase().startsWith("bearer ")
    ? value.slice(7).trim()
    : "";
}

function authorized(request,env){
  const expected=String(env.ADMIN_TOKEN || "").trim();
  const supplied=bearer(request);

  return Boolean(
    expected &&
    supplied &&
    supplied===expected
  );
}

function dbOf(env){
  return env.ENQUIRIES_DB || env.DB || env.D1 || null;
}

function clean(value,max=200){
  return String(value ?? "").trim().slice(0,max);
}

function integer(value,fallback,min,max){
  if(
    value===null ||
    value===undefined ||
    String(value).trim()===""
  ){
    return fallback;
  }

  const n=Number(value);

  if(!Number.isInteger(n)){
    return fallback;
  }

  return Math.max(min,Math.min(max,n));
}

function validDate(value){
  const text=clean(value,30);

  if(!text){
    return "";
  }

  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)){
    return "";
  }

  const ms=Date.parse(`${text}T00:00:00Z`);

  return Number.isFinite(ms)
    ? text
    : "";
}

async function rows(db,sql,bindings=[]){
  const result=await db.prepare(sql)
    .bind(...bindings)
    .all();

  return Array.isArray(result?.results)
    ? result.results
    : [];
}

async function one(db,sql,bindings=[]){
  return await db.prepare(sql)
    .bind(...bindings)
    .first();
}

function rangeClause(column,from,to){
  const clauses=[];
  const bindings=[];

  if(from){
    clauses.push(`datetime(${column}) >= datetime(?)`);
    bindings.push(`${from}T00:00:00.000Z`);
  }

  if(to){
    clauses.push(`datetime(${column}) < datetime(?,'+1 day')`);
    bindings.push(`${to}T00:00:00.000Z`);
  }

  return {
    sql:clauses.length
      ? ` AND ${clauses.join(" AND ")}`
      : "",
    bindings
  };
}

async function buildAnalytics(db,url){
  const now=new Date().toISOString();

  const from=validDate(
    url.searchParams.get("from")
  );

  const to=validDate(
    url.searchParams.get("to")
  );

  const upcomingDays=integer(
    url.searchParams.get("upcoming_days"),
    30,
    1,
    365
  );

  if(
    url.searchParams.get("from") &&
    !from
  ){
    throw new Error(
      "Invalid from date. Use YYYY-MM-DD."
    );
  }

  if(
    url.searchParams.get("to") &&
    !to
  ){
    throw new Error(
      "Invalid to date. Use YYYY-MM-DD."
    );
  }

  if(from && to && from>to){
    throw new Error(
      "from date cannot be after to date."
    );
  }

  const eventRange=
    rangeClause("e.event_at",from,to);

  const renewalRange=
    rangeClause("r.completed_at",from,to);

  const notificationRange=
    rangeClause("n.created_at",from,to);

  const summary=await one(db,`
    SELECT
      COUNT(*) AS total,

      SUM(
        CASE WHEN status='Pending'
        THEN 1 ELSE 0 END
      ) AS pending,

      SUM(
        CASE WHEN status='Active'
        THEN 1 ELSE 0 END
      ) AS active,

      SUM(
        CASE WHEN status='PastDue'
        THEN 1 ELSE 0 END
      ) AS past_due,

      SUM(
        CASE WHEN status='Paused'
        THEN 1 ELSE 0 END
      ) AS paused,

      SUM(
        CASE WHEN status='Cancelled'
        THEN 1 ELSE 0 END
      ) AS cancelled,

      SUM(
        CASE WHEN status='Expired'
        THEN 1 ELSE 0 END
      ) AS expired,

      SUM(
        CASE
          WHEN cancel_at_period_end=1
           AND status IN (
             'Active',
             'PastDue',
             'Paused'
           )
          THEN 1
          ELSE 0
        END
      ) AS cancellation_scheduled,

      SUM(
        CASE
          WHEN status='PastDue'
           AND grace_ends_at<>''
           AND datetime(grace_ends_at)>datetime(?)
          THEN 1
          ELSE 0
        END
      ) AS in_grace_period

    FROM subscriptions
  `,[now]);

  const upcoming=await one(db,`
    SELECT
      COUNT(*) AS count

    FROM subscriptions

    WHERE
      status='Active'
      AND cancel_at_period_end=0
      AND current_period_end<>''
      AND datetime(current_period_end)>datetime(?)
      AND datetime(current_period_end)<=datetime(?,'+${upcomingDays} days')
  `,[now,now]);

  const statusCounts=await rows(db,`
    SELECT
      status,
      COUNT(*) AS count

    FROM subscriptions

    GROUP BY status
    ORDER BY status
  `);

  const planBreakdown=await rows(db,`
    SELECT
      p.id AS plan_id,
      p.plan_reference,
      p.plan_code,
      p.status AS plan_status,
      p.renewal_mode,

      pr.id AS product_id,
      pr.sku,
      pr.name_en,
      pr.name_zh,
      pr.currency,
      pr.price,

      COUNT(s.id) AS total_subscriptions,

      SUM(
        CASE WHEN s.status='Active'
        THEN 1 ELSE 0 END
      ) AS active,

      SUM(
        CASE WHEN s.status='PastDue'
        THEN 1 ELSE 0 END
      ) AS past_due,

      SUM(
        CASE WHEN s.status='Paused'
        THEN 1 ELSE 0 END
      ) AS paused,

      SUM(
        CASE WHEN s.status='Cancelled'
        THEN 1 ELSE 0 END
      ) AS cancelled,

      SUM(
        CASE WHEN s.status='Expired'
        THEN 1 ELSE 0 END
      ) AS expired

    FROM subscription_plans p

    LEFT JOIN products pr
      ON pr.id=p.product_id

    LEFT JOIN subscriptions s
      ON s.plan_id=p.id

    GROUP BY
      p.id,
      p.plan_reference,
      p.plan_code,
      p.status,
      p.renewal_mode,
      pr.id,
      pr.sku,
      pr.name_en,
      pr.name_zh,
      pr.currency,
      pr.price

    ORDER BY
      total_subscriptions DESC,
      p.id
  `);

  const customerSummary=await one(db,`
    SELECT
      COUNT(DISTINCT customer_id) AS customers_with_subscriptions,

      COUNT(
        DISTINCT CASE
          WHEN status='Active'
          THEN customer_id
        END
      ) AS customers_with_active_subscriptions,

      COUNT(
        DISTINCT CASE
          WHEN status='PastDue'
          THEN customer_id
        END
      ) AS customers_with_past_due_subscriptions

    FROM subscriptions
  `);

  const topCustomers=await rows(db,`
    SELECT
      c.id AS customer_id,
      c.customer_reference,
      c.display_name,
      c.email,
      c.status AS customer_status,

      COUNT(s.id) AS subscriptions,

      SUM(
        CASE WHEN s.status='Active'
        THEN 1 ELSE 0 END
      ) AS active,

      SUM(
        CASE WHEN s.status='PastDue'
        THEN 1 ELSE 0 END
      ) AS past_due

    FROM customers c

    JOIN subscriptions s
      ON s.customer_id=c.id

    GROUP BY
      c.id,
      c.customer_reference,
      c.display_name,
      c.email,
      c.status

    ORDER BY
      subscriptions DESC,
      c.id

    LIMIT 100
  `);

  const eventCounts=await rows(
    db,
    `
      SELECT
        e.event_type,
        COUNT(*) AS count

      FROM subscription_events e

      WHERE 1=1
      ${eventRange.sql}

      GROUP BY e.event_type
      ORDER BY count DESC,e.event_type
    `,
    eventRange.bindings
  );

  const lifecycleEvents=await rows(
    db,
    `
      SELECT
        e.id,
        e.subscription_id,
        s.subscription_reference,
        e.event_type,
        e.from_status,
        e.to_status,
        e.source,
        e.source_reference,
        e.event_at

      FROM subscription_events e

      JOIN subscriptions s
        ON s.id=e.subscription_id

      WHERE 1=1
      ${eventRange.sql}

      ORDER BY datetime(e.event_at) DESC,e.id DESC
      LIMIT 200
    `,
    eventRange.bindings
  );

  const renewalEvents=await one(
    db,
    `
      SELECT
        COUNT(*) AS renewed_events

      FROM subscription_events e

      WHERE e.event_type='renewed'
      ${eventRange.sql}
    `,
    eventRange.bindings
  );

  const renewalExecutions=await one(
    db,
    `
      SELECT
        COUNT(*) AS executions

      FROM subscription_renewal_executions r

      WHERE 1=1
      ${renewalRange.sql}
    `,
    renewalRange.bindings
  );

  const renewalExecutionRows=await rows(
    db,
    `
      SELECT
        r.order_id,
        r.subscription_id,
        s.subscription_reference,
        r.membership_id,
        r.order_reference,
        r.previous_membership_end,
        r.period_start,
        r.new_membership_end,
        r.completed_at

      FROM subscription_renewal_executions r

      JOIN subscriptions s
        ON s.id=r.subscription_id

      WHERE 1=1
      ${renewalRange.sql}

      ORDER BY
        datetime(r.completed_at) DESC,
        r.order_id DESC

      LIMIT 200
    `,
    renewalRange.bindings
  );

  const notificationStatus=await rows(
    db,
    `
      SELECT
        n.status,
        COUNT(*) AS count

      FROM subscription_notification_logs n

      WHERE 1=1
      ${notificationRange.sql}

      GROUP BY n.status
      ORDER BY n.status
    `,
    notificationRange.bindings
  );

  const notificationTypes=await rows(
    db,
    `
      SELECT
        n.notification_type,
        n.status,
        COUNT(*) AS count

      FROM subscription_notification_logs n

      WHERE 1=1
      ${notificationRange.sql}

      GROUP BY
        n.notification_type,
        n.status

      ORDER BY
        n.notification_type,
        n.status
    `,
    notificationRange.bindings
  );

  const recentNotifications=await rows(
    db,
    `
      SELECT
        n.id,
        n.subscription_id,
        s.subscription_reference,
        n.notification_type,
        n.channel,
        n.recipient,
        n.status,
        n.provider_message_id,
        n.last_error,
        n.scheduled_for,
        n.sent_at,
        n.created_at,
        n.updated_at

      FROM subscription_notification_logs n

      JOIN subscriptions s
        ON s.id=n.subscription_id

      WHERE 1=1
      ${notificationRange.sql}

      ORDER BY
        datetime(n.created_at) DESC,
        n.id DESC

      LIMIT 200
    `,
    notificationRange.bindings
  );

  const upcomingRenewals=await rows(db,`
    SELECT
      s.id AS subscription_id,
      s.subscription_reference,
      s.status,
      s.current_period_end,
      s.next_renewal_at,
      s.grace_ends_at,
      s.cancel_at_period_end,

      c.id AS customer_id,
      c.customer_reference,
      c.display_name,
      c.email,

      p.id AS plan_id,
      p.plan_code,
      p.plan_reference,

      pr.sku,
      pr.name_en,
      pr.name_zh

    FROM subscriptions s

    JOIN customers c
      ON c.id=s.customer_id

    JOIN subscription_plans p
      ON p.id=s.plan_id

    LEFT JOIN products pr
      ON pr.id=p.product_id

    WHERE
      s.status='Active'
      AND s.cancel_at_period_end=0
      AND s.current_period_end<>''
      AND datetime(s.current_period_end)>datetime(?)
      AND datetime(s.current_period_end)<=datetime(?,'+${upcomingDays} days')

    ORDER BY
      datetime(s.current_period_end),
      s.id

    LIMIT 200
  `,[now,now]);

  const subscriptionOrders=await one(db,`
    SELECT
      COUNT(*) AS linked_orders,

      SUM(
        CASE WHEN order_type='Initial'
        THEN 1 ELSE 0 END
      ) AS initial_orders,

      SUM(
        CASE WHEN order_type='Renewal'
        THEN 1 ELSE 0 END
      ) AS renewal_orders

    FROM subscription_orders
  `);

  return {
    ok:true,

    generated_at:now,

    filters:{
      from:from || null,
      to:to || null,
      upcoming_days:upcomingDays
    },

    summary:{
      total:Number(summary?.total || 0),
      pending:Number(summary?.pending || 0),
      active:Number(summary?.active || 0),
      past_due:Number(summary?.past_due || 0),
      paused:Number(summary?.paused || 0),
      cancelled:Number(summary?.cancelled || 0),
      expired:Number(summary?.expired || 0),
      cancellation_scheduled:
        Number(summary?.cancellation_scheduled || 0),
      in_grace_period:
        Number(summary?.in_grace_period || 0),
      upcoming_renewals:
        Number(upcoming?.count || 0)
    },

    customers:{
      with_subscriptions:
        Number(
          customerSummary?.customers_with_subscriptions || 0
        ),
      with_active_subscriptions:
        Number(
          customerSummary?.customers_with_active_subscriptions || 0
        ),
      with_past_due_subscriptions:
        Number(
          customerSummary?.customers_with_past_due_subscriptions || 0
        )
    },

    renewals:{
      renewed_events:
        Number(renewalEvents?.renewed_events || 0),

      executions:
        Number(renewalExecutions?.executions || 0),

      linked_orders:
        Number(subscriptionOrders?.linked_orders || 0),

      initial_orders:
        Number(subscriptionOrders?.initial_orders || 0),

      renewal_orders:
        Number(subscriptionOrders?.renewal_orders || 0)
    },

    status_counts:statusCounts,
    plan_breakdown:planBreakdown,
    top_customers:topCustomers,

    lifecycle:{
      event_counts:eventCounts,
      recent_events:lifecycleEvents
    },

    renewal_executions:
      renewalExecutionRows,

    notifications:{
      status_counts:notificationStatus,
      type_status_counts:notificationTypes,
      recent:recentNotifications
    },

    upcoming_renewals:
      upcomingRenewals
  };
}

export async function onRequestGet({request,env}){
  try{
    if(!authorized(request,env)){
      return json(
        {error:"Unauthorized"},
        401
      );
    }

    const db=dbOf(env);

    if(!db){
      return json(
        {error:"Database binding unavailable"},
        503
      );
    }

    const url=new URL(request.url);

    const result=
      await buildAnalytics(db,url);

    return json(result);
  }catch(error){
    console.error(
      "Subscription analytics failed",
      error
    );

    const message=clean(
      error?.message ||
      "Subscription analytics failed.",
      1000
    );

    const validation=
      message.startsWith("Invalid ") ||
      message.includes("cannot be after");

    return json(
      {error:message},
      validation ? 400 : 500
    );
  }
}