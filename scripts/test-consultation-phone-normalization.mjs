import assert from 'node:assert/strict';
import {normalizeContact} from '../functions/lib/consultation/contact-policy.js';
import {normalizeMarketingContact} from '../functions/lib/marketing-consent.js';
import {contactFingerprint} from '../functions/lib/consultation/contact-crypto.js';
let passed=0;async function test(name,run){await run();passed++;console.log('PASS '+name);}
const variants=['0120000101','60120000101','+60120000101'];
for(let i=0;i<variants.length;i++)await test('Malaysian variant '+i+' canonicalizes',()=>assert.equal(normalizeContact('whatsapp',variants[i]),'+60120000101'));
for(const value of ['012-000 0101','+60 (12) 0000101','0060120000101'])await test('explicit formatting normalizes safely',()=>assert.equal(normalizeContact('whatsapp',value),'+60120000101'));
for(const value of ['+447700900101','00447700900101','+6587654321','+19999999999'])await test('explicit international input preserved',()=>assert.equal(normalizeContact('whatsapp',value),value.startsWith('00')?'+'+value.slice(2):value));
const invalid=['447700900101','6598765432','120000101','0200000101','012','6012','+600120000101','+601200001','+0120000101','+60abc120000101','++60120000101','60120000101 ext 2','+60120000101#2','+60(120000101','+600000000000','000120000101','+1'.repeat(100)];
for(let i=0;i<invalid.length;i++)await test('malformed or ambiguous input '+i+' rejected',()=>assert.throws(()=>normalizeContact('whatsapp',invalid[i])));
await test('frozen QY Malaysian marketing convention is compatible',()=>{for(const value of variants)assert.equal(normalizeMarketingContact('whatsapp',value,{country:'Malaysia'}),normalizeContact('whatsapp',value).slice(1));});
await test('canonical normalization is idempotent',()=>{for(const value of [...variants,'+447700900101'])assert.equal(normalizeContact('whatsapp',normalizeContact('whatsapp',value)),normalizeContact('whatsapp',value));});
await test('keyed fingerprints are identical for equivalent contacts',async()=>{const key=await crypto.subtle.generateKey({name:'HMAC',hash:'SHA-256',length:256},false,['sign','verify']);const hashes=await Promise.all(variants.map(value=>contactFingerprint(async()=>key,'synthetic-lookup-v1','whatsapp',value)));assert.equal(new Set(hashes).size,1);});
await test('email policy remains unchanged',()=>assert.equal(normalizeContact('email',' Synthetic@Example.Invalid '),'synthetic@example.invalid'));
console.log(`RESULT ${passed} passed, 0 failed; synthetic phone policy only`);
