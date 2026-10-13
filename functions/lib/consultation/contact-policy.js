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
 if(!/^\+[1-9][0-9]{7,14}$/.test(contact))throw Error('Contact input rejected');
 return contact;
}
