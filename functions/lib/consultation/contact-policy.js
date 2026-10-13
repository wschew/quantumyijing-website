// Consultation-only contact policy. No provider, portal or CRM writes.
export const CHANNELS=Object.freeze(['email','whatsapp']);
export const CHALLENGE_MS=10*60*1000;
export const WINDOW_MS=15*60*1000;
export const REQUEST_LIMIT=3;
export const VERIFY_LIMIT=10;
export const ATTEMPT_LIMIT=5;
export function normalizeContact(channel,value) {
 if(!CHANNELS.includes(channel)||typeof value!=='string')throw Error('Contact input rejected');
 const contact=value.trim();
 if(channel==='email'){
  if(contact.length>254||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(contact))throw Error('Contact input rejected');
  return contact.toLowerCase();
 }
 // Established QY Malaysian mobile variants, with strict international disambiguation.
 // Consultation storage stays +E.164; frozen CRM/WhatsApp digits-only values are unchanged.
 if(contact.length>80||!/^\+?[0-9 ()-]+$/.test(contact)||/[()]/.test(contact.replace(/\([0-9]+\)/g,'')))throw Error('Contact input rejected');
 let phone=contact.replace(/[ ()-]/g,'');
 if(/^01[0-9]{8,9}$/.test(phone))phone='+60'+phone.slice(1);
 else if(/^601[0-9]{8,9}$/.test(phone))phone='+'+phone;
 else if(phone.startsWith('00'))phone='+'+phone.slice(2);
 // Other bare country/national numbers are ambiguous without an explicit prefix.
 if(!/^\+[1-9][0-9]{7,14}$/.test(phone)||phone.startsWith('+600')||(phone.startsWith('+601')&&!/^\+601[0-9]{8,9}$/.test(phone)))throw Error('Contact input rejected');
 return phone;
}
