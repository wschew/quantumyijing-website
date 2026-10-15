// TEST-ONLY synthetic verification subset, NOT a WebAuthn implementation.
// No CBOR/registration, credential database, challenge state or session issuance.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export const from64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const to64=bytes=>btoa(String.fromCharCode(...bytes));
export function derToRaw(bytes){
 if(bytes.length<8||bytes.length>72||bytes[0]!==0x30||bytes[1]!==bytes.length-2)throw Error('DER');
 let offset=2;const raw=new Uint8Array(64);
 for(let n=0;n<2;n++){
  if(bytes[offset++]!==2)throw Error('DER integer');
  const size=bytes[offset++];if(size<1||size>33||offset+size>bytes.length)throw Error('DER length');
  let part=bytes.slice(offset,offset+size);offset+=size;
  if(part[0]&0x80||part.length>1&&part[0]===0&&!(part[1]&0x80))throw Error('DER sign/padding');
  if(part.length===33){if(part[0]!==0)throw Error('DER width');part=part.slice(1);}
  raw.set(part,32*n+32-part.length);
 }
 if(offset!==bytes.length)throw Error('DER trailing');return raw;
}
export async function importSyntheticKey(fixture){
 return crypto.subtle.importKey('jwk',fixture.publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
}
export async function verifySynthetic(fixture){
 try{
  const {expected}=fixture;
  if(fixture.clientData.length>4096||fixture.authData.length>128||fixture.signature.length>128)return false;
  const clientBytes=from64(fixture.clientData),client=JSON.parse(decoder.decode(clientBytes));
  if(client.type!=='webauthn.get'||client.challenge!==expected.challenge||client.origin!==expected.origin||client.crossOrigin!==false)return false;
  const auth=from64(fixture.authData);if(auth.length!==37)return false; // extension-free synthetic input only
  const rpHash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(expected.rpId)));
  if(!rpHash.every((v,i)=>v===auth[i]))return false;
  const flags=auth[32];if((flags&5)!==5||(flags&0xc0)!==0||(flags&0x10)&&!(flags&8))return false;
  const clientHash=new Uint8Array(await crypto.subtle.digest('SHA-256',clientBytes));
  const signed=new Uint8Array(69);signed.set(auth);signed.set(clientHash,37);
  return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await importSyntheticKey(fixture),derToRaw(from64(fixture.signature)),signed);
 }catch{return false;}
}
export async function runSynthetic(fixture,operation){
 if(operation==='public-key-import'){await importSyntheticKey(fixture);return true;}
 if(!await verifySynthetic(fixture))return false;
 if(operation==='assertion-and-session-crypto'){
  for(let i=0;i<2;i++)await crypto.subtle.digest('SHA-256',crypto.getRandomValues(new Uint8Array(32)));
 }
 return true;
}
