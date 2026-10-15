import assert from 'node:assert/strict';
// Runs against both actual bundled Node Worker and actual workerd/D1.
export async function freeChecks({test,dispatch,request,call,client,qy,customer,db,env,worker,origin,password}){
 await test('Free synthetic database allocation stays below 500MB',async()=>{
  let bytes;
  if(env){const pages=Object.values(await db.prepare('PRAGMA page_count').first())[0],size=Object.values(await db.prepare('PRAGMA page_size').first())[0];bytes=pages*size;}
  else bytes=(await db.prepare('SELECT 1').all()).meta.size_after;
  assert.ok(Number.isSafeInteger(bytes)&&bytes>0&&bytes<500000000);
 });
 await test('Free query cap covers repeated authenticated reads and assets',async()=>{
  for(let i=0;i<20;i++)for(const [path,cookie] of [['/customer',customer.cookie],['/qy',qy.cookie],['/workflow-ui.js',''],['/workflow.css',''],['/academy-logo.png',''],['/api/consultation/qy/bookings',qy.cookie],['/api/consultation/bookings',customer.cookie],['/api/consultation/account/state',customer.cookie]]){
   const r=await dispatch(request(path,undefined,cookie));assert.equal(r.status,200);const queries=JSON.parse(r.headers.get('x-c1-test-metrics')).queries;assert.ok(queries<=50);if(!path.startsWith('/api/'))assert.equal(queries,1);
  }
 });
 await test('Free remaining private routes deny invalid commands within query cap',async()=>{
  const paths=['meeting','qy/meeting','qy/availability','preferences','qy/preferences','qy/private','reschedule/list','qy/reschedule/list'];
  for(const path of paths){const r=await call(path,undefined,path.startsWith('qy/')?qy.cookie:customer.cookie);assert.ok(JSON.parse(r.headers.get('x-c1-test-metrics')).queries<=50);}
  for(const path of ['qy/meeting','preferences','reschedule/request','qy/reschedule/decide','qy/offer/expire','qy/forfeit','qy/report/status','qy/report','qy/customers/search','context/resume']){
   const r=await call(path,{},path.startsWith('qy/')?qy.cookie:customer.cookie,path.startsWith('qy/')?qy.csrf:customer.csrf);assert.ok(JSON.parse(r.headers.get('x-c1-test-metrics')).queries<=50);
   if(path!=='context/resume')assert.notEqual(r.status,200);
  }
 });
 await test('Free PBKDF2 login benchmark retains secure work factor',async()=>{
  // Dedicated login remains expensive; never change its work factor for CPU.
  for(let i=0;i<12;i++)assert.equal((await client(qy,'qy/login',{username:'synthetic',password})).status,200);
 });
 await test('Free quota and runtime errors never serve protected data or assets',async()=>{
  for(const failure of ['read-quota','runtime'])for(const path of ['/qy','/api/consultation/qy/bookings']){
   const r=await dispatch(request(path,undefined,qy.cookie,'',{'x-c1-test-failure':failure}));assert.notEqual(r.status,200);const body=await r.text();assert.ok(!body.includes('Synthetic private question'));
  }
  for(const limit of [0,1,2]){const r=await dispatch(request('/api/consultation/qy/bookings',undefined,qy.cookie,'',{'x-c1-test-limit':String(limit)}));assert.notEqual(r.status,200);}
 });
 await test('Free mutation quota failure creates no partial portal session',async()=>{
  const before=(await db.prepare('SELECT COUNT(*) n FROM academy_portal_sessions').first()).n;
  const r=await dispatch(request('/api/consultation/preview/bootstrap',{customerId:1},qy.cookie,qy.csrf,{'x-c1-test-limit':'5'}));assert.notEqual(r.status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM academy_portal_sessions').first()).n,before);
  const failed=await dispatch(request('/api/consultation/preview/bootstrap',{customerId:1},qy.cookie,qy.csrf,{'x-c1-test-failure':'write-quota'}));assert.notEqual(failed.status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM academy_portal_sessions').first()).n,before);
  assert.equal((await dispatch(request('/qy',undefined,'','',{'x-c1-test-failure':'write-quota'}))).status,200);
 });
 await test('Free next asset request observes missing schema guard without a cache',async()=>{
  const trigger=await db.prepare("SELECT sql FROM sqlite_master WHERE name='consultation_preview_outbox_update'").first();
  await db.prepare('DROP TRIGGER consultation_preview_outbox_update').run();try{assert.notEqual((await dispatch(request('/qy'))).status,200);}finally{await db.prepare(trigger.sql).run();}
 });
 await test('Free next request observes marker and synthetic inventory changes',async()=>{
  await db.prepare('UPDATE consultation_preview_environment SET enabled=0').run();try{assert.notEqual((await dispatch(request('/customer'))).status,200);}finally{await db.prepare('UPDATE consultation_preview_environment SET enabled=1').run();}
  await db.prepare("INSERT INTO customers(id,customer_reference,status) VALUES(999,'NON-SYNTHETIC','Active')").run();try{assert.notEqual((await dispatch(request('/customer'))).status,200);}finally{await db.prepare('DELETE FROM customers WHERE id=999').run();}
 });
 await test('Free prepared deployment rejects Production and wrong branch before D1',async()=>{
  for(const target of ['https://qy-c1-consultation-preview.pages.dev','https://quantumyijing-website.pages.dev','https://c1-bazi-consultation-development.quantumyijing-website.pages.dev','https://quantumyijing.com']){
   const r=await dispatch(new Request(target+'/qy'));assert.notEqual(r.status,200);assert.equal(JSON.parse(r.headers.get('x-c1-test-metrics')).queries,0);
  }
  if(worker){for(const change of [{CF_PAGES_BRANCH:'main'},{CONSULTATION_DEPLOYMENT_SLOT:'production'},{CF_PAGES:undefined},{PAYMENT_SECRET:'synthetic-denied'},{DB:db},{CONSULTATION_KEYRING:'x'.repeat(5001)}])assert.equal((await worker.fetch(new Request(origin+'/qy'),{...env,...change})).status,503);}
 });
}
