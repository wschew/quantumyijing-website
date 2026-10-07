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

async function callAutomation(baseUrl,path,token,label){
  const base=String(baseUrl || "")
    .trim()
    .replace(/\/+$/,"");

  if(!base){
    throw new Error(
      `${label} endpoint base URL is not configured.`
    );
  }

  if(!token){
    throw new Error(
      "ADMIN_TOKEN is not configured."
    );
  }

  const response=await fetch(
    `${base}${path}`,
    {
      method:"POST",
      headers:{
        "Authorization":`Bearer ${token}`,
        "Accept":"application/json",
        "Content-Type":"application/json"
      },
      body:"{}"
    }
  );

  const raw=await response.text();

  let result=null;

  try{
    result=raw ? JSON.parse(raw) : null;
  }catch{
    throw new Error(
      `${label} returned invalid JSON. HTTP ${response.status}`
    );
  }

  if(!response.ok){
    throw new Error(
      `${label} HTTP ${response.status}: ${raw.slice(0,500)}`
    );
  }

  if(
    !result ||
    result.ok!==true ||
    result.mode!=="run"
  ){
    throw new Error(
      `${label} rejected: ${raw.slice(0,500)}`
    );
  }

  if(Number(result.failed || 0)>0){
    throw new Error(
      `${label} reported ${result.failed} failure(s).`
    );
  }

  return result;
}

async function executeLifecycle(env){
  const token=String(env.ADMIN_TOKEN || "").trim();

  const result=await callAutomation(
    env.A6H_ENDPOINT_BASE_URL,
    "/api/admin/subscription-lifecycle-automation?action=run",
    token,
    "A6H lifecycle automation"
  );

  console.log(
    "A6H subscription lifecycle completed",
    JSON.stringify({
      runAt:result.runAt,
      checked:result.checked,
      planned:result.planned,
      transitioned:result.transitioned,
      pastDue:result.pastDue,
      cancelled:result.cancelled,
      expired:result.expired,
      unchanged:result.unchanged,
      failed:result.failed
    })
  );

  return result;
}

async function executeNotifications(env){
  const token=String(env.ADMIN_TOKEN || "").trim();

  const result=await callAutomation(
    env.A6I_ENDPOINT_BASE_URL,
    "/api/admin/subscription-notification-automation?action=run",
    token,
    "A6I notification automation"
  );

  console.log(
    "A6I subscription notifications completed",
    JSON.stringify({
      runAt:result.runAt,
      checked:result.checked,
      planned:result.planned,
      sent:result.sent,
      skipped:result.skipped,
      failed:result.failed
    })
  );

  return result;
}

async function executeSubscriptionCycle(env){
  /*
   * Ordering is intentional:
   *
   * 1. A6H performs subscription lifecycle transitions.
   * 2. A6I consumes resulting lifecycle events and sends
   *    transactional customer notifications.
   *
   * A6I does not modify subscription lifecycle state.
   */

  const lifecycle=await executeLifecycle(env);
  const notifications=await executeNotifications(env);

  return {
    lifecycle,
    notifications
  };
}

export default {

  async scheduled(event,env,ctx){
    ctx.waitUntil(
      executeSubscriptionCycle(env)
    );
  },

  async fetch(request,env){
    if(request.method!=="POST"){
      return Response.json(
        {error:"Method Not Allowed"},
        {status:405}
      );
    }

    if(!authorized(request,env)){
      return Response.json(
        {error:"Unauthorized"},
        {status:401}
      );
    }

    try{
      const result=
        await executeSubscriptionCycle(env);

      return Response.json({
        ok:true,
        trigger:"manual-subscription-cycle-smoke",
        lifecycle:result.lifecycle,
        notifications:result.notifications
      });
    }catch(error){
      return Response.json(
        {
          ok:false,
          error:String(
            error?.message || error
          ).slice(0,1000)
        },
        {status:502}
      );
    }
  }
};