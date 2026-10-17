// Existing prepared Worker + disposable SQLite only. Never executes remote SQL.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const packagePath=resolve('.local-c1-package-preview-individual-offers-1792227841991');
let source=readFileSync(new URL('./test-consultation-individual-offers.mjs',import.meta.url),'utf8');
source=source.replace("const output=resolve('.local-c1-package-preview-individual-offers-'+Date.now());\nconst packageInfo=await buildPackage(output,process.env.QY_ESBUILD_PATH);",`const output=${JSON.stringify(packagePath)};
const packageInfo={publicPath:resolve(output,'public'),offline:resolve(output,'offline'),manifest:JSON.parse(readFileSync(resolve(output,'offline/migration-manifest.json'),'utf8'))};`);
source=source.replace("databaseId='11111111-2222-4333-8444-555555555555'","databaseId='734455fd-cdec-4e14-ad6f-96f80f22f3e7'");
source=source.replace('const unavailableStart=start+4*86400000',"const unavailableStart=Date.parse('2026-11-05T02:00:00Z')");
source="import {prepareSyntheticCleanup} from "+JSON.stringify(pathToFileURL(resolve('scripts/consultation-synthetic-cleanup.mjs')).href)+";\n"+source;
const hook=String.raw`
 // No more application calls: configure only this disposable mirror for the fixed target guard.
 clock=freeCase.created_at+3600000;
 const cleanupBooking=raw.prepare('SELECT * FROM consultation_bookings WHERE id=?').get(freeCase.id);
 const cleanupGuest=raw.prepare('SELECT * FROM consultation_guest_intakes WHERE booking_id=?').get(freeCase.id);
 const cleanupReservation=raw.prepare('SELECT * FROM consultation_slot_reservations WHERE booking_id=?').get(freeCase.id);
 const cleanupScope={bookingId:freeCase.id,bookingReference:cleanupBooking.reference,offerId:freeOffer.data.offer.id,reservationId:cleanupReservation.id,customerId:cleanupBooking.customer_id,intakeId:cleanupGuest.intake_id,requestCommandId:cleanupGuest.command_id,requestFingerprint:cleanupGuest.fingerprint,snapshotHash:freeView.data.snapshotHash,expectedVersion:cleanupBooking.row_version,startAt:unavailableStart,runId:crypto.randomUUID(),runStartedAt:freeCase.created_at,runExpiresAt:freeCase.created_at+21600000,ownerApprovalReference:'LOCAL-SYNTHETIC-OWNER-APPROVAL'};
 const image=()=>Object.fromEntries(raw.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,raw.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));
 function executeCleanup(plan){raw.exec('SAVEPOINT cleanup_batch');try{for(const p of plan.statements)raw.prepare(p.sql.replaceAll("'now'","'"+new Date(clock).toISOString()+"'")).all(...p.params);raw.exec('RELEASE cleanup_batch');}catch(error){raw.exec('ROLLBACK TO cleanup_batch');raw.exec('RELEASE cleanup_batch');throw error;}}
 let cleanupChecks=0;
 const cleanupCheck=(v,label)=>{check(v,label);cleanupChecks++;};
 function rejected(label,mutate=()=>{},scope={...cleanupScope},changePlan=p=>p){raw.exec('SAVEPOINT cleanup_fixture');try{mutate();const before=JSON.stringify(image());let rejected=false;try{executeCleanup(changePlan(prepareSyntheticCleanup(scope)));}catch{rejected=true;}cleanupCheck(rejected&&JSON.stringify(image())===before,label+'; full rollback/no changes');}finally{raw.exec('ROLLBACK TO cleanup_fixture');raw.exec('RELEASE cleanup_fixture');}}
 for(const field of ['offerId','reservationId','requestCommandId','intakeId'])rejected('wrong '+field,()=>{},{...cleanupScope,[field]:crypto.randomUUID()});
 rejected('wrong expected version',()=>{},{...cleanupScope,expectedVersion:cleanupScope.expectedVersion+1});
 rejected('wrong request fingerprint',()=>{},{...cleanupScope,requestFingerprint:'0'.repeat(64)});
 rejected('wrong accepted price snapshot',()=>{},{...cleanupScope,snapshotHash:'0'.repeat(64)});
 rejected('wrong customer',()=>{},{...cleanupScope,customerId:1});
 rejected('expired cleanup approval window',()=>{},{...cleanupScope,runStartedAt:clock-21600001,runExpiresAt:clock-1});
 rejected('disabled target',()=>raw.prepare('UPDATE consultation_preview_environment SET enabled=0').run());
 rejected('database identity mismatch',()=>{},{...cleanupScope},p=>({...p,statements:p.statements.map(s=>({...s,params:s.params.map(v=>v==='734455fd-cdec-4e14-ad6f-96f80f22f3e7'?'11111111-2222-4333-8444-555555555555':v)}))}));
 rejected('booking not PaymentPending',()=>raw.prepare("UPDATE consultation_bookings SET state='Offered' WHERE id=?").run(freeCase.id));
 rejected('reservation already Confirmed',()=>raw.prepare("UPDATE consultation_slot_reservations SET state='Confirmed' WHERE id=?").run(cleanupReservation.id));
 rejected('confirmation evidence',()=>raw.prepare("INSERT INTO consultation_workflow_events VALUES(?,?,'Confirmed','QY','synthetic-evidence',?)").run(crypto.randomUUID(),freeCase.id,clock));
 rejected('capture/order-link audit evidence',()=>raw.prepare("INSERT INTO consultation_capture_audit VALUES(?,?,'OrderLinked',(SELECT id FROM consultation_auth_sessions LIMIT 1),?)").run(crypto.randomUUID(),freeCase.id,clock));
 function orderEvidence(){const orderId=raw.prepare("INSERT INTO orders(order_reference,customer_name,customer_email) VALUES(?,?,?) RETURNING id").get('synthetic-cleanup-'+crypto.randomUUID(),'Synthetic','synthetic@example.invalid').id;raw.prepare('UPDATE consultation_offers SET order_id=? WHERE id=?').run(orderId,cleanupScope.offerId);return orderId;}
 rejected('linked order',orderEvidence);
 rejected('payment evidence',()=>{const orderId=orderEvidence();raw.prepare("INSERT INTO payments(order_id,provider,amount,currency,status) VALUES(?,'synthetic',880,'MYR','Paid')").run(orderId);});
 rejected('capture-review evidence',()=>{const orderId=orderEvidence(),paymentId=raw.prepare("INSERT INTO payments(order_id,provider,amount,currency,status) VALUES(?,'synthetic',880,'MYR','Paid') RETURNING id").get(orderId).id,session=raw.prepare('SELECT id FROM consultation_auth_sessions LIMIT 1').get().id,auditId=crypto.randomUUID();raw.prepare("INSERT INTO consultation_capture_audit VALUES(?,?,'IndependentFinanceReview',?,?)").run(auditId,freeCase.id,session,clock);raw.prepare('INSERT INTO consultation_capture_reviews VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),freeCase.id,cleanupScope.offerId,cleanupScope.customerId,orderId,paymentId,1,clock,'SYNTHETIC','0'.repeat(64),session,auditId,clock);});
 rejected('zero-row reservation CAS after booking update',()=>{},{...cleanupScope},p=>({...p,statements:p.statements.map((s,i)=>i===2?{...s,params:[crypto.randomUUID(),...s.params.slice(1)]}:s)}));
 rejected('late audit-insertion failure',()=>raw.exec("CREATE TRIGGER cleanup_forced_failure BEFORE INSERT ON consultation_workflow_lifecycle_events BEGIN SELECT RAISE(ABORT,'synthetic rollback test'); END;"));
 // Force reservation CAS failure after booking mutation; the booking must roll back.
 rejected('reservation mutation failure',()=>raw.exec("CREATE TRIGGER cleanup_reservation_failure BEFORE UPDATE ON consultation_slot_reservations WHEN NEW.state='Released' BEGIN SELECT RAISE(ABORT,'synthetic rollback test'); END;"));
 for(const reference of ['BAZI-faffbbee-4f2e-48d2-ad64-66e0337b6264','BAZI-9debad86-d2fb-49d9-b4a9-f507e807d00b']){let refused=false;try{prepareSyntheticCleanup({...cleanupScope,bookingId:reference.slice(5),bookingReference:reference});}catch{refused=true;}cleanupCheck(refused,'explicit historical-reference exclusion');}
 const beforeCleanup=image(),plan=prepareSyntheticCleanup(cleanupScope);executeCleanup(plan);const afterCleanup=image();
 cleanupCheck(raw.prepare('SELECT state,row_version FROM consultation_bookings WHERE id=?').get(freeCase.id).state==='OwnerReview'&&raw.prepare('SELECT row_version FROM consultation_bookings WHERE id=?').get(freeCase.id).row_version===cleanupScope.expectedVersion+1,'successful cleanup moves exact booking to OwnerReview with CAS version');
 cleanupCheck(raw.prepare('SELECT state FROM consultation_slot_reservations WHERE id=?').get(cleanupReservation.id).state==='Released','successful cleanup releases exact Held reservation');
 const changed=Object.keys(beforeCleanup).filter(t=>JSON.stringify(beforeCleanup[t])!==JSON.stringify(afterCleanup[t]));
 cleanupCheck(JSON.stringify(changed.sort())===JSON.stringify(['consultation_bookings','consultation_slot_reservations','consultation_events','consultation_workflow_lifecycle_events'].sort()),'only two rows updated and two truthful audit tables appended');
 for(const table of changed){const key=table==='consultation_bookings'?cleanupScope.bookingId:table==='consultation_slot_reservations'?cleanupScope.reservationId:null;const oldRows=beforeCleanup[table].filter(r=>r.id!==key),newRows=afterCleanup[table].filter(r=>r.id!==key);cleanupCheck(key?JSON.stringify(oldRows)===JSON.stringify(newRows):oldRows.every(r=>newRows.some(v=>JSON.stringify(r)===JSON.stringify(v))),'all historical rows retained in '+table);}
 cleanupCheck(afterCleanup.consultation_events.length===beforeCleanup.consultation_events.length+1&&afterCleanup.consultation_workflow_lifecycle_events.length===beforeCleanup.consultation_workflow_lifecycle_events.length+1,'exactly two truthful maintenance audit events');
 cleanupCheck(afterCleanup.consultation_events.at(-1).event_type==='SyntheticTestHoldReleased'&&afterCleanup.consultation_workflow_lifecycle_events.at(-1).event==='OwnerReview','no fabricated expiry cancellation refund or payment event');
 cleanupCheck(raw.prepare('SELECT selling_price_sen,state FROM consultation_offers WHERE id=?').get(cleanupScope.offerId).selling_price_sen===88000&&raw.prepare('SELECT state FROM consultation_offers WHERE id=?').get(cleanupScope.offerId).state==='Accepted','accepted RM880 offer preserved');
 const afterSuccess=JSON.stringify(image());let repeatedRejected=false;try{executeCleanup(plan);}catch{repeatedRejected=true;}cleanupCheck(repeatedRejected&&JSON.stringify(image())===afterSuccess,'cleanup rerun fails closed without additional changes');
 cleanupCheck(raw.prepare('PRAGMA foreign_key_check').all().length===0,'cleanup preserves foreign-key integrity');
 console.log(JSON.stringify({cleanup:'PASS',cleanupChecks,statements:plan.statements.length,remoteOperations:0,method:'Prepared A4 Worker fixtures; disposable SQLite savepoint batch with rollback-on-error; all historical rows compared'}));
`;
if(!source.includes(' Date.now=realNow;'))throw Error('Existing fixture hook changed');
source=source.replace(' Date.now=realNow;',hook+'\n Date.now=realNow;');
// Relative imports in the in-memory test module resolve against the original scripts directory.
source=source.replace(/from '([.][^']+)'/g,(_,p)=>'from '+JSON.stringify(pathToFileURL(resolve('scripts',p)).href));
if(process.env.QY_MINIFLARE_PATH)throw Error('SQLite-only maintenance test; unset optional runtime variable');
try{await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
catch(error){console.error('LOCAL CLEANUP TEST FAILED: '+error.message);process.exitCode=1;}
