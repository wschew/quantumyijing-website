// Ephemeral mathematical authenticators only. Never persist private keys.
import {b64,bytes,hash} from './webauthn-synthetic-validation.mjs';
const enc=new TextEncoder();
export const concat=(...parts)=>Uint8Array.from(parts.flatMap(p=>Array.from(p)));
export function encodeCBOR(v){
 const head=(m,n)=>n<24?Uint8Array.of(m*32+n):n<256?Uint8Array.of(m*32+24,n):Uint8Array.of(m*32+25,n>>8,n&255);
 if(typeof v==='number')return head(v<0?1:0,v<0?-1-v:v);
 if(typeof v==='string'){const b=enc.encode(v);return concat(head(3,b.length),b);}
 if(v instanceof Uint8Array)return concat(head(2,v.length),v);
 if(v instanceof Map)return concat(head(5,v.size),...Array.from(v,([k,v])=>concat(encodeCBOR(k),encodeCBOR(v))));
 throw Error('fixture CBOR');
}
export async function authenticator(){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 return {pair,id:b64(crypto.getRandomValues(new Uint8Array(32))),publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey)};
}
export function rawToDER(raw){
 const p=[raw.slice(0,32),raw.slice(32)].map(b=>{while(b.length>1&&b[0]===0)b=b.slice(1);if(b[0]&128)b=concat([0],b);return concat([2,b.length],b);});return concat([48,p[0].length+p[1].length],...p);
}
export async function response(a,o,{count=1,flags=o.kind==='create'?69:5,client={},clientDataBytes,authPatch,attestationPatch,cosePatch,userHandle=o.userHandle}={}){
 const clientData=clientDataBytes??enc.encode(JSON.stringify({type:'webauthn.'+o.kind,challenge:o.challenge,origin:o.origin,crossOrigin:false,...client}));
 const auth=new Uint8Array(37);auth.set(await hash(enc.encode(o.rpId)));auth[32]=flags;new DataView(auth.buffer).setUint32(33,count);
 let data=auth;
 if(o.kind==='create'){
  const id=bytes(a.id),cose=new Map([[1,2],[3,-7],[-1,1],[-2,bytes(a.publicKey.x)],[-3,bytes(a.publicKey.y)]]);cosePatch?.(cose);
  data=concat(auth,new Uint8Array(16),[id.length>>8,id.length&255],id,encodeCBOR(cose));
 }
 authPatch?.(data);
 const result={type:'public-key',id:a.id,rawId:a.id,clientExtensionResults:{},response:{clientDataJSON:b64(clientData)}};
 if(o.kind==='create'){
  const att=new Map([['fmt','none'],['attStmt',new Map()],['authData',data]]);attestationPatch?.(att);result.response.attestationObject=b64(encodeCBOR(att));
 }else{
  result.response.authenticatorData=b64(data);result.response.userHandle=userHandle;
  result.response.signature=b64(rawToDER(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},a.pair.privateKey,concat(data,await hash(clientData))))));
 }
 return result;
}
