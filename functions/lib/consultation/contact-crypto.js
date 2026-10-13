import {identifier} from './foundation.js';
import {normalizeContact} from './contact-policy.js';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const FIELDS=['id','customerId','contextId','contextVersion','channel','kind','keyId','fingerprintKeyId','fingerprint','challengeKeyId','challengeHash','challengeId'];
const HEX=/^[a-f0-9]{64}$/;
const fail=()=>{throw Error('Contact cryptography rejected');};
function metadata(c,envelope=false){
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>![...FIELDS,...(envelope?['nonce','ciphertext']:[])].includes(k)))fail();
 for(const name of ['id','contextId','keyId','fingerprintKeyId','challengeKeyId','challengeId'])identifier(c[name]);
 if(!Number.isSafeInteger(c.customerId)||c.customerId<1||!Number.isSafeInteger(c.contextVersion)||c.contextVersion<1||
  !['email','whatsapp'].includes(c.channel)||!['Challenge','Proof'].includes(c.kind)||!HEX.test(c.fingerprint)||!HEX.test(c.challengeHash)||(c.kind==='Challenge'&&c.id!==c.challengeId))fail();
 return Object.fromEntries(FIELDS.map(k=>[k,c[k]]));
}
async function aes(provider,id,usage){const k=await provider(id);if(!k||k.extractable!==false||k.type!=='secret'||k.algorithm?.name!=='AES-GCM'||k.algorithm.length!==256||!k.usages.includes(usage))fail();return k;}
async function hmac(provider,id,usage){const k=await provider(id);if(!k||k.extractable!==false||k.type!=='secret'||k.algorithm?.name!=='HMAC'||k.algorithm.hash?.name!=='SHA-256'||k.algorithm.length!==256||!k.usages.includes(usage))fail();return k;}
const hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
export async function contactFingerprint(provider,keyId,channel,contact){try{identifier(keyId);const normalized=normalizeContact(channel,contact);return hex(await crypto.subtle.sign('HMAC',await hmac(provider,keyId,'sign'),encoder.encode(JSON.stringify(['qy-contact-lookup-v1',channel,normalized]))));}catch{fail();}}
function responseMessage(c,code){if(!HEX.test(code))fail();return encoder.encode(JSON.stringify(['qy-contact-response-v1',c.id,c.customerId,c.contextId,c.contextVersion,c.channel,'report_delivery',c.fingerprintKeyId,c.fingerprint,code]));}
export async function challengeDigest(provider,keyId,c,code){try{identifier(keyId);return hex(await crypto.subtle.sign('HMAC',await hmac(provider,keyId,'sign'),responseMessage(c,code)));}catch{fail();}}
export async function verifyChallengeDigest(provider,c,code){try{if(!HEX.test(c.challengeHash))fail();return await crypto.subtle.verify('HMAC',await hmac(provider,c.challengeKeyId,'verify'),Uint8Array.from(c.challengeHash.match(/../g),x=>parseInt(x,16)),responseMessage(c,code));}catch{fail();}}
function payload(data,c){if(!data||typeof data!=='object'||Object.keys(data).some(k=>!(c.kind==='Challenge'?['contact','code']:['contact']).includes(k))||normalizeContact(c.channel,data.contact)!==data.contact||(c.kind==='Challenge'&&!HEX.test(data.code)))fail();return data;}
export async function encryptContact(data,context,provider){try{const c=metadata(context);payload(data,c);const nonce=crypto.getRandomValues(new Uint8Array(12));const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:encoder.encode(JSON.stringify(FIELDS.map(k=>c[k]))),tagLength:128},await aes(provider,c.keyId,'encrypt'),encoder.encode(JSON.stringify(data))));return Object.freeze({...c,nonce,ciphertext});}catch{fail();}}
export async function decryptContact(record,provider){try{const c=metadata(record,true);if(!(record.nonce instanceof Uint8Array)||record.nonce.length!==12||!(record.ciphertext instanceof Uint8Array)||record.ciphertext.length<16||record.ciphertext.length>2048)fail();const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:record.nonce,additionalData:encoder.encode(JSON.stringify(FIELDS.map(k=>c[k]))),tagLength:128},await aes(provider,c.keyId,'decrypt'),record.ciphertext);return Object.freeze(payload(JSON.parse(decoder.decode(bytes)),c));}catch{fail();}}
