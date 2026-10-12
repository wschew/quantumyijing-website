const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const CONTEXT = ['id', 'customerId', 'payloadVersion', 'schemaVersion', 'keyId'];
const ENVELOPE = [...CONTEXT, 'nonce', 'ciphertext'];
const deny = () => { throw Error('Private intake cryptography rejected'); };
function metadata(value, envelope = false) {
 const allowed = envelope ? ENVELOPE : CONTEXT;
 if (!value || typeof value !== 'object' || Array.isArray(value) ||
     Object.keys(value).some(k => !allowed.includes(k)) ||
     !Number.isSafeInteger(value.customerId) || value.customerId < 1 ||
     !Number.isSafeInteger(value.payloadVersion) || value.payloadVersion < 1 ||
     value.schemaVersion !== 1 ||
     ![value.id, value.keyId].every(v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v))) deny();
 return {id:value.id, customerId:value.customerId, payloadVersion:value.payloadVersion,
  schemaVersion:value.schemaVersion, keyId:value.keyId};
}
function aad(c) { return encoder.encode(JSON.stringify(CONTEXT.map(k => c[k]))); }
async function key(provider, id, usage) {
 const k = await provider(id);
 if (!k || k.extractable !== false || k.type !== 'secret' || k.algorithm?.name !== 'AES-GCM' ||
     k.algorithm.length !== 256 || !k.usages.includes(usage)) deny();
 return k;
}
export async function encryptIntake(data, context, provider) {
 try {
  const c = metadata(context);
  const bytes = encoder.encode(JSON.stringify(data));
  if (bytes.length > 16000) deny();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
   {name:'AES-GCM', iv:nonce, additionalData:aad(c), tagLength:128},
   await key(provider, c.keyId, 'encrypt'), bytes));
  return Object.freeze({...c, nonce, ciphertext});
 } catch { deny(); }
}
export async function decryptIntake(record, provider) {
 try {
  const c = metadata(record, true);
  if (!(record.nonce instanceof Uint8Array) || record.nonce.length !== 12 ||
      !(record.ciphertext instanceof Uint8Array) || record.ciphertext.length < 16 || record.ciphertext.length > 16384) deny();
  const bytes = await crypto.subtle.decrypt(
   {name:'AES-GCM', iv:record.nonce, additionalData:aad(c), tagLength:128},
   await key(provider, c.keyId, 'decrypt'), record.ciphertext);
  return JSON.parse(decoder.decode(bytes));
 } catch { deny(); }
}
