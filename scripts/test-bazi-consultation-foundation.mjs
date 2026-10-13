// Local synthetic fixtures only. No endpoints, secrets or live providers.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import * as f from '../functions/lib/consultation/foundation.js';
import {transition,paymentDecision} from '../functions/lib/consultation/state.js';
let passed=0;const network=globalThis.fetch;globalThis.fetch=()=>{throw Error('Network forbidden in C1-C1 tests')};
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const t=s=>Date.parse(s),now=t('2026-10-11T00:00:00Z'),policyHash='a'.repeat(64);
const promo={id:'synthetic-promo',sku:'CONSULT-BAZI',version:1,state:'Draft',currency:'MYR',timezone:'Asia/Kuala_Lumpur',sellingPriceSen:98000,startsOn:'2026-10-11',endsOn:'2026-12-31',approvedBy:'synthetic-owner',approvedAt:now-1};
const args={id:'offer-1',bookingId:'booking-1',customerId:1,practitionerId:1,startAt:now+72*f.HOUR,issuedAt:now,policyVersion:'synthetic-policy-1',policyHash,promotion:promo};
const offer=await f.issueOffer(args),acceptance={now:now+1,customerId:1,policyHash,snapshotHash:offer.snapshotHash,acknowledged:true};
const accepted={...f.acceptOffer(offer,acceptance),orderId:1};
const booking={id:'booking-1',state:'PaymentPending',rowVersion:0,currentOfferId:offer.id,practitionerId:1,originalStartAt:offer.startAt,currentStartAt:offer.startAt,currentEndAt:offer.endAt,freeRescheduleUsed:false};
const payment={authoritative:true,verificationStatus:'Verified',currency:'MYR',amountSen:130000,offerId:offer.id,bookingId:offer.bookingId,orderId:1,capturedAt:now+2};
try{
 await test('72-hour boundary allowed',()=>assert.equal(offer.startAt-offer.issuedAt,72*f.HOUR));
 await test('one millisecond below 72 hours rejected',()=>assert.rejects(f.issueOffer({...args,startAt:args.startAt-1}),/lead/));
 await test('90-minute session',()=>assert.equal(offer.endAt-offer.startAt,f.SESSION));
 for(const state of ['Draft','Inactive','Revoked','Expired'])await test(state+' promotion never applies',()=>assert.equal(f.priceAt({issuedAt:now,promotion:{...promo,state}}).sellingPriceSen,130000));
 await test('explicit approved promotion applies',()=>assert.equal(f.priceAt({issuedAt:now,promotion:{...promo,state:'Active'}}).sellingPriceSen,98000));
 await test('promotion MYT start inclusive',()=>assert.equal(f.priceAt({issuedAt:t('2026-10-10T16:00:00Z'),promotion:{...promo,state:'Active',approvedAt:now-f.DAY}}).sellingPriceSen,98000));
 await test('promotion before MYT start standard',()=>assert.equal(f.priceAt({issuedAt:t('2026-10-10T15:59:59.999Z'),promotion:{...promo,state:'Active',approvedAt:now-f.DAY}}).sellingPriceSen,130000));
 await test('December 31 end inclusive',()=>assert.equal(f.priceAt({issuedAt:t('2026-12-31T15:59:59.999Z'),promotion:{...promo,state:'Active'}}).sellingPriceSen,98000));
 await test('January 1 standard',()=>assert.equal(f.priceAt({issuedAt:t('2026-12-31T16:00:00Z'),promotion:{...promo,state:'Active'}}).sellingPriceSen,130000));
 await test('active promotion without approval rejected',()=>assert.throws(()=>f.priceAt({issuedAt:now,promotion:{...promo,state:'Active',approvedBy:null}})));
 await test('Feng Shui promotion cannot apply',()=>assert.throws(()=>f.priceAt({issuedAt:now,promotion:{...promo,state:'Active',sku:'CONSULT-FENGSHUI'}})));
 await test('fractional sen rejected',()=>assert.throws(()=>f.priceAt({issuedAt:now,promotion:{...promo,state:'Active',sellingPriceSen:98000.5}})));
 await test('48-hour expiry is exclusive',()=>{assert(f.offerOpen(offer,offer.expiresAt-1));assert(!f.offerOpen(offer,offer.expiresAt));assert(!f.offerOpen(offer,now-1))});
 await test('expired acceptance rejected',()=>assert.throws(()=>f.acceptOffer(offer,{...acceptance,now:offer.expiresAt})));
 for(const overrides of [{acknowledged:false},{customerId:2},{policyHash:'b'.repeat(64)},{snapshotHash:'c'.repeat(64)}])await test('tampered acceptance rejected '+Object.keys(overrides),()=>assert.throws(()=>f.acceptOffer(offer,{...acceptance,...overrides})));
 await test('offer immutable and original unchanged',()=>{assert.throws(()=>{offer.sellingPriceSen=1});assert.equal(offer.state,'Issued');assert.equal(accepted.state,'Accepted')});
 await test('snapshot hash is server derived and sensitive to price',async()=>{const active=await f.issueOffer({...args,promotion:{...promo,state:'Active'}});assert.notEqual(active.snapshotHash,offer.snapshotHash)});
 await test('accepted price survives future promotion change',()=>{promo.sellingPriceSen=97000;assert.equal(accepted.sellingPriceSen,130000);promo.sellingPriceSen=98000});
 await test('24-hour reschedule boundary allowed',()=>assert.equal(f.rescheduleEligibility({requestedAt:offer.startAt-24*f.HOUR,startAt:offer.startAt,freeRescheduleUsed:false}),'FreeEligible'));
 await test('late by one millisecond not free',()=>assert.equal(f.rescheduleEligibility({requestedAt:offer.startAt-24*f.HOUR+1,startAt:offer.startAt,freeRescheduleUsed:false}),'Late'));
 await test('additional reschedule owner review',()=>assert.equal(f.rescheduleEligibility({requestedAt:now,startAt:offer.startAt,freeRescheduleUsed:true}),'OwnerReview'));
 await test('30-day MYT end inclusive',()=>{const deadline=f.replacementDeadline(t('2026-10-11T15:00:00Z'));assert.equal(deadline,t('2026-11-10T15:59:59.999Z'));assert(f.replacementAllowed({originalStart:t('2026-10-11T15:00:00Z'),replacementStart:deadline,now}));assert(!f.replacementAllowed({originalStart:t('2026-10-11T15:00:00Z'),replacementStart:deadline+1,now}))});
 const request={bookingId:booking.id,state:'Pending',requestedAt:now,appointmentStartSnapshot:booking.currentStartAt,originalStartSnapshot:booking.originalStartAt};
 await test('no slot routes owner review without mutation',()=>{const b={...booking,state:'Confirmed'};const result=f.approveReschedule(b,request,{now,actorRole:'owner',slotAvailable:false,expectedVersion:0});assert.equal(result.decision,'OwnerReview');assert.equal(result.booking,b);assert.equal(b.freeRescheduleUsed,false)});
 await test('approved replacement preserves original and consumes free once',()=>{const b={...booking,state:'Confirmed'};const result=f.approveReschedule(b,request,{now,actorRole:'owner',replacementStart:offer.startAt+f.DAY,slotAvailable:true,expectedVersion:0});assert.equal(result.decision,'Approved');assert.equal(result.booking.originalStartAt,b.originalStartAt);assert(result.booking.freeRescheduleUsed);assert(!b.freeRescheduleUsed)});
 await test('pending eligible request blocks no-show',()=>assert(!f.noShowAllowed({now:offer.endAt,startAt:offer.startAt,pendingRequests:[{state:'Pending',eligible:true}]})));
 await test('no-show not automatic before session end',()=>assert(!f.noShowAllowed({now:offer.endAt-1,startAt:offer.startAt})));
 const intake={fullName:'Synthetic Adult',calculationGender:'male',birthDate:'1990-02-28',birthTimePrecision:'exact',birthTime:'12:30',birthplace:'Synthetic locality',questions:'Synthetic consultation question',reportChannel:'email',consentVersion:'synthetic-consent',selfBooking:true,consultationConsent:true};
 const contact={verified:true,channel:'email',reference:'synthetic-verified-contact'};
 await test('adult private self-booking valid',()=>assert.equal(f.validateIntake(intake,{asOf:now,verifiedContact:contact}).fullName,'Synthetic Adult'));
 await test('adult birthday boundary',()=>{assert(f.isAdult('2008-10-11',now));assert(!f.isAdult('2008-10-12',now))});
 for(const overrides of [{birthDate:'2010-01-01'},{selfBooking:false},{consultationConsent:false},{birthDate:'2020-02-30'},{birthTime:'25:00'},{birthTimePrecision:'unknown',birthTime:'12:30'}])await test('invalid intake rejected '+Object.keys(overrides),()=>assert.throws(()=>f.validateIntake({...intake,...overrides},{asOf:now,verifiedContact:contact})));
 await test('unknown birth time accepted without invented value',()=>assert.equal(f.validateIntake({...intake,birthTimePrecision:'unknown',birthTime:null},{asOf:now,verifiedContact:contact}).birthTime,null));
 await test('unverified delivery contact rejected',()=>assert.throws(()=>f.validateIntake(intake,{asOf:now,verifiedContact:{...contact,verified:false}})));
 await test('report deadline third MYT calendar day',()=>assert.equal(f.reportDeadline(t('2026-10-11T16:01:00Z')),t('2026-10-15T15:59:59.999Z')));
 await test('24-month leap-day retention clamps month end',()=>assert.equal(f.retentionDeadline({completedAt:t('2024-02-29T03:04:05Z')}),t('2026-02-28T03:04:05Z')));
 await test('90 calendar days terminal intake retention',()=>assert.equal(f.retentionDeadline({terminalAt:now}),now+90*f.DAY));
 await test('pending booking has no automatic deletion deadline',()=>assert.equal(f.retentionDeadline({}),null));
 await test('completed retention wins over terminal date',()=>assert.equal(f.retentionDeadline({completedAt:now,terminalAt:now+1}),f.calendarMonthsLater(now,24)));
 await test('private role isolation',()=>{assert(f.privateAccess({role:'owner'}));assert(f.privateAccess({role:'practitioner',actorId:1,assignedPractitionerId:1}));assert(!f.privateAccess({role:'practitioner',actorId:2,assignedPractitionerId:1}));assert(!f.privateAccess({role:'booking_admin'}))});
 await test('verified capture before deadline confirms after deadline',()=>assert.equal(transition(booking,'Confirmed',{now:offer.expiresAt+1,expectedVersion:0,actorRole:'owner',offer:accepted,payment,slotReserved:true}).state,'Confirmed'));

 await test('owner resolves review only with verified full timely capture',()=>assert.equal(transition({...booking,state:'ExceptionReview'},'Confirmed',{now:offer.expiresAt+1,expectedVersion:0,actorRole:'owner',offer:accepted,payment,slotReserved:true}).state,'Confirmed'));
 await test('review cannot resolve on ambiguous evidence',()=>assert.throws(()=>transition({...booking,state:'ExceptionReview'},'Confirmed',{now:offer.expiresAt+1,expectedVersion:0,actorRole:'owner',offer:accepted,payment:{...payment,authoritative:false},slotReserved:true})));
 await test('review cannot resolve on late capture',()=>assert.throws(()=>transition({...booking,state:'ExceptionReview'},'Confirmed',{now:offer.expiresAt+1,expectedVersion:0,actorRole:'owner',offer:accepted,payment:{...payment,capturedAt:offer.expiresAt},slotReserved:true})));
 await test('review cannot resolve without reservation',()=>assert.throws(()=>transition({...booking,state:'ExceptionReview'},'Confirmed',{now:offer.expiresAt+1,expectedVersion:0,actorRole:'owner',offer:accepted,payment,slotReserved:false})));
 await test('booking admin cannot resolve payment review',()=>assert.throws(()=>transition({...booking,state:'ExceptionReview'},'Confirmed',{now:offer.expiresAt+1,expectedVersion:0,actorRole:'booking_admin',offer:accepted,payment,slotReserved:true})));

 for(const override of [{authoritative:false},{verificationStatus:'Unverified'},{amountSen:129999},{currency:'USD'},{capturedAt:null},{capturedAt:offer.expiresAt},{capturedAt:accepted.acceptedAt-1},{orderId:2}])await test('payment exception '+Object.keys(override),()=>assert.equal(paymentDecision(accepted,{...payment,...override}),'ExceptionReview'));
 await test('stale state version rejected',()=>assert.throws(()=>transition(booking,'Confirmed',{now,expectedVersion:1,actorRole:'owner',offer:accepted,payment,slotReserved:true})));
 await test('no reservation no confirmation',()=>assert.throws(()=>transition(booking,'Confirmed',{now,expectedVersion:0,actorRole:'owner',offer:accepted,payment,slotReserved:false})));
 await test('pending request prevents forfeiture transition',()=>assert.throws(()=>transition({...booking,state:'Confirmed'},'NoShowForfeited',{now:offer.endAt,expectedVersion:0,actorRole:'owner',pendingRequests:[{state:'Pending',eligible:true}]})));
 await test('lawful exception cannot silently forfeit',()=>assert.throws(()=>transition({...booking,state:'Confirmed'},'CancelledForfeited',{now,expectedVersion:0,actorRole:'owner',lawfulException:true})));
 await test('unassigned practitioner denied',()=>assert.throws(()=>transition({...booking,state:'Confirmed'},'Completed',{now:offer.endAt,expectedVersion:0,actorRole:'practitioner',actorId:2})));
 await test('booking admin cannot review private report',()=>assert.throws(()=>transition({...booking,state:'Completed'},'ReportReady',{now,expectedVersion:0,actorRole:'booking_admin',reportReviewed:true})));
 await test('delivery submission is not proof',()=>assert.throws(()=>transition({...booking,state:'ReportReady'},'ReportDelivered',{now,expectedVersion:0,actorRole:'owner',deliveryProven:false})));
 await test('completed transition sets report and retention clocks',()=>{const n=transition({...booking,state:'Confirmed'},'Completed',{now:offer.endAt,expectedVersion:0,actorRole:'practitioner',actorId:1});assert.equal(n.reportDueAt,f.reportDeadline(offer.endAt));assert.equal(n.privateRetentionUntil,f.calendarMonthsLater(offer.endAt,24))});
 await test('future payment capture cannot confirm',()=>assert.throws(()=>transition(booking,'Confirmed',{now:now+1,expectedVersion:0,actorRole:'owner',offer:accepted,payment,slotReserved:true})));
 await test('superseded current offer cannot confirm',()=>assert.throws(()=>transition({...booking,currentOfferId:'other'},'Confirmed',{now:now+3,expectedVersion:0,actorRole:'owner',offer:accepted,payment,slotReserved:true})));
 await test('stale reschedule approval rejected',()=>assert.throws(()=>f.approveReschedule({...booking,state:'Confirmed'},request,{now,replacementStart:offer.startAt+f.DAY,slotAvailable:true,actorRole:'owner',expectedVersion:1})));
 await test('lawful hold blocks retention action',()=>{assert(!f.retentionEligible({retentionUntil:now,lawfulHold:true},now));assert(f.retentionEligible({retentionUntil:now},now));assert(!f.retentionEligible({retentionUntil:null},now))});

 for (const value of ['false','true',0,1,null]) {
  await test('strict approval flag rejects '+String(value),()=>assert.throws(()=>f.approveReschedule(
   {...booking,state:'Confirmed'},request,{now,actorRole:'owner',expectedVersion:0,slotAvailable:true,ownerApproved:value})));
  await test('strict availability rejects '+String(value),()=>assert.throws(()=>f.approveReschedule(
   {...booking,state:'Confirmed'},request,{now,actorRole:'owner',expectedVersion:0,slotAvailable:value})));
 }
 for (const key of ['slotReserved','reportReviewed','deliveryProven','lawfulException']) {
  await test('transition rejects string '+key,()=>assert.throws(()=>transition(
   {...booking,state:'ReportReady'},'ReportDelivered',{now,expectedVersion:0,actorRole:'owner',deliveryProven:true,[key]:'false'})));
 }
 for (const actor of [{actorRole:'customer'},{actorRole:'practitioner',actorId:2},{actorRole:'booking_admin',ownerApproved:true}]) {
  await test('reschedule rejects unauthorized '+JSON.stringify(actor),()=>assert.throws(()=>f.approveReschedule(
   {...booking,state:'Confirmed'},request,{now,expectedVersion:0,slotAvailable:true,replacementStart:offer.startAt+f.DAY,...actor})));
 }
 await test('assigned practitioner may approve free operational reschedule',()=>assert.equal(f.approveReschedule(
  {...booking,state:'Confirmed'},request,{now,expectedVersion:0,slotAvailable:true,replacementStart:offer.startAt+f.DAY,actorRole:'practitioner',actorId:1}).decision,'Approved'));
 await test('future reschedule request rejected',()=>assert.throws(()=>f.approveReschedule(
  {...booking,state:'Confirmed'},{...request,requestedAt:now+1},{now,expectedVersion:0,actorRole:'owner'})));
 await test('replacement beyond window remains owner review even with owner flag',()=>assert.equal(f.approveReschedule(
  {...booking,state:'Confirmed'},request,{now,expectedVersion:0,slotAvailable:true,replacementStart:f.replacementDeadline(offer.startAt)+1,actorRole:'owner',ownerApproved:true}).decision,'OwnerReview'));
 for (const eligibility of [true,1]) await test('stored eligible request blocks no-show '+eligibility,()=>assert.equal(
  f.noShowAllowed({now:offer.endAt,startAt:offer.startAt,pendingRequests:[{state:'Pending',eligibility}]}),false));
 for (const eligibility of ['1',null,2]) await test('malformed eligibility fails closed '+eligibility,()=>assert.throws(()=>f.noShowAllowed({
  now:offer.endAt,startAt:offer.startAt,pendingRequests:[{state:'Pending',eligibility}]})));
 await test('missing and contradictory eligibility fail closed',()=>{
  assert.throws(()=>f.normalizeRescheduleRequest({state:'Pending'}));
  assert.throws(()=>f.normalizeRescheduleRequest({state:'Pending',eligible:false,eligibility:1}));
 });
 await test('early completion rejected at start and end-minus-one',()=>{
  for(const timestamp of [offer.startAt,offer.endAt-1]) assert.throws(()=>transition({...booking,state:'Confirmed'},'Completed',{
   now:timestamp,expectedVersion:0,actorRole:'owner'}),/ended/);
 });
 for (const to of ['PaymentPending','OfferExpired']) await test('stale offer rejected for '+to,()=>assert.throws(()=>transition(
  {...booking,state:'Offered',currentOfferId:'other'},to,{now:to==='OfferExpired'?offer.expiresAt:now+2,expectedVersion:0,actorRole:'owner',offer:accepted})));
 await test('offer transition assigns practitioner and schedule',()=>{
  const next=transition({...booking,state:'UnderReview',practitionerId:null},'Offered',{now,expectedVersion:0,actorRole:'owner',offer,slotReserved:true});
  assert.equal(next.practitionerId,offer.practitionerId);assert.equal(next.currentEndAt,offer.endAt);
 });
 await test('expired uncompleted booking receives 90-day retention',()=>{
  const expired=transition({...booking,state:'Offered'},'OfferExpired',{now:offer.expiresAt,expectedVersion:0,actorRole:'owner',offer});
  assert.equal(expired.privateRetentionUntil,offer.expiresAt+90*f.DAY);
  assert.throws(()=>transition(expired,'Confirmed',{now:offer.expiresAt,expectedVersion:expired.rowVersion,actorRole:'owner'}));
 });
 await test('duplicate transition and stale concurrent version rejected',()=>{
  const updated=transition(booking,'Confirmed',{now:now+3,expectedVersion:0,actorRole:'owner',offer:accepted,payment,slotReserved:true});
  assert.throws(()=>transition(updated,'Confirmed',{now:now+3,expectedVersion:1,actorRole:'owner',offer:accepted,payment,slotReserved:true}),/Illegal/);
  assert.throws(()=>transition(updated,'Completed',{now:offer.endAt,expectedVersion:0,actorRole:'owner'}),/Stale/);
 });
 await test('duplicate reschedule request cannot replay approved result',()=>{
  const result=f.approveReschedule({...booking,state:'Confirmed'},request,{now,expectedVersion:0,actorRole:'owner',slotAvailable:true,replacementStart:offer.startAt+f.DAY});
  assert.throws(()=>f.approveReschedule(result.booking,result.request,{now,expectedVersion:1,actorRole:'owner'}),/Pending/);
 });
 await test('calendar month end and leap-day adult boundaries',()=>{
  assert.equal(f.calendarMonthsLater(t('2024-01-31T12:00:00Z'),1),t('2024-02-29T12:00:00Z'));
  assert.equal(f.calendarMonthsLater(t('2025-01-31T12:00:00Z'),1),t('2025-02-28T12:00:00Z'));
  assert.equal(f.isAdult('2008-02-29',t('2026-02-28T00:00:00Z')),false);
  assert.equal(f.isAdult('2008-02-29',t('2026-03-01T00:00:00Z')),true);
 });
 await test('invalid offer identifiers rejected',async()=>{
  for(const id of ['',null,'bad id','../path']) await assert.rejects(f.issueOffer({...args,id}),/identifier/);
 });
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE products(id INTEGER PRIMARY KEY); CREATE TABLE customers(id INTEGER PRIMARY KEY); CREATE TABLE enquiries(id INTEGER PRIMARY KEY); CREATE TABLE coaches(id INTEGER PRIMARY KEY); CREATE TABLE orders(id INTEGER PRIMARY KEY); INSERT INTO products VALUES(1); INSERT INTO customers VALUES(1); INSERT INTO coaches VALUES(1);');
 const sql=readFileSync(new URL('../database/migrate-c1-bazi-consultation-foundation.sql',import.meta.url),'utf8');db.exec(sql);
 await test('all nine additive tables present',()=>assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'consultation_%'").get().n,9));
 const insertBooking=db.prepare("INSERT INTO consultation_bookings(id,reference,product_id,customer_id,state,report_channel,created_at,updated_at) VALUES(?,?,1,1,'Submitted','email',?,?)");insertBooking.run('b1','SYNTHETIC-B1',now,now);insertBooking.run('b2','SYNTHETIC-B2',now,now);insertBooking.run('b3','SYNTHETIC-B3',now,now);
 const insertOffer=db.prepare("INSERT INTO consultation_offers(id,booking_id,revision,state,practitioner_id,start_at,end_at,issued_at,expires_at,regular_price_sen,selling_price_sen,currency,policy_version,policy_hash,snapshot_hash,issued_by) VALUES(?,?,?,'Issued',1,?,?,?,?,130000,130000,'MYR','synthetic-policy',?,?,'synthetic-owner')");
 insertOffer.run('o1','b1',1,offer.startAt,offer.endAt,now,offer.expiresAt,policyHash,offer.snapshotHash);insertOffer.run('o2','b2',1,offer.startAt+f.SESSION,offer.endAt+f.SESSION,now,offer.expiresAt,policyHash,offer.snapshotHash);
 await test('SQL offer snapshot immutable',()=>assert.throws(()=>db.exec("UPDATE consultation_offers SET selling_price_sen=98000 WHERE id='o1'"),/immutable/));
 await test('SQL one current offer per booking',()=>assert.throws(()=>insertOffer.run('o3','b1',2,offer.startAt,offer.endAt,now,offer.expiresAt,policyHash,offer.snapshotHash),/UNIQUE/));
 await test('SQL acceptance requires policy evidence',()=>assert.throws(()=>db.exec("UPDATE consultation_offers SET state='Accepted' WHERE id='o1'"),/CHECK/));
 const slot=db.prepare("INSERT INTO consultation_slot_reservations(id,booking_id,offer_id,practitioner_id,start_at,end_at,state,hold_expires_at) VALUES(?,?,?,1,?,?,'Held',?)");slot.run('s1','b1','o1',offer.startAt,offer.endAt,offer.expiresAt);
 insertOffer.run('o3','b3',1,offer.startAt+1,offer.endAt+1,now,offer.expiresAt,policyHash,offer.snapshotHash);
 await test('SQL overlapping matching-offer slot rejected',()=>assert.throws(()=>slot.run('s3','b3','o3',offer.startAt+1,offer.endAt+1,offer.expiresAt),/overlap/));
 await test('SQL adjacent slot allowed',()=>slot.run('s2','b2','o2',offer.endAt,offer.endAt+f.SESSION,offer.expiresAt));
 await test('SQL update overlap rejected',()=>assert.throws(()=>db.prepare("UPDATE consultation_slot_reservations SET booking_id='b3',offer_id='o3',start_at=?,end_at=? WHERE id='s2'").run(offer.startAt+1,offer.endAt+1),/overlap/));
 await test('SQL foreign keys enforced',()=>assert.throws(()=>db.exec("INSERT INTO consultation_events VALUES('e1','missing',NULL,'Synthetic',NULL,NULL,'owner','synthetic',1,'c','cmd','{}')"),/FOREIGN KEY/));
 await test('SQL promotion defaults draft',()=>{db.exec("INSERT INTO consultation_promotions(id,product_id,version,selling_price_sen,starts_on,ends_on) VALUES('p1',1,1,98000,'2026-10-11','2026-12-31')");assert.equal(db.prepare("SELECT state FROM consultation_promotions WHERE id='p1'").get().state,'Draft')});
 await test('SQL activation without approval rejected',()=>assert.throws(()=>db.exec("UPDATE consultation_promotions SET state='Active' WHERE id='p1'"),/CHECK/));
 await test('SQL failed unit of work can be rolled back locally',()=>{db.exec('BEGIN');try{db.exec("INSERT INTO consultation_events VALUES('e1','b1',NULL,'Synthetic',NULL,NULL,'owner','synthetic',1,'c','cmd','{}')");assert.throws(()=>db.exec("UPDATE consultation_offers SET currency='USD' WHERE id='o1'"),/immutable/)}finally{db.exec('ROLLBACK')}assert.equal(db.prepare("SELECT COUNT(*) n FROM consultation_events").get().n,0)});

 await test('SQL NULL and invalid identifiers rejected',()=>{
  for(const id of [null,'','bad id','../path']) assert.throws(()=>insertBooking.run(id,'NULL-'+String(id),now,now));
 });
 await test('SQL start without end and noninteger timestamps rejected',()=>{
  assert.throws(()=>db.prepare("UPDATE consultation_bookings SET current_start_at=? WHERE id='b1'").run(offer.startAt),/CHECK/);
  assert.throws(()=>db.exec("UPDATE consultation_bookings SET updated_at=1.5 WHERE id='b1'"),/CHECK/);
 });
 await test('SQL NULL acceptance hashes rejected despite timestamp/customer',()=>{
  assert.throws(()=>db.prepare("UPDATE consultation_offers SET state='Accepted',accepted_at=?,acceptance_customer_id=1 WHERE id='o1'").run(now+1),/CHECK/);
 });
 db.exec('INSERT INTO customers VALUES(2); INSERT INTO coaches VALUES(2)');
 await test('SQL acceptance customer must own booking',()=>assert.throws(()=>db.prepare(
  "UPDATE consultation_offers SET state='Accepted',accepted_at=?,acceptance_customer_id=2,acceptance_policy_hash=policy_hash,acceptance_snapshot_hash=snapshot_hash WHERE id='o1'").run(now+1),/customer mismatch/));
 await test('SQL current offer must match booking and assignment',()=>{
  assert.throws(()=>db.prepare("UPDATE consultation_bookings SET current_offer_id='o2',practitioner_id=1,current_start_at=?,current_end_at=? WHERE id='b1'").run(offer.endAt,offer.endAt+f.SESSION),/mismatch/);
  assert.throws(()=>db.prepare("UPDATE consultation_bookings SET current_offer_id='o1',practitioner_id=2,current_start_at=?,current_end_at=? WHERE id='b1'").run(offer.startAt,offer.endAt),/mismatch/);
 });
 await test('SQL reservation cross-booking and mismatched expiry rejected',()=>{
  assert.throws(()=>slot.run('bad-slot','b2','o3',offer.startAt+1,offer.endAt+1,offer.expiresAt),/mismatch/);
  assert.throws(()=>slot.run('bad-slot','b3','o3',offer.startAt+1,offer.endAt+1,offer.expiresAt+1),/mismatch/);
 });
 await test('SQL booking ownership cannot change after offer',()=>assert.throws(()=>db.exec("UPDATE consultation_bookings SET customer_id=2 WHERE id='b1'"),/immutable/));
 await test('SQL valid acceptance persists and evidence cannot change',()=>{
  db.prepare("UPDATE consultation_offers SET state='Accepted',accepted_at=?,acceptance_customer_id=1,acceptance_policy_hash=policy_hash,acceptance_snapshot_hash=snapshot_hash WHERE id='o1'").run(now+1);
  assert.throws(()=>db.exec("UPDATE consultation_offers SET acceptance_customer_id=2 WHERE id='o1'"),/immutable/);
 });
 db.prepare("INSERT INTO consultation_reports(id,booking_id,version,object_key,sha256,size_bytes,mime_type,state,retention_until) VALUES('r1','b1',1,'synthetic/r1',?,1,'application/pdf','Uploaded',?)").run(policyHash,now+f.DAY);
 await test('SQL delivery cannot use another booking report',()=>assert.throws(()=>db.prepare(
  "INSERT INTO consultation_deliveries(id,booking_id,report_id,channel,template_version,deduplication_key,state,deadline_at) VALUES('d1','b2','r1','email','v1','synthetic-d1','Pending',?)").run(now),/mismatch/));
 await test('SQL event cannot use another booking offer',()=>assert.throws(()=>db.exec(
  "INSERT INTO consultation_events VALUES('cross','b1','o2','Synthetic',NULL,NULL,'owner','synthetic',1,'c','cross-command','{}')"),/mismatch/));
 await test('SQL duplicate command IDs reject repeated audit insertion',()=>{
  db.exec("INSERT INTO consultation_events VALUES('e1','b1',NULL,'Synthetic',NULL,NULL,'owner','synthetic',1,'c','cmd','{}')");
  assert.throws(()=>db.exec("INSERT INTO consultation_events VALUES('e2','b1',NULL,'Synthetic',NULL,NULL,'owner','synthetic',1,'c','cmd','{}')"),/UNIQUE/);
 });
 await test('SQL CAS permits one update and rejects stale unit atomically',()=>{
  const cas=db.prepare("UPDATE consultation_bookings SET row_version=row_version+1 WHERE id='b1' AND row_version=?");
  assert.equal(cas.run(0).changes,1);assert.equal(cas.run(0).changes,0);
  db.exec('BEGIN');
  try {
   // Demonstrates failure conversion, not a completed D1 adapter. changes() is evaluated
   // immediately after CAS; NULL command ID deliberately aborts the stale unit of work.
   cas.run(0);
   assert.throws(()=>db.exec("INSERT INTO consultation_events(id,booking_id,event_type,actor_role,actor_reference,occurred_at,correlation_id,command_id) VALUES('cas','b1','Synthetic','owner','synthetic',1,'c',CASE WHEN changes()=1 THEN 'cas-command' ELSE NULL END)"),/NOT NULL/);
  } finally { db.exec('ROLLBACK'); }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM consultation_events WHERE id='cas'").get().n,0);
  assert.equal(db.prepare("SELECT row_version FROM consultation_bookings WHERE id='b1'").get().row_version,1);
 });

 await test('SQL partial acceptance evidence cannot freeze invalid snapshot',()=>assert.throws(()=>db.prepare(
  "UPDATE consultation_offers SET accepted_at=? WHERE id='o2'").run(now+1),/CHECK/));
 await test('SQL invalid promotion calendar dates rejected',()=>assert.throws(()=>db.exec(
  "INSERT INTO consultation_promotions(id,product_id,version,selling_price_sen,starts_on,ends_on) VALUES('invalid-date',1,2,98000,'2026-02-30','2026-12-31')"),/CHECK/));
 await test('SQL blank command identifier rejected',()=>assert.throws(()=>db.exec(
  "INSERT INTO consultation_events VALUES('blank','b1',NULL,'Synthetic',NULL,NULL,'owner','synthetic',1,'c',' ','{}')"),/CHECK/));
 await test('eligible owner-review request remains protected from no-show',()=>assert.equal(f.noShowAllowed({
  now:offer.endAt,startAt:offer.startAt,pendingRequests:[{state:'OwnerReview',eligibility:1}]}),false));
 await test('SQL integrity and foreign keys',()=>{assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[])});db.close();

 if (process.env.QY_MINIFLARE_PATH) {
  const {createRequire}=await import('node:module');
  const {tmpdir}=await import('node:os');
  const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){throw new Error("No HTTP allowed")}}',
   compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-bazi-c1'},d1Persist:false,
   cf:false,telemetry:{enabled:false},rootPath:tmpdir()}));
  try {
   const local=await mf.getD1Database('DB');
   const definitions=sql.match(/CREATE TABLE[\s\S]*?\r?\n\);|CREATE (?:UNIQUE )?INDEX[^;]+;|CREATE TRIGGER[\s\S]*?END;/g);
   assert.equal(definitions.length,41);
   await local.batch(['CREATE TABLE products(id INTEGER PRIMARY KEY)',
    'CREATE TABLE customers(id INTEGER PRIMARY KEY)','CREATE TABLE enquiries(id INTEGER PRIMARY KEY)',
    'CREATE TABLE coaches(id INTEGER PRIMARY KEY)','CREATE TABLE orders(id INTEGER PRIMARY KEY)',
    'INSERT INTO products VALUES(1)','INSERT INTO customers VALUES(1)','INSERT INTO coaches VALUES(1)',
    ...definitions].map(statement=>local.prepare(statement)));
   await test('local D1 all nine tables and 21 triggers compile',async()=>{
    const rows=await local.prepare("SELECT type, COUNT(*) n FROM sqlite_schema WHERE name LIKE 'consultation_%' GROUP BY type").all();
    assert.equal(rows.results.find(r=>r.type==='table').n,9);
    assert.equal(rows.results.find(r=>r.type==='trigger').n,21);
   });
   await local.prepare("INSERT INTO consultation_bookings(id,reference,product_id,customer_id,state,report_channel,created_at,updated_at) VALUES('local-b','LOCAL-B',1,1,'Submitted','email',1,1)").run();
   await test('local D1 zero-row CAS aborts entire batch',async()=>{
    await assert.rejects(local.batch([
     local.prepare("UPDATE consultation_bookings SET updated_at=2 WHERE id='local-b'"),
     local.prepare("UPDATE consultation_bookings SET row_version=row_version+1 WHERE id='local-b' AND row_version=99"),
     local.prepare("INSERT INTO consultation_events(id,booking_id,event_type,actor_role,actor_reference,occurred_at,correlation_id,command_id) VALUES('local-e','local-b','Synthetic','owner','synthetic',1,'local-c',CASE WHEN changes()=1 THEN 'local-command' ELSE NULL END)")
    ]),/NOT NULL/);
    const row=await local.prepare("SELECT updated_at,row_version FROM consultation_bookings WHERE id='local-b'").first();
    assert.equal(row.updated_at,1);assert.equal(row.row_version,0);
   });
   await test('local D1 version CAS and audit commit together',async()=>{
    await local.batch([
     local.prepare("UPDATE consultation_bookings SET row_version=row_version+1 WHERE id='local-b' AND row_version=0"),
     local.prepare("INSERT INTO consultation_events(id,booking_id,event_type,actor_role,actor_reference,occurred_at,correlation_id,command_id) VALUES('local-e','local-b','Synthetic','owner','synthetic',1,'local-c',CASE WHEN changes()=1 THEN 'local-command' ELSE NULL END)")
    ]);
    assert.equal((await local.prepare("SELECT row_version FROM consultation_bookings WHERE id='local-b'").first()).row_version,1);
   });
   await test('local D1 duplicate command rolls back CAS',async()=>{
    await assert.rejects(local.batch([
     local.prepare("UPDATE consultation_bookings SET row_version=row_version+1 WHERE id='local-b' AND row_version=1"),
     local.prepare("INSERT INTO consultation_events(id,booking_id,event_type,actor_role,actor_reference,occurred_at,correlation_id,command_id) VALUES('local-e2','local-b','Synthetic','owner','synthetic',1,'local-c','local-command')")
    ]),/UNIQUE/);
    assert.equal((await local.prepare("SELECT row_version FROM consultation_bookings WHERE id='local-b'").first()).row_version,1);
   });
   await test('local D1 integrity and foreign keys',async()=>{
    assert.equal((await local.prepare('PRAGMA quick_check').first()).quick_check,'ok');
    assert.deepEqual((await local.prepare('PRAGMA foreign_key_check').all()).results,[]);
   });
  } finally { await mf.dispose(); }
 } else console.log('D1 emulator checks not run; set QY_MINIFLARE_PATH to an existing local installation');
 console.log('RESULT: '+passed+' passed, 0 failed; local synthetic databases only');
}finally{globalThis.fetch=network}
