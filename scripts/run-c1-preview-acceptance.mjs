// Owner-invoked one-shot runner. No secret files, automatic retries or public endpoint.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {cloudflareClient} from './initialize-consultation-preview.mjs';
import {prepareSyntheticCleanup} from './consultation-synthetic-cleanup.mjs';
const ACCOUNT='f87d6f0679c6fe4c1c08af320850b52c',DATABASE='734455fd-cdec-4e14-ad6f-96f80f22f3e7';
const PROJECT='qy-c1-consultation-preview',ORIGIN='https://c1-bazi-consultation-develop.qy-c1-consultation-preview.pages.dev';
const START=Date.parse('2026-11-05T02:00:00Z'),END=START+5400000;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const fail=()=>{throw Error('Controlled test stopped');};
export async function runPreviewAcceptance(input,{management,fetcher=globalThis.fetch}={}){
 let secret=input?.secret,cookie=null,csrf=null,offerToken=null,stage='private-input',checks=0;
 const out={result:'BLOCKED',runId:crypto.randomUUID(),cleanup:'not run',historicalUnchanged:false};
 const requireTrue=v=>{if(!v)fail();checks++;};
 const base='/accounts/'+ACCOUNT,dbPath=base+'/d1/database/'+DATABASE;
 async function query(statements){const r=await management(dbPath+'/query',{batch:statements});if(!Array.isArray(r)||r.length!==statements.length||r.some(x=>x.success!==true||!Array.isArray(x.results)))fail();return r;}
 const read=async(sql,params=[])=> (await query([{sql,params}]))[0].results;
 async function identity(){
  const a=await management(base),d=await management(dbPath),p=await management(base+'/pages/projects/'+PROJECT);
  requireTrue(a.id===ACCOUNT&&d.uuid===DATABASE&&d.name==='qy-c1-consultation-preview-db'&&p.name===PROJECT&&p.production_branch==='c1-production-disabled');
  const preview=p.deployment_configs?.preview,prod=p.deployment_configs?.production,v=preview?.env_vars||{},config=JSON.parse(v.CONSULTATION_CONFIG?.value||'{}');
  requireTrue(preview?.d1_databases?.CONSULTATION_DB?.id===DATABASE&&Object.keys(preview.d1_databases).length===1&&prod&&Object.keys(prod.d1_databases||{}).length===0);
  requireTrue(config.environment==='preview'&&config.syntheticOnly===true&&config.origin===ORIGIN&&config.databaseId===DATABASE&&config.expectedDatabaseId===DATABASE&&config.isolatedPreviewProject===PROJECT&&config.previewBranch==='c1-bazi-consultation-development');
  requireTrue(v.CONSULTATION_DEPLOYMENT_SLOT?.value==='preview'&&prod.env_vars?.CONSULTATION_DEPLOYMENT_SLOT?.value==='disabled');
  for(const k of ['CONSULTATION_PREVIEW_ENABLED','CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED','CONSULTATION_MOCK_DELIVERY_ENABLED'])requireTrue(v[k]?.value==='true'&&prod.env_vars?.[k]?.value==='false');
  requireTrue(v.SUBSCRIPTION_AUTOMATION_ENABLED?.value==='false'&&prod.env_vars?.SUBSCRIPTION_AUTOMATION_ENABLED?.value==='false');
  const marker=(await read('SELECT * FROM consultation_preview_environment WHERE id=1'))[0];
  requireTrue(marker?.enabled===1&&marker.synthetic_only===1&&marker.database_id===DATABASE&&marker.origin===ORIGIN&&marker.manifest_sha256==='e8231fb3ed2cd732ac26f7b8ce049c2b72ded138858874b062ad8901c5e0ac17');
 }
 async function app(route,body,admin=false){
  const headers=body===undefined?{}:{'content-type':'application/json',origin:ORIGIN,'sec-fetch-site':'same-origin'};
  if(admin){if(route!=='qy/login'&&(!cookie||!csrf))fail();if(cookie)headers.cookie=cookie;if(csrf)headers['x-qy-consultation-csrf']=csrf;}
  const r=await fetcher(ORIGIN+'/api/consultation/'+route,{method:body===undefined?'GET':'POST',headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000),...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(route==='qy/login'){const raw=r.headers.get('set-cookie');if(raw)cookie=raw.split(';')[0];}
  const data=await r.json();if(!r.ok||data.ok!==true)fail();if(route==='qy/login')csrf=data.csrfToken;return data;
 }
 async function snapshot(){
  const result=[];const tables=await read("SELECT name FROM sqlite_schema WHERE type='table' AND ((name LIKE 'consultation_%' AND name NOT LIKE 'consultation_auth_%' AND name<>'consultation_guest_admission') OR name IN ('customers','customer_enquiry_links','orders','order_items','payments','products','coaches')) ORDER BY name");
  for(const {name}of tables){if(!/^[a-z0-9_]+$/.test(name))fail();const columns=await read('PRAGMA table_info("'+name+'")'),pk=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);if(!pk.length)fail();const rows=await read('SELECT * FROM "'+name+'" ORDER BY rowid');result.push({name,pk,rows:new Map(rows.map(r=>[JSON.stringify(pk.map(k=>r[k])),sha(JSON.stringify(r))]))});}return result;
 }
 async function unchanged(before){const after=await snapshot();requireTrue(after.length===before.length);for(let i=0;i<before.length;i++){requireTrue(after[i].name===before[i].name);for(const [id,hash]of before[i].rows)requireTrue(after[i].rows.get(id)===hash);}}
 try{
  requireTrue(typeof secret==='string'&&/^[a-f0-9]{64}$/.test(secret));input.secret=null;
  if(!management){stage='private-management-authentication';const cfg=fs.readFileSync(path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=/^oauth_token\s*=\s*"([^"\r\n]+)"/m.exec(cfg)?.[1],expiry=/^expiration_time\s*=\s*"([^"\r\n]+)"/m.exec(cfg)?.[1];if(!token||expiry&&Date.parse(expiry)<=Date.now())fail();management=cloudflareClient(token);}
  stage='target-verification';await identity();
  stage='historical-baseline';const baseline=await snapshot();requireTrue((await read('SELECT id FROM consultation_bookings WHERE reference=?',['BAZI-faffbbee-4f2e-48d2-ad64-66e0337b6264'])).length===1);out.historicalTables=baseline.length;
  stage='appointment-preflight';requireTrue(START>=Date.now()+259200000&&START<=Date.now()+31*86400000);
  requireTrue((await read('SELECT id FROM consultation_availability_windows WHERE practitioner_id=1 AND start_at<? AND end_at>?',[END,START])).length===0);
  requireTrue((await read("SELECT id FROM consultation_slot_reservations WHERE practitioner_id=1 AND state IN ('Held','Confirmed') AND start_at<? AND end_at>?",[END,START])).length===0);
  requireTrue((await read("SELECT id FROM consultation_workflow_appointments WHERE practitioner_id=1 AND state='Active' AND start_at<? AND end_at>?",[END,START])).length===0);
  stage='administrator-login';await app('qy/login',{username:'qyadmin',password:secret},true);secret=null;requireTrue(/^__Host-QY_CONSULTATION=[a-f0-9]{64}$/.test(cookie||'')&&/^[a-f0-9]{64}$/.test(csrf||''));
  stage='public-policies';const {policies}=await app('guest/policies');requireTrue(!!policies?.booking?.hash&&!!policies?.consultation_privacy?.version);
  const runStartedAt=Date.now(),commandId=crypto.randomUUID();
  stage='request-submission';const submitted=await app('guest/review-request',{commandId,intake:{fullName:'Synthetic C1 Acceptance Adult',calculationGender:'female',birthDate:'1990-06-15',birthTimePrecision:'unknown',birthTime:null,birthCity:'Synthetic City',birthCountry:'MY',questions:'Disposable synthetic acceptance test. No real consultation or payment.',reportChannel:'email',selfBooking:true,adultAcknowledged:true,privacyAcknowledgement:{accepted:true,version:policies.consultation_privacy.version}},contact:'c1-acceptance@example.invalid',preferredStart:START,bookingAcknowledgement:{accepted:true,version:policies.booking.version,hash:policies.booking.hash}});
  out.bookingReference=submitted.reference;
  const b=(await read('SELECT b.*,g.intake_id,g.command_id,g.fingerprint FROM consultation_bookings b JOIN consultation_guest_intakes g ON g.booking_id=b.id WHERE g.command_id=?',[commandId]))[0];
  requireTrue(b&&b.reference===submitted.reference&&b.state==='UnderReview'&&b.current_offer_id===null);out.underReview=true;
  requireTrue((await read('SELECT id FROM consultation_slot_reservations WHERE booking_id=?',[b.id])).length===0);
  requireTrue((await read('SELECT id FROM consultation_availability_windows WHERE practitioner_id=1 AND start_at<? AND end_at>?',[END,START])).length===0);
  stage='offer-issuance';const offerCommand=crypto.randomUUID(),issued=await app('qy/offer',{id:b.id,expectedVersion:b.row_version,commandId:offerCommand,startAt:START,finalPriceSen:88000,description:'Disposable synthetic acceptance test'},true);
  requireTrue(issued.state==='Offered'&&issued.offer.sellingPriceSen===88000);
  const events=await read('SELECT e.window_id,w.* FROM consultation_availability_events e JOIN consultation_availability_windows w ON w.id=e.window_id WHERE e.command_id=?',[offerCommand]);requireTrue(events.length===1&&events[0].state==='Active'&&events[0].start_at===START&&events[0].end_at===END);out.automaticAvailability=true;
  requireTrue((await read('SELECT id FROM consultation_slot_reservations WHERE booking_id=?',[b.id])).length===0);
  const originalOffer=(await read('SELECT * FROM consultation_offers WHERE id=?',[issued.offer.id]))[0],originalPrice=(await read('SELECT * FROM consultation_individual_offer_prices WHERE offer_id=?',[issued.offer.id]))[0];
  stage='private-offer-link';const link=await app('qy/guest/link',{id:b.id},true),url=new URL(link.url);requireTrue(url.origin===ORIGIN&&url.pathname==='/customer.html');offerToken=new URLSearchParams(url.hash.slice(1)).get('offer');requireTrue(/^[a-f0-9]{64}$/.test(offerToken||''));link.url=null;
  const view=await app('guest/offer',{token:offerToken});requireTrue(view.sellingPriceSen===88000&&view.snapshotHash===originalOffer.snapshot_hash);
  const acceptance={token:offerToken,acknowledged:true,snapshotHash:view.snapshotHash,policyHash:view.policyHash};
  stage='customer-acceptance';requireTrue((await app('guest/offer/accept',acceptance)).state==='PaymentPending');
  const inspectAccepted=async()=>{const booking=(await read('SELECT * FROM consultation_bookings WHERE id=?',[b.id]))[0],offer=(await read('SELECT * FROM consultation_offers WHERE id=?',[issued.offer.id]))[0],reservations=await read('SELECT * FROM consultation_slot_reservations WHERE booking_id=?',[b.id]);requireTrue(booking.state==='PaymentPending'&&booking.original_start_at===null&&offer.state==='Accepted'&&offer.order_id===null&&offer.selling_price_sen===88000&&offer.snapshot_hash===originalOffer.snapshot_hash&&offer.acceptance_snapshot_hash===view.snapshotHash&&offer.acceptance_policy_hash===view.policyHash);requireTrue(reservations.length===1&&reservations[0].state==='Held'&&reservations[0].offer_id===offer.id&&reservations[0].practitioner_id===1&&reservations[0].start_at===START&&reservations[0].end_at===END);requireTrue(JSON.stringify((await read('SELECT * FROM consultation_individual_offer_prices WHERE offer_id=?',[offer.id]))[0])===JSON.stringify(originalPrice));requireTrue((await read('SELECT id FROM consultation_capture_reviews WHERE booking_id=?',[b.id])).length===0&&(await read('SELECT id FROM consultation_capture_audit WHERE booking_id=?',[b.id])).length===0);return {booking,offer,reservation:reservations[0]};};
  await inspectAccepted();out.paymentPending=true;
  stage='duplicate-acceptance';requireTrue((await app('guest/offer/accept',acceptance)).duplicate===true);const accepted=await inspectAccepted();out.singleReservation=true;acceptance.token=null;offerToken=null;
  stage='historical-before-cleanup';await unchanged(baseline);const beforeCleanup=await snapshot();
  stage='cleanup-target-verification';await identity();
  const plan=prepareSyntheticCleanup({bookingId:b.id,bookingReference:b.reference,offerId:issued.offer.id,reservationId:accepted.reservation.id,customerId:b.customer_id,intakeId:b.intake_id,requestCommandId:commandId,requestFingerprint:b.fingerprint,snapshotHash:view.snapshotHash,expectedVersion:accepted.booking.row_version,startAt:START,runId:out.runId,runStartedAt,runExpiresAt:runStartedAt+21600000,ownerApprovalReference:'owner-approved-final-preview-test'});requireTrue(plan.databaseId===DATABASE&&plan.statements.length===6);
  stage='atomic-cleanup';const cleaned=await query(plan.statements);requireTrue(cleaned[1].results[0]?.cleanup_guard===1&&cleaned[3].results[0]?.cleanup_guard===1);out.cleanup='executed';
  stage='cleanup-verification';requireTrue((await read('SELECT state FROM consultation_bookings WHERE id=?',[b.id]))[0]?.state==='OwnerReview');requireTrue((await read('SELECT state FROM consultation_slot_reservations WHERE id=?',[accepted.reservation.id]))[0]?.state==='Released');
  requireTrue((await read('SELECT id FROM consultation_events WHERE id=?',['cleanup-'+out.runId])).length===1&&(await read('SELECT id FROM consultation_workflow_lifecycle_events WHERE id=?',['cleanup-review-'+out.runId])).length===1);
  requireTrue(JSON.stringify((await read('SELECT * FROM consultation_individual_offer_prices WHERE offer_id=?',[issued.offer.id]))[0])===JSON.stringify(originalPrice));requireTrue((await read('SELECT state FROM consultation_availability_windows WHERE id=?',[events[0].window_id]))[0]?.state==='Active');
  const afterCleanup=await snapshot();requireTrue(afterCleanup.length===beforeCleanup.length);
  for(let i=0;i<beforeCleanup.length;i++){const before=beforeCleanup[i],after=afterCleanup[i];requireTrue(after.name===before.name);const skip=before.name==='consultation_bookings'?JSON.stringify([b.id]):before.name==='consultation_slot_reservations'?JSON.stringify([accepted.reservation.id]):null;for(const [id,hash]of before.rows)if(id!==skip)requireTrue(after.rows.get(id)===hash);requireTrue(after.rows.size===before.rows.size+(['consultation_events','consultation_workflow_lifecycle_events'].includes(before.name)?1:0));}
  stage='historical-after-cleanup';await unchanged(baseline);out.historicalUnchanged=true;out.cleanup='released; audit verified';out.result='PASS';
 }catch{out.result='BLOCKED';out.stoppedStage=stage;}
 finally{
  if(cookie&&csrf){try{await app('qy/logout',{},true);out.sessionDisposed=true;}catch{out.result='BLOCKED';out.logout='not verified';out.stoppedStage??='logout';}}
  else if(cookie){out.result='BLOCKED';out.logout='not verified';out.stoppedStage??='logout';}
  secret=null;cookie=null;csrf=null;offerToken=null;if(input)input.secret=null;management=null;
 }
 out.checks=checks;return out;
}
async function main(){
 const mode=process.argv[2];if(process.argv.length!==3||!['--execute-approved-preview','--local-self-test'].includes(mode))fail();
 let bytes=0,chunks=[],buffer,text,input;
 try{for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>4096)fail();chunks.push(chunk);}buffer=Buffer.concat(chunks);text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);input=JSON.parse(text);if(Object.keys(input).length!==1||typeof input.secret!=='string')fail();for(const b of chunks)b.fill(0);buffer.fill(0);text=null;chunks=[];
  if(mode==='--local-self-test'){const {selfTest}=await import('./test-c1-preview-launcher.mjs');await selfTest(input);}
  else{const result=await runPreviewAcceptance(input);console.log(JSON.stringify(result));if(result.result!=='PASS')process.exitCode=1;}
 }finally{for(const b of chunks)b.fill(0);buffer?.fill(0);text=null;if(input)input.secret=null;chunks=[];}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.log(JSON.stringify({result:'BLOCKED',stoppedStage:'private-launcher-input',remoteTestNotStarted:true}));process.exitCode=1;});
