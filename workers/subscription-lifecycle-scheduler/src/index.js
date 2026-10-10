function authorized(request,env){
  const expected=String(env.ADMIN_TOKEN || '').trim();
  const header=request.headers.get('authorization') || '';
  return !!expected && header.toLowerCase().startsWith('bearer ') && header.slice(7).trim()===expected;
}
export function validateTargets(env){
  const bases=[env.A6H_ENDPOINT_BASE_URL,env.A6I_ENDPOINT_BASE_URL].map(value=>{
    const url=new URL(String(value || ''));
    if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname))throw Error('Invalid automation target');
    return url.origin;
  });
  if(env.SUBSCRIPTION_AUTOMATION_ENVIRONMENT==='production'){
    const approved=new URL(String(env.SUBSCRIPTION_APPROVED_PRODUCTION_ORIGIN || ''));
    if(approved.protocol!=='https:' || approved.origin!==bases[0] || bases[0]!==bases[1] || approved.pathname!=='/' || approved.search || approved.hash || approved.username || approved.password)throw Error('Production target approval mismatch');
  }
  return bases;
}
async function call(base,path,env,body={}){
  const token=String(env.ADMIN_TOKEN || '').trim();if(!token)throw Error('ADMIN_TOKEN is not configured');
  const response=await fetch(base+path,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok || result?.ok!==true || result.mode!=='run')throw Error('Automation request failed');
  return result;
}
export async function executeSubscriptionCycle(env){
  if(String(env.SUBSCRIPTION_AUTOMATION_ENABLED)==='false' ||
    (env.SUBSCRIPTION_AUTOMATION_ENVIRONMENT==='production' && env.SUBSCRIPTION_AUTOMATION_ENABLED!=='true'))return {disabled:true};
  const bases=validateTargets(env),cutoff=String(env.SUBSCRIPTION_NOTIFICATION_EVENT_NOT_BEFORE || '');
  if(!Number.isFinite(Date.parse(cutoff)))throw Error('Notification cutoff is required');
  const recoveryCursor=String(env.SUBSCRIPTION_LIFECYCLE_AFTER_ID || '0');
  if(!/^\d+$/.test(recoveryCursor) || !Number.isSafeInteger(Number(recoveryCursor)))throw Error('Invalid lifecycle recovery cursor');
  const lifecycle={checked:0,transitioned:0,failed:0,pages:0,hasMore:false,nextAfterId:Number(recoveryCursor)};let cursor=Number(recoveryCursor),lifecycleError=false;
  // Continue past failed rows, with a bounded run. Remaining backlog is visible.
  for(let page=0;page<5;page++){
    try{
      const result=await call(bases[0],'/api/admin/subscription-lifecycle-automation?action=run&after_id='+cursor,env);
      lifecycle.pages++;for(const key of ['checked','transitioned','failed'])lifecycle[key]+=Number(result[key] || 0);
      lifecycle.hasMore=result.hasMore===true;
      if(Number.isSafeInteger(result.nextAfterId) && result.nextAfterId>=cursor)lifecycle.nextAfterId=result.nextAfterId;
      if(!lifecycle.hasMore)break;
      if(!Number.isSafeInteger(result.nextAfterId) || result.nextAfterId<=cursor)throw Error('Invalid lifecycle cursor');cursor=result.nextAfterId;lifecycle.nextAfterId=cursor;
    }catch{lifecycleError=true;break;}
  }
  let notifications=null,notificationError=false;
  // Independent work runs even when lifecycle partially fails or is unreachable.
  try{notifications=await call(bases[1],'/api/admin/subscription-notification-automation?action=run&event_not_before='+encodeURIComponent(cutoff),env);}catch{notificationError=true;}
  const result={lifecycle,notifications:notifications?{checked:notifications.checked,sent:notifications.sent,failed:notifications.failed,reconcile:notifications.reconcile,permanent:notifications.permanent,deliveryStates:notifications.deliveryStates,legacyUnconfirmed:notifications.legacyUnconfirmed,expiredReconciled:notifications.expiredReconciled,expiredSending:notifications.expiredSending,legacyEventIdentityUnknown:notifications.legacyEventIdentityUnknown,requiresAttention:notifications.requiresAttention}:null,lifecycleError,notificationError,failed:lifecycleError || notificationError || lifecycle.failed>0 || Number(notifications?.failed || 0)>0};
  result.requiresAttention=lifecycle.hasMore || notifications?.requiresAttention===true || Number(notifications?.expiredSending || 0)>0 || Number(notifications?.legacyEventIdentityUnknown || 0)>0 || Number(notifications?.legacyUnconfirmed || 0)>0 || (notifications?.deliveryStates || []).some(row=>['Reconcile','Permanent'].includes(row.state) && Number(row.count)>0);
  result.failed=result.failed || result.requiresAttention;
  console.log(JSON.stringify({event:'subscription-cycle',...result}));return result;
}
export default {
  async scheduled(event,env,ctx){ctx.waitUntil(executeSubscriptionCycle(env).then(result=>{if(result.failed)throw Error('Subscription cycle requires attention');}));},
  async fetch(request,env){
    if(request.method!=='POST')return Response.json({error:'Method Not Allowed'},{status:405});
    if(!authorized(request,env))return Response.json({error:'Unauthorized'},{status:401});
    try{const result=await executeSubscriptionCycle(env);return Response.json({ok:!result.failed,...result},{status:result.failed?207:200});}
    catch{return Response.json({ok:false,error:'Subscription cycle configuration or request failed'},{status:502});}
  }
};
