import {appointmentErrorCodes} from './appointment-availability.js';
import {createSelfService} from './selfservice-booking.js';
import {createGuestBooking} from './guest-booking.js';
// Internal synthetic adapter factory. No existing Pages route is mounted.
import {validatePreviewContract,composePreviewServices} from './preview-composition.js';
import {createWorkflowHandler,readWorkflowBody} from './workflow-handler.js';
import {createPricingAdmin,currentPricing} from './pricing-admin.js';
import {createWorkflowGuards,DB_NOW} from './workflow-guards.js';
import {randomSecret,tokenHash} from './auth-crypto.js';
import {requestAllowed} from './customer-request-security.js';
const fail=()=>{throw Error('Synthetic Preview operation unavailable');};
const reply=(status,body,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
export function createPreviewDatabase(raw,config){
 const native=new WeakMap();
 const condition="SELECT 1 FROM consultation_preview_environment WHERE id=1 AND enabled=1 AND synthetic_only=1 AND database_id=? AND origin=? AND manifest_sha256=? AND NOT EXISTS(SELECT 1 FROM customers c LEFT JOIN consultation_preview_synthetic_customers s ON s.customer_id=c.id WHERE s.customer_id IS NULL OR c.customer_reference NOT GLOB 'SYNTHETIC-*')";
 async function batch(plans){
  const statements=plans.map(p=>{const s=native.get(p);if(!s)fail();return s;});
  const id=crypto.randomUUID();
  const results=await raw.batch([raw.prepare('INSERT INTO consultation_preview_assertions VALUES(?,CASE WHEN EXISTS('+condition+') THEN 1 ELSE NULL END)').bind(id,config.databaseId,config.origin,config.manifestSha256),...statements,raw.prepare('DELETE FROM consultation_preview_assertions WHERE id=?').bind(id)]);
  return results.slice(1,-1);
 }
 function prepare(sql){
  let statement=raw.prepare(sql);
  const wrapper={bind(...v){statement=statement.bind(...v);native.set(wrapper,statement);return wrapper;},
   async all(){if(!/^\s*(SELECT|PRAGMA)\b/i.test(sql))return (await batch([wrapper]))[0];return statement.all();},
   async first(column){if(!/^\s*(SELECT|PRAGMA)\b/i.test(sql)){const row=(await batch([wrapper]))[0].results?.[0]??null;return column?row?.[column]??null:row;}return column===undefined?statement.first():statement.first(column);},
   async run(){return (await batch([wrapper]))[0];}};
  native.set(wrapper,statement);return wrapper;
 }
 return Object.freeze({prepare,batch});
}
function aad(config,row,keyId){return new TextEncoder().encode(JSON.stringify(['qy-preview-mock-v1',config.databaseId,config.origin,row.id,row.customer_id,row.context_id,row.context_version,keyId]));}
export function createEncryptedPreviewOutbox({db,config,key}){
 if(!key?.provider||!key.activeKeyId)fail();
 const live=`h.consumed_at IS NULL AND h.attempts<5 AND h.expires_at>${DB_NOW} AND o.expires_at=h.expires_at AND c.revoked_at IS NULL AND x.version=h.context_version AND x.customer_id=h.customer_id AND x.revoked_at IS NULL AND x.expires_at>${DB_NOW} AND p.customer_id=x.customer_id AND COALESCE(p.revoked_at,'')='' AND datetime(p.expires_at)>datetime('now') AND u.status='Active' AND s.enabled=1`;
 const join=' FROM consultation_preview_outbox o JOIN consultation_account_challenges h ON h.id=o.challenge_id JOIN consultation_account_contacts c ON c.id=h.contact_id JOIN consultation_customer_contexts x ON x.id=h.context_id JOIN academy_portal_sessions p ON p.id=x.portal_session_id JOIN customers u ON u.id=h.customer_id JOIN consultation_preview_synthetic_customers s ON s.customer_id=u.id ';
 const guards=createWorkflowGuards({db,origin:config.origin});
 async function prepare(message,row){
  let bytes;
  try{
   if(message?.challengeId!==row.id||message.purpose!=='canonical_account_stepup'||!['email','whatsapp'].includes(message.channel)||!/^\d{8}$/.test(message.code)||typeof message.recipient!=='string'||message.recipient.length>320)fail();
   const nonce=crypto.getRandomValues(new Uint8Array(12));bytes=new TextEncoder().encode(JSON.stringify({purpose:message.purpose,channel:message.channel,recipient:message.recipient,code:message.code}));
   const k=await key.provider(key.activeKeyId);if(k.algorithm.name!=='AES-GCM'||k.algorithm.length!==256||k.extractable!==false)fail();
   const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad(config,row,key.activeKeyId)},k,bytes));
   return [db.prepare('INSERT INTO consultation_preview_outbox(challenge_id,key_id,nonce,ciphertext,expires_at) SELECT id,?,?,?,expires_at FROM consultation_account_challenges WHERE id=? AND customer_id=? AND context_id=? AND context_version=?').bind(key.activeKeyId,nonce,ciphertext,row.id,row.customer_id,row.context_id,row.context_version),db.prepare('INSERT INTO consultation_preview_assertions VALUES(?,CASE WHEN changes()=1 THEN 1 ELSE NULL END)').bind('outbox-'+row.id),db.prepare('DELETE FROM consultation_preview_assertions WHERE id=?').bind('outbox-'+row.id)];
  }catch{fail();}finally{bytes?.fill(0);}
 }
 async function read(request,input){
  let plain;
  try{
   if(!input||Object.keys(input).join(',')!=='challengeId'||typeof input.challengeId!=='string'||input.challengeId.length>128)fail();
   const a=await guards.qy(request,true);
   const query='SELECT o.key_id,o.nonce,o.ciphertext,h.id,h.customer_id,h.context_id,h.context_version'+join+'WHERE h.id=? AND '+live+' AND EXISTS('+a.sql+')';
   const evidence="INSERT INTO consultation_preview_events SELECT ?, 'OutboxRead', ?, h.id, "+DB_NOW+join+'WHERE h.id=? AND '+live+' AND EXISTS('+a.sql+')';
   const results=await db.batch([db.prepare(query).bind(input.challengeId,...a.values),db.prepare(evidence).bind(crypto.randomUUID(),a.principal.sessionId,input.challengeId,...a.values)]);
   const row=results[0].results?.[0];if(!row||results[1].meta?.changes!==1)fail();
   plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(row.nonce),additionalData:aad(config,row,row.key_id)},await key.provider(row.key_id),new Uint8Array(row.ciphertext)));
   const message=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
   if(Object.keys(message).sort().join(',')!=='channel,code,purpose,recipient'||message.purpose!=='canonical_account_stepup'||!/^\d{8}$/.test(message.code))fail();
   return {syntheticOnly:true,...message};
  }catch{fail();}finally{plain?.fill(0);}
 }
 return Object.freeze({kind:'EncryptedPersistentSyntheticMock',databaseId:config.databaseId,prepare,read,async send(message){
  if(!await db.prepare('SELECT challenge_id FROM consultation_preview_outbox WHERE challenge_id=?').bind(message.challengeId).first())fail();
 }});
}
export async function createPreviewAdapter(env,config,manifest){
 config=structuredClone(config);
 if(Object.keys(env).some(k=>!['CONSULTATION_DB','CONSULTATION_PREVIEW_ENABLED','CONSULTATION_KEYRING','CONSULTATION_ADMIN_SECRET','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED','SUBSCRIPTION_AUTOMATION_ENABLED'].includes(k)))fail();
 if(env.CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED!=='true'||env.CONSULTATION_MOCK_DELIVERY_ENABLED!=='true')fail();
 if(!/^[a-z0-9][a-z0-9-]{2,62}$/.test(config.isolatedPreviewProject)||config.isolatedPreviewProject==='quantumyijing-website')fail();
 const host=new URL(config.origin).hostname;
 if(host!==config.isolatedPreviewProject+'.pages.dev'&&!host.endsWith('.'+config.isolatedPreviewProject+'.pages.dev'))fail();
 const base=await validatePreviewContract(env,config,manifest);
 if(!base.keys.mockDelivery)fail();
 if(base.unknownCustomers!==0)fail();
 const db=createPreviewDatabase(base.db,config),localEnv={...env,CONSULTATION_DB:db};
 const transport=createEncryptedPreviewOutbox({db,config,key:base.keys.mockDelivery});
 const runtime=await composePreviewServices(localEnv,config,manifest,{mockDelivery:transport});
 const guards=createWorkflowGuards({db,origin:config.origin});
 const guest=createGuestBooking({db,origin:config.origin,keys:base.keys,config,policies:base.policies});
 const selfservice=createSelfService({db,origin:config.origin,keys:base.keys,config,guest});
 const pricingAdmin=createPricingAdmin({db,origin:config.origin,config});
 const handler=createWorkflowHandler({origin:config.origin,...runtime.services,policies:base.policies});
 async function bootstrap(request,input){
  if(!input||Object.keys(input).join(',')!=='customerId'||!Number.isSafeInteger(input.customerId)||input.customerId<1)fail();
  const a=await guards.qy(request,true),token=randomSecret(),digest=await tokenHash(token),now=Date.now();
  await db.batch([
   db.prepare("INSERT INTO academy_portal_sessions(customer_id,token_hash,created_at,expires_at) SELECT c.id,?,?,? FROM customers c JOIN consultation_preview_synthetic_customers s ON s.customer_id=c.id WHERE c.id=? AND c.status='Active' AND c.customer_reference GLOB 'SYNTHETIC-*' AND s.enabled=1 AND EXISTS("+a.sql+')').bind(digest,new Date(now).toISOString(),new Date(now+3600000).toISOString(),input.customerId,...a.values),
   db.prepare("INSERT INTO consultation_preview_events VALUES(CASE WHEN changes()=1 THEN ? ELSE NULL END,'Bootstrap',?,?,"+DB_NOW+')').bind(crypto.randomUUID(),a.principal.sessionId,String(input.customerId))]);
  return reply(200,{ok:true,syntheticOnly:true},{'set-cookie':'QY_PORTAL_SESSION='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=3600'});
 }
 return Object.freeze({async fetch(request){
  try{
   if(env.SUBSCRIPTION_AUTOMATION_ENABLED==='true'||env.CONSULTATION_PREVIEW_ENABLED!=='true'||env.CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED!=='true'||env.CONSULTATION_MOCK_DELIVERY_ENABLED!=='true')return reply(503,{ok:false,code:'PREVIEW_DISABLED'});
   await runtime.assertEnabled();
   const url=new URL(request.url);
   if(!url.pathname.startsWith('/api/consultation/'))return reply(404,{ok:false});
   if(!requestAllowed(request,config.origin,{mutation:request.method==='POST'})||[...url.searchParams.keys()].some(k=>k!=='id'))return reply(403,{ok:false,code:'PREVIEW_REQUEST_REJECTED'});
   const guestPath=url.pathname.replace('/api/consultation/','');
   if(guestPath==='qy/pricing'&&request.method==='GET')return reply(200,{ok:true,...await pricingAdmin.list(request)});
   if(guestPath==='qy/invitations'&&request.method==='POST'){const input=await readWorkflowBody(request,2048);if(input.action!=='revoke')return reply(410,{ok:false,code:'PRICING_INVITATIONS_RETIRED'});return reply(200,{ok:true,...await pricingAdmin.invitation(request,input)});}
   if(guestPath==='guest/invitation'&&request.method==='POST')return reply(410,{ok:false,code:'PRICING_INVITATIONS_RETIRED'});
   if(guestPath==='qy/discounts'&&request.method==='POST'){const input=await readWorkflowBody(request,2048);if(input.action!=='revoke')return reply(410,{ok:false,code:'DISCOUNT_CODES_RETIRED'});return reply(200,{ok:true,...await pricingAdmin.discount(request,input)});}
   if(['qy/promotions','qy/discounts'].includes(guestPath)&&request.method==='POST')return reply(200,{ok:true,...await pricingAdmin[guestPath==='qy/promotions'?'promotion':'discount'](request,await readWorkflowBody(request,2048))});
   if(guestPath==='guest/policies'&&request.method==='GET'){const time=(await db.prepare(`SELECT ${DB_NOW} n`).first()).n;return reply(200,{ok:true,policies:config.policies,pricing:(await currentPricing(db,config.productId,time)).price,syntheticOnly:true});}
   if(['guest/quote','guest/checkout'].includes(guestPath)&&request.method==='POST'){
    const input=await readWorkflowBody(request,20000);
    if(guestPath==='guest/quote')return reply(410,{ok:false,code:'SELF_SERVICE_CHECKOUT_RETIRED'});
    return reply(200,{ok:true,...await selfservice.checkout(input,{replayOnly:true})});
   }
   if(guestPath==='guest/calendar'&&request.method==='POST')await selfservice.expire();
   const guestOperations={'guest/calendar':'calendar','guest/requests':'submit','guest/review-request':'submitForReview','guest/offer':'view','guest/offer/accept':'accept','qy/guest/link':'issueLink'};
   if(Object.hasOwn(guestOperations,guestPath)&&request.method==='POST'){
    const input=await readWorkflowBody(request,20000);
    return reply(200,{ok:true,...await (guestPath==='qy/guest/link'?guest.issueLink(request,input):guest[guestOperations[guestPath]](input))});
   }
   if(url.pathname==='/api/consultation/preview/bootstrap'&&request.method==='POST')return await bootstrap(request,await readWorkflowBody(request,1024));
   if(url.pathname==='/api/consultation/qy/preview/outbox'&&request.method==='POST')return reply(200,{ok:true,...await transport.read(request,await readWorkflowBody(request,1024))});
   return await handler(request);
  }catch(error){if(appointmentErrorCodes.has(error.code))return reply(409,{ok:false,code:error.code});return reply(409,{ok:false,code:'PREVIEW_OPERATION_REJECTED'});}
 }});
}
