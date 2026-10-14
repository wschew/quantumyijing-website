// Meeting-only authenticated encryption. No network, logs or user-controlled envelope metadata.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fields=['id','bookingId','customerId','revision','appointmentKind','appointmentId','appointmentVersion','startAt','endAt','keyId'];
const denied=()=>{throw Error('Meeting cryptography rejected');};
export function validateMeetingDetails(value){
 try{
  if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='joinUrl,meetingId,passcode')denied();
  if(typeof value.joinUrl!=='string'||value.joinUrl.length>1024||/[\s\\\x00-\x1f]/.test(value.joinUrl)||typeof value.meetingId!=='string'||typeof value.passcode!=='string')denied();
  const u=new URL(value.joinUrl),meetingId=value.meetingId.replace(/[ -]/g,'');
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!(u.hostname==='zoom.us'||/^[a-z0-9-]+\.zoom\.us$/.test(u.hostname))||!/^\/j\/\d{9,11}$/.test(u.pathname)||!/^\d{9,11}$/.test(meetingId)||u.pathname!=='/j/'+meetingId)denied();
  const entries=[...u.searchParams];if(entries.length>1||entries.some(([k,v])=>k!=='pwd'||!v||v.length>256||!/^[A-Za-z0-9._~+=/-]+$/.test(v)))denied();
  if(!/^[A-Za-z0-9@_-]{1,64}$/.test(value.passcode))denied();
  return {joinUrl:u.href,meetingId,passcode:value.passcode};
 }catch{denied();}
}
function context(value,envelope=false){
 if(!value||Array.isArray(value)||Object.keys(value).some(k=>![...fields,...(envelope?['nonce','ciphertext']:[])].includes(k)))denied();
 for(const k of ['id','bookingId','appointmentId','keyId'])if(typeof value[k]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value[k]))denied();
 for(const k of ['customerId','revision','appointmentVersion'])if(!Number.isSafeInteger(value[k])||value[k]<1)denied();
 if(!['Offer','Replacement'].includes(value.appointmentKind)||!Number.isSafeInteger(value.startAt)||value.endAt!==value.startAt+5400000)denied();
 return Object.fromEntries(fields.map(k=>[k,value[k]]));
}
async function key(provider,id,usage){const k=await provider(id);if(k?.extractable!==false||k.type!=='secret'||k.algorithm?.name!=='AES-GCM'||k.algorithm.length!==256||!k.usages.includes(usage))denied();return k;}
const aad=c=>encoder.encode(JSON.stringify(['qy-consultation-meeting-v1',...fields.map(k=>c[k])]));
export async function encryptMeeting(details,metadata,provider){
 try{const c=context(metadata),data=encoder.encode(JSON.stringify(validateMeetingDetails(details))),nonce=crypto.getRandomValues(new Uint8Array(12));try{const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad(c),tagLength:128},await key(provider,c.keyId,'encrypt'),data));return {...c,nonce,ciphertext};}finally{data.fill(0);}}catch{denied();}
}
export async function decryptMeeting(record,provider){
 try{const c=context(record,true);if(!(record.nonce instanceof Uint8Array)||record.nonce.length!==12||!(record.ciphertext instanceof Uint8Array)||record.ciphertext.length<16||record.ciphertext.length>4096)denied();const data=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:record.nonce,additionalData:aad(c),tagLength:128},await key(provider,c.keyId,'decrypt'),record.ciphertext));try{return validateMeetingDetails(JSON.parse(decoder.decode(data)));}finally{data.fill(0);}}catch{denied();}
}