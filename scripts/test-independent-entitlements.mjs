// Local synthetic D1 only. Real handlers and SQLite predicates, fixed SQL clock.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
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
const independent=['memberships','membership_events','course_entitlements','course_entitlement_events','orders','order_items','payments','receipts','payment_verification_events'];
const snapshot=async()=>Object.fromEntries(await Promise.all(independent.map(async t=>[t,await rows(t)])));
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e);}}
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
  await run("INSERT INTO subscription_plans(id,plan_reference,plan_code,product_id) VALUES(1,'SYNTH-P','SYNTH-P',1)");
  await run("INSERT INTO subscriptions(id,subscription_reference,customer_id,plan_id,membership_id,status,current_period_start,current_period_end) VALUES(1,'SYNTH-S',1,1,1,'Active','1900-01-01','2030-01-01')");
  await run("INSERT INTO course_entitlements(id,entitlement_reference,customer_id,product_id,status,starts_at,ends_at,source_type,source_order_id) VALUES(1,'SYNTH-CE',1,2,'Active','2020-01-01','2030-01-01','Order',2)");
  await run("INSERT INTO course_entitlement_events(course_entitlement_id,event_type) VALUES(1,'activated')");
  await run("INSERT INTO academy_portal_sessions(customer_id,token_hash,expires_at) VALUES(1,?,'2030-01-01')",await sha256('synthetic-session'));
  await run("INSERT INTO course_modules(id,module_reference,product_id,status) VALUES(1,'SYNTH-CM',2,'Published')");
  await run("INSERT INTO course_lessons(id,lesson_reference,module_id,status) VALUES(1,'SYNTH-CL',1,'Published')");
  await run("INSERT INTO course_resources(id,resource_reference,lesson_id,resource_type,status,content_text) VALUES(1,'SYNTH-CR',1,'text','Published','Synthetic protected content')");
  const cases=[['valid','Active','2020-01-01','2030-01-01',1,200],['paused','Paused','','',1,403],['expired status','Expired','','',1,403],['revoked','Revoked','','',1,403],['pending','Pending','','',1,403],['expired date','Active','','2026-10-08',1,403],['foreign owner','Active','','',2,403],['future start','Active','2026-10-10','',1,403],['start equality','Active',clock,'',1,200],['end equality','Active','',clock,1,403],['end one second later','Active','','2026-10-09T12:00:01Z',1,200],['start one second later','Active','2026-10-09T12:00:01Z','',1,403],['unbounded','Active','','',1,200],['invalid start','Active','invalid','',1,403],['invalid end','Active','','invalid',1,403]];
  for(const subscription of ['Active','Paused','Cancelled','Expired']) for(const handler of [course,resource]) for(const [name,status,start,end,owner,expected] of cases){
    await test(`${handler===course?'course':'resource'} / ${subscription} / ${name}`,async()=>{
      await run('UPDATE subscriptions SET status=?',subscription);
      await run('UPDATE course_entitlements SET status=?,starts_at=?,ends_at=?,customer_id=?',status,start,end,owner);
      const before=await snapshot(),eventsBefore=(await rows('course_content_access_events')).length;
      const response=await access(handler);assert.equal(response.status,expected,await response.text());
      assert.deepEqual(await snapshot(),before);
      assert.equal((await rows('course_content_access_events')).length,eventsBefore+(expected===200?1:0));
    });
  }
  for(const handler of [course,resource]) await test('missing session '+(handler===course?'course':'resource'),async()=>assert.equal((await access(handler,false)).status,401));
  // Lifecycle operations run against independently purchased entitlement rows,
  // including independent revoked/expired states; snapshot every field/event.
  for(const entitlement of ['Active','Revoked','Expired']) for(const member of ['Active','Paused','Expired','Cancelled','Refunded']) for(const [name,from,body,to] of [
    ['Pause','Active',{action:'status',status:'Paused'},'Paused'],['Resume','Paused',{action:'status',status:'Active'},'Active'],['Cancel Now','Active',{action:'status',status:'Cancelled'},'Cancelled'],['Cancel at Period End','Active',{action:'cancel-at-period-end'},'Active'],['Mark Expired','Active',{action:'status',status:'Expired'},'Expired']]){
    await test(`${name} preserves ${member} membership / ${entitlement} course`,async()=>{
      await run("UPDATE subscriptions SET status=?,cancel_at_period_end=0,current_period_end='2030-01-01'",from);
      await run('UPDATE memberships SET status=?',member);
      await run("UPDATE course_entitlements SET customer_id=1,status=?,starts_at='2020-01-01',ends_at='2030-01-01'",entitlement);
      const before=await snapshot();assert.equal((await action(body)).status,200);assert.equal((await rows('subscriptions'))[0].status,to);assert.deepEqual(await snapshot(),before);
      if(name==='Resume') assert.equal((await access(course)).status,entitlement==='Active'?200:403);
    });
  }
  await test('due cancellation preserves independent records and events',async()=>{
    await run("UPDATE subscriptions SET status='Active',cancel_at_period_end=1,current_period_end='2000-01-01'");
    const before=await snapshot();const response=await automation({request:new Request('https://synthetic.invalid/automation',{method:'POST',headers:{authorization:'Bearer synthetic-admin','content-type':'application/json'},body:JSON.stringify({action:'run'})}),env:{ENQUIRIES_DB:db,ADMIN_TOKEN:'synthetic-admin'}});
    assert.equal(response.status,200);assert.equal((await rows('subscriptions'))[0].status,'Cancelled');assert.deepEqual(await snapshot(),before);
  });
  const html=await readFile('portal.html','utf8');
  const source=html.slice(html.indexOf('function courseAvailability('),html.indexOf('function renderMemberships('));
  let rendered='';const context={Date:class extends Date{static now(){return now;}},lang:'en',esc:String,t:en=>en,$:()=>({set innerHTML(value){rendered=value;}}),encodeURIComponent};
  vm.createContext(context);vm.runInContext(source,context);
  for(const [name,status,start,end,,expected] of cases.filter(c=>c[4]===1)) await test('portal presentation / '+name,async()=>{
    context.renderCourses([{status,starts_at:start,ends_at:end,product_id:2}]);assert.equal(rendered.includes('Open Course'),expected===200);if(expected!==200)assert.match(rendered,/Unavailable|Expired|Not yet active/);
  });
  console.log(`RESULT: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
}finally{globalThis.fetch=originalFetch;await mf.dispose();await rm(directory,{recursive:true,force:true});}
