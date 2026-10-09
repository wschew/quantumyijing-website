// Run from the repository root with Node 24. Uses the installed local Miniflare
// runtime (or QY_MINIFLARE_PATH), never a remote database or Pages endpoint.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {onRequestPost as lifecycleAutomation} from '../functions/api/admin/subscription-lifecycle-automation.js';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {onRequestGet,onRequestPost} from '../functions/api/admin/subscriptions.js';
import {lifecycleSnapshotGuard} from '../functions/lib/subscription-lifecycle-concurrency.js';
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
async function checkpoint(path){
  const source=execFileSync('git',['show',`288f847662939a95aa1a4e554440c0b709bfdc95:${path}`],{encoding:'utf8'})
    .replace(/from "(\.\.\/\.\.\/lib\/[^"]+)"/g,(_,relative)=>`from "${pathToFileURL(resolve('functions/api/admin',relative)).href}"`);
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const checkpointAdmin=await checkpoint('functions/api/admin/subscriptions.js');
const checkpointAutomation=await checkpoint('functions/api/admin/subscription-lifecycle-automation.js');
async function automation(database=db,handler=lifecycleAutomation,mode='run'){
  const response=await handler({request:new Request('https://synthetic.invalid/lifecycle',{method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({action:mode})}),
    env:{ADMIN_TOKEN:token,DB:database}});
  return {status:response.status,body:await response.json()};
}
async function atTime(iso,fn){
  const RealDate=globalThis.Date;
  globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[iso]));} static now(){return RealDate.parse(iso);} };
  try{return await fn();}finally{globalThis.Date=RealDate;}
}

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
  const req=new Request('https://synthetic.invalid/api/admin/subscriptions?action='+ (method==='GET'?'renewal-preview&id=1&orderId=1':(extra.action || 'renew')),{
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
  // Prove SQL semantics before any application hardening. These statements use
  // actual local D1 batch(), existing schema constraints, and synthetic rows only.
  for(const [name,expected] of [['matching snapshot',1],['stale snapshot',0]]){
    await test(`D1 changes() atomicity: ${name}`,async()=>{
      const results=await db.batch([
        db.prepare("UPDATE subscriptions SET status='Paused' WHERE id=1 AND status IS ?").bind(expected?'Active':'PastDue'),
        db.prepare("INSERT INTO subscription_events(subscription_id,event_type,from_status,to_status) SELECT 1,'paused','Active','Paused' WHERE changes()=1")
      ]);
      assert.equal(results[0].meta.changes,expected);assert.equal(results[1].meta.changes,expected);
      assert.equal((await first('SELECT COUNT(*) AS n FROM subscription_events')).n,expected);
      assert.equal((await first('SELECT status FROM subscriptions')).status,expected?'Paused':'Active');
    });
  }
  await test('D1 changes() atomicity: event failure rolls back update',async()=>{
    const before=await snapshot();
    await assert.rejects(db.batch([
      db.prepare("UPDATE subscriptions SET status='Paused' WHERE id=1 AND status IS 'Active'"),
      db.prepare("INSERT INTO subscription_events(subscription_id,event_type) SELECT 1,'invalid-synthetic-event' WHERE changes()=1")
    ]),/CHECK constraint/);
    assert.deepEqual(await snapshot(),before);
  });
  // Retain deterministic reproductions of the unfixed checkpoint as regression
  // evidence: their asserted outcome is the defect, never the desired behavior.
  for(const kind of ['catch-up expiry','scheduled cancellation','admin status','cancellation scheduling']){
    await scenario(`checkpoint defect reproduction: ${kind}`,async()=>{
      await run("UPDATE subscriptions SET cancel_at_period_end=0,grace_ends_at='2026-01-31T23:59:59.000Z'");
      if(kind==='scheduled cancellation')await run('UPDATE subscriptions SET cancel_at_period_end=1');
    },()=>atTime('2026-02-01T00:00:00.000Z',async()=>{
      let once=false;
      const raced=wrapped(async statements=>{
        if(!once){once=true;assert.equal((await request('POST')).body.renewed,true);}
        return db.batch(statements);
      });
      if(kind==='catch-up expiry'||kind==='scheduled cancellation'){
        assert.equal((await automation(raced,checkpointAutomation.onRequestPost)).status,200);
        assert.equal((await first('SELECT status FROM subscriptions')).status,kind==='catch-up expiry'?'Expired':'Cancelled');
      }else{
        const result=await request('POST',raced,{action:kind==='admin status'?'status':'cancel-at-period-end',status:'Expired'},checkpointAdmin);
        assert.equal(result.body.changed,true);
        const row=await first('SELECT * FROM subscriptions');
        assert.equal(kind==='admin status'?row.status:row.cancel_at_period_end,kind==='admin status'?'Expired':1);
      }
      assert.equal((await first('SELECT COUNT(*) AS n FROM subscription_renewal_executions')).n,1);
    }));
  }
  if(process.argv.includes('--lifecycle-preflight')){
    console.log(`PREFLIGHT: ${passed} scenarios passed; atomicity proved and checkpoint defects reproduced.`);
  }else{
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
  // Intercept the link read, after the losing request's initial completion reads.
  // Batch-only barriers cannot exercise a winner committing at this boundary.
  function commitBeforeLinkRead(commit){
    let fired=false;
    return {
      prepare(sql){
        const statement=db.prepare(sql);
        if(!/FROM subscription_orders\s+WHERE order_id=\?/i.test(sql) || !sql.includes('period_end')) return statement;
        return {bind(...params){
          const bound=statement.bind(...params);
          return {async first(...args){
            if(!fired){fired=true;await commit();}
            return bound.first(...args);
          }};
        }};
      },
      batch:statements=>db.batch(statements)
    };
  }
  await test('same-order read-phase race returns the committed manual completion',async()=>{
    let winner,committed;
    const raced=commitBeforeLinkRead(async()=>{
      winner=await request('POST');assert.equal(winner.status,200);assert.equal(winner.body.renewed,true);
      committed=await snapshot();
    });
    const loser=await request('POST',raced);
    assert.equal(loser.status,200);assert.equal(loser.body.idempotent,true);assert.equal(loser.body.changed,false);
    const after=await snapshot();assert.deepEqual(after,committed);
    assert.equal(after.subscription_renewal_executions.length,1);
    assert.equal(after.subscription_orders.length,1);
    assert.equal(after.subscription_events.length,1);assert.equal(after.membership_events.length,1);
    assert.equal(after.subscriptions[0].current_period_end,'2026-02-28T23:59:59.000Z');
    assert.equal(after.memberships[0].ends_at,'2027-01-31T23:59:59.000Z');
  });
  for(const kind of ['incomplete','foreign subscription','foreign membership','historical engine','historical manual']){
    await test('read-phase link recheck: '+kind,async()=>{
      let committed;
      const raced=commitBeforeLinkRead(async()=>{
        await link();
        if(kind.startsWith('foreign')){
          if(kind==='foreign subscription') await run("INSERT INTO subscriptions(id,subscription_reference,customer_id,plan_id,membership_id) VALUES(2,'SYNTH-S2',1,1,1)");
          else await run("INSERT INTO memberships(id,membership_reference,customer_id,product_id,status) VALUES(2,'SYNTH-M2',1,1,'Active')");
          await run('INSERT INTO subscription_renewal_executions(order_id,subscription_id,membership_id) VALUES(1,?,?)',kind==='foreign subscription'?2:1,kind==='foreign membership'?2:1);
        }else if(kind.startsWith('historical')){
          await run("INSERT INTO subscription_events(subscription_id,event_type,source,source_reference) VALUES(1,'renewed',?,?)",
            kind==='historical manual'?'A6E Manual Renewal Administration':'Historic',
            kind==='historical manual'?'AdminRenewal:1':'RenewalOrder:1');
        }
        committed=await snapshot();
      });
      const response=await request('POST',raced);
      assert.equal(response.status,kind.startsWith('historical')?200:409);
      if(kind.startsWith('historical')) assert.equal(response.body.idempotent,true);
      else assert.match(response.body.error,kind==='incomplete'?/linked but has no recognized completion/:/another subscription or membership/);
      assert.deepEqual(await snapshot(),committed);
    });
  }
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
  for(const path of ['manual','engine']) for(const table of ['subscription_events','membership_events']){
    await scenario(`${path}: failure at ${table} write rolls back the complete renewal`,async()=>{
      if(path==='engine')await link();
    },async()=>{
      const before=await snapshot();let calls=0;
      const failed=wrapped(async statements=>{
        calls++;
        const index=path==='manual'?(table==='subscription_events'?4:5):(table==='membership_events'?4:5);
        const replacement=[...statements];
        const parent=table==='subscription_events'?'subscription_id':'membership_id';
        replacement[index]=db.prepare(`INSERT INTO ${table}(${parent},event_type) VALUES(1,'invalid-synthetic-event')`);
        return db.batch(replacement);
      });
      if(path==='manual')assert.equal((await request('POST',failed)).status,409);
      else await assert.rejects(engine(failed,1),/CHECK constraint/);
      assert.equal(calls,1);assert.deepEqual(await snapshot(),before);
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

  const lifecycleClock='2026-02-01T00:00:00.000Z';
  async function lifecycleFixture(path,kind){
    await run("UPDATE subscriptions SET cancel_at_period_end=?,grace_ends_at=?,status=?",
      kind==='scheduled cancellation'?1:0,
      kind==='PastDue'?'2026-02-08T00:00:00.000Z':'2026-01-31T23:59:59.000Z',
      kind==='existing Expired'?'PastDue':'Active');
    if(path==='engine')await link();
  }
  async function renewalOutcome(path,database=db){
    if(path==='manual'){
      const response=await request('POST',database);
      assert.ok([200,409].includes(response.status),JSON.stringify(response));
      return response.status===200;
    }
    try{await engine(database,1);return true;}
    catch(error){assert.match(error.message,/VALIDATION:.*(?:cannot be renewed|Active subscription)/);return false;}
  }
  function lifecycleState(state){
    return {dates:dates(state),cancelled:state.subscriptions[0].cancelled_at,
      paused:state.subscriptions[0].paused_at,expired:state.subscriptions[0].expired_at,
      events:state.subscription_events.map(e=>[e.event_type,e.from_status,e.to_status,e.source_reference]),
      memberEvents:state.membership_events.map(e=>[e.event_type,e.from_status,e.to_status]),
      ledger:state.subscription_renewal_executions.map(e=>[e.order_id,e.previous_membership_end,e.period_start,e.new_membership_end])};
  }
  // Compare interleaved handlers with a sequential reference, not a new date or
  // cancellation policy. A barrier intercepts the real batch after all reads.
  for(const path of ['manual','engine']){
    for(const kind of ['PastDue','catch-up Expired','scheduled cancellation',...(path==='engine'?['existing Expired']:[])]){
      for(const winner of ['renewal','automation']){
        await scenario(`${path} versus automated ${kind}: ${winner} commits first`,()=>lifecycleFixture(path,kind),
          ()=>atTime(lifecycleClock,async()=>{
            const prepared=await snapshot();
            let expectedOutcome;
            if(winner==='renewal'){expectedOutcome=await renewalOutcome(path);await automation();}
            else{await automation();expectedOutcome=await renewalOutcome(path);}
            const expected=lifecycleState(await snapshot());await restore(prepared);
            let batches=0,actualOutcome;
            const raced=wrapped(async statements=>{
              if(++batches===1){
                if(winner==='renewal')actualOutcome=await renewalOutcome(path);
                else assert.equal((await automation()).status,200);
              }
              return db.batch(statements);
            });
            if(winner==='renewal'){
              const result=await automation(raced);assert.equal(result.status,200);
              assert.equal(result.body.transitioned,0);assert.equal(result.body.failed,0);
              assert.equal(result.body.unchanged,1);assert.equal(batches,1);
            }else actualOutcome=await renewalOutcome(path,raced);
            assert.equal(actualOutcome,expectedOutcome);
            assert.deepEqual(lifecycleState(await snapshot()),expected);
          }));
      }
    }
    for(const [name,extra] of [
      ['Pause',{action:'status',status:'Paused'}],['Cancel Now',{action:'status',status:'Cancelled'}],
      ['Mark Expired',{action:'status',status:'Expired'}],['Mark PastDue',{action:'status',status:'PastDue'}],
      ['Cancel at Period End',{action:'cancel-at-period-end'}]
    ]) for(const winner of ['renewal','administration']){
      await scenario(`${path} versus admin ${name}: ${winner} commits first`,()=>lifecycleFixture(path,'PastDue'),
        ()=>atTime(lifecycleClock,async()=>{
          const prepared=await snapshot();let expectedOutcome;
          // A stale administrative request is rejected; refreshing is explicit.
          if(winner==='renewal')expectedOutcome=await renewalOutcome(path);
          else{assert.equal((await request('POST',db,extra)).status,200);expectedOutcome=await renewalOutcome(path);}
          const expected=lifecycleState(await snapshot());await restore(prepared);
          let firstBatch=true,actualOutcome;
          const raced=wrapped(async statements=>{
            if(firstBatch){firstBatch=false;
              if(winner==='renewal')actualOutcome=await renewalOutcome(path);
              else assert.equal((await request('POST',db,extra)).status,200);
            }
            return db.batch(statements);
          });
          if(winner==='renewal'){
            const result=await request('POST',raced,extra);assert.equal(result.status,409);
            assert.match(result.body.error,/state changed/);
          }else actualOutcome=await renewalOutcome(path,raced);
          assert.equal(actualOutcome,expectedOutcome);assert.deepEqual(lifecycleState(await snapshot()),expected);
          assert.equal(firstBatch,false);
        }));
    }
    for(const order of ['renewal attempt first','resume first']){
      await scenario(`${path} versus Resume from Paused: ${order}`,async()=>{
        await lifecycleFixture(path,'PastDue');await run("UPDATE subscriptions SET status='Paused',paused_at='2026-01-01T00:00:00.000Z'");
      },()=>atTime(lifecycleClock,async()=>{
        const before=await snapshot();
        if(order==='renewal attempt first'){
          assert.equal(await renewalOutcome(path),false);assert.deepEqual(await snapshot(),before);
        }
        assert.equal((await request('POST',db,{action:'status',status:'Active'})).status,200);
        assert.equal(await renewalOutcome(path),true);
        const state=await snapshot();assert.equal(state.subscriptions[0].paused_at,'');
        assert.equal(state.subscriptions[0].status,'Active');assert.equal(state.memberships[0].status,'Active');
        assert.deepEqual(state.subscription_events.map(e=>e.event_type),['resumed','renewed']);
        assert.equal(state.subscription_renewal_executions.length,1);
      }));
    }
  }
  for(const extra of [{action:'status',status:'Paused'},{action:'cancel-at-period-end'}]){
    await scenario(`duplicate admin ${extra.action}: one event, loser 409`,()=>run('UPDATE subscriptions SET cancel_at_period_end=0'),async()=>{
      const gate=barrier(2),raced=wrapped(async statements=>{await gate();return db.batch(statements);});
      const results=await Promise.all([request('POST',raced,extra),request('POST',raced,extra)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal((await first('SELECT COUNT(*) AS n FROM subscription_events')).n,1);
      const before=await snapshot();const repeat=await request('POST',db,extra);
      assert.equal(repeat.body.idempotent,true);assert.deepEqual(await snapshot(),before);
    });
  }
  await scenario('stale Resume cannot reactivate a cancelled subscription',async()=>{
    await run("UPDATE subscriptions SET status='Paused',paused_at='2026-01-01T00:00:00.000Z'");
  },async()=>{
    const raced=wrapped(async statements=>{
      assert.equal((await request('POST',db,{action:'status',status:'Cancelled'})).status,200);
      return db.batch(statements);
    });
    assert.equal((await request('POST',raced,{action:'status',status:'Active'})).status,409);
    const state=await snapshot();assert.equal(state.subscriptions[0].status,'Cancelled');
    assert.deepEqual(state.subscription_events.map(e=>[e.from_status,e.to_status]),[['Paused','Cancelled']]);
  });
  await scenario('stale scheduling cannot modify a terminal subscription',()=>run('UPDATE subscriptions SET cancel_at_period_end=0'),async()=>{
    const raced=wrapped(async statements=>{
      await request('POST',db,{action:'status',status:'Expired'});return db.batch(statements);
    });
    assert.equal((await request('POST',raced,{action:'cancel-at-period-end'})).status,409);
    const state=await snapshot();assert.equal(state.subscriptions[0].cancel_at_period_end,0);
    assert.deepEqual(state.subscription_events.map(e=>e.event_type),['expired']);
  });
  await scenario('simultaneous automation runs at identical timestamps record each catch-up event once',()=>lifecycleFixture('manual','catch-up Expired'),
    ()=>atTime(lifecycleClock,async()=>{
      const gate=barrier(2);let arrivals=0;
      const raced=wrapped(async statements=>{if(++arrivals<=2)await gate();return db.batch(statements);});
      const results=await Promise.all([automation(raced),automation(raced)]);
      assert.equal(results.reduce((n,r)=>n+r.body.transitioned,0),2);
      const state=await snapshot();assert.equal(state.subscriptions[0].status,'Expired');
      assert.deepEqual(state.subscription_events.map(e=>[e.event_type,e.from_status,e.to_status]),
        [['past_due','Active','PastDue'],['expired','PastDue','Expired']]);
      const before=await snapshot();assert.equal((await automation()).body.transitioned,0);
      assert.deepEqual(await snapshot(),before);
    }));
  await scenario('engine renewal between catch-up steps prevents stale expiry',()=>lifecycleFixture('engine','catch-up Expired'),
    ()=>atTime(lifecycleClock,async()=>{
      let batches=0;
      const raced=wrapped(async statements=>{if(++batches===2)assert.equal(await renewalOutcome('engine'),true);return db.batch(statements);});
      const result=await automation(raced);assert.equal(result.body.transitioned,1);assert.equal(result.body.unchanged,1);
      const state=await snapshot();assert.equal(state.subscriptions[0].status,'Active');
      assert.deepEqual(state.subscription_events.map(e=>e.event_type),['past_due','renewed']);
    }));
  for(const kind of ['status','scheduling','automation']){
    await scenario(`${kind}: event failure rolls back state and unexpected SQL failure is not retried`,async()=>{
      await lifecycleFixture('manual','PastDue');
    },()=>atTime(lifecycleClock,async()=>{
      const extra=kind==='status'?{action:'status',status:'Paused'}:{action:'cancel-at-period-end'};
      const before=await snapshot();let calls=0;
      // Append an invalid statement inside the real transaction AFTER the event:
      // prove state and event rollback, rather than simulate a pre-write throw.
      const fail=wrapped(async statements=>{calls++;return db.batch([...statements,
        db.prepare("INSERT INTO subscription_events(subscription_id,event_type) VALUES(1,'invalid-synthetic-event')")]);});
      if(kind==='automation'){
        const result=await automation(fail);assert.equal(result.body.failed,1);assert.equal(result.body.transitioned,0);
      }else{
        const result=await request('POST',fail,extra);
        assert.equal(result.status,409);assert.match(result.body.error,/constraint conflict/);
      }
      assert.equal(calls,1);assert.deepEqual(await snapshot(),before);
      const sqlFailure=wrapped(async statements=>{calls++;return db.batch([...statements,db.prepare('SELECT * FROM nonexistent_synthetic_table')]);});
      if(kind==='automation')assert.equal((await automation(sqlFailure)).body.failed,1);
      else assert.equal((await request('POST',sqlFailure,extra)).status,500);
      assert.equal(calls,2);assert.deepEqual(await snapshot(),before);
    }));
  }
  // Exercise failure in the event statement itself through real D1, not a wrapper
  // throwing before batch execution. Fixture-only trigger leaves app schema alone.
  for(const kind of ['status','scheduling','automation']){
    await scenario(`${kind}: corresponding event insertion failure rolls back update`,()=>lifecycleFixture('manual','PastDue'),
      ()=>atTime(lifecycleClock,async()=>{
        const before=await snapshot();
        await run("CREATE TRIGGER synthetic_event_failure BEFORE INSERT ON subscription_events BEGIN SELECT RAISE(ABORT,'synthetic event recording failure'); END");
        try{
          if(kind==='automation')assert.equal((await automation()).body.failed,1);
          else assert.equal((await request('POST',db,kind==='status'?{action:'status',status:'Paused'}:{action:'cancel-at-period-end'})).status,500);
          assert.deepEqual(await snapshot(),before);
        }finally{await run('DROP TRIGGER synthetic_event_failure');}
      }));
  }
  await scenario('due period-end cancellation executes once and preserves unrelated subscriptions',async()=>{
    await run('UPDATE subscriptions SET current_period_end=?,cancel_at_period_end=1',lifecycleClock);
    await run("INSERT INTO subscriptions(id,subscription_reference,customer_id,plan_id,membership_id,status,current_period_end,cancel_at_period_end) VALUES(2,'SYNTH-FUTURE',1,1,1,'Active','2027-01-01T00:00:00.000Z',1),(3,'SYNTH-TERMINAL',1,1,1,'Expired','2020-01-01T00:00:00.000Z',1)");
  },async()=>{
    const before=await snapshot();
    await atTime('2026-01-31T23:59:59.999Z',async()=>{
      const result=await automation();assert.equal(result.body.transitioned,0);assert.deepEqual(await snapshot(),before);
    });
    await atTime(lifecycleClock,async()=>{
      const result=await automation();assert.equal(result.status,200);assert.equal(result.body.failed,0);assert.equal(result.body.transitioned,1);
      const after=await snapshot();const row=after.subscriptions.find(r=>r.id===1);
      assert.equal(row.status,'Cancelled');assert.equal(row.cancelled_at,lifecycleClock);
      assert.deepEqual(after.subscriptions.filter(r=>r.id!==1),before.subscriptions.filter(r=>r.id!==1));
      assert.deepEqual(after.memberships,before.memberships);assert.deepEqual(after.membership_events,before.membership_events);
      assert.deepEqual(after.subscription_events.map(e=>[e.subscription_id,e.event_type,e.from_status,e.to_status,e.event_at]),[[1,'cancelled','Active','Cancelled',lifecycleClock]]);
      assert.equal((await automation()).body.transitioned,0);assert.deepEqual(await snapshot(),after);
    });
  });
  for(const [name,status,end,grace,flag,events] of [
    ['period exactly reached','Active',lifecycleClock,'2026-02-08T00:00:00.000Z',0,['past_due']],
    ['period one millisecond future','Active','2026-02-01T00:00:00.001Z','',0,[]],
    ['grace exactly reached','PastDue','2026-01-31T00:00:00.000Z',lifecycleClock,0,['expired']],
    ['grace one millisecond future','PastDue','2026-01-31T00:00:00.000Z','2026-02-01T00:00:00.001Z',0,[]],
    ['invalid dates','Active','invalid','invalid',0,[]],['empty dates','Active','','',0,[]],
    ['Pending excluded','Pending','2026-01-31T00:00:00.000Z','',1,[]],
    ['Paused excluded without cancellation','Paused','2026-01-31T00:00:00.000Z','',0,[]],
    ['Paused scheduled cancellation','Paused',lifecycleClock,'',1,['cancelled']],
    ['cancellation priority over catch-up','Active',lifecycleClock,lifecycleClock,1,['cancelled']],
    ['catch-up preserves both transitions','Active',lifecycleClock,lifecycleClock,0,['past_due','expired']]
  ]) await scenario(`lifecycle boundary: ${name}`,()=>run('UPDATE subscriptions SET status=?,current_period_end=?,grace_ends_at=?,cancel_at_period_end=?',status,end,grace,flag),
    ()=>atTime(lifecycleClock,async()=>{
      const before=await snapshot();const preview=await automation(db,lifecycleAutomation,'preview');
      assert.equal(preview.body.planned,events.length);assert.deepEqual(await snapshot(),before);
      const result=await automation();assert.equal(result.body.failed,0);assert.equal(result.body.transitioned,events.length);
      const after=await snapshot();assert.deepEqual(after.subscription_events.map(e=>e.event_type),events);
      assert.deepEqual(after.memberships,before.memberships);assert.deepEqual(after.membership_events,before.membership_events);
    }));
  for(const terminal of ['Cancelled','Expired']) for(const extra of [{action:'status',status:'Active'},{action:'cancel-at-period-end'}]){
    await scenario(`${terminal} rejects ${extra.action} without entitlement writes`,()=>run('UPDATE subscriptions SET status=?',terminal),async()=>{
      const before=await snapshot();assert.equal((await request('POST',db,extra)).status,409);assert.deepEqual(await snapshot(),before);
    });
  }

  await test('lifecycle guard compares every business field and ignores timestamps-only changes',async()=>{
    const row=await first('SELECT * FROM subscriptions WHERE id=1');
    const guard=lifecycleSnapshotGuard(row);
    assert.equal((await first(`SELECT EXISTS(SELECT 1 FROM subscriptions WHERE ${guard.sql}) AS ok`,...guard.params)).ok,1);
    const timestampOnly=lifecycleSnapshotGuard({...row,updated_at:'same-second-or-other-time'});
    assert.deepEqual(timestampOnly,guard);
    for(const field of ['id','subscription_reference','customer_id','plan_id','membership_id','status',
      'current_period_start','current_period_end','next_renewal_at','grace_ends_at','auto_renew',
      'cancel_at_period_end','cancelled_at','paused_at','expired_at']){
      const changed=lifecycleSnapshotGuard({...row,[field]:String(row[field])+'-stale'});
      assert.equal((await first(`SELECT EXISTS(SELECT 1 FROM subscriptions WHERE ${changed.sql}) AS ok`,...changed.params)).ok,0,field);
      assert.throws(()=>lifecycleSnapshotGuard({...row,[field]:undefined}),/snapshot missing/);
    }
    // Null-safe SQL comparisons are demonstrated even though the current schema
    // declares the captured columns NOT NULL.
    assert.equal((await first('SELECT NULL IS ? AS ok',null)).ok,1);
  });
  for(const path of ['manual','engine']) for(const extra of [
    {action:'status',status:'Paused'},{action:'status',status:'Cancelled'},
    {action:'status',status:'Expired'},{action:'cancel-at-period-end'}]){
    await scenario(`${path}: fresh ${extra.status || extra.action} after renewal remains permitted`,()=>lifecycleFixture(path,'PastDue'),
      ()=>atTime(lifecycleClock,async()=>{
        assert.equal(await renewalOutcome(path),true);const before=await snapshot();
        const result=await request('POST',db,extra);assert.equal(result.status,200);assert.equal(result.body.changed,true);
        const after=await snapshot();assert.deepEqual(after.memberships,before.memberships);
        assert.deepEqual(after.membership_events,before.membership_events);
        for(const field of ['current_period_start','current_period_end','next_renewal_at','grace_ends_at'])
          assert.equal(after.subscriptions[0][field],before.subscriptions[0][field]);
        assert.equal(after.subscription_events.length,2);
        assert.equal(after.subscription_events[1].from_status,'Active');
        assert.equal(after.subscription_events[1].to_status,extra.status || 'Active');
      }));
  }
  for(const kind of ['cancellation flag cleared','period extended without status change','grace extended without status change']){
    await scenario(`automation skips stale ${kind}`,async()=>{
      await lifecycleFixture('manual','catch-up Expired');
      if(kind==='cancellation flag cleared')await run('UPDATE subscriptions SET cancel_at_period_end=1');
      if(kind==='grace extended without status change')await run("UPDATE subscriptions SET status='PastDue'");
    },()=>atTime(lifecycleClock,async()=>{
      const before=await snapshot();let calls=0;
      const raced=wrapped(async statements=>{
        calls++;
        if(kind==='cancellation flag cleared')await run('UPDATE subscriptions SET cancel_at_period_end=0');
        else if(kind==='period extended without status change')await run("UPDATE subscriptions SET current_period_end='2027-01-31T23:59:59.000Z'");
        else await run("UPDATE subscriptions SET grace_ends_at='2027-01-31T23:59:59.000Z'");
        return db.batch(statements);
      });
      const result=await automation(raced);assert.equal(result.body.transitioned,0);assert.equal(result.body.unchanged,1);
      assert.equal(calls,1);const after=await snapshot();assert.equal(after.subscription_events.length,0);
      assert.equal(after.subscriptions[0].status,before.subscriptions[0].status);
      assert.deepEqual(after.memberships,before.memberships);
    }));
  }
  }
  console.log(`RESULT: ${passed} scenarios passed; 0 failed. Local D1 only. Protected fixture tables unchanged by handlers.`);
}finally{globalThis.fetch=originalFetch;await mf.dispose();await rm(directory,{recursive:true,force:true});}
