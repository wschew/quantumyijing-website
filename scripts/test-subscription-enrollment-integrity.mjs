// Local synthetic D1 only. Real handlers and SQLite predicates, fixed SQL clock.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {onRequestGet as course} from '../functions/api/portal/course-content.js';
import {onRequestGet as resource} from '../functions/api/portal/resource.js';
import {onRequestGet as subscriptionsGet,onRequestPost as lifecycle} from '../functions/api/admin/subscriptions.js';
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
  await run('DELETE FROM subscription_events');await run('DELETE FROM subscriptions');
  for(const table of ['customers','products','memberships','subscription_plans']){
    for(const row of baseline[table]){const columns=Object.keys(row).filter(c=>c!=='id');await run(`UPDATE ${table} SET ${columns.map(c=>c+'=?').join(',')} WHERE id=?`,...columns.map(c=>row[c]),row.id);}
  }
}
async function enrollment(database=db,body={}){return lifecycle({request:new Request('https://synthetic.invalid/admin',{method:'POST',headers:{authorization:'Bearer synthetic-admin','content-type':'application/json'},body:JSON.stringify({action:'create',customerId:1,planId:1,membershipId:1,source:'Synthetic enrollment',notes:'Synthetic notes',...body})}),env:{ENQUIRIES_DB:database,ADMIN_TOKEN:'synthetic-admin'}});}
async function test(name,fn){try{await reset();const before=await snapshot();await fn();assert.deepEqual(await snapshot(),before);passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
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
  await run("INSERT INTO subscriptions(id,subscription_reference,customer_id,plan_id,membership_id,status,current_period_end) VALUES(1,'SYNTH-S',1,1,1,'Active','2030-01-01')");
  await run("INSERT INTO course_entitlements(id,entitlement_reference,customer_id,product_id,status,starts_at,ends_at,source_type,source_order_id) VALUES(1,'SYNTH-CE',1,2,'Active','2020-01-01','2030-01-01','Order',2)");
  await run("INSERT INTO course_entitlement_events(course_entitlement_id,event_type) VALUES(1,'activated')");
  await run("INSERT INTO academy_portal_sessions(customer_id,token_hash,expires_at) VALUES(1,?,'2030-01-01')",await sha256('synthetic-session'));
  await run("INSERT INTO course_modules(id,module_reference,product_id,status) VALUES(1,'SYNTH-CM',2,'Published')");
  await run("INSERT INTO course_lessons(id,lesson_reference,module_id,status) VALUES(1,'SYNTH-CL',1,'Published')");
  await run("INSERT INTO course_resources(id,resource_reference,lesson_id,resource_type,status,content_text) VALUES(1,'SYNTH-CR',1,'text','Published','Synthetic protected content')");
  await run("INSERT INTO crm_activities(enquiry_id,activity_type,description,activity_date) VALUES(1,'Enquiry','Synthetic history','2026-01-01')");
  baseline=Object.fromEntries(await Promise.all(['customers','products','memberships','subscription_plans'].map(async t=>[t,await rows(t)])));
  await test('blank Pending form and attribution',async()=>{
    const response=await enrollment();assert.equal(response.status,201);const body=await response.json();assert.equal(body.created,true);assert.equal(body.subscription.status,'Pending');
    for(const field of ['current_period_start','current_period_end','next_renewal_at','grace_ends_at'])assert.equal(body.subscription[field],'');
    const events=await rows('subscription_events');assert.equal(events.length,1);assert.equal(events[0].subscription_id,body.subscription.id);assert.equal(events[0].source,'Synthetic enrollment');assert.equal(events[0].source_reference,body.subscription.subscription_reference);assert.equal(events[0].notes,'Synthetic notes');
  });
  await test('concurrent enrollment after duplicate reads',async()=>{
    let arrivals=0,release;const gate=new Promise(r=>release=r);
    const raced={prepare:sql=>db.prepare(sql),batch:async statements=>{if(++arrivals===2)release();await gate;return db.batch(statements);}};
    const replies=await Promise.all([enrollment(raced),enrollment(raced)]);assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);assert.equal((await rows('subscriptions')).length,1);assert.equal((await rows('subscription_events')).length,1);
  });
  await test('late creation-event failure rolls back subscription',async()=>{
    const fault={prepare:sql=>db.prepare(sql),batch:statements=>db.batch([statements[0],db.prepare("INSERT INTO subscription_events(subscription_id,event_type) VALUES(-1,'invalid-event')")])};
    let injected=false;const wrapped={prepare:fault.prepare,batch:statements=>{injected=true;return fault.batch(statements);}};assert.equal((await enrollment(wrapped)).status,409);assert.equal(injected,true);assert.deepEqual(await rows('subscriptions'),[]);assert.deepEqual(await rows('subscription_events'),[]);
  });
  const mutations=[['customer inactive',"UPDATE customers SET status='Inactive' WHERE id=1"],['membership inactive',"UPDATE memberships SET status='Expired' WHERE id=1"],['ownership changed','UPDATE memberships SET customer_id=2 WHERE id=1'],['membership product changed','UPDATE memberships SET product_id=2 WHERE id=1'],['plan inactive',"UPDATE subscription_plans SET status='Draft' WHERE id=1"],['plan mode changed',"UPDATE subscription_plans SET renewal_mode='Automatic' WHERE id=1"],['plan product changed','UPDATE subscription_plans SET product_id=2 WHERE id=1'],['product inactive',"UPDATE products SET status='Inactive' WHERE id=1"],['product type changed',"UPDATE products SET product_type='course' WHERE id=1"]];
  for(const [name,sql] of mutations) await test('batch eligibility: '+name,async()=>{
    // This mutation simulates another local transaction, not the handler.
    const before=await snapshot();const raced={prepare:query=>db.prepare(query),batch:async statements=>{await run(sql);return db.batch(statements);}};
    const rejected=await enrollment(raced);assert.equal(rejected.status,409);assert.match((await rejected.json()).error,/eligibility changed/);assert.deepEqual(await rows('subscriptions'),[]);assert.deepEqual(await rows('subscription_events'),[]);
    // Restore external race mutation before handler immutability comparison.
    for(const table of ['customers','products','memberships','subscription_plans'])for(const row of baseline[table]){const columns=Object.keys(row).filter(c=>c!=='id');await run(`UPDATE ${table} SET ${columns.map(c=>c+'=?').join(',')} WHERE id=?`,...columns.map(c=>row[c]),row.id);}
    assert.deepEqual(await snapshot(),before);
  });
  for(const status of ['Pending','Paused','Expired','Cancelled','Refunded'])await test('reject membership '+status,async()=>{
    await run('UPDATE memberships SET status=?',status);const before=await snapshot();assert.equal((await enrollment()).status,409);assert.deepEqual(await snapshot(),before);await run("UPDATE memberships SET status='Active'");
  });
  for(const [name,sql] of mutations)await test('initial eligibility: '+name,async()=>{
    await run(sql);const before=await snapshot();assert.equal((await enrollment()).status,409);assert.deepEqual(await snapshot(),before);await reset();
  });
  for(const [name,body,status] of [
    ['valid normalized dates',{currentPeriodStart:'2026-01-01',currentPeriodEnd:'2026-02-01T08:00:00+08:00',nextRenewalAt:'2026-02-01T00:00:00Z',graceEndsAt:'2026-02-08'},201],
    ['malformed',{currentPeriodStart:'garbage'},409],['impossible calendar',{currentPeriodStart:'2026-02-30'},409],['invalid hour',{currentPeriodEnd:'2026-01-01T24:00:00Z'},409],['timezone required',{currentPeriodStart:'2026-01-01T12:00:00'},409],['equal period',{currentPeriodStart:'2026-01-01',currentPeriodEnd:'2026-01-01'},409],['reversed period',{currentPeriodStart:'2026-02-01',currentPeriodEnd:'2026-01-01'},409],['next mismatch',{currentPeriodEnd:'2026-02-01',nextRenewalAt:'2026-01-31'},409],['next without end',{nextRenewalAt:'2026-02-01'},409],['grace before end',{currentPeriodEnd:'2026-02-01',graceEndsAt:'2026-01-31'},409],['grace without end',{graceEndsAt:'2026-02-01'},409],['zero grace',{currentPeriodEnd:'2026-02-01',graceEndsAt:'2026-02-01'},201],['only start',{currentPeriodStart:'2026-01-01'},201],['only end',{currentPeriodEnd:'2026-02-01'},201]
  ])await test('dates: '+name,async()=>{const response=await enrollment(db,body);assert.equal(response.status,status);assert.equal((await rows('subscriptions')).length,status===201?1:0);assert.equal((await rows('subscription_events')).length,status===201?1:0);if(name==='valid normalized dates')assert.equal((await response.json()).subscription.current_period_end,'2026-02-01T00:00:00.000Z');});
  for(const old of ['Cancelled','Expired'])await test('historical '+old+' permits one current',async()=>{
    await run("INSERT INTO subscriptions(subscription_reference,customer_id,plan_id,membership_id,status) VALUES('SYNTH-HISTORY',1,1,1,?)",old);assert.equal((await enrollment()).status,201);const again=await enrollment();assert.equal(again.status,409);assert.match((await again.json()).error,/already exists/);assert.equal((await rows('subscriptions')).length,2);assert.equal((await rows('subscription_events')).length,1);
    // Even a direct writer cannot restore this historical row to current status.
    await assert.rejects(run("UPDATE subscriptions SET status='Active' WHERE subscription_reference='SYNTH-HISTORY'"),/UNIQUE/);
    const response=await lifecycle({request:new Request('https://synthetic.invalid/admin',{method:'POST',headers:{authorization:'Bearer synthetic-admin','content-type':'application/json'},body:JSON.stringify({action:'status',id:(await rows('subscriptions'))[0].id,status:'Active'})}),env:{ENQUIRIES_DB:db,ADMIN_TOKEN:'synthetic-admin'}});assert.equal(response.status,409);
  });
  await test('index covers every current status',async()=>{
    for(const status of ['Pending','Active','PastDue','Paused']){
      await run("INSERT INTO subscriptions(subscription_reference,customer_id,plan_id,membership_id,status) VALUES('SYNTH-CURRENT',1,1,1,?)",status);
      await assert.rejects(run("INSERT INTO subscriptions(subscription_reference,customer_id,plan_id,membership_id,status) VALUES('SYNTH-DUP',1,1,1,'Pending')"),/UNIQUE/);await run('DELETE FROM subscriptions');
    }
  });
  await test('migration fails safely on existing duplicate current rows',async()=>{
    await run('DROP INDEX idx_subscriptions_one_current_membership');
    try{
      await run("INSERT INTO subscriptions(subscription_reference,customer_id,plan_id,membership_id,status) VALUES('SYNTH-D1',1,1,1,'Pending'),('SYNTH-D2',1,1,1,'Active')");
      const before=await rows('subscriptions');await assert.rejects(run("CREATE UNIQUE INDEX idx_subscriptions_one_current_membership ON subscriptions(membership_id) WHERE status IN ('Pending','Active','PastDue','Paused')"),/UNIQUE/);assert.deepEqual(await rows('subscriptions'),before);
    }finally{await run('DELETE FROM subscriptions');await run("CREATE UNIQUE INDEX idx_subscriptions_one_current_membership ON subscriptions(membership_id) WHERE status IN ('Pending','Active','PastDue','Paused')");}
  });
  async function periodFixture(status,start='2026-01-01',end='2026-02-01'){
    const response=await enrollment(db,{currentPeriodStart:'2026-01-01',currentPeriodEnd:'2026-02-01'});
    assert.equal(response.status,201);const id=(await response.json()).subscription.id;
    await run('UPDATE subscriptions SET status=?,current_period_start=?,current_period_end=? WHERE id=?',status,start,end,id);
    return id;
  }
  async function change(id,status,database=db){return lifecycle({request:new Request('https://synthetic.invalid/admin',{method:'POST',headers:{authorization:'Bearer synthetic-admin','content-type':'application/json'},body:JSON.stringify({action:'status',id,status})}),env:{ENQUIRIES_DB:database,ADMIN_TOKEN:'synthetic-admin'}});}
  const invalidPeriods=[['blank start','','2026-02-01'],['blank end','2026-01-01',''],['malformed','bad','2026-02-01'],['calendar rollover','2026-02-30','2026-03-31'],['equal','2026-02-01','2026-02-01'],['reversed','2026-02-02','2026-02-01'],['ambiguous time','2026-01-01T00:00:00','2026-02-01'],['invalid hour','2026-01-01T24:00:00Z','2026-02-01']];
  for(const [from,to] of [['Pending','Active'],['Paused','Active'],['Active','PastDue']]){
    for(const [name,start,end] of invalidPeriods)await test(`P1 ${from}->${to} rejects ${name} atomically`,async()=>{
      const id=await periodFixture(from,start,end);const before={subscriptions:await rows('subscriptions'),events:await rows('subscription_events')};
      const response=await change(id,to);assert.equal(response.status,409);assert.ok((await response.json()).periodDateIssues.length);
      assert.deepEqual(await rows('subscriptions'),before.subscriptions);assert.deepEqual(await rows('subscription_events'),before.events);
    });
    await test(`P1 ${from}->${to} accepts valid period`,async()=>{
      const id=await periodFixture(from,'2024-02-29 00:00:00','2026-02-01T08:00:00+08:00');const events=await rows('subscription_events');
      assert.equal((await change(id,to)).status,200);assert.equal((await rows('subscriptions'))[0].status,to);assert.equal((await rows('subscription_events')).length,events.length+1);
    });
    await test(`P1 ${from}->${to} fences concurrent invalid date change`,async()=>{
      const id=await periodFixture(from);const events=await rows('subscription_events');let calls=0;
      const raced={prepare:sql=>db.prepare(sql),batch:async statements=>{calls++;await run("UPDATE subscriptions SET current_period_start='' WHERE id=?",id);return db.batch(statements);}};
      assert.equal((await change(id,to,raced)).status,409);assert.equal(calls,1);assert.equal((await rows('subscriptions'))[0].status,from);assert.deepEqual(await rows('subscription_events'),events);
    });
    await test(`P1 concurrent ${from}->${to} creates one event`,async()=>{
      const id=await periodFixture(from);const events=await rows('subscription_events');let arrivals=0,release;const gate=new Promise(r=>release=r);
      const raced={prepare:sql=>db.prepare(sql),batch:async statements=>{if(++arrivals===2)release();await gate;return db.batch(statements);}};
      const replies=await Promise.all([change(id,to,raced),change(id,to,raced)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);assert.equal((await rows('subscriptions'))[0].status,to);assert.equal((await rows('subscription_events')).length,events.length+1);
    });
  }
  for(const status of ['Active','PastDue'])await test(`P1 historical ${status} review is read-only`,async()=>{
    const id=await periodFixture(status,'','');const before=await rows('subscriptions');const events=await rows('subscription_events');
    for(const query of ['',`?action=detail&id=${id}`]){
      const response=await subscriptionsGet({request:new Request('https://synthetic.invalid/admin'+query,{headers:{authorization:'Bearer synthetic-admin'}}),env:{ENQUIRIES_DB:db,ADMIN_TOKEN:'synthetic-admin'}});
      assert.equal(response.status,200);const data=await response.json();const record=query?data.subscription:data.subscriptions.find(r=>r.id===id);assert.equal(record.periodDateIssues.length,2);
    }
    assert.deepEqual(await rows('subscriptions'),before);assert.deepEqual(await rows('subscription_events'),events);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}finally{globalThis.fetch=originalFetch;await mf.dispose();await rm(directory,{recursive:true,force:true});}
