// Run from the repository root with Node 24. Uses the installed local Miniflare
// runtime (or QY_MINIFLARE_PATH), never a remote database or Pages endpoint.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {onRequestGet,onRequestPost} from '../functions/api/admin/subscriptions.js';
import {renewalSnapshotGuard,isRenewalSnapshotConflict} from '../functions/lib/subscription-renewal-validation.js';
import {processVerifiedSubscriptionRenewal as engine} from '../functions/api/admin/subscription-renewal.js';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(process.env.QY_MINIFLARE_PATH || '/workspace/.cloud-setup/quantumyijing/node_modules/miniflare');
const baseline='e23d36738503f8b4d7c38f3a2531ff7ca614cb12';
async function original(path){
  const source=execFileSync('git',['show',`${baseline}:${path}`],{encoding:'utf8'});
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const oldManual=await original('functions/api/admin/subscriptions.js');
const oldEngine=await original('functions/api/admin/subscription-renewal.js');
const directory=await mkdtemp(join(tmpdir(),'qy-renewal-test-'));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test only")}}',
  compatibilityDate:'2026-10-07',d1Databases:{DB:'qy-synthetic-renewal'},resourcePersistencePath:directory,cf:false,telemetry:{enabled:false}}));
const db=await mf.getD1Database('DB');
const originalFetch=globalThis.fetch;
globalThis.fetch=async (input,...args)=>{
  const hostname=new URL(typeof input==='string' ? input : input.url).hostname;
  if(!['127.0.0.1','localhost','[::1]'].includes(hostname)) throw new Error('External fetch forbidden in renewal tests');
  return originalFetch(input,...args);
};
const run=(sql,...params)=>db.prepare(sql).bind(...params).run();
const first=(sql,...params)=>db.prepare(sql).bind(...params).first();
const token='synthetic-local-only';
let passed=0;
const fixtures=[
  'database/schema.sql','database/migrate-v2.7.sql','database/migrate-v3.1.sql',
  'migrate-v3.3.15.sql','database/migrate-v4.0-customer-membership-foundation.sql',
  'database/migrate-v4.0-subscription-foundation.sql',
  'database/migrate-v4.0-phase-b3e-renewal-hardening.sql'
];
const tables=['subscription_renewal_executions','subscription_events','membership_events','subscription_orders',
  'subscriptions','subscription_plans','memberships','customer_enquiry_links','customer_identifiers',
  'customers','payment_verification_events','receipts','payments','order_items','orders','products','enquiries'];
