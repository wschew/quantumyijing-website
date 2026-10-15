// TEST ONLY. Strict ES256/none-attestation/no-extension profile; no C1 imports.
import {derToRaw} from './consultation-passkey-bench-fixture.mjs';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
export const b64=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function bytes(s,max=8192){
 if(typeof s!=='string'||!s.length||s.length>max||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('encoding');
 const b=Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
 if(b64(b)!==s)throw Error('canonical encoding');return b;
}
export const hash=async b=>new Uint8Array(await crypto.subtle.digest('SHA-256',b));
export const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
// JSON.parse validates grammar but silently keeps the last duplicate member.
// Scan its original text as well, comparing decoded keys (including escapes).
// Unknown future members remain allowed, but duplicates anywhere fail closed.
function uniqueJSON(text){
 const value=JSON.parse(text);let p=0,nodes=0;
 const string=/"(?:[^"\\]|\\.)*"/y;
 const space=()=>{while(p<text.length&&/[ \t\r\n]/.test(text[p]))p++;};
 const readString=()=>{string.lastIndex=p;const match=string.exec(text);if(!match)throw Error('client JSON string');p=string.lastIndex;return JSON.parse(match[0]);};
 function scan(depth=0){
  space();if(depth>16||++nodes>256)throw Error('client JSON bounds');
  const start=text[p];
  if(start==='"'){readString();return;}
  if(start==='{'||start==='['){
   const object=start==='{',end=object?'}':']',keys=new Set();p++;space();
   if(text[p]===end){p++;return;}
   while(true){
    if(object){space();const key=readString();if(keys.has(key))throw Error('client JSON duplicate key');keys.add(key);space();if(text[p++]!==':')throw Error('client JSON colon');}
    scan(depth+1);space();if(text[p]===end){p++;return;}if(text[p++]!==',')throw Error('client JSON separator');
   }
  }
  const begin=p;while(p<text.length&&!/[,\]} \t\r\n]/.test(text[p]))p++;
  if(p===begin)throw Error('client JSON value');
 }
 scan();space();if(p!==text.length)throw Error('client JSON trailing');return value;
}
function clientData(clientBytes,expected){
 // Strict profile: UTF-8 without BOM, one object, unique decoded keys.
 // WebAuthn L3 7.1/7.2 permit absent crossOrigin; present must be false.
 // No cross-origin frames or Token Binding support: reject either reserved
 // tokenBinding or topOrigin member by presence, including malformed values.
 if(clientBytes[0]===0xef&&clientBytes[1]===0xbb&&clientBytes[2]===0xbf)throw Error('client UTF-8 BOM');
 const client=uniqueJSON(dec.decode(clientBytes));
 if(client===null||typeof client!=='object'||Array.isArray(client))throw Error('client object');
 for(const field of ['type','challenge','origin'])if(!Object.hasOwn(client,field)||typeof client[field]!=='string')throw Error('client field');
 if(client.type!==(expected.kind==='create'?'webauthn.create':'webauthn.get')||client.challenge!==expected.challenge||client.origin!==expected.origin)throw Error('client binding');
 if(Object.hasOwn(client,'crossOrigin')&&client.crossOrigin!==false)throw Error('client crossOrigin');
 if(Object.hasOwn(client,'topOrigin')||Object.hasOwn(client,'tokenBinding'))throw Error('client unsupported context');
}
// Bounded definite-length CBOR only. Reject duplicate keys, tags, floats,
// indefinite lengths, unsupported types, excessive nesting and trailing data.
export function cbor(data,start=0){
 let p=start,nodes=0;
 function read(depth=0){
  if(depth>8||++nodes>64||p>=data.length)throw Error('CBOR bounds');
  const h=data[p++],major=h>>5,ai=h&31;let n;
  if(ai<24)n=ai;
  else if(ai===24){if(p>=data.length)throw Error('CBOR truncated');n=data[p++];if(n<24)throw Error('CBOR minimal');}
  else if(ai===25){if(p+2>data.length)throw Error('CBOR truncated');n=data[p++]*256+data[p++];if(n<256)throw Error('CBOR minimal');}
  else throw Error('CBOR length');
  if(major===0)return n;if(major===1)return -1-n;
  if(major===2||major===3){if(p+n>data.length)throw Error('CBOR truncated');const b=data.slice(p,p+n);p+=n;return major===2?b:dec.decode(b);}
  if(major===5){const m=new Map();if(n>16)throw Error('CBOR map');for(let i=0;i<n;i++){const k=read(depth+1);if(!['number','string'].includes(typeof k)||m.has(k))throw Error('CBOR key');m.set(k,read(depth+1));}return m;}
  throw Error('CBOR type');
 }
 const value=read();return {value,end:p};
}
export async function validate(response,expected,credential){
 if(response.type!=='public-key'||response.id!==response.rawId)throw Error('credential envelope');
 const id=bytes(response.id,1400);if(id.length>1023)throw Error('credential ID');
 if(response.clientExtensionResults==null||Object.keys(response.clientExtensionResults).length)throw Error('extensions');
 const clientBytes=bytes(response.response.clientDataJSON,5500);clientData(clientBytes,expected);
 let auth,key;
 if(expected.kind==='create'){
  const raw=bytes(response.response.attestationObject),parsed=cbor(raw),a=parsed.value;
  if(parsed.end!==raw.length||!(a instanceof Map)||a.size!==3||a.get('fmt')!=='none'||!(a.get('attStmt') instanceof Map)||a.get('attStmt').size!==0)throw Error('attestation');
  auth=a.get('authData');
 }else auth=bytes(response.response.authenticatorData,2048);
 if(!(auth instanceof Uint8Array)||auth.length<37||!equal(auth.slice(0,32),await hash(enc.encode(expected.rpId))))throw Error('RP hash');
 const flags=auth[32],count=new DataView(auth.buffer,auth.byteOffset).getUint32(33);
 if((flags&5)!==5||(flags&0xa2)!==0||(flags&16)&&!(flags&8))throw Error('flags');
 // Conservative prototype policy: reject backup eligible/synced keys entirely.
 if(flags&24)throw Error('backup policy');
 if(expected.kind==='create'){
  if(!(flags&64)||auth.length<55)throw Error('attested data');
  const size=auth[53]*256+auth[54];if(size!==id.length||!equal(auth.slice(55,55+size),id))throw Error('attested ID');
  const parsed=cbor(auth,55+size),c=parsed.value;
  if(parsed.end!==auth.length||!(c instanceof Map)||c.size!==5||c.get(1)!==2||c.get(3)!==-7||c.get(-1)!==1||!(c.get(-2) instanceof Uint8Array)||c.get(-2).length!==32||!(c.get(-3) instanceof Uint8Array)||c.get(-3).length!==32)throw Error('COSE');
  key={kty:'EC',crv:'P-256',x:b64(c.get(-2)),y:b64(c.get(-3)),ext:true};
  await crypto.subtle.importKey('jwk',key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 }else{
  if(auth.length!==37||(flags&64)||!credential||credential.id!==response.id)throw Error('assertion credential');
  if(response.response.userHandle!==null&&response.response.userHandle!==expected.userHandle)throw Error('user handle');
  if(count===0||count<=credential.count)throw Error('counter');
  const publicKey=await crypto.subtle.importKey('jwk',credential.key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const signed=new Uint8Array(auth.length+32);signed.set(auth);signed.set(await hash(clientBytes),auth.length);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,derToRaw(bytes(response.response.signature,128)),signed))throw Error('signature');
 }
 return {id:response.id,key,count};
}
