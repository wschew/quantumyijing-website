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

async function executeNotifications(env){
  const base=String(
    env.A6I_ENDPOINT_BASE_URL || ""
  ).trim().replace(/\/+$/,"");

  const token=String(
    env.ADMIN_TOKEN || ""
  ).trim();

  if(!base){
    throw new Error(
      "A6I_ENDPOINT_BASE_URL is not configured."
    );
  }

  if(!token){
    throw new Error(
      "ADMIN_TOKEN is not configured."
    );
  }

  const url=
    `${base}/api/admin/subscription-notification-automation?action=run`;

  const response=await fetch(url,{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${token}`,
      "Accept":"application/json",
      "Content-Type":"application/json"
    },
    body:"{}"
  });

  const raw=await response.text();

  let result=null;

  try{
    result=raw ? JSON.parse(raw) : null;
  }catch{
    throw new Error(
      `A6I endpoint returned invalid JSON. HTTP ${response.status}`
    );
  }

  if(!response.ok){
    throw new Error(
      `A6I endpoint HTTP ${response.status}: ${raw.slice(0,500)}`
    );
  }

  if(
    !result ||
    result.ok!==true ||
    result.mode!=="run"
  ){
    throw new Error(
      `A6I notification run rejected: ${raw.slice(0,500)}`
    );
  }

  if(Number(result.failed || 0)>0){
    throw new Error(
      `A6I notification run reported ${result.failed} failure(s).`
    );
  }

  console.log(
    "A6I subscription notification automation completed",
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

export default {

  async scheduled(event,env,ctx){
    ctx.waitUntil(
      executeNotifications(env)
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
        await executeNotifications(env);

      return Response.json({
        ok:true,
        trigger:"manual-preview-smoke",
        result
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