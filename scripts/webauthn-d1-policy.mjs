// Isolated synthetic transport/filter only. A MAC is NEVER session authority.
import {b64,bytes,hash} from './webauthn-synthetic-validation.mjs';
export const hexToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export const digest=async s=>{if(typeof s!=='string'||s.length>5500)throw Error('token');return b64(await hash(new TextEncoder().encode(s)));};
const enc=new TextEncoder();
async function key(secret){if(typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw Error('control key');return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function seal(value,secret){const data=b64(enc.encode(JSON.stringify(value)));return data+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(data))));}
export async function open(raw,secret){
 if(typeof raw!=='string'||raw.length>8000)throw Error('ticket');const parts=raw.split('.');
 if(parts.length!==2||!await crypto.subtle.verify('HMAC',await key(secret),bytes(parts[1],100),enc.encode(parts[0])))throw Error('MAC');
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes(parts[0],7900)));
}
function cookie(req,name){const raw=req.headers.get('cookie')||'';if(raw.length>8192)throw Error('cookie bound');const values=raw.split(';').map(s=>s.trim()).filter(s=>s.split('=')[0].trim()===name);if(values.length!==1||!values[0].startsWith(name+'='))throw Error('cookie');return values[0].slice(name.length+1);}
export async function binding(req,raw,secret,origin){
 if(req.headers.get('origin')!==origin||new URL(req.url).origin!==origin||!['same-origin',null].includes(req.headers.get('sec-fetch-site')))throw Error('origin');
 if(cookie(req,'__Host-QY_CONSULTATION')!==raw)throw Error('session binding');
 const g=await open(cookie(req,'__Host-QY_CONSULTATION_GATE'),secret),csrf=req.headers.get('x-qy-consultation-csrf');
 if(g.v!==1||g.kind!=='gate'||g.origin!==origin||g.hash!==await digest(raw)||g.csrf!==await digest(csrf)||!Number.isSafeInteger(g.issued)||!Number.isSafeInteger(g.expires)||g.expires-g.issued!==300000||g.issued>Date.now()||g.expires<=Date.now())throw Error('gate');return g;
}
export async function cookies(issued,secret,origin){
 const g=await seal({v:1,kind:'gate',origin,hash:issued.hash,csrf:issued.csrfHash,credential:issued.credential,issued:issued.issued,expires:issued.expires},secret);
 const suffix='; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=300';
 return ['__Host-QY_CONSULTATION='+issued.raw+suffix,'__Host-QY_CONSULTATION_GATE='+g+suffix];
}