const protectedTables=['customers','customer_enquiry_links','products','orders','order_items','payments','receipts','payment_verification_events'];
async function snapshot(names=tables){
  const result={};
  for(const table of names) result[table]=(await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
  return result;
}
async function restore(state){
  for(const table of tables) await run(`DELETE FROM ${table}`);
  for(const table of [...tables].reverse()) for(const row of state[table]){
    const columns=Object.keys(row);
    await run(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,...Object.values(row));
  }
}
async function seed(){
  for(const table of tables) await run(`DELETE FROM ${table}`);
  await run(`INSERT INTO products(id,sku,slug,product_type,name_en,status,price) VALUES(1,'SYNTH-1','synthetic','membership','Synthetic','Active',100),(2,'SYNTH-2','other','membership','Other','Active',100)`);
  await run(`INSERT INTO customers(id,customer_reference,display_name,email) VALUES(1,'SYNTH-C1','Synthetic One','one@example.invalid'),(2,'SYNTH-C2','Synthetic Two','two@example.invalid')`);
  await run(`INSERT INTO enquiries(id,reference,submitted_at_utc,submitted_at_malaysia,submitted_date,name,email,interest,message) VALUES(1,'SYNTH-E1','','','','Synthetic','one@example.invalid','Test','Test')`);
  await run(`INSERT INTO customer_enquiry_links(id,customer_id,enquiry_id,link_type) VALUES(1,1,1,'historical')`);
  await run(`INSERT INTO orders(id,order_reference,enquiry_id,customer_name,customer_email,total,payment_status) VALUES(1,'SYNTH-O1',1,'Synthetic','one@example.invalid',100,'Paid')`);
  await run(`INSERT INTO order_items(id,order_id,product_id,quantity,unit_price,line_total) VALUES(1,1,1,1,100,100)`);
  await run(`INSERT INTO payments(id,order_id,provider,status,amount,gross_amount,verification_status) VALUES(1,1,'Synthetic','Paid',100,100,'Verified')`);
  await run(`INSERT INTO receipts(id,receipt_number,order_id,payment_id,customer_name,amount) VALUES(1,'SYNTH-R1',1,1,'Synthetic',100)`);
  await run(`INSERT INTO payment_verification_events(id,order_id,payment_id,verification_method,verification_status) VALUES(1,1,1,'Manual','Verified')`);

  await run(`INSERT INTO memberships(id,membership_reference,customer_id,product_id,status,starts_at,ends_at) VALUES(1,'SYNTH-M1',1,1,'Active','2025-01-31T23:59:59.000Z','2026-01-31T23:59:59.000Z')`);
  await run(`INSERT INTO subscription_plans(id,plan_reference,plan_code,product_id,status,billing_interval_unit,billing_interval_count,membership_duration_unit,membership_duration_count,grace_period_days) VALUES(1,'SYNTH-P1','SYNTH',1,'Active','Month',1,'Year',1,7)`);
  await run(`INSERT INTO subscriptions(id,subscription_reference,customer_id,plan_id,membership_id,status,current_period_end,cancel_at_period_end) VALUES(1,'SYNTH-S1',1,1,1,'Active','2026-01-31T23:59:59.000Z',1)`);
  // Fixed fixture timestamps make independent baseline runs comparable.
  for(const table of tables){
    const columns=(await db.prepare(`PRAGMA table_info(${table})`).all()).results;
    for(const column of columns){
      if(['created_at','updated_at','linked_at'].includes(column.name)) await run(`UPDATE ${table} SET ${column.name}='2000-01-01 00:00:00'`);
    }
  }

}
async function request(method, database=db, extra={}, handlers={onRequestGet,onRequestPost}){
  const req=new Request('https://synthetic.invalid/api/admin/subscriptions?action='+ (method==='GET'?'renewal-preview&id=1&orderId=1':'renew'),{
    method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    ...(method==='POST'?{body:JSON.stringify({action:'renew',id:1,orderId:1,source:'A6E Manual Renewal Administration',sourceReference:`AdminRenewal:${extra.orderId || 1}`,...extra})}:{})
  });
  const response=await handlers[method==='GET'?'onRequestGet':'onRequestPost']({request:req,env:{ADMIN_TOKEN:token,ENQUIRIES_DB:database}});
  return {status:response.status,body:await response.json()};
}
async function link(){ await run(`INSERT INTO subscription_orders(subscription_id,order_id,order_type) VALUES(1,1,'Renewal')`); }
async function test(name,fn){
  await seed();const frozen=await snapshot(protectedTables);
  await fn();assert.deepEqual(await snapshot(protectedTables),frozen,'frozen rows changed during '+name);
  passed++;console.log('PASS',name);
}
// For scenarios that change synthetic evidence, capture the frozen baseline AFTER
// that fixture preparation, then assert every application call leaves it untouched.
async function scenario(name,prepare,fn){
  await seed();await prepare();const frozen=await snapshot(protectedTables);
  await fn();assert.deepEqual(await snapshot(protectedTables),frozen,name+' changed protected rows');
  passed++;console.log('PASS',name);
}
async function rejected(reason){
  const before=await snapshot();const preview=await request('GET');
  assert.equal(preview.status,200);assert.equal(preview.body.eligible,false);assert.match(preview.body.reason,reason);
  const post=await request('POST');assert.equal(post.status,409);assert.match(post.body.error,reason);
  assert.deepEqual(await snapshot(),before);
}
function wrapped(batch){return {prepare:sql=>db.prepare(sql),batch};}
function barrier(count){let arrivals=0,release;const wait=new Promise(r=>release=r);return async()=>{if(++arrivals===count)release();await wait;};}
try{
  // Schema statements come only from the repository; no application schema edits.
  for(const file of fixtures){
    const sql=(await readFile(file,'utf8')).replace(/--[^\n]*/g,'');
    const statements=sql.split(';').map(s=>s.trim()).filter(Boolean);
    await db.batch(statements.map(s=>db.prepare(s)));
  }
  await test('manual renewal: preview/date parity, one ledger and repeat submission',async()=>{
    const preview=await request('GET');const originalPreview=await request('GET',db,{},oldManual);
    assert.deepEqual(preview,originalPreview);
    const result=await request('POST');assert.equal(result.body.renewed,true);
    assert.equal(result.body.period.end,'2026-02-28T23:59:59.000Z');
    assert.equal(result.body.membership.endsAt,'2027-01-31T23:59:59.000Z');
    const after=await snapshot();assert.equal((await request('POST')).body.idempotent,true);
    assert.equal((await request('GET')).body.alreadyApplied,true);assert.equal((await engine(db,1)).idempotent,true);
    assert.deepEqual(await snapshot(),after);assert.equal(after.subscription_renewal_executions.length,1);
    assert.equal(after.subscription_events[0].source_reference,'AdminRenewal:1');
  });
  for(const [name,sql,reason] of [
    ['different canonical customer','UPDATE customer_enquiry_links SET customer_id=2',/does not match/],
    ['missing enquiry','UPDATE orders SET enquiry_id=NULL',/CRM enquiry/],
    ['missing customer link','DELETE FROM customer_enquiry_links',/canonical customer/],
    ['inactive customer',"UPDATE customers SET status='Inactive' WHERE id=1",/Active/],
    ['missing payments','DELETE FROM payments',/fully verified/],
    ['unverified payment',"UPDATE payments SET verification_status='Unverified'",/fully verified/],
    ['rejected payment',"UPDATE payments SET verification_status='Rejected'",/fully verified/],
    ['insufficient payment','UPDATE payments SET gross_amount=99,amount=99',/fully verified/],
    ['outside tolerance','UPDATE payments SET gross_amount=99.994',/fully verified/],
    ['non-Paid order',"UPDATE orders SET payment_status='Pending'",/Paid/],
    ['wrong product','UPDATE order_items SET product_id=2',/product/]
  ]) await scenario(name,()=>run(sql),()=>rejected(reason));
  for(const [name,prepare] of [
    ['split verified payments',async()=>{await run('UPDATE payments SET gross_amount=40,amount=40');await run("INSERT INTO payments(order_id,provider,status,amount,gross_amount,verification_status) VALUES(1,'Synthetic','External',60,60,'Verified')");}],
    ['legacy amount fallback',()=>run('UPDATE payments SET gross_amount=0')],
    ['within coverage tolerance',()=>run('UPDATE payments SET gross_amount=99.995')],
    ['manual bundles and quantity remain permitted',async()=>{await run('UPDATE order_items SET quantity=2');await run('INSERT INTO order_items(order_id,product_id,quantity) VALUES(1,2,1)');}]
  ]) await scenario(name,prepare,async()=>{assert.equal((await request('GET')).body.eligible,true);assert.equal((await request('POST')).body.renewed,true);});
  await scenario('verified engine preserves exact-item restriction',async()=>{await link();await run('UPDATE order_items SET quantity=2');},async()=>{
    const before=await snapshot();await assert.rejects(engine(db,1),/quantity must be exactly one/);assert.deepEqual(await snapshot(),before);
  });
  await scenario('linked but unprocessed: manual rejects, engine processes once',link,async()=>{
    assert.equal((await request('GET')).body.alreadyApplied,false);assert.equal((await request('POST')).status,409);
    const value=await engine(db,1);assert.equal(value.idempotent,false);
    assert.equal(value.period_start,'2026-02-01T00:00:00.000Z');assert.equal(value.new_membership_end,'2027-01-31T23:59:59.000Z');
    const after=await snapshot();assert.equal((await request('POST')).body.idempotent,true);assert.equal((await engine(db,1)).idempotent,true);assert.deepEqual(await snapshot(),after);
  });
  await scenario('verified engine result/date parity with baseline',link,async()=>{
    const current=await engine(db,1);await seed();await link();const previous=await oldEngine.processVerifiedSubscriptionRenewal(db,1);assert.deepEqual(current,previous);
  });
  for(const [reference,source,completed] of [
    ['RenewalOrder:1','Historic',true],['AdminRenewal:1','A6E Manual Renewal Administration',true],['AdminRenewal:1','Uncorroborated',false],['Custom:1','A6E Manual Renewal Administration',false]
  ]) await scenario('historical completion '+reference+' / '+source,async()=>{
    await link();await run("INSERT INTO subscription_events(subscription_id,event_type,source,source_reference) VALUES(1,'renewed',?,?)",source,reference);
  },async()=>{
    const before=await snapshot();assert.equal((await request('GET')).body.alreadyApplied,completed);
    if(completed){assert.equal((await request('POST')).body.idempotent,true);assert.equal((await engine(db,1)).idempotent,true);assert.deepEqual(await snapshot(),before);}
    else {assert.equal((await request('POST')).status,409);assert.deepEqual(await snapshot(),before);}
  });
  await test('repeated concurrent manual submissions: one extension',async()=>{
    const gate=barrier(2);const raced=wrapped(async statements=>{await gate();return db.batch(statements);});
    const results=await Promise.all([request('POST',raced),request('POST',raced)]);
    assert.ok(results.every(r=>r.status===200));assert.equal(results.filter(r=>r.body.renewed).length,1);assert.equal(results.filter(r=>r.body.idempotent).length,1);
    assert.equal((await snapshot()).subscription_events.length,1);assert.equal((await snapshot()).subscription_renewal_executions.length,1);
  });
  await test('manual versus engine contention: engine wins, manual batch rolls back',async()=>{
    // Manual has completed its reads. A concurrent linkage operation makes the
    // order visible to the engine; both paths now attempt the same ledger key.
    let engineResult;
    const raced=wrapped(async statements=>{await link();engineResult=await engine(db,1);const before=await snapshot();
      await assert.rejects(db.batch(statements),/UNIQUE|constraint/i);assert.deepEqual(await snapshot(),before);
      return db.batch(statements); // handler must reload the winning completion
    });
    const response=await request('POST',raced);assert.equal(response.body.idempotent,true);assert.equal(engineResult.idempotent,false);
    const after=await snapshot();assert.equal(after.subscription_events.length,1);assert.equal(after.membership_events.length,1);assert.equal(after.subscription_renewal_executions.length,1);
  });
  await test('manual wins before engine retry: no additional extension',async()=>{
    let result;const raced=wrapped(async statements=>{const committed=await db.batch(statements);const before=await snapshot();result=await engine(db,1);assert.deepEqual(await snapshot(),before);return committed;});
    assert.equal((await request('POST',raced)).body.renewed,true);assert.equal(result.idempotent,true);
  });
  await test('duplicate ledger collision rolls back EARLIER entitlement and event writes',async()=>{
    await request('POST');const before=await snapshot();
    await assert.rejects(db.batch([
      db.prepare("UPDATE memberships SET ends_at='2099-01-01' WHERE id=1"),
      db.prepare("UPDATE subscriptions SET current_period_end='2099-01-01' WHERE id=1"),
      db.prepare("INSERT INTO subscription_events(subscription_id,event_type) VALUES(1,'renewed')"),
      db.prepare("INSERT INTO membership_events(membership_id,event_type) VALUES(1,'renewed')"),
      db.prepare('INSERT INTO subscription_renewal_executions SELECT * FROM subscription_renewal_executions WHERE order_id=1')
    ]),/UNIQUE|constraint/i);assert.deepEqual(await snapshot(),before);
  });
  await test('late event failure rolls back manual ledger, link and entitlement changes',async()=>{
    const before=await snapshot();const failed=wrapped(statements=>db.batch([...statements,db.prepare("INSERT INTO subscription_events(subscription_id,event_type) VALUES(1,'invalid-event')")]));
    const response=await request('POST',failed);assert.equal(response.status,409);assert.deepEqual(await snapshot(),before);
  });
  await test('preview followed by ownership change: POST revalidates',async()=>{
    assert.equal((await request('GET')).body.eligible,true);await run('UPDATE customer_enquiry_links SET customer_id=2');const before=await snapshot();assert.equal((await request('POST')).status,409);assert.deepEqual(await snapshot(),before);
    await run('UPDATE customer_enquiry_links SET customer_id=1'); // restore fixture-only preparation
  });
  await test('preview followed by payment change: POST revalidates',async()=>{
    assert.equal((await request('GET')).body.eligible,true);await run("UPDATE payments SET verification_status='Rejected'");const before=await snapshot();assert.equal((await request('POST')).status,409);assert.deepEqual(await snapshot(),before);
    await run("UPDATE payments SET verification_status='Verified'");
  });
  await test('unauthorized request leaves all records unchanged',async()=>{
    const before=await snapshot();for(const handler of [onRequestGet,onRequestPost]){const res=await handler({request:new Request('https://synthetic.invalid'),env:{ADMIN_TOKEN:token,ENQUIRIES_DB:db}});assert.equal(res.status,401);}assert.deepEqual(await snapshot(),before);
  });
  await scenario('completed A6E history remains idempotent after lifecycle/payment changes',async()=>{
    await link();await run("INSERT INTO subscription_events(subscription_id,event_type,source,source_reference) VALUES(1,'renewed','A6E Manual Renewal Administration','AdminRenewal:1')");
    await run("UPDATE subscriptions SET status='Cancelled'");await run("UPDATE memberships SET status='Expired'");await run('DELETE FROM payments');await run('DELETE FROM customer_enquiry_links');
  },async()=>{const before=await snapshot();assert.equal((await request('POST')).body.idempotent,true);assert.equal((await engine(db,1)).idempotent,true);assert.deepEqual(await snapshot(),before);});
  await scenario('conflicting completion owner rejects without writes',async()=>{
    await link();await run("INSERT INTO subscriptions(id,subscription_reference,customer_id,plan_id,membership_id) VALUES(2,'SYNTH-S2',1,1,1)");
    await run('INSERT INTO subscription_renewal_executions(order_id,subscription_id,membership_id) VALUES(1,2,1)');
  },async()=>{const before=await snapshot();assert.equal((await request('GET')).status,409);assert.equal((await request('POST')).status,409);await assert.rejects(engine(db,1),/another subscription/);assert.deepEqual(await snapshot(),before);});
  await scenario('zero-total policy is retained, not silently tightened',async()=>{await run('UPDATE orders SET total=0');await run('DELETE FROM payments');},async()=>{
    assert.equal((await request('GET')).body.eligible,true);assert.equal((await request('POST')).body.renewed,true);
  });
  await scenario('existing engine currency aggregation policy is retained',()=>run("UPDATE payments SET currency='USD'"),async()=>{
    assert.equal((await request('GET')).body.eligible,true);assert.equal((await request('POST')).body.renewed,true);
  });
  for(const [name,subscriptionEnd,membershipEnd,unit,count] of [
    ['leap year','2024-02-29T23:59:59.000Z','2024-02-29T23:59:59.000Z','Year',1],
    ['later membership end','2026-01-31T23:59:59.000Z','2026-07-31T23:59:59.000Z','Month',1],
    ['daily interval','2026-12-31T23:59:59.000Z','2026-12-31T23:59:59.000Z','Day',2]
  ]) await scenario('baseline manual dates: '+name,async()=>{
    await run('UPDATE subscriptions SET current_period_end=?',subscriptionEnd);await run('UPDATE memberships SET ends_at=?',membershipEnd);
    await run('UPDATE subscription_plans SET billing_interval_unit=?,billing_interval_count=?',unit,count);
  },async()=>{
    const before=await snapshot();const preview=await request('GET');assert.deepEqual(preview,await request('GET',db,{},oldManual));
    const current=await request('POST');
    // Restore the exact synthetic snapshot before exercising baseline execution.
    await restore(before);
    const previous=await request('POST',db,{},oldManual);
    // CURRENT_TIMESTAMP may cross a second between independent executions.
    delete current.body.subscription.updated_at;delete previous.body.subscription.updated_at;
    assert.deepEqual(current,previous);
  });
  await test('unavailable execution ledger fails closed without entitlement writes',async()=>{
    const before=await snapshot();const missing={prepare(sql){if(sql.includes('subscription_renewal_executions')) throw new Error('Synthetic missing execution ledger');return db.prepare(sql);},batch:statements=>db.batch(statements)};
    assert.equal((await request('POST',missing)).status,500);assert.deepEqual(await snapshot(),before);
  });
  await scenario('engine late event failure rolls back all renewal writes',link,async()=>{
    const before=await snapshot();const failed=wrapped(statements=>db.batch([...statements,db.prepare("INSERT INTO subscription_events(subscription_id,event_type) VALUES(1,'invalid-event')")]));
    await assert.rejects(engine(failed,1),/CHECK constraint/);assert.deepEqual(await snapshot(),before);
  });
  await scenario('concurrent engine submissions share the same ledger barrier',link,async()=>{
    const gate=barrier(2);const raced=wrapped(async statements=>{await gate();return db.batch(statements);});
    const values=await Promise.all([engine(raced,1),engine(raced,1)]);
    assert.equal(values.filter(v=>v.idempotent).length,1);
    const after=await snapshot();assert.equal(after.subscription_events.length,1);assert.equal(after.membership_events.length,1);assert.equal(after.subscription_renewal_executions.length,1);
  });
  async function secondOrder(){
    await run("INSERT INTO orders(id,order_reference,enquiry_id,customer_name,customer_email,total,payment_status) VALUES(2,'SYNTH-O2',1,'Synthetic','one@example.invalid',100,'Paid')");
    await run('INSERT INTO order_items(order_id,product_id,quantity) VALUES(2,1,1)');
    await run("INSERT INTO payments(order_id,provider,status,amount,gross_amount,verification_status) VALUES(2,'Synthetic','Paid',100,100,'Verified')");
  }
  async function call(path,orderId,database=db){
    if(path==='manual'){
      const result=await request('POST',database,{orderId});assert.equal(result.status,200);assert.equal(result.body.renewed,true);return result;
    }
    const result=await engine(database,orderId);assert.equal(result.idempotent,false);return result;
  }
  function dates(state){
    const subscription=state.subscriptions[0],membership=state.memberships[0];
    return {start:subscription.current_period_start,end:subscription.current_period_end,
      next:subscription.next_renewal_at,grace:subscription.grace_ends_at,
      status:subscription.status,cancel:subscription.cancel_at_period_end,
      memberEnd:membership.ends_at,memberStatus:membership.status};
  }
  await scenario('guard error identity and rollback of preceding writes',async()=>{},async()=>{
    const before=await snapshot();
    const guard=db.prepare("INSERT INTO subscription_renewal_executions(order_id,subscription_id,membership_id,previous_membership_end) VALUES(1,1,1,CASE WHEN EXISTS(SELECT 1 FROM memberships WHERE ends_at='stale') THEN 'old' ELSE NULL END)");
    let error;
    try{await db.batch([db.prepare("UPDATE memberships SET ends_at='uncommitted'"),guard]);}catch(e){error=e;}
    assert.ok(isRenewalSnapshotConflict(error));assert.deepEqual(await snapshot(),before);
    assert.equal(isRenewalSnapshotConflict(new Error('UNIQUE constraint failed: subscription_renewal_executions.order_id')),false);
    assert.equal(isRenewalSnapshotConflict(new Error('Unexpected database failure')),false);
  });
  // Keep the pre-fix reproduction as evidence, without treating a lost extension
  // as an acceptable outcome of the current implementation.
  await scenario('original baseline reproduces different-order lost extension',secondOrder,async()=>{
    const gate=barrier(2);const raced=wrapped(async statements=>{await gate();return db.batch(statements);});
    const results=await Promise.all([request('POST',raced,{},oldManual),request('POST',raced,{orderId:2},oldManual)]);
    assert.ok(results.every(r=>r.body.renewed));
    assert.equal((await first('SELECT ends_at FROM memberships')).ends_at,'2027-01-31T23:59:59.000Z');
    assert.equal((await first("SELECT COUNT(*) AS n FROM subscription_events WHERE event_type='renewed'")).n,2);
  });
  for(const [pathA,pathB] of [['manual','manual'],['engine','engine'],['manual','engine'],['engine','manual']]){
    for(const winner of [1,2]) await scenario(`${pathA}/${pathB} distinct orders, winner ${winner}, retry matches sequential dates`,async()=>{
      await secondOrder();
      if(pathA==='engine') await link();
      if(pathB==='engine') await run("INSERT INTO subscription_orders(subscription_id,order_id,order_type) VALUES(1,2,'Renewal')");
    },async()=>{
      const prepared=await snapshot();
      // Both requests finish their reads. Commit the chosen winner before the
      // loser's stale batch; retry batches bypass the one-shot barrier.
      let arrivals=0,releaseReady,releaseWinner;
      const ready=new Promise(r=>releaseReady=r),won=new Promise(r=>releaseWinner=r);
      let conflicts=0;
      const databaseFor=orderId=>wrapped(async statements=>{
        if(++arrivals<=2){
          if(arrivals===2) releaseReady();await ready;
          if(orderId!==winner) await won;
          try{const result=await db.batch(statements);if(orderId===winner)releaseWinner();return result;}
          catch(error){if(isRenewalSnapshotConflict(error)) conflicts++;throw error;}
        }
        return db.batch(statements);
      });
      await Promise.all([call(pathA,1,databaseFor(1)),call(pathB,2,databaseFor(2))]);
      const concurrent=await snapshot();assert.equal(conflicts,1);
      assert.equal(concurrent.subscription_renewal_executions.length,2);
      assert.equal(concurrent.subscription_events.length,2);assert.equal(concurrent.membership_events.length,2);
      await restore(prepared);
      const paths={1:pathA,2:pathB};await call(paths[winner],winner);await call(paths[3-winner],3-winner);
      const sequential=await snapshot();assert.deepEqual(dates(concurrent),dates(sequential));
      for(const orderId of [1,2]){
        const row=state=>state.subscription_renewal_executions.find(e=>e.order_id===orderId);
        for(const field of ['previous_membership_end','period_start','new_membership_end']) assert.equal(row(concurrent)[field],row(sequential)[field]);
      }
    });
  }
  for(const path of ['manual','engine']){
    await scenario(`${path} retry exhaustion has no completion`,async()=>{if(path==='engine')await link();},async()=>{
      let attempts=0;
      const raced=wrapped(async statements=>{
        attempts++;await run('UPDATE subscription_plans SET grace_period_days=grace_period_days+1');
        return db.batch(statements);
      });
      const before=await snapshot();
      if(path==='manual'){const result=await request('POST',raced);assert.equal(result.status,409);assert.match(result.body.error,/changed repeatedly/);}
      else await assert.rejects(engine(raced,1),/changed repeatedly/);
      assert.equal(attempts,3);const after=await snapshot();
      for(const table of ['subscriptions','memberships','subscription_orders','subscription_events','membership_events','subscription_renewal_executions']) assert.deepEqual(after[table],before[table]);
    });
    await scenario(`${path} lost response is recovered without retrying uncertain failure`,async()=>{if(path==='engine')await link();},async()=>{
      let batches=0;
      const lost=wrapped(async statements=>{batches++;await db.batch(statements);throw new Error('Synthetic response lost after commit');});
      if(path==='manual') assert.equal((await request('POST',lost)).body.idempotent,true);
      else assert.equal((await engine(lost,1)).idempotent,true);
      const committed=await snapshot();
      if(path==='manual')assert.equal((await request('POST')).body.idempotent,true);
      else assert.equal((await engine(db,1)).idempotent,true);
      assert.equal(batches,1);assert.deepEqual(await snapshot(),committed);
    });
    await scenario(`${path} unexpected pre-commit error is not retried`,async()=>{if(path==='engine')await link();},async()=>{
      let batches=0;const before=await snapshot();
      const failed=wrapped(async()=>{batches++;throw new Error('Synthetic unexpected database failure');});
      if(path==='manual')assert.equal((await request('POST',failed)).status,500);
      else await assert.rejects(engine(failed,1),/unexpected database failure/);
      assert.equal(batches,1);assert.deepEqual(await snapshot(),before);
    });
    for(const [table,status] of [['subscriptions','Paused'],['subscriptions','Cancelled'],['subscriptions','Expired'],['memberships','Paused'],['memberships','Expired']]){
      await scenario(`${path} revalidates concurrent ${table} ${status}`,async()=>{if(path==='engine')await link();},async()=>{
        let batches=0;
        const raced=wrapped(async statements=>{batches++;await run(`UPDATE ${table} SET status=?`,status);return db.batch(statements);});
        if(path==='manual')assert.equal((await request('POST',raced)).status,409);
        else await assert.rejects(engine(raced,1),/cannot be renewed/);
        assert.equal(batches,1);
        const after=await snapshot();assert.equal(after.subscription_renewal_executions.length,0);
        assert.equal(after.subscription_events.length,0);assert.equal(after.membership_events.length,0);
        assert.equal(after.memberships[0].ends_at,'2026-01-31T23:59:59.000Z');
      });
    }
    await scenario(`${path} retries a concurrent cancellation scheduling flag`,async()=>{if(path==='engine')await link();await run('UPDATE subscriptions SET cancel_at_period_end=0');},async()=>{
      let batches=0;
      const raced=wrapped(async statements=>{if(++batches===1)await run('UPDATE subscriptions SET cancel_at_period_end=1');return db.batch(statements);});
      await call(path,1,raced);assert.equal(batches,2);
      assert.equal((await first('SELECT cancel_at_period_end FROM subscriptions')).cancel_at_period_end,0);
    });
  }
  for(const path of ['manual','engine']){
    await scenario(`${path} recalculates from changed plan intervals`,async()=>{if(path==='engine')await link();},async()=>{
      let batches=0;
      const raced=wrapped(async statements=>{
        if(++batches===1)await run('UPDATE subscription_plans SET billing_interval_count=2,membership_duration_count=2');
        return db.batch(statements);
      });
      await call(path,1,raced);assert.equal(batches,2);
      const state=await snapshot();assert.equal(state.memberships[0].ends_at,'2028-01-31T23:59:59.000Z');
      assert.equal(state.subscriptions[0].current_period_end,path==='manual'?'2026-03-31T23:59:59.000Z':'2028-01-31T23:59:59.000Z');
      assert.equal(state.subscription_renewal_executions.length,1);
    });
    await scenario(`${path} recalculates from a changed membership end`,async()=>{if(path==='engine')await link();},async()=>{
      let batches=0;
      const raced=wrapped(async statements=>{if(++batches===1)await run("UPDATE memberships SET ends_at='2026-07-31T23:59:59.000Z'");return db.batch(statements);});
      await call(path,1,raced);assert.equal(batches,2);
      assert.equal((await first('SELECT ends_at FROM memberships')).ends_at,'2027-07-31T23:59:59.000Z');
    });
    await scenario(`${path} retains policy after concurrent PastDue transition`,async()=>{if(path==='engine')await link();},async()=>{
      let batches=0;
      const raced=wrapped(async statements=>{if(++batches===1)await run("UPDATE subscriptions SET status='PastDue'");return db.batch(statements);});
      if(path==='manual'){
        assert.equal((await request('POST',raced)).status,409);assert.equal(batches,1);
        assert.equal((await snapshot()).subscription_renewal_executions.length,0);
      }else{await call(path,1,raced);assert.equal(batches,2);assert.equal((await first('SELECT status FROM subscriptions')).status,'Active');}
    });
  }
  // Verify every compared field, including independent membership/plan changes,
  // produces the deliberate assertion rather than accepting a stale snapshot.
  await test('all captured subscription/membership/plan fields invalidate the guard',async()=>{
    const subscription=await first('SELECT * FROM subscriptions WHERE id=1');
    const membership=await first('SELECT * FROM memberships WHERE id=1');
    const plan=await first('SELECT * FROM subscription_plans WHERE id=1');
    const guard=renewalSnapshotGuard(subscription,membership,plan);
    assert.equal((await first(`SELECT ${guard.sql} AS matches`,...guard.params)).matches,1);
    const fields={subscriptions:['customer_id','plan_id','membership_id','status','current_period_start','current_period_end','next_renewal_at','grace_ends_at','auto_renew','cancel_at_period_end','cancelled_at','paused_at','expired_at'],
      memberships:['customer_id','product_id','status','starts_at','ends_at','source_order_id','expired_at','paused_at','cancelled_at'],
      subscription_plans:['product_id','status','renewal_mode','billing_interval_unit','billing_interval_count','membership_duration_unit','membership_duration_count','grace_period_days']};
    const rows={subscriptions:subscription,memberships:membership,subscription_plans:plan};
    for(const [table,columns] of Object.entries(fields)) for(const column of columns){
      // Mutate the EXPECTED value instead of fixture constraints: this exercises
      // each predicate without invalid enum/foreign-key fixture updates.
      const altered={...rows[table],[column]:rows[table][column]===null ? 99 : String(rows[table][column])+'-stale'};
      const testGuard=renewalSnapshotGuard(table==='subscriptions'?altered:subscription,table==='memberships'?altered:membership,table==='subscription_plans'?altered:plan);
      assert.equal((await first(`SELECT ${testGuard.sql} AS matches`,...testGuard.params)).matches,0,table+'.'+column);
    }
  });
  console.log(`RESULT: ${passed} scenarios passed; 0 failed. Local D1 only. Protected fixture tables unchanged by handlers.`);
}finally{globalThis.fetch=originalFetch;await mf.dispose();await rm(directory,{recursive:true,force:true});}
