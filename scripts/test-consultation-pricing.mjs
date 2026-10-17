import vm from 'node:vm';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {buildPackage} from './build-consultation-pages.mjs';
import {sha,canonical,verifyManifest} from './consultation-migration-verifier.mjs';
import {newPasswordRecord,randomSecret} from '../functions/lib/consultation/auth-crypto.js';
const output=process.env.QY_C1_LEGACY_PACKAGE?resolve(process.env.QY_C1_LEGACY_PACKAGE):resolve('.local-c1-package-preview-pricing-'+Date.now());
// Archive mode checks retired A/A2/A3 behavior only, not active A4 endpoints.
const packageInfo=process.env.QY_C1_LEGACY_PACKAGE?{publicPath:resolve(output,'public'),offline:resolve(output,'offline'),manifest:JSON.parse(readFileSync(resolve(output,'offline/migration-manifest.json'),'utf8'))}:await buildPackage(output,process.env.QY_ESBUILD_PATH);
const manifest=verifyManifest(packageInfo.manifest),publicPath=packageInfo.publicPath,offline=packageInfo.offline;
const origin='https://c1-bazi-consultation-develop.qy-c1-consultation-preview.pages.dev',databaseId='11111111-2222-4333-8444-555555555555';
const config={environment:'preview',syntheticOnly:true,origin,databaseId,expectedDatabaseId:databaseId,manifestSha256:sha(JSON.stringify(manifest)),productId:1,practitionerId:1,countryCodes:['MY'],isolatedPreviewProject:'qy-c1-consultation-preview',previewBranch:'c1-bazi-consultation-development',policies:Object.fromEntries(['consultation_privacy','future_calculations','marketing','booking'].map(p=>[p,{version:'synthetic-v1',text:'Synthetic '+p,hash:sha('Synthetic '+p)}]))};
const ring=Object.fromEntries(['intake','contact','lookup','challenge','meeting','mockDelivery'].map(p=>[p,{active:p+'-synthetic-v1',keys:{[p+'-synthetic-v1']:randomSecret()}}]));
const settings={CONSULTATION_DEPLOYMENT_SLOT:'preview',CONSULTATION_CONFIG:JSON.stringify(config),CONSULTATION_PREVIEW_ENABLED:'true',CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED:'true',CONSULTATION_MOCK_DELIVERY_ENABLED:'true',CONSULTATION_KEYRING:JSON.stringify(ring),CF_PAGES:'1',CF_PAGES_BRANCH:'c1-bazi-consultation-development',CF_PAGES_COMMIT_SHA:'synthetic',CF_PAGES_URL:origin};
const password=randomSecret();settings.CONSULTATION_ADMIN_SECRET=password;
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const split=s=>s.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|INSERT|ALTER|$)/).map(s=>s.trim()).filter(Boolean);
function sqlite(raw){return {prepare(sql){let v=[];return {sql,bind(...x){v=x;return this;},async first(){return raw.prepare(sql).get(...v)??null;},async all(){return {results:raw.prepare(sql).all(...v)};},async run(){const s=raw.prepare(sql);if(s.columns().length)return {results:s.all(...v),meta:{changes:Number(raw.prepare('SELECT changes() n').get().n)}};return {meta:{changes:Number(s.run(...v).changes)}};}};},async batch(plans){raw.exec('BEGIN');try{const r=[];for(const p of plans)r.push(await p.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
async function schema(db){
 for(const s of split(readFileSync(resolve(offline,'000-isolated-prerequisites.sql'),'utf8')))await db.prepare(s).run();
 for(const m of manifest.migrations){
  const sql=readFileSync(resolve(offline,String(m.ordinal).padStart(3,'0')+'-'+m.path.split('/').at(-1)),'utf8');
  assert.equal(sha(canonical(sql)),m.sha256);
  await db.batch([...split(sql).map(s=>db.prepare(s)),db.prepare('INSERT INTO consultation_migration_ledger VALUES(?,?,?,?)').bind(m.ordinal,m.path,m.sha256,Date.now())]);
 }
 await db.prepare('INSERT INTO consultation_preview_environment VALUES(1,?,?,?,1,0)').bind(databaseId,origin,config.manifestSha256).run();
 await db.prepare("INSERT INTO customers(id,customer_reference,display_name,email,status) VALUES(1,'SYNTHETIC-001','Synthetic One','one@example.invalid','Active')").run();
 await db.prepare('INSERT INTO consultation_preview_synthetic_customers VALUES(1,1)').run();
 await db.prepare("INSERT INTO products(id,sku,slug,product_type,name_en,status,price,currency) VALUES(1,'CONSULT-BAZI','synthetic','consultation','Synthetic','Draft',1300,'MYR')").run();
 await db.prepare("INSERT INTO coaches(id,coach_code,full_name,email,status) VALUES(1,'SYNTHETIC','Synthetic','qy@example.invalid','Approved')").run();
}
import {page} from './test-consultation-guest-ui.mjs';
const worker=(await import(pathToFileURL(resolve(publicPath,'_worker.js')).href)).default;
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
let clock=Date.parse('2026-10-17T02:00:00Z'),assertions=0,barrier=null,beforeWrite=null,submitted=0,reads=0;
// Keep native authentication and SQL on the same deterministic test clock.
const realNow=Date.now;Date.now=()=>clock;
const check=(value,message)=>{assert.ok(value,message);assertions++;};
try{
 const native=sqlite(raw);await schema(native);
 for(const name of ['guest','selfservice'])raw.exec(readFileSync('database/additive/c1-consultation-'+name+'.sql','utf8'));
 const credential=await newPasswordRecord(password);raw.prepare("INSERT INTO consultation_auth_account VALUES(1,'qyadmin',1,'PBKDF2-SHA256',600000,?,?,1,?)").run(credential.salt,credential.hash,clock);raw.prepare('UPDATE consultation_preview_environment SET enabled=1').run();
 raw.prepare("INSERT INTO consultation_promotions VALUES('synthetic-bazi-promo-2026',1,1,'MYR',98000,'2026-10-11','2026-12-31','Asia/Kuala_Lumpur','Active','synthetic-owner-approval',?)").run(clock-1000);
 const seasonal=JSON.stringify(raw.prepare('SELECT * FROM consultation_promotions').get());
 const pricingDDL=readFileSync('database/additive/c1-consultation-pricing.sql','utf8');
 const oldTables=raw.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table'").all();
 raw.exec('BEGIN');try{raw.exec(pricingDDL+'; SELECT * FROM a2_forced_missing_table;');throw Error('Expected migration failure');}catch{raw.exec('ROLLBACK');}
 check(!raw.prepare("SELECT name FROM sqlite_schema WHERE name='consultation_discount_codes'").get(),'migration failure can roll back all additions locally');
 raw.exec(pricingDDL);raw.exec(readFileSync('database/additive/c1-consultation-invitations.sql','utf8'));check(oldTables.every(r=>raw.prepare('SELECT sql FROM sqlite_schema WHERE name=?').get(r.name).sql===r.sql),'original table definitions unchanged');
 let rerunRejected=false;try{raw.exec(pricingDDL);}catch{rerunRejected=true;}check(rerunRejected,'one-time additive migration refuses blind rerun');
 check(JSON.stringify(raw.prepare("SELECT * FROM consultation_promotions WHERE id='synthetic-bazi-promo-2026'").get())===seasonal,'migration preserves existing seasonal promotion');
 let queue=Promise.resolve();
 const db={prepare(sql){let values=[];const compiled=()=>native.prepare(sql.replaceAll("'now'","'"+new Date(clock).toISOString()+"'")).bind(...values);return {sql,bind(...v){values=v;return this;},async first(){reads++;return compiled().first();},async all(){reads++;return compiled().all();},async run(){return compiled().run();}};},async batch(plans){submitted+=plans.length;if(plans.some(p=>p.sql?.includes('INSERT INTO consultation_selfservice_bookings'))){if(beforeWrite){const fn=beforeWrite;beforeWrite=null;fn();}if(barrier)await barrier();}const result=queue.then(()=>native.batch(plans));queue=result.catch(()=>{});return result;}};
 const env={...settings,CONSULTATION_DB:db,ASSETS:{fetch:async request=>{let name=new URL(request.url).pathname.slice(1);if(['customer','qy'].includes(name))name+='.html';return new Response(readFileSync(resolve(publicPath,name)),{headers:{'content-type':name.endsWith('.js')?'application/javascript':'text/html'}});}}};
 const call=async(path,body,who={})=>{const r=await worker.fetch(new Request(origin+'/api/consultation/'+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin',cookie:who.cookie||'','x-qy-consultation-csrf':who.csrf||''},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);const data=await r.json();if(r.headers.get('set-cookie'))who.cookie=r.headers.get('set-cookie').split(';')[0];if(data.csrfToken)who.csrf=data.csrfToken;return {status:r.status,data};};
 const start=Date.parse('2026-10-24T02:00:00Z');raw.prepare("INSERT INTO consultation_availability_windows VALUES('a2-test',1,?,?,'Active',1,?,?)").run(start,start+2*86400000,clock,clock);
 const intake={fullName:'Synthetic A2 Guest',calculationGender:'female',birthDate:'1990-06-15',birthTimePrecision:'unknown',birthTime:null,birthCity:'Synthetic City',birthCountry:'MY',questions:'Synthetic private intake',reportChannel:'email',selfBooking:true,adultAcknowledged:true,privacyAcknowledgement:{accepted:true,version:'synthetic-v1'}};
 const count=()=>raw.prepare('SELECT COUNT(*) n FROM consultation_bookings').get().n;
 const qy={};check((await call('qy/login',{username:'qyadmin',password},qy)).status===200,'existing secret login');
 const issue=async(price=88000,expiry=clock+3600000)=>{const r=await call('qy/discounts',{action:'issue',finalPriceSen:price,description:'Synthetic private final price',expiresAt:expiry},qy);check(r.status===200,'admin code issuance');return r.data;};
 const quote=(at,code)=>call('guest/quote',{preferredStart:at,...(code?{discountCode:code}:{})});
 const input=(q,at)=>({commandId:crypto.randomUUID(),intake,contact:'a2@example.invalid',preferredStart:at,acceptance:{accepted:true,quote:q.data.quote}});
 check((await call('qy/pricing')).status!==200,'no anonymous price management listing');
 check((await call('qy/discounts',{action:'issue',finalPriceSen:1,description:'',expiresAt:clock+10000})).status!==200,'no unauthenticated issue');
 check((await call('qy/discounts',{action:'issue',finalPriceSen:1,description:'',expiresAt:clock+10000},{cookie:qy.cookie})).status!==200,'CSRF required');
 const draft={action:'draft',priceSen:95000,startsOn:'2027-01-01',endsOn:'2027-01-31',currency:'MYR'};
 for(const invalid of [{...draft,priceSen:0},{...draft,currency:'USD'},{...draft,startsOn:'2027-02-30'},{...draft,endsOn:'2026-12-01'},{...draft,startsOn:'2026-10-01'}])check((await call('qy/promotions',invalid,qy)).status!==200,'invalid promotion rejected');
 const promotion=await call('qy/promotions',draft,qy);check(promotion.status===200,'future promotion draft');
 check((await call('qy/promotions',{action:'activate',id:promotion.data.id},qy)).status!==200,'explicit approval required');
 check((await call('qy/promotions',{action:'activate',id:promotion.data.id,approved:true},qy)).status===200,'approved activation');
 const overlap=await call('qy/promotions',{...draft,startsOn:'2027-01-31',endsOn:'2027-02-02'},qy);check(overlap.status===200,'overlap can be reviewed as draft');
 check((await call('qy/promotions',{action:'activate',id:overlap.data.id,approved:true},qy)).status!==200,'inclusive overlapping active promotions rejected');
 check(raw.prepare('SELECT state FROM consultation_promotions WHERE id=?').get(overlap.data.id).state==='Draft','failed activation rolls back');
 check((await call('qy/promotions',{action:'revoke',id:promotion.data.id},qy)).status===200,'future promotion revocation');
 check(JSON.stringify(raw.prepare("SELECT * FROM consultation_promotions WHERE id='synthetic-bazi-promo-2026'").get())===seasonal,'approved seasonal record intact');
 raw.prepare("UPDATE consultation_promotions SET state='Inactive' WHERE id='synthetic-bazi-promo-2026'").run();check((await quote(start)).data.price===130000,'RM1300 regular');
 const legacy=await call('guest/requests',{commandId:crypto.randomUUID(),intake,contact:'legacy@example.invalid',preferredStart:start+64800000});check(legacy.status===200,'historical manual guest path');
 const legacyBooking=raw.prepare('SELECT * FROM consultation_bookings WHERE reference=?').get(legacy.data.reference);
 check((await call('qy/status',{id:legacyBooking.id,to:'UnderReview',expectedVersion:0,commandId:crypto.randomUUID()},qy)).status===200,'QY exception review preserved');
 check((await call('qy/offer',{id:legacyBooking.id,expectedVersion:1,commandId:crypto.randomUUID(),startAt:start+64800000},qy)).status===200,'legacy RM1300 manual offer');
 const legacyOffer=raw.prepare('SELECT * FROM consultation_offers WHERE booking_id=?').get(legacyBooking.id);check(legacyOffer.selling_price_sen===130000,'legacy regular-price snapshot');
 raw.prepare("UPDATE consultation_promotions SET state='Active' WHERE id='synthetic-bazi-promo-2026'").run();
 check((await quote(start)).data.price===98000,'RM980 seasonal');
 check((await call('qy/discounts',{action:'issue',finalPriceSen:99000,description:'',expiresAt:clock+10000},qy)).status!==200,'discount cannot exceed applicable promotional base');
 check((await quote(start,'0'.repeat(64))).status!==200,'unknown code');check((await quote(start,'bad-code')).status!==200,'invalid code format');
 const code=await issue(),stored=raw.prepare('SELECT * FROM consultation_discount_codes WHERE id=?').get(code.id);
 check(stored.verifier!==code.code&&stored.verifier.length===64&&!JSON.stringify(stored).includes(code.code),'hash-only persistence');
 check(!JSON.stringify((await call('qy/pricing',undefined,qy)).data).includes(stored.verifier),'admin inventory excludes verifier');
 const q=await quote(start,code.code);check(q.status===200&&q.data.price===88000&&q.data.basePrice===98000&&q.data.regularPrice===130000&&q.data.individualDiscount===10000,'complete RM880 breakdown');
 check(!JSON.stringify(q.data).includes(code.code)&&!JSON.stringify(q.data).includes(stored.verifier),'quote excludes code and verifier');
 const booking=input(q,start);check((await call('guest/checkout',{...booking,acceptance:{...booking.acceptance,accepted:false}})).status!==200,'explicit final-price consent');
 const forged=structuredClone(booking);forged.acceptance.quote.value.finalPriceSen=1;check((await call('guest/checkout',forged)).status!==200,'manipulated final price');
 const beforeSubmitted=submitted,beforeReads=reads,cpuStart=process.cpuUsage(),wallStart=performance.now();const result=await call('guest/checkout',booking);const wallMs=performance.now()-wallStart,cpu=process.cpuUsage(cpuStart),successSubmitted=submitted-beforeSubmitted,successReads=reads-beforeReads;
 check(result.status===200&&result.data.price===88000&&result.data.state==='PaymentPending'&&result.data.paymentAvailable===false,'automatic discounted PaymentPending');
 const original=raw.prepare("SELECT * FROM consultation_offers WHERE issued_by='C1-selfservice'").get(),snapshot=raw.prepare('SELECT * FROM consultation_offer_prices').get();check(original.selling_price_sen===88000&&original.promotion_id==='synthetic-bazi-promo-2026'&&snapshot.base_price_sen===98000,'immutable offer final matches price breakdown');
 check(original.acceptance_snapshot_hash===original.snapshot_hash&&original.acceptance_policy_hash===config.policies.booking.hash,'consent binds final offer and terms');
 check(raw.prepare('SELECT redeemed_booking_id FROM consultation_discount_codes WHERE id=?').get(code.id).redeemed_booking_id===original.booking_id,'one booking redemption binding');
 const repeated=await call('guest/checkout',booking);check(repeated.status===200&&repeated.data.duplicate&&repeated.data.privateUrl===result.data.privateUrl&&count()===2,'successful retry does not redeem again');check((await quote(start+10800000,code.code)).status!==200,'reused code rejected');
 check(raw.prepare('SELECT snapshot_hash FROM consultation_offers WHERE id=?').get(legacyOffer.id).snapshot_hash===legacyOffer.snapshot_hash&&raw.prepare('SELECT selling_price_sen FROM consultation_offers WHERE id=?').get(legacyOffer.id).selling_price_sen===130000,'legacy price/history not repriced');
 const token=new URL(result.data.privateUrl).hash.slice(7),view=await call('guest/offer',{token});check(view.data.breakdown.final_price_sen===88000&&!JSON.stringify(view.data).includes(intake.questions),'private access has breakdown without intake');
 const rev=await issue(),rq=await quote(start+10800000,rev.code);check((await call('qy/discounts',{action:'revoke',id:rev.id},qy)).status===200,'revoke unused code');check((await quote(start+10800000,rev.code)).status!==200&&(await call('guest/checkout',input(rq,start+10800000))).status!==200,'revocation invalidates quote');
 check((await call('qy/discounts',{action:'revoke',id:code.id},qy)).status!==200,'cannot revoke redeemed history');
 const expired=await issue(88000,clock+1000),eq=await quote(start+10800000,expired.code);clock+=1001;check((await quote(start+10800000,expired.code)).status!==200&&(await call('guest/checkout',input(eq,start+10800000))).status!==200,'expired code rejected');
 const raceCode=await issue(),ra=input(await quote(start+10800000,raceCode.code),start+10800000),rb=input(await quote(start+21600000,raceCode.code),start+21600000);
 let arrivals=0,release;const wait=new Promise(r=>release=r);barrier=async()=>{if(++arrivals===2)release();await wait;};const race=await Promise.all([call('guest/checkout',ra),call('guest/checkout',rb)]);barrier=null;check(arrivals===2&&race.filter(r=>r.status===200).length===1&&count()===3,'distinct slots concurrent redemption exactly one winner');
 check(raw.prepare('SELECT COUNT(*) n FROM consultation_offer_prices WHERE discount_id=?').get(raceCode.id).n===1,'one discount price snapshot');
 const failedCode=await issue(),fq=await quote(start+32400000,failedCode.code),fb=input(fq,start+32400000),before=count();raw.exec("CREATE TRIGGER a2_test_failure BEFORE INSERT ON consultation_offer_prices BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");check((await call('guest/checkout',fb)).status!==200&&count()===before,'last-write failure rolls back booking');check(raw.prepare('SELECT redeemed_at FROM consultation_discount_codes WHERE id=?').get(failedCode.id).redeemed_at===null,'failed booking leaves code unused');raw.exec('DROP TRIGGER a2_test_failure');check((await call('guest/checkout',fb)).status===200,'same request can succeed after rolled-back failure');
 const changing=await issue(),cq=await quote(start+43200000,changing.code);beforeWrite=()=>raw.prepare("UPDATE consultation_promotions SET state='Inactive' WHERE id='synthetic-bazi-promo-2026'").run();const bc=count();check((await call('guest/checkout',input(cq,start+43200000))).status!==200&&count()===bc,'promotion changes at commit roll back');check(raw.prepare('SELECT redeemed_at FROM consultation_discount_codes WHERE id=?').get(changing.id).redeemed_at===null,'price failure does not consume code');raw.prepare("UPDATE consultation_promotions SET state='Active' WHERE id='synthetic-bazi-promo-2026'").run();
 const expiring=await issue(88000,clock+1000),xq=await quote(start+43200000,expiring.code);beforeWrite=()=>{clock+=1001;};check((await call('guest/checkout',input(xq,start+43200000))).status!==200&&count()===bc,'code expiry between validation and write fails atomically');
 const revokedRace=await issue(),vrq=await quote(start+43200000,revokedRace.code);beforeWrite=()=>raw.prepare('UPDATE consultation_discount_codes SET revoked_at=? WHERE id=?').run(clock,revokedRace.id);check((await call('guest/checkout',input(vrq,start+43200000))).status!==200&&count()===bc,'revocation during verification rolls back');
 const futureQuote=await quote(start+43200000);clock=Date.parse('2027-01-01T02:00:00Z');check((await call('guest/checkout',input(futureQuote,start+43200000))).status!==200,'promotion/quote expiry rejected');clock=Date.parse('2026-10-17T02:01:00Z');
 check(raw.prepare('SELECT snapshot_hash FROM consultation_offers WHERE id=?').get(original.id).snapshot_hash===original.snapshot_hash&&raw.prepare('SELECT selling_price_sen FROM consultation_offers WHERE id=?').get(original.id).selling_price_sen===88000,'history preserved after promotion and code changes');
 check((await call('qy/status',{id:original.booking_id,to:'Confirmed',expectedVersion:1,commandId:crypto.randomUUID()},qy)).status!==200,'no unverified confirmation');
 const records=await call('qy/bookings',undefined,qy);check(records.status===200&&records.data.records.some(r=>r.selfservice===1&&r.final_price_sen===88000&&r.base_price_sen===98000),'dashboard immutable breakdown and selfservice marker');check(records.data.records.some(r=>r.id===legacyBooking.id&&!r.selfservice&&r.final_price_sen===null&&r.selling_price_sen===130000),'historical offer remains separate without invented breakdown');
 // Execute the actual packaged dashboard handlers with synthetic DOM and real Worker transport.
 const adminElements=new Map(),adminListeners={},adminCalls=[];
 function element(tag='div'){return {tagName:tag.toUpperCase(),value:'',hidden:false,disabled:false,dataset:{},children:[],textContent:'',setAttribute(){},setCustomValidity(){},addEventListener(type,fn){this[type]=fn;},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},reset(){},closest(){return null;}};}
 const adminEl=id=>{if(!adminElements.has(id))adminElements.set(id,element());return adminElements.get(id);};
 for(const m of readFileSync(resolve(publicPath,'qy.html'),'utf8').matchAll(/\bid="([^"]+)"/g))adminEl(m[1]);
 const adminContext=vm.createContext({document:{body:{dataset:{page:'qy',deployment:'preview'}},documentElement:{},hidden:false,getElementById:adminEl,createElement:element,querySelectorAll(){return [];},createTreeWalker(){return {nextNode(){return null;}};},addEventListener(){}},window:{addEventListener(type,fn){adminListeners[type]=fn;},prompt(){throw Error('Unexpected prompt');}},NodeFilter:{SHOW_TEXT:4},MutationObserver:class{observe(){}},location:{hostname:new URL(origin).hostname},localStorage:{getItem(){return null;},setItem(k){assert.equal(k,'qy-consultation-language');}},URL,crypto:globalThis.crypto,FormData:class{constructor(form){this.values=form.values;}get(k){return this.values[k];}},fetch:async(path,options={})=>{adminCalls.push({path,options});const r=await call(path.replace('/api/consultation/',''),options.body?JSON.parse(options.body):undefined,qy);return Response.json(r.data,{status:r.status});}});
 const adminRun=code=>vm.runInContext(code,adminContext);adminRun(readFileSync(resolve(publicPath,'workflow-ui.js'),'utf8'));await adminRun('refresh()');adminRun('csrf='+JSON.stringify(qy.csrf));
 const deadlineLabels=adminEl('records').children.flatMap(box=>box.children.filter(n=>n.tagName==='DL').flatMap(dl=>dl.children.filter(n=>n.tagName==='DT').map(n=>n.textContent)));
 check(deadlineLabels.includes('Payment deadline (MYT)')&&deadlineLabels.includes('Offer deadline (MYT)'),'actual dashboard distinguishes payment and historical offer deadlines');
 await adminRun('refreshPricing()');check(adminEl('pricing-records').children.length>0,'actual admin inventory renders');
 const discountForm=adminEl('invitation-form');discountForm.values={price:'880.00',description:'Synthetic UI single-use',expiresAt:'2026-10-17T14:00'};
 const issuedBefore=raw.prepare('SELECT COUNT(*) n FROM consultation_discount_codes').get().n;
 await Promise.all([discountForm.submit({preventDefault(){},currentTarget:discountForm}),discountForm.submit({preventDefault(){},currentTarget:discountForm})]);
 check(raw.prepare('SELECT COUNT(*) n FROM consultation_discount_codes').get().n===issuedBefore+1&&adminEl('invitation-once').textContent.startsWith(origin+'/customer.html#invitation='),'actual issue handler shows code once and suppresses duplicate clicks');
 const sent=adminCalls.filter(c=>c.path.endsWith('qy/invitations')).at(-1);check(sent.options.headers['x-qy-consultation-csrf']===qy.csrf&&JSON.parse(sent.options.body).finalPriceSen===88000,'admin form uses existing CSRF and exact sen');
 adminRun("chooseLanguage('zh-CN')");check(adminRun("translateText('Payment deadline (MYT)')")!=='Payment deadline (MYT)'&&adminRun("translateText('Issue single-use code')")!=='Issue single-use code','dashboard new terminology bilingual');
 adminListeners.pagehide();check(adminEl('invitation-once').textContent==='','pagehide clears private code');
 const transport=(path,options={})=>worker.fetch(new Request(origin+path,options.method==='POST'?{method:'POST',headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin'},body:options.body}:{}),env);
 const uiCode=(await call('qy/invitations',{action:'issue',finalPriceSen:88000,description:'Synthetic UI',expiresAt:clock+3600000},qy)).data,ui=page(new URL(uiCode.url).hash,transport);await ui.ready;
 for(const [name,value]of Object.entries({fullName:'Synthetic UI Adult',questions:'Synthetic UI intake',birthDate:'1990-06-15',birthCity:'Synthetic City',birthCountry:'MY',calculationGender:'female',birthTimePrecision:'unknown',reportChannel:'email',contact:'ui@example.invalid',preferredStart:String(start+54000000) }))ui.field(name).value=value;
 for(const name of ['privacy','selfBooking','adultAcknowledged'])ui.field(name).checked=true;
 await ui.elements.get('intake').handlers.submit({preventDefault(){}});check(ui.elements.get('checkout-price').textContent.includes('880.00')&&ui.elements.get('checkout-price').textContent.includes('980.00')&&ui.elements.get('checkout-price').textContent.includes('1300.00'),'UI full breakdown');
 await ui.language('zh-CN');check(ui.elements.get('checkout-price').textContent.includes('\u4e2a\u522b\u6298\u6263')&&ui.field('questions').value==='Synthetic UI intake','Chinese switching preserves code and intake');await ui.language('en');check(ui.elements.get('checkout-price').textContent.includes('Individual discount'),'English restored');
 ui.elements.get('checkout-accepted').checked=true;await ui.elements.get('intake').handlers.submit({preventDefault(){}});check(ui.elements.get('checkout-result').hidden===false&&count()===bc+1,'UI accepts final price and books once');
 check(raw.prepare('PRAGMA foreign_key_check').all().length===0,'foreign key consistency');check(raw.prepare('SELECT COUNT(*) n FROM consultation_migration_ledger').get().n===15,'15 pinned migrations unchanged');check(raw.prepare('SELECT password_hash FROM consultation_auth_account').get().password_hash===credential.hash,'password/session architecture unchanged');
 check(submitted>0&&successSubmitted<50,'bounded local write submissions');
 for(const offset of [27,30]){const at=start+offset*3600000;check((await call('guest/checkout',input(await quote(at),at))).status===200,'additional synthetic hold for worst-case cleanup');}
 const cleanupCode=await issue(88000,clock+72*3600000);clock+=49*3600000;
 const expiredBefore=raw.prepare("SELECT COUNT(*) n FROM consultation_selfservice_bookings x JOIN consultation_offers o ON o.id=x.offer_id WHERE o.state='Accepted' AND o.expires_at<=?").get(clock).n;
 const cleanupStart=start+75600000,cleanupQuote=await quote(cleanupStart,cleanupCode.code),beforeCleanup=count(),cleanupSubmitted=submitted,cleanupReads=reads;
 check(expiredBefore>=4,'four expired holds exercise both cleanup batches');
 check(cleanupQuote.status===200,'discount quote with bounded expired-hold cleanup');
 const cleanupResult=await call('guest/checkout',input(cleanupQuote,cleanupStart)),cleanupStatements=submitted-cleanupSubmitted+reads-cleanupReads;
 check(cleanupResult.status===200&&count()===beforeCleanup+1,'discount checkout with remaining expired holds');
 check(cleanupStatements<=50,'worst tested cleanup plus discounted checkout bounded to 50 submitted statements');
 Date.now=realNow;
 if(process.env.QY_MINIFLARE_PATH){
  const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"globalThis.fetch=async()=>{throw Error('Outbound disabled');};\n"+readFileSync(resolve(publicPath,'_worker.js'),'utf8'),compatibilityDate:'2026-10-07',bindings:settings,d1Databases:{CONSULTATION_DB:'synthetic-a2-disposable'},d1Persist:false,cf:false,telemetry:{enabled:false}}));
  try{
   const d1=await mf.getD1Database('CONSULTATION_DB');await schema(d1);for(const name of ['guest','selfservice','pricing','invitations'])await d1.batch(split(readFileSync('database/additive/c1-consultation-'+name+'.sql','utf8')).map(sql=>d1.prepare(sql)));
   await d1.prepare("INSERT INTO consultation_auth_account VALUES(1,'qyadmin',1,'PBKDF2-SHA256',600000,?,?,1,?)").bind(credential.salt,credential.hash,Date.now()).run();await d1.prepare('UPDATE consultation_preview_environment SET enabled=1').run();
   await d1.prepare("INSERT INTO consultation_promotions VALUES('synthetic-bazi-promo-2026',1,1,'MYR',98000,'2026-10-11','2026-12-31','Asia/Kuala_Lumpur','Active','synthetic-owner-approval',?)").bind(Date.now()-1000).run();
   const at=Math.ceil((Date.now()+7*86400000)/1800000)*1800000;await d1.prepare("INSERT INTO consultation_availability_windows VALUES('a2-workerd',1,?,?,'Active',1,?,?)").bind(at,at+86400000,Date.now(),Date.now()).run();
   const d1admin={};
   async function dcall(path,body,who={}){const r=await mf.dispatchFetch(origin+'/api/consultation/'+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin',cookie:who.cookie||'','x-qy-consultation-csrf':who.csrf||''},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(r.headers.get('set-cookie'))who.cookie=r.headers.get('set-cookie').split(';')[0];if(data.csrfToken)who.csrf=data.csrfToken;return {status:r.status,data};}
   check((await dcall('qy/login',{username:'qyadmin',password},d1admin)).status===200,'workerd existing secret login');
   const dc=await dcall('qy/discounts',{action:'issue',finalPriceSen:88000,expiresAt:Date.now()+3600000},d1admin);check(dc.status===200,'workerd native SHA256 secure code issuance');
   const dq=await dcall('guest/quote',{preferredStart:at,discountCode:dc.data.code}),dq2=await dcall('guest/quote',{preferredStart:at+10800000,discountCode:dc.data.code});check(dq.data.price===88000,'workerd discounted quote');
   const di=input(dq,at),di2=input(dq2,at+10800000),dr=await Promise.all([dcall('guest/checkout',di),dcall('guest/checkout',di2)]);check(dr.filter(r=>r.status===200).length===1,'workerd D1 concurrent code exactly one successful booking');
   check((await d1.prepare('SELECT COUNT(*) n FROM consultation_bookings').first()).n===1&&(await d1.prepare('SELECT COUNT(*) n FROM consultation_slot_reservations').first()).n===1,'workerd losing batch rolled back booking and slot');
   const winner=dr[0].status===200?di:di2;check((await dcall('guest/checkout',winner)).data.duplicate===true,'workerd D1 successful retry');
   const failed=await dcall('qy/discounts',{action:'issue',finalPriceSen:88000,expiresAt:Date.now()+3600000},d1admin),fquote=await dcall('guest/quote',{preferredStart:at+21600000,discountCode:failed.data.code});
   await d1.prepare("CREATE TRIGGER a2_d1_failure BEFORE INSERT ON consultation_offer_prices BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
   check((await dcall('guest/checkout',input(fquote,at+21600000))).status!==200,'workerd final-write error rejected');check((await d1.prepare('SELECT redeemed_at FROM consultation_discount_codes WHERE id=?').bind(failed.data.id).first()).redeemed_at===null&&(await d1.prepare('SELECT COUNT(*) n FROM consultation_bookings').first()).n===1,'workerd D1 rollback preserves unused code');
   check((await d1.prepare('PRAGMA foreign_key_check').all()).results.length===0,'workerd D1 FK integrity');
  }finally{await mf.dispose();}
 }
 console.log(JSON.stringify({result:'PASS',assertions,package:output,successfulDiscountCheckout:{submittedWriteBatchStatements:successSubmitted,separateReadSubmissions:successReads,wallMs,nodeProcessCpuMs:(cpu.user+cpu.system)/1000},checkoutWithBoundedCleanup:{expiredBefore,submittedStatements:cleanupStatements},workerd:process.env.QY_MINIFLARE_PATH?'PASS (9 additional checks included)':'NOT RUN',method:'Actual packaged Worker in Node with transactional local SQLite and deterministic competing-write barriers; counts are submitted SQL, not D1 execution/rows or deployed CPU. No remote operations.'}));
}finally{Date.now=realNow;raw.close();}
