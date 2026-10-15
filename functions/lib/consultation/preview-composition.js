// U3-A unmounted Worker-compatible composition. No Node, public route or provisioning.
import {createWorkflowKeys,requirePreviewWorkflowConfiguration} from './workflow-runtime.js';
import {createCustomerIdentity} from './customer-identity.js';
import {createConsultationAuth} from './auth.js';
import {createCustomerContact} from './customer-contact.js';
import {createAccountStepup} from './account-stepup.js';
import {createConsultationWorkflow} from './workflow.js';
import {createWorkflowLifecycle} from './workflow-lifecycle.js';
import {createAppointmentPreferences} from './appointment-preferences.js';
import {createAvailability} from './availability.js';
import {createMeetingManagement} from './meeting-management.js';
import {createCustomerSearch} from './customer-search.js';
const fail=()=>{throw Error('Isolated consultation Preview unavailable');};
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
const digest=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
export async function validatePreviewContract(env,config,manifest){
 try{
  if(env.CONSULTATION_PREVIEW_ENABLED!=='true'||config.syntheticOnly!==true||config.environment!=='preview'||env.SUBSCRIPTION_AUTOMATION_ENABLED==='true')fail();
  const checked=requirePreviewWorkflowConfiguration({...config,enabled:env.CONSULTATION_PREVIEW_ENABLED,subscriptionAutomationEnabled:env.SUBSCRIPTION_AUTOMATION_ENABLED});
  const db=env.CONSULTATION_DB;
  if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function'||db===env.DB||db===env.ENQUIRIES_DB)fail();
  if(manifest?.version!==1||manifest.migrations?.length!==15||manifest.baselineCommit!=='2f554a2b6756ee0c803ca734679c56f1ac500243')fail();
  const manifestHash=await digest(JSON.stringify(manifest));
  if(config.manifestSha256!==manifestHash)fail();
  // One fresh SQLite snapshot per validation, never a cross-request cache.
  // Table-valued PRAGMAs preserve all prerequisite column checks.
  const snapshot=await db.prepare(`SELECT
   (SELECT json_object('enabled',enabled,'synthetic_only',synthetic_only,'database_id',database_id,'origin',origin,'manifest_sha256',manifest_sha256) FROM consultation_preview_environment WHERE id=1) marker,
   (SELECT json_group_array(json_object('ordinal',ordinal,'path',path,'canonical_sha256',canonical_sha256)) FROM (SELECT * FROM consultation_migration_ledger ORDER BY ordinal)) ledger,
   (SELECT json_group_array(json_object('name',name,'type',type)) FROM sqlite_master) schema,
   (SELECT json_group_array(json_object('table',t.value,'name',p.name)) FROM json_each(?) t JOIN pragma_table_info(t.value) p) columns,
   (SELECT json_object('sku',sku,'product_type',product_type,'price',price,'currency',currency) FROM products WHERE id=?) product,
   (SELECT status FROM coaches WHERE id=?) practitioner,
   (SELECT COUNT(*) FROM consultation_auth_account WHERE id=1 AND enabled=1) administrator,
   (SELECT COUNT(*) FROM customers c LEFT JOIN consultation_preview_synthetic_customers s ON s.customer_id=c.id WHERE s.customer_id IS NULL OR c.customer_reference NOT GLOB 'SYNTHETIC-*') unknownCustomers
  `).bind(JSON.stringify(['customers','products','coaches','orders','payments','academy_portal_sessions']),config.productId,config.practitionerId).first();
  const marker=JSON.parse(snapshot.marker);
  if(!marker||marker.enabled!==1||marker.synthetic_only!==1||marker.database_id!==checked.databaseId||marker.origin!==checked.origin||marker.manifest_sha256!==manifestHash)fail();
  const ledger=JSON.parse(snapshot.ledger);
  if(ledger.length!==manifest.migrations.length)fail();
  for(const [i,m] of manifest.migrations.entries())if(m.ordinal!==i+1||ledger[i].ordinal!==m.ordinal||ledger[i].path!==m.path||ledger[i].canonical_sha256!==m.sha256)fail();
  const schema=JSON.parse(snapshot.schema);
  for(const migration of manifest.migrations)for(const object of migration.objects)if(!schema.some(row=>row.name===object.name&&row.type===object.type))fail();
  const required={customers:['id','status','customer_reference'],products:['id','sku','product_type','price','currency'],coaches:['id','status','coach_code'],orders:['id','enquiry_id','total','currency','payment_status'],payments:['id','order_id','verification_status','accounting_eligible'],academy_portal_sessions:['id','customer_id','token_hash','expires_at','revoked_at']};
  for(const [table,columns] of Object.entries(required)){
   const rows=JSON.parse(snapshot.columns).filter(row=>row.table===table);
   if(columns.some(c=>!rows.some(r=>r.name===c)))fail();
  }
  if(!Number.isSafeInteger(config.productId)||config.productId<1||!Number.isSafeInteger(config.practitionerId)||config.practitionerId<1)fail();
  const product=JSON.parse(snapshot.product);
  if(product?.sku!=='CONSULT-BAZI'||product.product_type!=='consultation'||product.price!==1300||product.currency!=='MYR'||snapshot.practitioner!=='Approved')fail();
  if(snapshot.administrator!==1)fail();
  const policies={};
  for(const purpose of ['consultation_privacy','future_calculations','marketing','booking']){
   const p=config.policies?.[purpose];
   if(!p||!/^[-A-Za-z0-9_]{1,128}$/.test(p.version)||typeof p.text!=='string'||!p.text.trim()||await digest(p.text)!==p.hash)fail();
   policies[purpose]=Object.freeze({version:p.version,hash:p.hash});
  }
  if(!Array.isArray(config.countryCodes)||!config.countryCodes.length||config.countryCodes.some(c=>!(/^[A-Z]{2}$/).test(c)))fail();
  const keys=await createWorkflowKeys(env.CONSULTATION_KEYRING);
  if(!['challenge,contact,intake,lookup,meeting','challenge,contact,intake,lookup,meeting,mockDelivery'].includes(Object.keys(keys).sort().join(',')))fail();
  return {db,origin:checked.origin,keys,policies,unknownCustomers:snapshot.unknownCustomers};
 }catch{fail();}
}
export async function composePreviewServices(env,config,manifest,{mockDelivery}={}){
 const contract=await validatePreviewContract(env,config,manifest);
 // This is a trusted deployment dependency, never request JSON. Persistent transport is U3-B.
 if(mockDelivery?.kind!=='EncryptedPersistentSyntheticMock'||mockDelivery.databaseId!==config.databaseId||typeof mockDelivery.send!=='function')fail();
 const {db,origin,keys,policies}=contract;
 const identity=createCustomerIdentity({db,origin}),qyAuth=createConsultationAuth({db,origin});
 const stepup=createAccountStepup({db,origin,keys,mockDelivery:message=>mockDelivery.send(message),prepareMockDelivery:mockDelivery.prepare??null});
 const contacts=createCustomerContact({db,origin,keyProvider:keys.contact.provider,fingerprintKeyProvider:keys.lookup.provider,challengeKeyProvider:keys.challenge.provider,activeKeyId:keys.contact.activeKeyId,activeFingerprintKeyId:keys.lookup.activeKeyId,activeChallengeKeyId:keys.challenge.activeKeyId});
 const workflow=createConsultationWorkflow({db,origin,keys,stepup,contacts,productId:config.productId,practitionerId:config.practitionerId,policies,countryCodes:config.countryCodes,bookingPolicy:policies.booking});
 const services=Object.freeze({identity,qyAuth,stepup,contacts,workflow,lifecycle:createWorkflowLifecycle({db,origin,keys,stepup}),preferences:createAppointmentPreferences({db,origin,stepup}),availability:createAvailability({db,origin,practitionerId:config.practitionerId}),meetings:createMeetingManagement({db,origin,keys,stepup}),customerSearch:createCustomerSearch({db,origin})});
 // Future mounting MUST call this for every request; startup validation alone is insufficient.
 return Object.freeze({services,assertEnabled:()=>validatePreviewContract(env,config,manifest)});
}
