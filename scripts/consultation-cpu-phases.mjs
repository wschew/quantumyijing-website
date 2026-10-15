// Local-only phase attribution. Never imported by the application or bundled Worker.
import assert from 'node:assert/strict';
import {cpuUsage,hrtime} from 'node:process';
import {writeFileSync} from 'node:fs';
import {passwordHash,newPasswordRecord,equalHash} from '../functions/lib/consultation/auth-crypto.js';
import {createWorkflowKeys,requirePreviewWorkflowConfiguration} from '../functions/lib/consultation/workflow-runtime.js';
import {validatePreviewContract} from '../functions/lib/consultation/preview-composition.js';
import {encryptIntake,decryptIntake} from '../functions/lib/consultation/intake-crypto.js';
import {contactFingerprint} from '../functions/lib/consultation/contact-crypto.js';
import {meterDatabase} from './consultation-free-profile.mjs';
export async function measurePhases({env,config,manifest,password,output}){
 const samples=[];
 async function measure(name,fn,count=30,batch=1){
  for(let i=0;i<count;i++){
   const before=cpuUsage(),start=hrtime.bigint();
   for(let j=0;j<batch;j++)await fn();
   const wallMs=Number(hrtime.bigint()-start)/1e6,cpu=cpuUsage(before);
   samples.push({name,batch,cpuMs:(cpu.user+cpu.system)/1000,wallMs});
  }
 }
 const credential=await newPasswordRecord(password),keys=await createWorkflowKeys(env.CONSULTATION_KEYRING);
 const context={id:'synthetic-cpu',customerId:1,payloadVersion:1,schemaVersion:1,keyId:keys.intake.activeKeyId};
 const data={fullName:'Synthetic CPU',questions:'Synthetic private text '.repeat(100)};
 const encrypted=await encryptIntake(data,context,keys.intake.provider);
 await measure('PBKDF2-SHA256 verification 600000',async()=>assert.ok(equalHash(await passwordHash(password,credential.salt),credential.hash)));
 await measure('environment configuration validation',()=>requirePreviewWorkflowConfiguration({...config,enabled:'true'}));
 await measure('environment configuration validation batch',()=>requirePreviewWorkflowConfiguration({...config,enabled:'true'}),30,100);
 await measure('live environment/schema contract including key import',async()=>{
  const meter=meterDatabase(env.CONSULTATION_DB);await validatePreviewContract({...env,CONSULTATION_DB:meter.db},config,manifest);assert.equal(meter.stats.queries,1);
 });
 await measure('six-purpose key validation/import',()=>createWorkflowKeys(env.CONSULTATION_KEYRING));
 await measure('AES-256-GCM intake encryption',()=>encryptIntake(data,context,keys.intake.provider),100);
 await measure('AES-256-GCM intake decryption',async()=>assert.deepEqual(await decryptIntake(encrypted,keys.intake.provider),data),100);
 await measure('HMAC-SHA256 contact fingerprint',()=>contactFingerprint(keys.lookup.provider,keys.lookup.activeKeyId,'whatsapp','+60120000101'),100);
 await measure('AES-256-GCM intake encryption batch',()=>encryptIntake(data,context,keys.intake.provider),30,100);
 await measure('AES-256-GCM intake decryption batch',()=>decryptIntake(encrypted,keys.intake.provider),30,100);
 await measure('HMAC-SHA256 contact fingerprint batch',()=>contactFingerprint(keys.lookup.provider,keys.lookup.activeKeyId,'whatsapp','+60120000101'),30,100);
 // Security regressions: work factor, authenticated context, key separation and live guards.
 await assert.rejects(passwordHash(password,credential.salt,599999));
 assert.equal(equalHash(await passwordHash(password+'x',credential.salt),credential.hash),false);
 await assert.rejects(decryptIntake({...encrypted,customerId:2},keys.intake.provider));
 const tampered={...encrypted,ciphertext:encrypted.ciphertext.slice()};tampered.ciphertext[0]^=1;
 await assert.rejects(decryptIntake(tampered,keys.intake.provider));
 await assert.rejects(decryptIntake(encrypted,keys.contact.provider));
 const ring=JSON.parse(env.CONSULTATION_KEYRING);ring.lookup.keys[ring.lookup.active]=ring.intake.keys[ring.intake.active];
 await assert.rejects(createWorkflowKeys(JSON.stringify(ring)));
 await assert.rejects(validatePreviewContract({...env,CONSULTATION_PREVIEW_ENABLED:'false'},config,manifest));
 await assert.rejects(validatePreviewContract(env,{...config,manifestSha256:'0'.repeat(64)},manifest));
 writeFileSync(output,JSON.stringify({runtime:'Node process CPU (not workerd or deployed CPU)',securityChecks:8,payloadBytes:new TextEncoder().encode(JSON.stringify(data)).length,samples},null,2)+'\n',{flag:'wx'});
}
