// Synthetic local-only SQLite and D1 tests; no provider or HTTP calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createCustomerIdentity,CONTEXT_MS} from '../functions/lib/consultation/customer-identity.js';
import {PORTAL_COOKIE,CONTEXT_COOKIE,CSRF_HEADER,sessionCookie,requestAllowed,contextCookie} from '../functions/lib/consultation/customer-request-security.js';
import {randomSecret,tokenHash} from '../functions/lib/consultation/auth-crypto.js';
let passed=0;
const test=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
const origin='https://synthetic.invalid';
const sql=readFileSync(new URL('../database/migrate-c1-consultation-customer-identity.sql',import.meta.url),'utf8');
const portalSQL=readFileSync(new URL('../database/migrate-v4.0-phase-f1f2-academy-portal.sql',import.meta.url),'utf8');
function statements(source){return source.replace(/^\uFEFF/,'').replace(/^--.*$/gm,'').split(/;\s*(?=CREATE|INSERT|$)/).map(x=>x.trim()).filter(Boolean)}
function binding(raw){return {prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return raw.prepare(sql).get(...values)??null},async all(){return {results:raw.prepare(sql).all(...values)}},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...values).changes)}}}}},async batch(plan){raw.exec('BEGIN');try{const result=[];for(const p of plan)result.push(await p.run());raw.exec('COMMIT');return result}catch(e){raw.exec('ROLLBACK');throw e}}};}
function request(parent,context=null,{method='GET',csrf=null,requestOrigin=origin,site='same-origin',url=origin,contentType='application/json',cookieOverride=null,body=null}={}){
 const headers={};if(cookieOverride!==null)headers.cookie=cookieOverride;else if(parent)headers.cookie=PORTAL_COOKIE+'='+parent+(context?'; '+CONTEXT_COOKIE+'='+context:'');
 if(method==='POST'){if(requestOrigin!==null)headers.origin=requestOrigin;if(contentType!==null)headers['content-type']=contentType;}
 if(site!==null)headers['sec-fetch-site']=site;if(csrf!==null)headers[CSRF_HEADER]=csrf;
 return new Request(url,{method,headers,...(body===null?{}:{body:JSON.stringify(body)})});
}
const newContext=async(service,parent,body=null)=>{
 const response=await service.establish(request(parent,null,{method:'POST',body}));
 assert.equal(response.status,200);const json=await response.json();
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/);assert.ok(!cookie.includes('Domain='));
 return {token:cookie.split(';')[0].split('=')[1],csrf:json.csrfToken,expiresAt:json.expiresAt,responseHeaders:response.headers};
};
function batchHook(db,hook){let fired=false;return {prepare:s=>db.prepare(s),async batch(plan){if(!fired){fired=true;await hook()}return db.batch(plan)}};}
function selectHook(db,prefix,hook){let fired=false;return {batch:p=>db.batch(p),prepare(sql){let s=db.prepare(sql);if(!sql.startsWith(prefix))return s;return {bind(...v){s=s.bind(...v);return this},async first(){const value=await s.first();if(!fired){fired=true;await hook()}return value}}}};}
async function checks(db,label){
 const t=(name,run)=>test(label+' '+name,run);
 await db.prepare("CREATE TABLE customers(id INTEGER PRIMARY KEY,status TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL)").run();
 await db.prepare("INSERT INTO customers VALUES(1,'Active','synthetic@example.invalid','000000'),(2,'Active','other@example.invalid','111111')").run();
 for(const s of [...statements(portalSQL),...statements(sql)])await db.prepare(s).run();
 let sessionId=0;
 async function parent(customerId=1,patch={}){sessionId++;const token=randomSecret(),time=Date.now();await db.prepare('INSERT INTO academy_portal_sessions(id,customer_id,token_hash,expires_at,created_at,last_seen_at,revoked_at) VALUES(?,?,?,?,?,?,?)').bind(sessionId,customerId,await tokenHash(token),patch.expiresAt||new Date(time+7*86400000).toISOString(),patch.createdAt||new Date(time-10000).toISOString(),'unchanged',patch.revokedAt||'').run();return {token,id:sessionId,customerId};}
 const p=await parent(),service=createCustomerIdentity({db,origin});
 await t('canonical minimal portal identity',async()=>{const a=await service.portalIdentity(request(p.token));assert.equal(a.principal.customerId,1);assert.deepEqual(Object.keys(a.principal),['customerId','portalSessionId','expiresAt'])});
 await t('bridge does not write last_seen or events',async()=>{const row=await db.prepare('SELECT last_seen_at FROM academy_portal_sessions WHERE id=?').bind(p.id).first();assert.equal(row.last_seen_at,'unchanged');assert.equal((await db.prepare('SELECT count(*) n FROM academy_portal_events').first()).n,0)});
 for(const cookies of [null,'QY_PORTAL_SESSION=short',PORTAL_COOKIE+'='+p.token+'; '+PORTAL_COOKIE+'='+p.token,PORTAL_COOKIE+'='+p.token+'; '+PORTAL_COOKIE+'='+randomSecret(),PORTAL_COOKIE+'=%61'+p.token.slice(1),PORTAL_COOKIE+' ='+p.token,PORTAL_COOKIE,PORTAL_COOKIE+'='+p.token.toUpperCase()])await t('missing/malformed/ambiguous portal cookie',async()=>assert.equal((await service.portalIdentity(request(null,null,{cookieOverride:cookies}))).error.status,401));
 await t('wrong host rejected',async()=>assert.equal((await service.portalIdentity(request(p.token,null,{url:'https://other.invalid'}))).error.status,403));
 const expired=await parent(1,{expiresAt:new Date(Date.now()-1000).toISOString()});
 await t('expired portal denied',async()=>assert.equal((await service.portalIdentity(request(expired.token))).error.status,401));
 const revoked=await parent(1,{revokedAt:new Date().toISOString()});
 await t('revoked portal denied',async()=>assert.equal((await service.portalIdentity(request(revoked.token))).error.status,401));
 const malformed=await parent(1,{expiresAt:'invalid'});
 await t('invalid persisted expiry denied',async()=>assert.equal((await service.portalIdentity(request(malformed.token))).error.status,401));
 const future=await parent(1,{createdAt:new Date(Date.now()+10000).toISOString()});
 await t('future-issued portal denied',async()=>assert.equal((await service.portalIdentity(request(future.token))).error.status,401));
 await t('inactive canonical customer denied',async()=>{await db.prepare("UPDATE customers SET status='Inactive' WHERE id=1").run();assert.equal((await service.portalIdentity(request(p.token))).error.status,401);await db.prepare("UPDATE customers SET status='Active' WHERE id=1").run()});
 let context=await newContext(service,p.token,{customerId:2,verified:true});
 await t('forged input never sets customer ownership',async()=>assert.equal((await service.authorize(request(p.token,context.token))).principal.customerId,1));
 await t('context lifetime bounded',()=>assert.ok(context.expiresAt<=Date.now()+CONTEXT_MS));
 await t('cookie security/no-store',()=>{assert.equal(context.responseHeaders.get('cache-control'),'no-store');assert.equal(context.responseHeaders.get('access-control-allow-origin'),null)});
 await t('all raw session/CSRF secrets absent from context DB',async()=>{const dump=JSON.stringify((await db.prepare('SELECT * FROM consultation_customer_contexts').all()).results)+JSON.stringify((await db.prepare('SELECT * FROM consultation_customer_context_events').all()).results);for(const secret of [p.token,context.token,context.csrf])assert.equal(dump.includes(secret),false)});
 await t('minimal context principal',async()=>assert.deepEqual(Object.keys((await service.authorize(request(p.token,context.token))).principal),['customerId','portalSessionId','contextId','version','expiresAt']));
 for(const cookie of [PORTAL_COOKIE+'='+p.token,PORTAL_COOKIE+'='+p.token+'; '+CONTEXT_COOKIE+'=invalid',PORTAL_COOKIE+'='+p.token+'; '+CONTEXT_COOKIE+'='+context.token+'; '+CONTEXT_COOKIE+'='+context.token])await t('missing/malformed/duplicate context cookie',async()=>assert.equal((await service.authorize(request(null,null,{cookieOverride:cookie}))).error.status,401));
 const other=await parent(2),sameCustomerOtherSession=await parent(1);
 await t('cross customer context substitution denied',async()=>assert.equal((await service.authorize(request(other.token,context.token))).error.status,401));
 await t('context bound to exact parent session',async()=>assert.equal((await service.authorize(request(sameCustomerOtherSession.token,context.token))).error.status,401));
 for(const patch of [{csrf:null},{csrf:randomSecret()},{csrf:'invalid'},{csrf:context.csrf,requestOrigin:null},{csrf:context.csrf,requestOrigin:'https://evil.invalid'},{csrf:context.csrf,site:'same-site'},{csrf:context.csrf,contentType:'text/plain'}])await t('CSRF/Origin rejection',async()=>assert.ok((await service.authorize(request(p.token,context.token,{method:'POST',...patch}),{stateChanging:true})).error));
 await t('duplicated CSRF header rejected',async()=>{const req=request(p.token,context.token,{method:'POST',csrf:context.csrf});req.headers.append(CSRF_HEADER,context.csrf);assert.equal((await service.authorize(req,{stateChanging:true})).error.status,401)});
 await t('same-site sibling Origin rejected',async()=>assert.equal((await service.authorize(request(p.token,context.token,{method:'POST',csrf:context.csrf,requestOrigin:'https://sibling.synthetic.invalid',site:'same-site'}),{stateChanging:true})).error.status,403));
 await t('valid CSRF mutation positive control',async()=>assert.equal((await service.authorize(request(p.token,context.token,{method:'POST',csrf:context.csrf}),{stateChanging:true})).principal.customerId,1));
 await t('state-changing GET forbidden',async()=>assert.equal((await service.authorize(request(p.token,context.token),{stateChanging:true})).error.status,403));
 await t('malformed operation flag rejected',async()=>assert.equal((await service.authorize(request(p.token,context.token),{stateChanging:'true'})).error.status,403));
 await t('active context cannot be replaced by bootstrap',async()=>assert.equal((await service.establish(request(p.token,null,{method:'POST'}))).status,401));
 const old=context;
 await t('rotation issues new token/CSRF/version',async()=>{const r=await service.rotate(request(p.token,context.token,{method:'POST',csrf:context.csrf}));assert.equal(r.status,200);const j=await r.json();context={token:r.headers.get('set-cookie').split(';')[0].split('=')[1],csrf:j.csrfToken};assert.notEqual(context.token,old.token);assert.notEqual(context.csrf,old.csrf);assert.equal((await service.authorize(request(p.token,context.token))).principal.version,2);assert.equal((await service.authorize(request(p.token,old.token))).error.status,401)});
 await t('stale CSRF does not authorize new context',async()=>assert.equal((await service.authorize(request(p.token,context.token,{method:'POST',csrf:old.csrf}),{stateChanging:true})).error.status,401));
 await t('revocation invalidates context and clears cookie',async()=>{const r=await service.revoke(request(p.token,context.token,{method:'POST',csrf:context.csrf}));assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await service.authorize(request(p.token,context.token))).error.status,401)});
 await t('stale revoked context cannot rotate',async()=>assert.equal((await service.rotate(request(p.token,context.token,{method:'POST',csrf:context.csrf}))).status,401));
 const revived=await newContext(service,p.token);
 await t('explicit new establishment never revives old token',async()=>{assert.notEqual(revived.token,context.token);assert.equal((await service.authorize(request(p.token,revived.token))).principal.version,4);assert.equal((await service.authorize(request(p.token,context.token))).error.status,401)});
 await t('parent logout immediately denies context',async()=>{await db.prepare('UPDATE academy_portal_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').bind(p.id).run();assert.equal((await service.authorize(request(p.token,revived.token))).error.status,401);assert.equal((await service.rotate(request(p.token,revived.token,{method:'POST',csrf:revived.csrf}))).status,401)});
 const pDeactivate=await parent(),cDeactivate=await newContext(service,pDeactivate.token);
 await t('parent customer deactivation denies context',async()=>{await db.prepare("UPDATE customers SET status='Inactive' WHERE id=1").run();assert.equal((await service.authorize(request(pDeactivate.token,cDeactivate.token))).error.status,401);await db.prepare("UPDATE customers SET status='Active' WHERE id=1").run()});
 const pExp=await parent(),cExp=await newContext(service,pExp.token);
 await t('parent expiry after establishment denies context',async()=>{await db.prepare('UPDATE academy_portal_sessions SET expires_at=? WHERE id=?').bind(new Date(Date.now()-1000).toISOString(),pExp.id).run();assert.equal((await service.authorize(request(pExp.token,cExp.token))).error.status,401)});
 const pShort=await parent(1,{expiresAt:new Date(Date.now()+60000).toISOString()}),cShort=await newContext(service,pShort.token);
 await t('context expiry never exceeds parent expiry',async()=>assert.equal(cShort.expiresAt,(await service.portalIdentity(request(pShort.token))).principal.expiresAt));
 const pOld=await parent(),oldToken=randomSecret(),oldCsrf=randomSecret(),time=Date.now();
 await db.prepare('INSERT INTO consultation_customer_contexts VALUES(?,?,?,?,?,1,?,?,?,NULL)').bind('expired-fixture',pOld.id,1,await tokenHash(oldToken),await tokenHash(oldCsrf),time-3600000,time-3600000,time-1800000).run();
 await t('expired context rejected independently of live parent',async()=>assert.equal((await service.authorize(request(pOld.token,oldToken))).error.status,401));
 await t('expired generation replaced with new secrets only',async()=>{const c=await newContext(service,pOld.token);assert.notEqual(c.token,oldToken);assert.equal((await service.authorize(request(pOld.token,c.token))).principal.version,2)});
 const pRace=await parent();
 const racedService=createCustomerIdentity({db:batchHook(db,async()=>{await db.prepare('UPDATE academy_portal_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').bind(pRace.id).run()}),origin});
 await t('parent revoke between precheck/create aborts all effects',async()=>{const r=await racedService.establish(request(pRace.token,null,{method:'POST'}));assert.equal(r.status,401);assert.equal((await db.prepare('SELECT count(*) n FROM consultation_customer_contexts WHERE portal_session_id=?').bind(pRace.id).first()).n,0)});
 const pConcurrent=await parent();let winner;
 const concurrent=createCustomerIdentity({db:selectHook(db,'SELECT id,version,revoked_at,expires_at',async()=>{winner=await newContext(service,pConcurrent.token)}),origin});
 await t('concurrent creation has one winning context/evidence',async()=>{assert.equal((await concurrent.establish(request(pConcurrent.token,null,{method:'POST'}))).status,401);assert.equal((await service.authorize(request(pConcurrent.token,winner.token))).principal.version,1);assert.equal((await db.prepare('SELECT count(*) n FROM consultation_customer_contexts WHERE portal_session_id=?').bind(pConcurrent.id).first()).n,1)});
 const pRevokeRace=await parent(),cRevokeRace=await newContext(service,pRevokeRace.token);let newest;
 const staleRevoker=createCustomerIdentity({db:batchHook(db,async()=>{const r=await service.rotate(request(pRevokeRace.token,cRevokeRace.token,{method:'POST',csrf:cRevokeRace.csrf}));assert.equal(r.status,200);const j=await r.json();newest={token:r.headers.get('set-cookie').split(';')[0].split('=')[1],csrf:j.csrfToken}}),origin});
 await t('stale revocation cannot revoke newly rotated context',async()=>{assert.equal((await staleRevoker.revoke(request(pRevokeRace.token,cRevokeRace.token,{method:'POST',csrf:cRevokeRace.csrf}))).status,401);assert.equal((await service.authorize(request(pRevokeRace.token,newest.token))).principal.version,2)});
 const pContextRace=await parent(),cContextRace=await newContext(service,pContextRace.token);
 const staleRotator=createCustomerIdentity({db:batchHook(db,async()=>{assert.equal((await service.revoke(request(pContextRace.token,cContextRace.token,{method:'POST',csrf:cContextRace.csrf}))).status,200)}),origin});
 await t('revoked context cannot rotate after earlier precheck',async()=>{assert.equal((await staleRotator.rotate(request(pContextRace.token,cContextRace.token,{method:'POST',csrf:cContextRace.csrf}))).status,401);assert.equal((await service.authorize(request(pContextRace.token,cContextRace.token))).error.status,401)});
 const pFail=await parent();
 await db.prepare("CREATE TRIGGER synthetic_evidence_failure BEFORE INSERT ON consultation_customer_context_events WHEN NEW.event='Established' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
 await t('late evidence failure rolls back creation',async()=>{assert.equal((await service.establish(request(pFail.token,null,{method:'POST'}))).status,503);assert.equal((await db.prepare('SELECT count(*) n FROM consultation_customer_contexts WHERE portal_session_id=?').bind(pFail.id).first()).n,0)});
 await db.prepare('DROP TRIGGER synthetic_evidence_failure').run();
 await t('no forged ownership FK relation',async()=>{await assert.rejects(db.prepare('INSERT INTO consultation_customer_contexts VALUES(?,?,?,?,?,1,?,?,?,NULL)').bind('forged',other.id,1,await tokenHash(randomSecret()),await tokenHash(randomSecret()),time,time,time+60000).run(),/customer context insert rejected/)});
 await t('context uniqueness and replacement protection',async()=>{const row=await db.prepare('SELECT * FROM consultation_customer_contexts WHERE portal_session_id=?').bind(other.id).first();assert.equal(row,null);await assert.rejects(db.prepare('INSERT OR REPLACE INTO consultation_customer_contexts VALUES(?,?,?,?,?,1,?,?,?,NULL)').bind('replacement',pConcurrent.id,1,await tokenHash(randomSecret()),await tokenHash(randomSecret()),time,time,time+60000).run(),/customer context insert rejected/)});
 const event=await db.prepare('SELECT * FROM consultation_customer_context_events LIMIT 1').first();
 await t('context event INSERT OR REPLACE rejected',()=>assert.rejects(db.prepare('INSERT OR REPLACE INTO consultation_customer_context_events VALUES(?,?,?,?,?)').bind(event.id,event.context_id,event.version,event.event,event.occurred_at).run(),/customer context authorization failed/));
 await t('context event REPLACE rejected',()=>assert.rejects(db.prepare('REPLACE INTO consultation_customer_context_events VALUES(?,?,?,?,?)').bind(event.id,event.context_id,event.version,event.event,event.occurred_at).run(),/customer context authorization failed/));

 const pTiny=await parent(1,{expiresAt:new Date(Date.now()+900).toISOString()});
 await t('subsecond parent rejected before context commit',async()=>{assert.equal((await service.establish(request(pTiny.token,null,{method:'POST'}))).status,401);assert.equal((await db.prepare('SELECT count(*) n FROM consultation_customer_contexts WHERE portal_session_id=?').bind(pTiny.id).first()).n,0)});
 function issuanceHook(action){let fired=false;return {batch:plan=>db.batch(plan),prepare(query){let stmt=db.prepare(query);if(!query.startsWith('SELECT MIN(x.expires_at,'))return stmt;return {bind(...v){stmt=stmt.bind(...v);return this},async first(){if(!fired){fired=true;await action()}return stmt.first()}}}};}
 const pPost=await parent();
 const postService=createCustomerIdentity({db:issuanceHook(async()=>{await db.prepare('UPDATE academy_portal_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').bind(pPost.id).run()}),origin});
 await t('post-commit parent revocation returns explicit committed/non-issued state',async()=>{const r=await postService.establish(request(pPost.token,null,{method:'POST'}));assert.equal(r.status,409);const b=await r.json();assert.equal(b.committed,true);assert.equal(b.issued,false);assert.equal(r.headers.get('set-cookie'),null);assert.equal(Object.hasOwn(b,'csrfToken'),false);assert.equal((await db.prepare('SELECT count(*) n FROM consultation_customer_contexts WHERE portal_session_id=?').bind(pPost.id).first()).n,1)});
 const pReadFailure=await parent();
 const readFailure=createCustomerIdentity({db:issuanceHook(async()=>{throw Error('synthetic post-commit read failure')}),origin});
 await t('post-commit read error is distinguished from rollback',async()=>{const r=await readFailure.establish(request(pReadFailure.token,null,{method:'POST'}));assert.equal(r.status,503);const b=await r.json();assert.equal(b.committed,true);assert.equal(b.issued,false);assert.equal(r.headers.get('set-cookie'),null);assert.equal((await db.prepare('SELECT count(*) n FROM consultation_customer_contexts WHERE portal_session_id=?').bind(pReadFailure.id).first()).n,1)});
 const pRotateTiny=await parent(),cRotateTiny=await newContext(service,pRotateTiny.token);
 await db.prepare('UPDATE academy_portal_sessions SET expires_at=? WHERE id=?').bind(new Date(Date.now()+900).toISOString(),pRotateTiny.id).run();
 await t('subsecond parent cannot commit a rotation',async()=>{const before=await db.prepare('SELECT version,token_hash FROM consultation_customer_contexts WHERE portal_session_id=?').bind(pRotateTiny.id).first();assert.equal((await service.rotate(request(pRotateTiny.token,cRotateTiny.token,{method:'POST',csrf:cRotateTiny.csrf}))).status,401);assert.deepEqual(await db.prepare('SELECT version,token_hash FROM consultation_customer_contexts WHERE portal_session_id=?').bind(pRotateTiny.id).first(),before)});
 await t('SQL foreign keys',async()=>assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]));
 await t('SQL quick_check',async()=>assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok'));
}
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');try{await checks(binding(raw),'SQLite')}finally{raw.close()}
if(!process.env.QY_MINIFLARE_PATH)throw Error('Local D1 path required');
const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default{fetch(){throw Error("No network")}}',compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-customer-context'},d1Persist:false,cf:false,telemetry:{enabled:false}}));
try{await checks(await mf.getD1Database('DB'),'D1')}finally{await mf.dispose()}
await test('origin configuration rejects HTTP/path/untrusted type',()=>{for(const value of ['http://synthetic.invalid','https://synthetic.invalid/path','https://user:password@synthetic.invalid'])assert.throws(()=>createCustomerIdentity({db:{prepare(){},batch(){}},origin:value}))});
await test('module source has no logger/provider calls',()=>{for(const p of ['customer-identity.js','customer-request-security.js'])assert.ok(!/console\.|fetch\(/.test(readFileSync(new URL('../functions/lib/consultation/'+p,import.meta.url),'utf8')))});
console.log(`RESULT ${passed} passed, 0 failed; synthetic local databases only`);
