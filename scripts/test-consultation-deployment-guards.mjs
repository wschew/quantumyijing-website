import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewConfiguration} from './review-consultation-preview.mjs';
import {createWorkflowKeys} from '../functions/lib/consultation/workflow-runtime.js';
import {encryptIntake,decryptIntake} from '../functions/lib/consultation/intake-crypto.js';
import {requirePagesPreview,PREVIEW_ORIGIN,PAGES_PROJECT,PREVIEW_BRANCH} from '../functions/lib/consultation/pages-boundary.js';
import {randomSecret} from '../functions/lib/consultation/auth-crypto.js';
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const template=JSON.parse(readFileSync('consultation-pages/wrangler.template.jsonc','utf8').replace(/^\/\/.*$/gm,''));
await test('unexpected service binding rejects review',()=>{const c=structuredClone(template);c.services=[{binding:'ACADEMY',service:'synthetic-denied'}];assert.throws(()=>reviewConfiguration(c));});
await test('unexpected Preview binding rejects review',()=>{const c=structuredClone(template);c.env.preview.kv_namespaces=[{binding:'CRM',id:'synthetic-denied'}];assert.throws(()=>reviewConfiguration(c));});
await test('prepared config contains disabled default and Production slots without D1',()=>assert.equal(reviewConfiguration(template).remoteReady,false));
for(const slot of ['default','production','preview'])await test(slot+' rejects enabled gates',()=>{const c=structuredClone(template);(slot==='default'?c:c.env[slot]).vars.CONSULTATION_PREVIEW_ENABLED='true';assert.throws(()=>reviewConfiguration(c));});
for(const change of ['production-binding','shared-project','provider','secret-var'])await test('configuration rejects '+change,()=>{const c=structuredClone(template);if(change==='production-binding')c.env.production.d1_databases=c.env.preview.d1_databases;if(change==='shared-project')c.name='quantumyijing-website';if(change==='provider')c.vars.ADMIN_TOKEN='synthetic-denied';if(change==='secret-var')c.env.preview.vars.CONSULTATION_KEYRING='synthetic-denied';assert.throws(()=>reviewConfiguration(c));});
const config={origin:PREVIEW_ORIGIN,isolatedPreviewProject:PAGES_PROJECT,previewBranch:PREVIEW_BRANCH};
const env={CONSULTATION_DEPLOYMENT_SLOT:'preview',CF_PAGES:'1',CF_PAGES_BRANCH:PREVIEW_BRANCH,CONSULTATION_CONFIG:JSON.stringify(config),CONSULTATION_KEYRING:'synthetic'};
await test('exact Preview branch identity passes boundary only',()=>requirePagesPreview(env,config));
for(const change of [{CONSULTATION_DEPLOYMENT_SLOT:'production'},{CF_PAGES_BRANCH:'main'},{CF_PAGES:undefined},{CONSULTATION_KEYRING:'x'.repeat(5001)}])await test('deployment boundary rejects '+Object.keys(change),()=>assert.throws(()=>requirePagesPreview({...env,...change},config)));
await test('bare project Production URL cannot pass with Preview slot variable',()=>assert.throws(()=>requirePagesPreview(env,{...config,origin:'https://'+PAGES_PROJECT+'.pages.dev'})));
const ring=Object.fromEntries(['intake','contact','lookup','challenge','meeting','mockDelivery'].map(p=>[p,{active:p+'-v1',keys:{[p+'-v1']:randomSecret()}}]));
const before=await createWorkflowKeys(JSON.stringify(ring)),context={id:'SYNTHETIC-INTAKE',customerId:1,payloadVersion:1,schemaVersion:1,keyId:'intake-v1'};
const encrypted=await encryptIntake({question:'Synthetic only'},context,before.intake.provider);
await test('six-purpose rotation retains old ciphertext and changes active version',async()=>{
 for(const p of Object.keys(ring)){ring[p].keys[p+'-v2']=randomSecret();ring[p].active=p+'-v2';}
 const rotated=await createWorkflowKeys(JSON.stringify(ring));
 assert.equal(rotated.intake.activeKeyId,'intake-v2');assert.equal((await decryptIntake({...context,...encrypted},rotated.intake.provider)).question,'Synthetic only');
 for(const p of Object.keys(ring)){assert.ok(await rotated[p].provider(p+'-v1'));assert.ok(await rotated[p].provider(p+'-v2'));}
});
await test('missing historical key fails closed rather than exposing ciphertext',async()=>{delete ring.intake.keys['intake-v1'];const keys=await createWorkflowKeys(JSON.stringify(ring));await assert.rejects(decryptIntake({...context,...encrypted},keys.intake.provider));});
await test('cross-purpose duplicate secret material rejects',async()=>{ring.mockDelivery.keys['mockDelivery-v2']=ring.intake.keys['intake-v2'];await assert.rejects(createWorkflowKeys(JSON.stringify(ring)));});
console.log('RESULT '+passed+' passed, 0 failed; synthetic keys only, no secret installation');
