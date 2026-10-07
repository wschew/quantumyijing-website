async function executeLifecycle(env){
  const base=String(env.A6H_ENDPOINT_BASE_URL || "").trim().replace(/\/+$/,"");
  const token=String(env.ADMIN_TOKEN || "").trim();

  if(!base){
    throw new Error("A6H_ENDPOINT_BASE_URL is not configured.");
  }

  if(!token){
    throw new Error("ADMIN_TOKEN is not configured.");
  }

  const url=
    `${base}/api/admin/subscription-lifecycle-automation?action=run`;

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
      `A6H endpoint returned invalid JSON. HTTP ${response.status}`
    );
  }

  if(!response.ok){
    throw new Error(
      `A6H endpoint HTTP ${response.status}: ${raw.slice(0,500)}`
    );
  }

  if(!result || result.ok!==true || result.mode!=="run"){
    throw new Error(
      `A6H lifecycle run rejected: ${raw.slice(0,500)}`
    );
  }

  if(Number(result.failed || 0)>0){
    throw new Error(
      `A6H lifecycle run reported ${result.failed} failure(s).`
    );
  }

  console.log(
    "A6H subscription lifecycle automation completed",
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

export default {
  async scheduled(event,env,ctx){
    ctx.waitUntil(executeLifecycle(env));
  }
};