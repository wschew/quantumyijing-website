// Standalone C1 Pages advanced-mode entry. Never mount in the existing website.
import {createPreviewAdapter} from '../functions/lib/consultation/preview-adapter.js';
import {requirePreviewWorkflowConfiguration} from '../functions/lib/consultation/workflow-runtime.js';
import manifest from '../database/c1-migration-manifest.json';
import {requirePagesPreview} from '../functions/lib/consultation/pages-boundary.js';
import {validatePreviewContract} from '../functions/lib/consultation/preview-composition.js';
const allowed=['CONSULTATION_DEPLOYMENT_SLOT','ASSETS','CONSULTATION_CONFIG','CONSULTATION_DB','CONSULTATION_PREVIEW_ENABLED','CONSULTATION_KEYRING','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED','SUBSCRIPTION_AUTOMATION_ENABLED','CF_PAGES','CF_PAGES_BRANCH','CF_PAGES_COMMIT_SHA','CF_PAGES_URL'];
// Pages serves HTML at clean URLs. Fetching .html through ASSETS can redirect;
// resolve both UI link forms to the clean asset path to avoid redirect loops.
const assets=new Map([['/','/customer'],['/customer','/customer'],['/customer.html','/customer'],['/qy','/qy'],['/qy.html','/qy'],...['/workflow-ui.js','/workflow.css','/academy-logo.png'].map(p=>[p,p])]);
const security={
 'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
 'permissions-policy':'camera=(), microphone=(), geolocation=()', 'x-frame-options':'DENY'
};
function secure(response,head=false){const headers=new Headers(response.headers);for(const [k,v] of Object.entries(security))headers.set(k,v);return new Response(head?null:response.body,{status:response.status,headers});}
const error=status=>secure(Response.json({ok:false,code:'PREVIEW_UNAVAILABLE'},{status}));
export default {async fetch(request,env){
 try{
  if(Object.keys(env).some(k=>!allowed.includes(k)))return error(503);
  for(const name of ['CONSULTATION_PREVIEW_ENABLED','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED'])if(env[name]!=='true')return error(503);
  const config=JSON.parse(env.CONSULTATION_CONFIG);
  requirePagesPreview(env,config);
  requirePreviewWorkflowConfiguration({...config,enabled:env.CONSULTATION_PREVIEW_ENABLED,subscriptionAutomationEnabled:env.SUBSCRIPTION_AUTOMATION_ENABLED});
  const url=new URL(request.url);
  if(url.origin!==config.origin)return error(403);
  // Metadata is explicitly allowed but never forwarded as a service dependency.
  const local=Object.fromEntries(Object.entries(env).filter(([k])=>!['ASSETS','CONSULTATION_CONFIG'].includes(k)&&!k.startsWith('CF_PAGES')));
  delete local.CONSULTATION_DEPLOYMENT_SLOT;
  if(url.pathname.startsWith('/api/consultation/')){
   const adapter=await createPreviewAdapter(local,config,manifest);
   return secure(await adapter.fetch(request),request.method==='HEAD');
  }
  if(!assets.has(url.pathname)||url.search||!['GET','HEAD'].includes(request.method))return error(404);
  // Assets retain the live disable/schema/key contract without constructing API
  // services or repeating validation. One read, no database writes, no cache.
  const contract=await validatePreviewContract(local,config,manifest);
  if(contract.unknownCustomers!==0||!contract.keys.mockDelivery)return error(503);
  if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')return error(503);
  // ASSETS receives no cookies, auth headers, query strings or arbitrary paths.
  const path=assets.get(url.pathname);
  return secure(await env.ASSETS.fetch(new Request(config.origin+path,{method:request.method})),request.method==='HEAD');
 }catch{return error(503);}
}};
