import {isAdult,dateParts,instant,identifier} from './foundation.js';
import {PURPOSES,isTrustedConsentSnapshot} from './intake-policy.js';
const fail=()=>{throw Error('Invalid consultation intake')};
function text(value,min,max){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\u0000-\u001f]/.test(value))fail();return value.trim();}
export function validatePrivateIntake(input,{now,customerId,contact,policies,countryCodes}) {
 instant(now);
 if(!Number.isSafeInteger(customerId)||customerId<1||contact?.customerId!==customerId||contact.verified!==true||!Number.isSafeInteger(contact.expiresAt)||contact.expiresAt<=now)fail();
 return validatePayload(input,{now,contact,policies,countryCodes});
}
export function validateGuestIntake(input,{now,contact,policies,countryCodes}) {
 instant(now);
 if(contact?.verified!==false)fail();
 return validatePayload(input,{now,contact,policies,countryCodes});
}
function validatePayload(input,{now,contact,policies,countryCodes}) {
 const allowed=['fullName','calculationGender','birthDate','birthTimePrecision','birthTime','birthCity','birthCountry','questions','reportChannel','selfBooking','adultAcknowledged','privacyAcknowledgement','futureCalculationsConsent','marketingConsent'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))fail();
 if(input.selfBooking!==true||input.adultAcknowledged!==true||!isAdult(input.birthDate,now))fail();
 dateParts(input.birthDate);
 if(!['male','female'].includes(input.calculationGender)||!['exact','approximate','unknown'].includes(input.birthTimePrecision))fail();
 if(input.birthTimePrecision==='unknown'){if(input.birthTime!==null)fail();}
 else if(typeof input.birthTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.birthTime))fail();
 if(!Array.isArray(countryCodes)||!countryCodes.includes(input.birthCountry)||!/^[A-Z]{2}$/.test(input.birthCountry))fail();
 if(!['email','whatsapp'].includes(input.reportChannel)||contact.channel!==input.reportChannel)fail();
 identifier(contact.reference);
 const consents=PURPOSES.map((purpose,i)=>{
  const policy=policies?.[purpose];
  if(!policy||typeof policy.version!=='string'||policy.version.trim().length<1||policy.version.length>128||!/^[a-f0-9]{64}$/.test(policy.hash))fail();
  const choice=input[['privacyAcknowledgement','futureCalculationsConsent','marketingConsent'][i]];
  if(i===0&&choice?.accepted!==true)fail();
  if(choice!==undefined&&(choice===null||typeof choice!=='object'||Array.isArray(choice)||Object.keys(choice).some(k=>!['accepted','version'].includes(k))||typeof choice.accepted!=='boolean'||choice.version!==policy.version))fail();
  return Object.freeze({purpose,policy_version:policy.version,policy_hash:policy.hash,state:choice?.accepted===true?'Granted':'Declined',occurred_at:now});
 });
 return Object.freeze({privateData:Object.freeze({fullName:text(input.fullName,2,120),calculationGender:input.calculationGender,birthDate:input.birthDate,birthTimePrecision:input.birthTimePrecision,birthTime:input.birthTime,birthCity:text(input.birthCity,2,120),birthCountry:input.birthCountry,questions:text(input.questions,1,2000),contact:{channel:contact.channel,reference:contact.reference,value:text(contact.value,3,254)},reportChannel:input.reportChannel}),consents:Object.freeze(consents)});
}
const withdrawalEvents = new WeakSet();
export function withdrawConsent(latest,now,{eventId=crypto.randomUUID()}={}) {
 instant(now); identifier(eventId);
 if (!isTrustedConsentSnapshot(latest) || latest.state !== 'Granted' || latest.sequence >= Number.MAX_SAFE_INTEGER || now < latest.occurred_at || eventId === latest.id) throw Error('Invalid consent withdrawal');
 const event = Object.freeze({id:eventId,intake_id:latest.intake_id,customer_id:latest.customer_id,
  purpose:latest.purpose,sequence:latest.sequence+1,policy_version:latest.policy_version,
  policy_hash:latest.policy_hash,state:'Withdrawn',occurred_at:now,
  previous_id:latest.id,previous_sequence:latest.sequence});
 withdrawalEvents.add(event);
 return event;
}
export function isWithdrawalEvent(event) { return withdrawalEvents.has(event); }
