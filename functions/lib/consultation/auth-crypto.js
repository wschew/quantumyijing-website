// Local-only authentication primitives; no network, logging or environment secrets.
// Work factor follows OWASP PBKDF2-HMAC-SHA256 guidance; never downgrade for runtime limits.
export const PASSWORD_ITERATIONS = 600000;
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2,'0')).join('');
export function randomSecret() {
 const bytes = new Uint8Array(32);
 crypto.getRandomValues(bytes);
 return hex(bytes);
}
export async function tokenHash(value) {
 return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
}
// Fixed-length, no early mismatch return; not a guaranteed constant-time JS primitive.
export function equalHash(left,right) {
 if (typeof left !== 'string' || typeof right !== 'string' || left.length !== 64 || right.length !== 64) return false;
 let difference = 0;
 for (let i=0;i<64;i++) difference |= left.charCodeAt(i)^right.charCodeAt(i);
 return difference === 0;
}
export function validPassword(password) {
 return typeof password === 'string' && password.length>=20 && encoder.encode(password).length<=128;
}
export async function passwordHash(password,salt,iterations=PASSWORD_ITERATIONS) {
 if (!validPassword(password) || !/^[a-f0-9]{64}$/.test(salt) || iterations!==PASSWORD_ITERATIONS) {
  throw Error('Invalid credential input');
 }
 const saltBytes = Uint8Array.from(salt.match(/../g),pair=>parseInt(pair,16));
 const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBytes,iterations},key,256));
}
export async function newPasswordRecord(password) {
 const salt = randomSecret();
 return Object.freeze({algorithm:'PBKDF2-SHA256',iterations:PASSWORD_ITERATIONS,salt,hash:await passwordHash(password,salt)});
}