// Local synthetic D1 only. Real handlers and SQLite predicates, fixed SQL clock.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {deliverNotification,reconcileExpiredDeliveries} from '../functions/lib/subscription-notification-delivery.js';
import {onRequestGet as analytics} from '../functions/api/admin/subscription-analytics.js';
import {onRequestPost as notifications} from '../functions/api/admin/subscription-notification-automation.js';
import {executeSubscriptionCycle,validateTargets} from '../workers/subscription-lifecycle-scheduler/src/index.js';
import {onRequestGet as course} from '../functions/api/portal/course-content.js';
import {onRequestGet as resource} from '../functions/api/portal/resource.js';
import {onRequestPost as lifecycle} from '../functions/api/admin/subscriptions.js';
import {onRequestPost as automation} from '../functions/api/admin/subscription-lifecycle-automation.js';
import {sha256} from '../functions/api/portal/_auth.js';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(process.env.QY_MINIFLARE_PATH || '/workspace/.cloud-setup/quantumyijing/node_modules/miniflare');
const directory=await mkdtemp(join(tmpdir(),'qy-policy-a-'));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local only")}}',compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-policy-a'},resourcePersistencePath:directory,cf:false,telemetry:{enabled:false}}));
const db=await mf.getD1Database('DB');
const clock='2026-10-09T12:00:00Z',now=Date.parse(clock);
const fixed={prepare:sql=>db.prepare(sql.replace(/datetime\('now'\)/g,`datetime('${clock}')`)),batch:statements=>db.batch(statements)};
const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
const rows=async table=>(await db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results;
const independent=['memberships','membership_events','course_entitlements','course_entitlement_events','orders','order_items','payments','receipts','payment_verification_events','customers','enquiries','customer_identifiers','customer_enquiry_links','students','crm_activities'];
const snapshot=async()=>Object.fromEntries(await Promise.all(independent.map(async t=>[t,await rows(t)])));
let passed=0,failed=0,baseline;
async function reset(){
  await run('DELETE FROM subscription_notification_delivery');await run('DELETE FROM subscription_notification_logs');
  await run('DELETE FROM subscription_events');await run('DELETE FROM subscriptions WHERE id<>1');await run('DELETE FROM memberships WHERE id<>1');
  await run("UPDATE subscriptions SET status='Active',current_period_end='2026-11-01T00:00:00.000Z',grace_ends_at='',cancel_at_period_end=0 WHERE id=1");
  await run("UPDATE customers SET email='test@example.invalid',status='Active' WHERE id=1");
}
async function test(name,fn,prepare=async()=>{}){try{await reset();await prepare();const before=await snapshot();await fn();assert.deepEqual(await snapshot(),before);passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,...args)=>{const url=new URL(typeof input==='string'?input:input.url);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('External requests forbidden');return originalFetch(input,...args);};
async function access(handler,authenticated=true){
  return handler({request:new Request('https://synthetic.invalid/api/portal/'+(handler===course?'course-content?product_id=2':'resource?id=1'),{headers:authenticated?{cookie:'QY_PORTAL_SESSION=synthetic-session'}:{}}),env:{ENQUIRIES_DB:fixed}});
}
async function action(body){return lifecycle({request:new Request('https://synthetic.invalid/admin',{method:'POST',headers:{authorization:'Bearer synthetic-admin','content-type':'application/json'},body:JSON.stringify({id:1,...body})}),env:{ENQUIRIES_DB:db,ADMIN_TOKEN:'synthetic-admin'}});}
try{
  for(const file of ['database/schema.sql','database/migrate-v2.4.sql','database/migrate-v2.7.sql','database/migrate-v3.0.sql','database/migrate-v3.1.sql','migrate-v3.3.15.sql','database/migrate-v4.0-customer-membership-foundation.sql','database/migrate-v4.0-subscription-foundation.sql','database/migrate-v4.0-phase-b3e-renewal-hardening.sql','database/migrate-v4.1-r3-enrollment-integrity.sql','database/migrate-v4.0-course-entitlement-foundation.sql','database/migrate-v4.0-phase-f1f2-academy-portal.sql','database/migrate-v4.0-phase-f3-course-content.sql']){
    const statements=(await readFile(file,'utf8')).replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
    await db.batch(statements.map(s=>db.prepare(s)));
  }
  await run("DELETE FROM products");
  await run("INSERT INTO products(id,sku,slug,product_type,name_en,status) VALUES(1,'SYNTH-M','synthetic-membership','membership','Synthetic membership','Active'),(2,'SYNTH-C','synthetic-course','course','Synthetic course','Active')");
  await run("INSERT INTO customers(id,customer_reference,display_name) VALUES(1,'SYNTH-1','Synthetic One'),(2,'SYNTH-2','Synthetic Two')");
  await run("INSERT INTO enquiries(id,reference,submitted_at_utc,submitted_at_malaysia,submitted_date,name,email,interest,message) VALUES(1,'SYNTH-E','','','','Synthetic','test@example.invalid','Test','Test')");
  await run("INSERT INTO orders(id,order_reference,enquiry_id,customer_name,customer_email,total,payment_status) VALUES(1,'SYNTH-M-ORDER',1,'Synthetic','test@example.invalid',100,'Paid'),(2,'SYNTH-C-ORDER',1,'Synthetic','test@example.invalid',100,'Paid')");
  await run("INSERT INTO order_items(order_id,product_id,quantity,unit_price,line_total) VALUES(1,1,1,100,100),(2,2,1,100,100)");
  await run("INSERT INTO payments(order_id,provider,status,amount,gross_amount,verification_status) VALUES(1,'Synthetic','Paid',100,100,'Verified'),(2,'Synthetic','Paid',100,100,'Verified')");
  await run("INSERT INTO memberships(id,membership_reference,customer_id,product_id,status,starts_at,ends_at,source_order_id) VALUES(1,'SYNTH-M1',1,1,'Active','2020-01-01','2030-01-01',1)");
  await run("INSERT INTO membership_events(membership_id,event_type,from_status,to_status) VALUES(1,'activated','Pending','Active')");
  await run("INSERT INTO subscription_plans(id,plan_reference,plan_code,product_id,status) VALUES(1,'SYNTH-P','SYNTH-P',1,'Active')");
  await run("INSERT INTO subscriptions(id,subscription_reference,customer_id,plan_id,membership_id,status,current_period_start,current_period_end) VALUES(1,'SYNTH-S',1,1,1,'Active','1900-01-01','2030-01-01')");
  await run("INSERT INTO course_entitlements(id,entitlement_reference,customer_id,product_id,status,starts_at,ends_at,source_type,source_order_id) VALUES(1,'SYNTH-CE',1,2,'Active','2020-01-01','2030-01-01','Order',2)");
  await run("INSERT INTO course_entitlement_events(course_entitlement_id,event_type) VALUES(1,'activated')");
  await run("INSERT INTO academy_portal_sessions(customer_id,token_hash,expires_at) VALUES(1,?,'2030-01-01')",await sha256('synthetic-session'));
  await run("INSERT INTO course_modules(id,module_reference,product_id,status) VALUES(1,'SYNTH-CM',2,'Published')");
  await run("INSERT INTO course_lessons(id,lesson_reference,module_id,status) VALUES(1,'SYNTH-CL',1,'Published')");
  await run("INSERT INTO course_resources(id,resource_reference,lesson_id,resource_type,status,content_text) VALUES(1,'SYNTH-CR',1,'text','Published','Synthetic protected content')");
  await run("INSERT INTO crm_activities(enquiry_id,activity_type,description,activity_date) VALUES(1,'Enquiry','Synthetic history','2026-01-01')");
  // Schema initialization in an ephemeral synthetic D1 fixture only.
  const fixture=(await readFile('database/migrate-v4.1-a6i-subscription-notifications.sql','utf8'))+'\n'+(await readFile('database/migrate-v4.1-r4-notification-delivery.sql','utf8'));
  await db.batch(fixture.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  const item={subscription_id:1,notification_type:'RenewalReminder30d',recipient:'test@example.invalid',source_event_id:null,scheduled_for:'2026-11-01T00:00:00.000Z'};
  const payload={from:'synthetic@example.invalid',to:[item.recipient],subject:'Synthetic',text:'Synthetic'};
  const start='2026-10-09T12:00:00.000Z',later=hours=>new Date(Date.parse(start)+hours*3600000).toISOString();
  const send=(database=db,fetcher=async()=>Response.json({id:'synthetic-provider-id'}),time=start,body=payload)=>deliverNotification(database,item,body,'synthetic-key',{now:time,clock:()=>time,fetcher});
  async function atTime(time,fn){const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[time]));}static now(){return RealDate.parse(time);}};try{return await fn();}finally{globalThis.Date=RealDate;}}
  async function notify(action='run',query='',env={},database=db){return atTime(start,()=>notifications({request:new Request('https://synthetic.invalid/notifications?action='+action+query,{method:'POST',headers:{authorization:'Bearer synthetic-admin'}}),env:{ENQUIRIES_DB:database,ADMIN_TOKEN:'synthetic-admin',RESEND_API_KEY:'synthetic-key',SUBSCRIPTION_NOTIFICATION_EVENT_NOT_BEFORE:'2026-10-08T00:00:00Z',...env}}));}
  await test('successful send has stable identity and bounded request',async()=>{
    let captured;assert.equal(await send(db,async(url,options)=>{captured=options;assert.equal(url,'https://api.resend.com/emails');return Response.json({id:'provider-1'});}), 'sent');
    const row=(await db.prepare('SELECT * FROM subscription_notification_delivery').first());assert.equal(captured.headers['Idempotency-Key'],row.idempotency_key);assert.equal(captured.body,row.payload);assert.ok(captured.signal instanceof AbortSignal);assert.equal(captured.redirect,'error');assert.equal((await rows('subscription_notification_logs'))[0].provider_message_id,'provider-1');
    assert.equal(await send(db,()=>{throw Error('must not resend');}), 'skipped');
  });
  await test('concurrent claims dispatch once',async()=>{
    let calls=0;const provider=async()=>{calls++;return Response.json({id:'one'});};const outcomes=await Promise.all([send(db,provider),send(db,provider)]);assert.equal(calls,1);assert.equal(outcomes.filter(x=>x==='sent').length,1);assert.equal((await rows('subscription_notification_logs')).length,1);
  });
  for(const hours of [0,23.99,24,48,168])await test('ambiguous timeout never resends at '+hours+' hours',async()=>{
    assert.equal(await send(db,async()=>{throw new DOMException('synthetic timeout','TimeoutError');}), 'reconcile');assert.equal(await send(db,()=>{throw Error('must not resend');},later(hours)),'reconcile');
  });
  await test('acceptance then Sent persistence failure retains provider ID',async()=>{
    let injected=false;const faulty={prepare:sql=>db.prepare(sql),batch:async statements=>{if(!injected){injected=true;throw Error('synthetic persistence failure');}return db.batch(statements);}};
    // Fail the finish batch, not the initial atomic claim batch.
    let batches=0;faulty.batch=statements=>{if(++batches===2)throw Error('synthetic persistence failure');return db.batch(statements);};
    assert.equal(await send(faulty),'reconcile');const row=await db.prepare('SELECT * FROM subscription_notification_delivery').first();assert.equal(row.state,'Reconcile');assert.equal(row.provider_message_id,'synthetic-provider-id');assert.equal(await send(db,()=>{throw Error('must not send');},later(48)),'reconcile');
  });
  await test('explicit rate-limit rejection retries same key and payload',async()=>{
    const captures=[];const provider=async(url,options)=>{captures.push(options);return captures.length===1?Response.json({message:'limited'},{status:429}):Response.json({id:'retry-success'});};
    assert.equal(await send(db,provider),'retryable');assert.equal(await send(db,provider,later(5.99)),'skipped');assert.equal(await send(db,provider,later(6)),'sent');assert.equal(captures[0].headers['Idempotency-Key'],captures[1].headers['Idempotency-Key']);assert.equal(captures[0].body,captures[1].body);
  });
  await test('rejections stop after three attempts',async()=>{
    let calls=0;const provider=async()=>{calls++;return Response.json({}, {status:429});};for(const hour of [0,6,12])assert.equal(await send(db,provider,later(hour)),'retryable');assert.equal(await send(db,provider,later(18)),'permanent');assert.equal(calls,3);
  });
  for(const status of [400,401,403,422,500,503,408,409])await test('provider classification '+status,async()=>{assert.equal(await send(db,async()=>Response.json({}, {status})),[500,503,408,409].includes(status)?'reconcile':'permanent');});
  await test('malformed provider success is ambiguous',async()=>assert.equal(await send(db,async()=>new Response('invalid',{status:200})),'reconcile'));
  await test('lease expiration fences stale worker completion',async()=>{
    let release,entered;const pending=new Promise(r=>release=r),arrived=new Promise(r=>entered=r);
    const first=send(db,async()=>{entered();await pending;return Response.json({id:'late-provider'});});await arrived;
    assert.equal(await send(db,()=>{throw Error('must not dispatch');},later(2)),'reconcile');release();assert.equal(await first,'stale');assert.equal((await db.prepare('SELECT state FROM subscription_notification_delivery').first()).state,'Reconcile');
  });
  await test('expired pre-dispatch lease can safely reclaim',async()=>{
    await run("INSERT INTO subscription_notification_logs(id,subscription_id,notification_type,recipient,status,scheduled_for,updated_at) VALUES(1,1,'RenewalReminder30d',?,'Pending',?,?)",item.recipient,item.scheduled_for,start);
    await run("INSERT INTO subscription_notification_delivery(log_id,idempotency_key,payload,state,lease_token,lease_until,updated_at) VALUES(1,'synthetic-reclaim',?,'Claimed','old',?,?)",JSON.stringify(payload),start,start);
    assert.equal(await send(db,async()=>Response.json({id:'reclaimed'}),later(2)),'sent');
  });
  await test('new lease fences old pre-dispatch attempt',async()=>{
    let release,entered;const gate=new Promise(r=>release=r),arrived=new Promise(r=>entered=r);
    const paused={batch:statements=>db.batch(statements),prepare:sql=>{
      const stmt=db.prepare(sql);if(sql.startsWith('SELECT s.status'))return {bind:(...args)=>({first:async()=>{entered();await gate;return stmt.bind(...args).first();}})};return stmt;
    }};
    let oldCalls=0,newCalls=0;const old=send(paused,async()=>{oldCalls++;return Response.json({id:'old'});});await arrived;
    assert.equal(await send(db,async()=>{newCalls++;return Response.json({id:'new'});},later(2)),'sent');release();assert.equal(await old,'stale');assert.equal(oldCalls,0);assert.equal(newCalls,1);assert.equal((await db.prepare('SELECT provider_message_id FROM subscription_notification_delivery').first()).provider_message_id,'new');
  });
  await test('network abort bounds a nonresponsive provider',async()=>{
    let aborted=false;const outcome=await send(db,async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(options.signal.reason);},{once:true})));
    assert.equal(outcome,'reconcile');assert.equal(aborted,true);
  });
  await test('immutable retry payload cannot change',async()=>{await send(db,async()=>Response.json({}, {status:429}));assert.equal(await send(db,()=>{throw Error('no dispatch');},later(6),{...payload,text:'changed'}),'reconcile');});
  for(const [name,sql] of [['recipient',"UPDATE customers SET email='changed@example.invalid' WHERE id=1"],['status',"UPDATE subscriptions SET status='Cancelled' WHERE id=1"]])await test('eligibility changed before dispatch: '+name,async()=>{
    const raced={batch:statements=>db.batch(statements),prepare:sql=>{const stmt=db.prepare(sql);if(sql.startsWith('SELECT s.status'))return {bind:(...args)=>({first:async()=>{await run(sql.includes('never')?'SELECT 1':name==='recipient'?"UPDATE customers SET email='changed@example.invalid' WHERE id=1":"UPDATE subscriptions SET status='Cancelled' WHERE id=1");return stmt.bind(...args).first();}})};return stmt;}};
    assert.equal(await send(raced,()=>{throw Error('no dispatch');}),'skipped');if(name==='recipient')await run("UPDATE customers SET email='test@example.invalid' WHERE id=1");
  });
  await test('legacy uncertain delivery requires reconciliation',async()=>{await run("INSERT INTO subscription_notification_logs(subscription_id,notification_type,channel,recipient,status,scheduled_for,updated_at) VALUES(1,'RenewalReminder30d','email',?,'Failed',?,'2000-01-01')",item.recipient,item.scheduled_for);assert.equal(await send(db,()=>{throw Error('no dispatch');}),'reconcile');});
  async function cancellationEvents(count=1){
    await run('UPDATE subscriptions SET cancel_at_period_end=1');
    for(let i=0;i<count;i++)await run("INSERT INTO subscription_events(subscription_id,event_type,event_at) VALUES(1,'cancel_scheduled',?)",start);
    return (await rows('subscription_events')).map(event=>({...item,notification_type:'CancellationScheduledNotice',source_event_id:event.id,scheduled_for:start}));
  }
  const sendEvent=(event,provider=async()=>Response.json({id:'event-provider'}),time=start,database=db)=>deliverNotification(database,event,payload,'synthetic-key',{now:time,clock:()=>time,fetcher:provider});
  await test('distinct identical-timestamp events get separate logs and provider keys',async()=>{
    await cancellationEvents(2);const captured=[];globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');captured.push(options.headers['Idempotency-Key']);return Response.json({id:'event-'+captured.length});};
    const result=await (await notify()).json();assert.equal(result.sent,2);assert.equal(new Set(captured).size,2);
    const logs=await rows('subscription_notification_logs');assert.equal(logs.length,2);assert.equal(new Set(logs.map(row=>row.source_event_id)).size,2);
    assert.equal((await (await notify()).json()).checked,0);assert.equal(captured.length,2);
  });
  await test('analytics preserves event and reminder timestamp response contracts',async()=>{
    const [event]=await cancellationEvents();await sendEvent(event);await run('UPDATE subscriptions SET cancel_at_period_end=0');await send();
    const response=await analytics({request:new Request('https://synthetic.invalid/analytics',{headers:{authorization:'Bearer synthetic-admin'}}),env:{ENQUIRIES_DB:db,ADMIN_TOKEN:'synthetic-admin'}});assert.equal(response.status,200);const result=await response.json();assert.equal(result.notifications.recent.length,2);assert.equal(result.notifications.recent.find(row=>row.notification_type==='CancellationScheduledNotice').scheduled_for,start);assert.equal(result.notifications.recent.find(row=>row.notification_type==='RenewalReminder30d').scheduled_for,item.scheduled_for);
  });
  await test('concurrent processing of one event dispatches exactly once',async()=>{
    const [event]=await cancellationEvents();let calls=0;const provider=async()=>{calls++;return Response.json({id:'one-event'});};
    const results=await Promise.all([sendEvent(event,provider),sendEvent(event,provider)]);assert.equal(calls,1);assert.equal(results.filter(x=>x==='sent').length,1);assert.equal((await rows('subscription_notification_logs')).length,1);
  });
  await test('event retry preserves key even if source timestamp changes',async()=>{
    const [event]=await cancellationEvents();const captures=[];const provider=async(url,options)=>{captures.push(options.headers['Idempotency-Key']);return captures.length===1?Response.json({}, {status:429}):Response.json({id:'retried-event'});};
    assert.equal(await sendEvent(event,provider),'retryable');assert.equal(await sendEvent({...event,scheduled_for:later(1)},provider,later(6)),'sent');assert.equal(captures[0],captures[1]);assert.equal((await rows('subscription_notification_logs')).length,1);
  });
  for(const status of ['Sent','Skipped','Pending','Failed'])await test('upgrade holds timestamp-only historical '+status+' without redelivery',async()=>{
    const [event]=await cancellationEvents();await run(`INSERT INTO subscription_notification_logs(subscription_id,notification_type,channel,recipient,status,scheduled_for,updated_at) VALUES(1,?,'email',?,?,?,'2000-01-01')`,event.notification_type,item.recipient,status,start);
    let calls=0;const outcome=await sendEvent(event,async()=>{calls++;throw Error('historical delivery forbidden');});assert.equal(calls,0);assert.equal(outcome,['Sent','Skipped'].includes(status)?'skipped':'reconcile');assert.equal((await rows('subscription_notification_logs')).length,1);
    const result=await (await notify()).json();assert.equal(result.checked,0);assert.equal(result.legacyEventIdentityUnknown,1);assert.equal(result.requiresAttention,true);
  });
  await test('upgrade reuses identified historical log and leaves distinct event eligible',async()=>{
    const events=await cancellationEvents(2);await run("INSERT INTO subscription_notification_logs(subscription_id,notification_type,channel,recipient,status,source_event_id,scheduled_for) VALUES(1,?,'email',?,'Sent',?,?)",events[0].notification_type,item.recipient,events[0].source_event_id,start);
    let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({id:'second-event'});};assert.equal((await (await notify()).json()).sent,1);assert.equal(calls,1);assert.equal((await rows('subscription_notification_logs')).length,2);assert.equal(await sendEvent(events[0],()=>{throw Error('no resend');}),'skipped');
  });
  await test('unknown historical identity cannot reuse a Ready delivery key',async()=>{
    const [event]=await cancellationEvents();await run("INSERT INTO subscription_notification_logs(id,subscription_id,notification_type,recipient,status,scheduled_for) VALUES(1,1,? ,?,'Pending',?)",event.notification_type,item.recipient,start);
    await run("INSERT INTO subscription_notification_delivery(log_id,idempotency_key,payload,state,updated_at) VALUES(1,'historical-ready',?,'Ready',?)",JSON.stringify(payload),start);
    assert.equal(await sendEvent(event,()=>{throw Error('no send');}),'reconcile');assert.equal((await db.prepare('SELECT state,idempotency_key FROM subscription_notification_delivery').first()).idempotency_key,'historical-ready');
    assert.equal((await db.prepare('SELECT state FROM subscription_notification_delivery').first()).state,'Reconcile');
  });
  await test('event identity index rejects duplicate event with a different timestamp',async()=>{
    const [event]=await cancellationEvents();await sendEvent(event);
    await assert.rejects(run("INSERT INTO subscription_notification_logs(subscription_id,notification_type,source_event_id,scheduled_for) VALUES(1,?,?,?)",event.notification_type,event.source_event_id,later(1)),/UNIQUE/);
  });
  await test('identified pre-upgrade Retryable delivery retains stored provider key',async()=>{
    const [event]=await cancellationEvents();await run("INSERT INTO subscription_notification_logs(id,subscription_id,notification_type,channel,recipient,status,source_event_id,scheduled_for,updated_at) VALUES(1,1,?,'email',?,'Failed',?,?,'2000-01-01')",event.notification_type,item.recipient,event.source_event_id,start);
    await run("INSERT INTO subscription_notification_delivery(log_id,idempotency_key,payload,state,attempt_count,updated_at) VALUES(1,'historical-key',?,'Retryable',1,'2000-01-01')",JSON.stringify(payload));let key;
    assert.equal(await sendEvent(event,async(url,options)=>{key=options.headers['Idempotency-Key'];return Response.json({id:'historical-retry'});}),'sent');assert.equal(key,'historical-key');assert.equal((await rows('subscription_notification_logs')).length,1);
  });
  await test('additive upgrade preserves historical rows and cannot replay processed events',async()=>{
    const events=await cancellationEvents(4);await run('DROP INDEX idx_subscription_notification_event_identity');await run('DROP TABLE subscription_notification_delivery');
    for(let i=0;i<4;i++)await run("INSERT INTO subscription_notification_logs(subscription_id,notification_type,channel,recipient,status,source_event_id,scheduled_for,updated_at) VALUES(1,?,'email',?,?,?,?, '2000-01-01')",events[i].notification_type,item.recipient,['Sent','Skipped','Pending','Failed'][i],events[i].source_event_id,later(i));
    const before=await rows('subscription_notification_logs');const statements=(await readFile('database/migrate-v4.1-r4-notification-delivery.sql','utf8')).replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);await db.batch(statements.map(sql=>db.prepare(sql)));assert.deepEqual(await rows('subscription_notification_logs'),before);
    globalThis.fetch=()=>{throw Error('upgrade must not replay');};assert.equal((await (await notify()).json()).checked,0);assert.equal(await sendEvent(events[0],()=>{throw Error('no resend');}),'skipped');assert.equal((await rows('subscription_notification_logs')).length,4);
  });
  async function seedSending(count=1){
    for(let i=0;i<count;i++){
      await run("INSERT INTO subscription_notification_logs(id,subscription_id,notification_type,recipient,status,scheduled_for) VALUES(?,1,'RenewalReminder30d',?,'Pending',?)",i+1,item.recipient,i?item.scheduled_for+'-'+i:item.scheduled_for);
      await run("INSERT INTO subscription_notification_delivery(log_id,idempotency_key,payload,state,attempt_count,lease_token,lease_until,updated_at) VALUES(?,?,?,'Sending',1,?,?,?)",i+1,'expired-'+i,JSON.stringify(payload),'old-'+i,later(-1),start);
    }
  }
  for(const change of ["status='Cancelled'","current_period_end='2030-01-01'","status='Expired'"])await test('expired Sending reconciles outside eligibility: '+change,async()=>{
    await seedSending();await run('UPDATE subscriptions SET '+change);globalThis.fetch=()=>{throw Error('no provider call');};
    const result=await (await notify()).json();assert.equal(result.checked,0);assert.equal(result.expiredReconciled,1);assert.equal(result.expiredSending,0);assert.equal(result.requiresAttention,true);assert.equal((await db.prepare('SELECT state FROM subscription_notification_delivery').first()).state,'Reconcile');
    assert.equal((await (await notify()).json()).expiredReconciled,0);
  });
  await test('preview reports expired Sending without mutating it',async()=>{
    await seedSending();const before=await db.prepare('SELECT * FROM subscription_notification_delivery').first();const result=await (await notify('preview')).json();assert.equal(result.expiredReconciled,0);assert.equal(result.expiredSending,1);assert.equal(result.requiresAttention,true);assert.deepEqual(await db.prepare('SELECT * FROM subscription_notification_delivery').first(),before);
  });
  await test('reconciliation scan is bounded and exposes remaining expired backlog',async()=>{
    await seedSending(101);await run("UPDATE subscriptions SET status='Cancelled'");const first=await (await notify()).json();assert.equal(first.expiredReconciled,100);assert.equal(first.expiredSending,1);assert.equal(first.requiresAttention,true);const second=await (await notify()).json();assert.equal(second.expiredReconciled,1);assert.equal(second.expiredSending,0);
  });
  await test('expired pre-dispatch claim never calls provider',async()=>{
    let current=start,calls=0;const raced={batch:statements=>db.batch(statements),prepare:sql=>{const stmt=db.prepare(sql);if(sql.startsWith('SELECT s.status'))return {bind:(...args)=>({first:async()=>{current=later(2);return stmt.bind(...args).first();}})};return stmt;}};
    assert.equal(await deliverNotification(raced,item,payload,'synthetic-key',{now:start,clock:()=>current,fetcher:async()=>{calls++;return Response.json({id:'forbidden'});}}),'stale');assert.equal(calls,0);assert.equal((await db.prepare('SELECT attempt_count FROM subscription_notification_delivery').first()).attempt_count,0);
    assert.equal(await send(db,async()=>{calls++;return Response.json({id:'reclaimed'});},later(2)),'sent');assert.equal(calls,1);
  });
  await test('provider completion after unclaimed expiry reconciles instead of Sent',async()=>{
    let current=start;const result=await deliverNotification(db,item,payload,'synthetic-key',{now:start,clock:()=>current,fetcher:async()=>{current=later(2);return Response.json({id:'late-accepted'});}});assert.equal(result,'reconcile');assert.equal((await db.prepare('SELECT status FROM subscription_notification_logs').first()).status,'Skipped');assert.equal((await db.prepare('SELECT provider_message_id FROM subscription_notification_delivery').first()).provider_message_id,'late-accepted');
  });
  await test('concurrent expired scans reconcile once and never dispatch',async()=>{
    await seedSending();const results=await Promise.all([reconcileExpiredDeliveries(db,{now:start}),reconcileExpiredDeliveries(db,{now:start}),send(db,()=>{throw Error('no provider');})]);assert.equal(results.slice(0,2).reduce((a,b)=>a+b,0)<=1,true);assert.equal((await db.prepare('SELECT state,attempt_count FROM subscription_notification_delivery').first()).state,'Reconcile');assert.equal((await db.prepare('SELECT attempt_count FROM subscription_notification_delivery').first()).attempt_count,1);
  });
  await test('reconciliation snapshot cannot overwrite a replaced lease',async()=>{
    await seedSending();let injected=false;const raced={prepare:sql=>db.prepare(sql),batch:async statements=>{if(!injected){injected=true;await run("UPDATE subscription_notification_delivery SET lease_token='new',lease_until=? WHERE log_id=1",later(2));}return db.batch(statements);}};
    assert.equal(await reconcileExpiredDeliveries(raced,{now:start}),0);const result=await db.prepare('SELECT state,lease_token FROM subscription_notification_delivery').first();assert.equal(result.state,'Sending');assert.equal(result.lease_token,'new');assert.equal((await rows('subscription_notification_logs'))[0].status,'Pending');
  });
  await test('cutoff request precedence and historical exclusion',async()=>{
    await run("UPDATE subscriptions SET status='Expired'");await run("INSERT INTO subscription_events(subscription_id,event_type,event_at) VALUES(1,'expired','2026-10-07T12:00:00Z')");
    let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({id:'cutoff-test'});};assert.equal((await (await notify()).json()).checked,0);assert.equal((await (await notify('preview','&event_not_before=2026-10-07T00:00:00Z')).json()).checked,1);assert.equal(calls,0);assert.equal((await notify('run','&event_not_before=2026-10-07T00:00:00Z')).status,200);assert.equal(calls,1);
  });
  await test('missing/invalid run cutoff fails closed',async()=>{assert.equal((await notify('run','',{SUBSCRIPTION_NOTIFICATION_EVENT_NOT_BEFORE:''})).status,503);assert.equal((await notify('run','&event_not_before=invalid')).status,400);});
  await test('catch-up preserves events and selects only final-state notice',async()=>{
    await run("UPDATE subscriptions SET current_period_end='2026-10-01',grace_ends_at='2026-10-02'");const response=await atTime(start,()=>automation({request:new Request('https://synthetic.invalid/lifecycle?action=run',{method:'POST',headers:{authorization:'Bearer synthetic-admin'}}),env:{ENQUIRIES_DB:db,ADMIN_TOKEN:'synthetic-admin'}}));assert.equal(response.status,200);assert.deepEqual((await rows('subscription_events')).map(r=>r.event_type),['past_due','expired']);const result=await (await notify('preview')).json();assert.deepEqual(result.preview.map(r=>r.notification_type),['ExpiredNotice']);
  });
  for(const [name,end,grace,expected] of [['missing dates','','','Active'],['zero-grace blank','2026-10-01','','PastDue'],['explicit grace equals end','2026-10-01','2026-10-01','Expired']])await test('existing date policy: '+name,async()=>{
    await run('UPDATE subscriptions SET current_period_end=?,grace_ends_at=?',end,grace);await atTime(start,()=>automation({request:new Request('https://synthetic.invalid/lifecycle?action=run',{method:'POST',headers:{authorization:'Bearer synthetic-admin'}}),env:{ENQUIRIES_DB:db,ADMIN_TOKEN:'synthetic-admin'}}));assert.equal((await rows('subscriptions'))[0].status,expected);
  });
  async function backlog(){
    await run("WITH RECURSIVE n(x) AS(SELECT 2 UNION ALL SELECT x+1 FROM n WHERE x<501) INSERT INTO memberships(id,membership_reference,customer_id,product_id,status) SELECT x,'SYNTH-M-'||x,1,1,'Active' FROM n");
    await run("INSERT INTO subscriptions(id,subscription_reference,customer_id,plan_id,membership_id,status,current_period_start,current_period_end) SELECT id,'SYNTH-S-'||id,1,1,id,'Active','1900-01-01','2026-11-01T00:00:00.000Z' FROM memberships WHERE id>1");
  }
  await test('notification backlog excludes 500 permanent/uncertain failures before limit',async()=>{
    await run("INSERT INTO subscription_notification_logs(subscription_id,notification_type,channel,recipient,status,scheduled_for,updated_at) SELECT id,'RenewalReminder30d','email','test@example.invalid','Failed',current_period_end,'2000-01-01' FROM subscriptions WHERE id<=500");const result=await (await notify('preview')).json();assert.equal(result.checked,1);assert.equal(result.preview[0].subscription_id,501);
  },backlog);
  await test('notification backlog excludes exhausted deliveries before limit',async()=>{
    await run("INSERT INTO subscription_notification_logs(subscription_id,notification_type,channel,recipient,status,scheduled_for,updated_at) SELECT id,'RenewalReminder30d','email','test@example.invalid','Failed',current_period_end,'2000-01-01' FROM subscriptions WHERE id<=500");
    await run("INSERT INTO subscription_notification_delivery(log_id,idempotency_key,payload,state,attempt_count,updated_at) SELECT id,'synthetic-key-'||id,'{}','Permanent',3,'2000-01-01' FROM subscription_notification_logs");
    const result=await (await notify('preview')).json();assert.equal(result.checked,1);assert.equal(result.preview[0].subscription_id,501);
  },backlog);
  await test('lifecycle cursor passes persistent first-page failures',async()=>{
    await run("UPDATE subscriptions SET current_period_end='2000-01-01'");const fail={prepare:sql=>db.prepare(sql),batch:async()=>{await new Promise(resolve=>setImmediate(resolve));throw Error('synthetic transaction failure');}};
    const request=cursor=>new Request('https://synthetic.invalid/lifecycle?action=run&after_id='+cursor,{method:'POST',headers:{authorization:'Bearer synthetic-admin'}});
    const first=await (await atTime(start,()=>automation({request:request(0),env:{ENQUIRIES_DB:fail,ADMIN_TOKEN:'synthetic-admin'}}))).json();assert.equal(first.failed,500);assert.equal(first.hasMore,true);
    const second=await (await atTime(start,()=>automation({request:request(first.nextAfterId),env:{ENQUIRIES_DB:db,ADMIN_TOKEN:'synthetic-admin'}}))).json();assert.equal(second.checked,1);assert.equal(second.transitioned,1);
  },backlog);
  const env={ADMIN_TOKEN:'synthetic-admin',A6H_ENDPOINT_BASE_URL:'https://synthetic.invalid',A6I_ENDPOINT_BASE_URL:'https://synthetic.invalid',SUBSCRIPTION_NOTIFICATION_EVENT_NOT_BEFORE:start};
  await test('scheduler partial failure continues pages and independent notifications',async()=>{
    const calls=[];globalThis.fetch=async(url,options)=>{calls.push(url);assert.ok(options.signal);if(url.includes('notification'))return Response.json({ok:true,mode:'run',checked:1,sent:1,failed:0});return Response.json({ok:true,mode:'run',checked:calls.length===1?500:1,transitioned:1,failed:calls.length===1?500:0,hasMore:calls.length===1,nextAfterId:calls.length===1?500:501});};const result=await executeSubscriptionCycle(env);assert.equal(calls.length,3);assert.equal(result.notifications.sent,1);assert.equal(result.failed,true);
  });
  await test('scheduler unreachable lifecycle still invokes notifications',async()=>{let called=false;globalThis.fetch=async url=>{if(url.includes('lifecycle'))throw Error('synthetic network failure');called=true;return Response.json({ok:true,mode:'run',failed:0});};assert.equal((await executeSubscriptionCycle(env)).lifecycleError,true);assert.equal(called,true);});
  await test('scheduler bounds pages and exposes remaining backlog',async()=>{
    let calls=0;globalThis.fetch=async url=>{calls++;return url.includes('notification')?Response.json({ok:true,mode:'run',failed:0}):Response.json({ok:true,mode:'run',checked:500,failed:500,hasMore:true,nextAfterId:calls*500});};
    const result=await executeSubscriptionCycle(env);assert.equal(calls,6);assert.equal(result.lifecycle.pages,5);assert.equal(result.lifecycle.hasMore,true);assert.equal(result.failed,true);
  });
  await test('unresolved delivery queue stays visible in worker monitoring',async()=>{
    globalThis.fetch=async url=>Response.json(url.includes('notification')?{ok:true,mode:'run',failed:0,deliveryStates:[{state:'Reconcile',count:1}]}:{ok:true,mode:'run',checked:0,failed:0});
    const result=await executeSubscriptionCycle(env);assert.equal(result.requiresAttention,true);assert.equal(result.failed,true);
  });
  await test('expired orphan queue triggers worker attention without eligible candidates',async()=>{
    globalThis.fetch=async url=>Response.json(url.includes('notification')?{ok:true,mode:'run',checked:0,failed:0,expiredSending:1,deliveryStates:[{state:'Sending',count:1}]}:{ok:true,mode:'run',checked:0,failed:0});const result=await executeSubscriptionCycle(env);assert.equal(result.requiresAttention,true);assert.equal(result.failed,true);
  });
  await test('bounded lifecycle recovery reports cursor and permits explicit resume',async()=>{
    let calls=0;globalThis.fetch=async url=>{if(url.includes('notification'))return Response.json({ok:true,mode:'run',failed:0});calls++;const cursor=Number(new URL(url).searchParams.get('after_id'));return Response.json({ok:true,mode:'run',checked:500,failed:500,hasMore:true,nextAfterId:cursor+500});};
    const first=await executeSubscriptionCycle(env);const repeated=await executeSubscriptionCycle(env);assert.equal(first.lifecycle.nextAfterId,2500);assert.equal(repeated.lifecycle.nextAfterId,2500);assert.equal(first.requiresAttention,true);
    const resumed=await executeSubscriptionCycle({...env,SUBSCRIPTION_LIFECYCLE_AFTER_ID:String(first.lifecycle.nextAfterId)});assert.equal(resumed.lifecycle.nextAfterId,5000);assert.equal(calls,15);
    await assert.rejects(executeSubscriptionCycle({...env,SUBSCRIPTION_LIFECYCLE_AFTER_ID:'-1'}),/Invalid lifecycle recovery cursor/);
  });
  await test('Production requires explicit enablement',async()=>{
    globalThis.fetch=()=>{throw Error('no network');};assert.deepEqual(await executeSubscriptionCycle({...env,SUBSCRIPTION_AUTOMATION_ENVIRONMENT:'production'}),{disabled:true});
  });
  await test('disabled Production template never dispatches',async()=>{const config=JSON.parse(await readFile('workers/subscription-lifecycle-scheduler/wrangler.production.template.jsonc','utf8'));assert.deepEqual(config.triggers.crons,[]);globalThis.fetch=()=>{throw Error('no network');};assert.deepEqual(await executeSubscriptionCycle(config.vars),{disabled:true});});
  for(const [name,changes] of [['http',{A6H_ENDPOINT_BASE_URL:'http://synthetic.invalid'}],['mismatch',{SUBSCRIPTION_AUTOMATION_ENVIRONMENT:'production',SUBSCRIPTION_APPROVED_PRODUCTION_ORIGIN:'https://synthetic.invalid',A6I_ENDPOINT_BASE_URL:'https://other.invalid'}],['credentials',{A6H_ENDPOINT_BASE_URL:'https://user:pass@synthetic.invalid'}],['path',{A6H_ENDPOINT_BASE_URL:'https://synthetic.invalid/api'}]])await test('target rejects '+name,async()=>assert.throws(()=>validateTargets({...env,...changes})));
  await test('approved Production target validates',async()=>assert.deepEqual(validateTargets({...env,SUBSCRIPTION_AUTOMATION_ENVIRONMENT:'production',SUBSCRIPTION_APPROVED_PRODUCTION_ORIGIN:'https://synthetic.invalid'}),['https://synthetic.invalid','https://synthetic.invalid']));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}finally{globalThis.fetch=originalFetch;await mf.dispose();await rm(directory,{recursive:true,force:true});}
