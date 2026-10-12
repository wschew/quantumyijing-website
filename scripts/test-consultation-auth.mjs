// Synthetic local accounts only. No existing QY authentication is invoked.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {Readable} from 'node:stream';
import {readLocalCredentialInput} from './setup-consultation-account-local.mjs';
import {createConsultationAuth,COOKIE_NAME,SESSION_MS} from '../functions/lib/consultation/auth.js';
import {newPasswordRecord,randomSecret,passwordHash} from '../functions/lib/consultation/auth-crypto.js';
const origin='https://consultation.synthetic.invalid';
const epoch=Date.now();
const DB_TIME="(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const secret=randomSecret(); // Synthetic test password, never printed.
const record=await newPasswordRecord(secret);
const schema=readFileSync(new URL('../database/migrate-c1-consultation-auth.sql',import.meta.url),'utf8');
const schemaStatements=schema.match(/CREATE TABLE[\s\S]*?\n\);|INSERT INTO[^;]+;|CREATE INDEX[^;]+;|CREATE TRIGGER[\s\S]*?END;/g);
const created=[];
let passed=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw Error('External network forbidden');};
const emitted=[];
const originalLog=console.log,originalError=console.error,originalWarn=console.warn;
console.log=(...args)=>emitted.push(args.join(' '));
console.error=(...args)=>emitted.push(args.join(' '));
console.warn=(...args)=>emitted.push(args.join(' '));
const test=async(name,run)=>{await run();passed++;originalLog('PASS '+name);};
function privateSyntheticDirectory(prefix) {
 const root=realpathSync(tmpdir()),path=join(root,prefix+crypto.randomUUID());
 const part=relative(root,path);
 if(!part||part.startsWith('..')||isAbsolute(part))throw Error('Unsafe test directory');
 // Create a NEW directory with a private ACL; never alter an existing Windows ACL.
 const script=`$ErrorActionPreference='Stop'
 if(Test-Path -LiteralPath $env:QY_SYNTHETIC_DIR){exit 1}
 $security=New-Object Security.AccessControl.DirectorySecurity
 $security.SetAccessRuleProtection($true,$false)
 $current=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $security.SetOwner($current)
 foreach($id in @($current.Value,'S-1-5-18','S-1-5-32-544')){
  $sid=New-Object Security.Principal.SecurityIdentifier($id)
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $security.AddAccessRule($rule)
 }
 [IO.Directory]::CreateDirectory($env:QY_SYNTHETIC_DIR,$security) | Out-Null
 exit 0`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:{...process.env,QY_SYNTHETIC_DIR:path},encoding:'utf8',timeout:15000});
 if(result.status!==0)throw Error('Private synthetic directory creation failed');
 return path;
}
function localBinding(sqlite) {
 return {
  prepare(sql) {
   sql=sql.replaceAll(DB_TIME,'consultation_test_now()');
   let values=[];
   const statement={
    sql,
    bind(...args){values=args;return statement;},
    async first(){return sqlite.prepare(sql).get(...values)??null;},
    async all(){return {results:sqlite.prepare(sql).all(...values)};},
    async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:result.changes}};}
   };
   return statement;
  },
  async batch(statements) {
   sqlite.exec('BEGIN');
   try {const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}
   catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
 };
}
function fixture(provision=true) {
 const sqlite=new DatabaseSync(':memory:');created.push(sqlite);sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(schema);
 if(provision)sqlite.prepare('INSERT INTO consultation_auth_account VALUES(1,?,1,?,?,?,?,1,?)').run('synthetic-qy',record.algorithm,record.iterations,record.salt,record.hash,epoch);
 let time=epoch;
 sqlite.function('consultation_test_now',()=>time);
 const db=localBinding(sqlite);
 const auth=createConsultationAuth({db,origin,clock:()=>time});
 return {sqlite,db,auth,setTime:value=>{time=value;}};
}
function request({method='GET',cookie='',csrf=null,requestOrigin=origin,url=origin+'/consultation/test',extra={}}={}) {
 const headers={...extra};if(cookie)headers.cookie=cookie;
 if(method!=='GET'&&method!=='HEAD'){headers['content-type']='application/json';if(requestOrigin!==null)headers.origin=requestOrigin;}
 if(csrf!==null)headers['x-qy-consultation-csrf']=csrf;
 return new Request(url,{method,headers});
}
async function signedIn(f) {
 const result=await f.auth.login(request({method:'POST'}),{username:'synthetic-qy',password:secret});
 assert.equal(result.status,200);
 return {response:result,cookie:result.headers.get('set-cookie').split(';')[0],body:await result.json()};
}
try {
 const f=fixture();let session=await signedIn(f);
 await test('correct password and secure host-only cookie',()=>{
  const value=session.response.headers.get('set-cookie');
  for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/'])assert(value.includes(flag));
  assert(!value.includes('Domain='));assert(!JSON.stringify(session.body).includes(secret));
 });
 await test('only session and CSRF hashes are persisted',async()=>{
  const token=session.cookie.split('=')[1];const row=f.sqlite.prepare('SELECT * FROM consultation_auth_sessions').get();
  assert.notEqual(row.token_hash,token);assert.notEqual(row.csrf_hash,session.body.csrfToken);
  assert(!JSON.stringify(row).includes(secret));assert.equal(row.expires_at-row.created_at,SESSION_MS);
 });
 await test('valid session authorizes fresh private access',async()=>{
  const result=await f.auth.requirePrivateAccess(request({cookie:session.cookie}));
  assert.equal(result.principal.accountId,1);assert.deepEqual(Object.keys(result.principal).sort(),['accountId','scope','sessionId']);
 });
 await test('wrong password and unknown account share generic errors',async()=>{
  const wrong=await f.auth.login(request({method:'POST'}),{username:'synthetic-qy',password:randomSecret()});
  const unknown=await f.auth.login(request({method:'POST'}),{username:'unknown',password:secret});
  assert.equal(wrong.status,401);assert.equal(unknown.status,401);assert.deepEqual(await wrong.json(),await unknown.json());
 });
 await test('shared admin and other QY credentials cannot authorize',async()=>{
  for(const header of ['Bearer '+randomSecret(),'Basic synthetic','Bearer ADMIN_TOKEN']) {
   const result=await f.auth.requirePrivateAccess(request({extra:{authorization:header,'x-actor-role':'owner','x-actor-id':'1'}}));
   assert.equal(result.error.status,401);
  }
 });
 await test('forged and malformed session tokens denied',async()=>{
  for(const token of [randomSecret(),'1','undefined','../token'])assert.equal((await f.auth.requirePrivateAccess(request({cookie:COOKIE_NAME+'='+token}))).error.status,401);
 });
 await test('duplicate session cookies rejected',async()=>assert.equal((await f.auth.requirePrivateAccess(request({cookie:session.cookie+'; '+session.cookie}))).error.status,401));
 await test('expiry is exclusive and revoked sessions denied',async()=>{
  const a=fixture();const s=await signedIn(a);a.setTime(epoch+SESSION_MS);
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:s.cookie}))).error.status,401);
  a.setTime(epoch);a.sqlite.exec('UPDATE consultation_auth_sessions SET revoked_at=1');
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:s.cookie}))).error.status,401);
 });
 await test('disabled account and changed password version invalidate sessions',async()=>{
  const a=fixture();const s=await signedIn(a);a.sqlite.exec('UPDATE consultation_auth_account SET enabled=0');
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:s.cookie}))).error.status,401);
  a.sqlite.exec('UPDATE consultation_auth_account SET enabled=1,password_version=2');
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:s.cookie}))).error.status,401);
 });
 await test('no default account or first-visitor registration',async()=>{
  const a=fixture(false);assert.equal((await a.auth.login(request({method:'POST'}),{username:'synthetic-qy',password:secret})).status,401);
  assert.equal(a.sqlite.prepare('SELECT count(*) n FROM consultation_auth_account').get().n,0);
 });
 await test('singleton prevents a second account',()=>assert.throws(()=>f.sqlite.prepare('INSERT INTO consultation_auth_account VALUES(2,?,1,?,?,?,?,1,?)').run('other-qy',record.algorithm,record.iterations,record.salt,record.hash,epoch),/CHECK/));
 await test('five failures lock all aliases and cooldown recovers',async()=>{
  const a=fixture();
  for(let i=0;i<5;i++)assert.equal((await a.auth.login(request({method:'POST'}),{username:i%2?'unknown':'synthetic-qy',password:randomSecret()})).status,401);
  assert.equal((await a.auth.login(request({method:'POST'}),{username:'synthetic-qy',password:secret})).status,401);
  assert.equal(a.sqlite.prepare('SELECT attempts FROM consultation_auth_control').get().attempts,5);
  a.setTime(epoch+15*60*1000);await signedIn(a);
 });
 await test('parallel failures stay bounded at five',async()=>{
  const a=fixture();const results=await Promise.all(Array.from({length:12},()=>a.auth.login(request({method:'POST'}),{username:'unknown',password:randomSecret()})));
  assert(results.every(r=>r.status===401));assert.equal(a.sqlite.prepare('SELECT attempts FROM consultation_auth_control').get().attempts,5);
 });
 await test('login rejects missing, foreign and insecure origins',async()=>{
  for(const requestOrigin of [null,'https://foreign.synthetic.invalid','http://consultation.synthetic.invalid'])assert.equal((await f.auth.login(request({method:'POST',requestOrigin}),{username:'synthetic-qy',password:secret})).status,403);
 });
 await test('cross-site fetch metadata and non-JSON mutations rejected',async()=>{
  assert.equal((await f.auth.login(request({method:'POST',extra:{'sec-fetch-site':'cross-site'}}),{username:'synthetic-qy',password:secret})).status,403);
  assert.equal((await f.auth.logout(new Request(origin+'/test',{method:'POST',headers:{cookie:session.cookie,origin,'content-type':'text/plain','x-qy-consultation-csrf':session.body.csrfToken}}))).status,403);
 });
 await test('mutations require both Origin and session-bound CSRF',async()=>{
  for(const csrf of [null,randomSecret(),'false'])assert.equal((await f.auth.logout(request({method:'POST',cookie:session.cookie,csrf}))).status,403);
  assert.equal((await f.auth.logout(request({method:'POST',cookie:session.cookie,csrf:session.body.csrfToken,requestOrigin:'https://foreign.synthetic.invalid'}))).status,403);
 });
 await test('read guard cannot be used for mutations or truthy flags',async()=>{
  assert.equal((await f.auth.requirePrivateAccess(request({method:'POST',cookie:session.cookie}))).error.status,405);
  assert.equal((await f.auth.requirePrivateAccess(request({cookie:session.cookie}),{stateChanging:'false'})).error.status,400);
 });
 await test('CSRF token from another session is rejected',async()=>{
  const other=await signedIn(f);
  assert.equal((await f.auth.logout(request({method:'POST',cookie:session.cookie,csrf:other.body.csrfToken}))).status,403);
 });
 await test('logout revokes and clears cookie',async()=>{
  const result=await f.auth.logout(request({method:'POST',cookie:session.cookie,csrf:session.body.csrfToken}));
  assert.equal(result.status,200);assert(result.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal((await f.auth.requirePrivateAccess(request({cookie:session.cookie}))).error.status,401);
 });
 await test('revoke-all invalidates every active session',async()=>{
  const a=fixture();const first=await signedIn(a);const second=await signedIn(a);
  assert.equal((await a.auth.revokeAll(request({method:'POST',cookie:first.cookie,csrf:first.body.csrfToken}))).status,200);
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:second.cookie}))).error.status,401);
 });
 await test('audit is sanitized and append-only',()=>{
  const rows=f.sqlite.prepare('SELECT * FROM consultation_auth_audit').all();
  assert(rows.length>0);const text=JSON.stringify(rows);
  assert(!text.includes(secret));assert(!text.includes(session.body.csrfToken));assert(!text.includes(session.cookie.split('=')[1]));
  assert.throws(()=>f.sqlite.exec("UPDATE consultation_auth_audit SET event='login_failed'"),/immutable/);
  assert.throws(()=>f.sqlite.exec('DELETE FROM consultation_auth_audit'),/immutable/);
 });
 await test('failed login-success audit rolls back inserted session',async()=>{
  const a=fixture();a.sqlite.exec("CREATE TRIGGER synthetic_failure BEFORE INSERT ON consultation_auth_audit WHEN NEW.event='login_success' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  const result=await a.auth.login(request({method:'POST'}),{username:'synthetic-qy',password:secret});assert.equal(result.status,503);
  assert.equal(a.sqlite.prepare('SELECT count(*) n FROM consultation_auth_sessions').get().n,0);
 });
 await test('invalid hash work factors and weak password inputs rejected',async()=>{
  await assert.rejects(passwordHash(secret,record.salt,100000));await assert.rejects(newPasswordRecord('short'));
 });
 await test('SQL integrity, foreign keys and token-hash uniqueness',()=>{
  assert.equal(f.sqlite.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  const row=f.sqlite.prepare('SELECT * FROM consultation_auth_sessions LIMIT 1').get();
  assert.throws(()=>f.sqlite.prepare('INSERT INTO consultation_auth_sessions VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),1,row.token_hash,row.csrf_hash,1,epoch,epoch+SESSION_MS,null),/UNIQUE/);
 });
 await test('explicit local setup stores hashes only and refuses overwrite',()=>{
  const dir=privateSyntheticDirectory('qy-consult-auth-');const path=join(dir,'synthetic.sqlite');
  try {
   const run=()=>spawnSync(process.execPath,['scripts/setup-consultation-account-local.mjs','--local-db',path,'--initialize'],{encoding:'utf8',input:JSON.stringify({username:'synthetic-qy',password:secret,confirmation:secret})});
   const result=run();assert.equal(result.status,0);assert(!result.stdout.includes(secret));assert(!result.stderr.includes(secret));
   const sqlite=new DatabaseSync(path);try{const row=sqlite.prepare('SELECT * FROM consultation_auth_account').get();assert.notEqual(row.password_hash,secret);assert.equal(row.password_iterations,600000);}finally{sqlite.close();}
   assert.equal(run().status,1);
  } finally {
   const target=realpathSync(dir),root=realpathSync(tmpdir()),part=relative(root,target);
   if(!part||part.startsWith('..')||isAbsolute(part))throw Error('Unsafe temporary cleanup target');
   rmSync(target,{recursive:true,force:true});
  }
 });

 await test('unauthenticated private access and foreign-host cookies denied',async()=>{
  assert.equal((await f.auth.requirePrivateAccess(request())).error.status,401);
  const fresh=await signedIn(f);
  assert.equal((await f.auth.requirePrivateAccess(request({cookie:fresh.cookie}))).principal.accountId,1);
  assert.equal((await f.auth.requirePrivateAccess(request({cookie:fresh.cookie,url:'https://foreign.synthetic.invalid/private'}))).error.status,401);
 });
 await test('disabled account login uses generic failure',async()=>{
  const a=fixture();a.sqlite.exec('UPDATE consultation_auth_account SET enabled=0');
  const result=await a.auth.login(request({method:'POST'}),{username:'synthetic-qy',password:secret});
  assert.equal(result.status,401);assert.deepEqual(await result.json(),{ok:false,error:'Authentication failed.'});
 });
 await test('local setup rejects unsafe filenames and outside directories',()=>{
  for(const path of [join(tmpdir(),'synthetic:stream.sqlite'),join(tmpdir(),'not-approved.txt'),'C:\\synthetic-qy.sqlite']) {
   const result=spawnSync(process.execPath,['scripts/setup-consultation-account-local.mjs','--local-db',path,'--initialize'],{encoding:'utf8',input:JSON.stringify({username:'synthetic-qy',password:secret,confirmation:secret})});
   assert.equal(result.status,1);assert(!result.stdout.includes(secret));assert(!result.stderr.includes(secret));
  }
 });

 await test('credential changes require monotonic version advancement',()=>{
  const a=fixture();
  assert.throws(()=>a.sqlite.prepare('UPDATE consultation_auth_account SET password_hash=?').run(randomSecret()),/version/);
  a.sqlite.exec('UPDATE consultation_auth_account SET password_version=2');
  assert.throws(()=>a.sqlite.exec('UPDATE consultation_auth_account SET password_version=1'),/version/);
 });
 await test('sessions cannot be rebound, extended or resurrected',async()=>{
  const a=fixture();await signedIn(a);
  assert.throws(()=>a.sqlite.prepare('UPDATE consultation_auth_sessions SET token_hash=?').run(randomSecret()),/immutable/);
  assert.throws(()=>a.sqlite.exec('UPDATE consultation_auth_sessions SET expires_at=expires_at-1'),/immutable/);
  a.sqlite.prepare('UPDATE consultation_auth_sessions SET revoked_at=?').run(epoch);
  assert.throws(()=>a.sqlite.exec('UPDATE consultation_auth_sessions SET revoked_at=NULL'),/immutable/);
 });

 // Encoding-independent fixtures: raw JSON contains real 3-byte and 4-byte characters.
 const chinese=String.fromCodePoint(0x4e2d),supplementary=String.fromCodePoint(0x1f600);
 const unicodeInput={username:'synthetic-qy',password:secret+chinese+supplementary,confirmation:secret+chinese+supplementary};
 const unicodeBytes=Buffer.from(JSON.stringify(unicodeInput),'utf8');
 const splitEveryByte=bytes=>[...bytes].map(byte=>Buffer.from([byte]));
 const checkExactUnicode=async decode=>{
  const decoded=await decode(Readable.from(splitEveryByte(unicodeBytes)));
  assert.equal(decoded.password===unicodeInput.password,true,'Password must round-trip exactly');
  assert.equal(decoded.confirmation===unicodeInput.confirmation,true,'Confirmation must round-trip exactly');
 };
 await test('streaming UTF-8 preserves real split 3-byte and 4-byte characters',async()=>{
  assert.equal(Buffer.byteLength(chinese,'utf8'),3);
  assert.equal(Buffer.byteLength(supplementary,'utf8'),4);
  assert(unicodeBytes.includes(Buffer.from([0xe4,0xb8,0xad])));
  assert(unicodeBytes.includes(Buffer.from([0xf0,0x9f,0x98,0x80])));
  // One-byte chunks split every multibyte sequence, including password and confirmation.
  await checkExactUnicode(readLocalCredentialInput);
 });
 await test('exact Unicode regression rejects the old chunk-by-chunk decoder',async()=>{
  const oldDecoder=async stream=>{let text='';for await(const chunk of stream)text+=chunk;return JSON.parse(text);};
  // First prove the old decoder parses the JSON; then require the exact-value assertion to fail.
  const old=await oldDecoder(Readable.from(splitEveryByte(unicodeBytes)));
  assert.equal(old.password===unicodeInput.password,false);
  assert.equal(old.confirmation===unicodeInput.confirmation,false);
  await assert.rejects(checkExactUnicode(oldDecoder),error=>error.name==='AssertionError'&&error.code==='ERR_ASSERTION');
 });
 const malformedInputs=[
  Buffer.from([0xe4,0xb8]), // truncated three-byte sequence inside a closed JSON string
  Buffer.from([0xf0,0x9f,0x98]), // truncated four-byte sequence
  Buffer.from([0xe4,0x41,0xad]), // invalid continuation byte
  Buffer.from([0xc0,0xaf]) // forbidden overlong encoding
 ].map(bad=>Buffer.concat([
  Buffer.from('{"username":"synthetic-qy","password":"','utf8'),bad,
  Buffer.from('","confirmation":"synthetic-confirmation"}','utf8')
 ]));
 await test('malformed UTF-8 in otherwise valid JSON fails before JSON.parse',async()=>{
  for(const bytes of malformedInputs){
   // Lossy decoding yields valid JSON, so JSON syntax cannot explain strict rejection.
   const lossy=JSON.parse(bytes.toString('utf8'));
   assert.equal(typeof lossy.password,'string');
   assert.equal(lossy.username,'synthetic-qy');
   const original=JSON.parse;let parsingAttempted=false;
   JSON.parse=(...args)=>{parsingAttempted=true;return original(...args);};
   try {
    await assert.rejects(readLocalCredentialInput(Readable.from(splitEveryByte(bytes))),error=>
     error instanceof TypeError&&error.code==='ERR_ENCODING_INVALID_ENCODED_DATA');
    assert.equal(parsingAttempted,false,'Decoder must reject before parsing');
   } finally {JSON.parse=original;}
  }
 });
 await test('malformed provisioning bytes cannot create or rotate credentials',async()=>{
  const dir=privateSyntheticDirectory('qy-consult-unicode-'),path=join(dir,'synthetic.sqlite');
  const run=(args,input)=>spawnSync(process.execPath,['scripts/setup-consultation-account-local.mjs','--local-db',path,...args],{encoding:'utf8',input});
  const verifyError=result=>{
   assert.equal(result.status,1);
   assert.equal(result.stdout,'');
   assert.equal(result.stderr.trim(),'Local administrative action failed. Credentials are not included in this error.');
   assert.equal(result.stderr.includes(secret),false);
  };
  try {
   for(const bytes of malformedInputs){
    verifyError(run(['--initialize'],bytes));
    assert.equal(existsSync(path),false,'Malformed input must not create the database');
   }
   assert.equal(run(['--initialize'],Buffer.from(JSON.stringify(unicodeInput),'utf8')).status,0);
   const provisioned=new DatabaseSync(path);
   try {
    const account=provisioned.prepare('SELECT password_salt,password_hash FROM consultation_auth_account').get();
    assert.equal((await passwordHash(unicodeInput.password,account.password_salt))===account.password_hash,true,'CLI must hash the original Unicode password');
   } finally {provisioned.close();}

   const snapshot=()=>{
    const db=new DatabaseSync(path);
    try{return JSON.stringify({account:db.prepare('SELECT * FROM consultation_auth_account').get(),audit:db.prepare('SELECT * FROM consultation_auth_audit ORDER BY id').all(),sessions:db.prepare('SELECT * FROM consultation_auth_sessions ORDER BY id').all()});}
    finally{db.close();}
   };
   const baseline=snapshot();
   for(const bytes of malformedInputs){
    verifyError(run(['--rotate','--expected-version','1','--authorized-local-recovery'],bytes));
    assert.equal(snapshot()===baseline,true,'Malformed rotation must preserve credentials and audit');
   }
  } finally {
   const target=realpathSync(dir),root=realpathSync(tmpdir()),part=relative(root,target);
   if(!part||part.startsWith('..')||isAbsolute(part))throw Error('Unsafe temporary cleanup target');
   rmSync(target,{recursive:true,force:true});
  }
 });
 for(const method of ['logout','revokeAll']) {
  for(const invalidation of ['revoked','credential-version','disabled','expired']) {
   await test('atomic '+method+' rejects '+invalidation+' after precheck',async()=>{
    const a=fixture();const caller=await signedIn(a);const newer=await signedIn(a);
    const original=a.db.batch;let fired=false,baseline;
    a.db.batch=async statements=>{
     if(!fired){fired=true;
      if(invalidation==='revoked')a.sqlite.prepare('UPDATE consultation_auth_sessions SET revoked_at=? WHERE id=(SELECT session_id FROM consultation_auth_audit WHERE event=? ORDER BY rowid LIMIT 1)').run(epoch,'login_success');
      if(invalidation==='credential-version')a.sqlite.exec('UPDATE consultation_auth_account SET password_version=password_version+1');
      if(invalidation==='disabled')a.sqlite.exec('UPDATE consultation_auth_account SET enabled=0');
      if(invalidation==='expired')a.setTime(epoch+SESSION_MS);
      baseline=JSON.stringify({sessions:a.sqlite.prepare('SELECT * FROM consultation_auth_sessions ORDER BY id').all(),audit:a.sqlite.prepare('SELECT * FROM consultation_auth_audit ORDER BY id').all(),account:a.sqlite.prepare('SELECT password_version,enabled FROM consultation_auth_account').get()});
     }
     return original(statements);
    };
    const result=await a.auth[method](request({method:'POST',cookie:caller.cookie,csrf:caller.body.csrfToken}));
    assert.equal(result.status,401);
    const after=JSON.stringify({sessions:a.sqlite.prepare('SELECT * FROM consultation_auth_sessions ORDER BY id').all(),audit:a.sqlite.prepare('SELECT * FROM consultation_auth_audit ORDER BY id').all(),account:a.sqlite.prepare('SELECT password_version,enabled FROM consultation_auth_account').get()});
    assert.equal(after===baseline,true);
   });
  }
 }
 await test('logout audit failure rolls back the revocation',async()=>{
  const a=fixture(),caller=await signedIn(a);
  a.sqlite.exec("CREATE TRIGGER synthetic_logout_failure BEFORE INSERT ON consultation_auth_audit WHEN NEW.event='logout' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  assert.equal((await a.auth.logout(request({method:'POST',cookie:caller.cookie,csrf:caller.body.csrfToken}))).status,503);
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:caller.cookie}))).principal.accountId,1);
 });
 await test('revoke-all audit failure rolls back generation and all revocations',async()=>{
  const a=fixture(),caller=await signedIn(a);
  a.sqlite.exec("CREATE TRIGGER synthetic_revoke_failure BEFORE INSERT ON consultation_auth_audit WHEN NEW.event='revoke_all' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  assert.equal((await a.auth.revokeAll(request({method:'POST',cookie:caller.cookie,csrf:caller.body.csrfToken}))).status,503);
  assert.equal(a.sqlite.prepare('SELECT password_version FROM consultation_auth_account').get().password_version,1);
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:caller.cookie}))).principal.accountId,1);
 });
 await test('blocked requests create no audit rows or repeated summary writes',async()=>{
  const a=fixture();for(let i=0;i<5;i++)await a.auth.login(request({method:'POST'}),{username:'unknown',password:secret});
  const before=JSON.stringify(a.sqlite.prepare('SELECT * FROM consultation_auth_control').get());
  const rows=a.sqlite.prepare('SELECT count(*) n FROM consultation_auth_audit').get().n;
  for(let i=0;i<50;i++)assert.equal((await a.auth.login(request({method:'POST'}),{username:'unknown',password:secret})).status,401);
  assert.equal(JSON.stringify(a.sqlite.prepare('SELECT * FROM consultation_auth_control').get())===before,true);
  assert.equal(a.sqlite.prepare('SELECT count(*) n FROM consultation_auth_audit').get().n,rows);
  assert.equal(a.sqlite.prepare('SELECT failure_count FROM consultation_auth_control').get().failure_count,5);
 });

 await test('zero-row generation CAS aborts revocation and audit',async()=>{
  const a=fixture(),caller=await signedIn(a);
  const count=a.sqlite.prepare('SELECT count(*) n FROM consultation_auth_audit').get().n;
  a.sqlite.exec("CREATE TRIGGER synthetic_zero_cas BEFORE UPDATE ON consultation_auth_account WHEN NEW.password_version>OLD.password_version BEGIN SELECT RAISE(IGNORE); END");
  assert.equal((await a.auth.revokeAll(request({method:'POST',cookie:caller.cookie,csrf:caller.body.csrfToken}))).status,401);
  assert.equal(a.sqlite.prepare('SELECT count(*) n FROM consultation_auth_audit').get().n,count);
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:caller.cookie}))).principal.accountId,1);
 });
 await test('revocation wins over pending older-generation login',async()=>{
  const a=fixture(),caller=await signedIn(a),original=a.db.batch;let fired=false;
  a.db.batch=async statements=>{
   if(!fired&&statements[0].sql.includes('INSERT INTO consultation_auth_sessions')){
    fired=true;a.db.batch=original;
    assert.equal((await a.auth.revokeAll(request({method:'POST',cookie:caller.cookie,csrf:caller.body.csrfToken}))).status,200);
   }
   return original(statements);
  };
  assert.equal((await a.auth.login(request({method:'POST'}),{username:'synthetic-qy',password:secret})).status,401);
  assert.equal(a.sqlite.prepare('SELECT count(*) n FROM consultation_auth_sessions').get().n,1);
  assert.equal(a.sqlite.prepare('SELECT password_version FROM consultation_auth_account').get().password_version,2);
  const fresh=await signedIn(a);assert.equal((await a.auth.requirePrivateAccess(request({cookie:fresh.cookie}))).principal.accountId,1);
 });
 await test('login that commits before revoke-all is revoked',async()=>{
  const a=fixture(),caller=await signedIn(a),original=a.db.batch;let newer,fired=false;
  a.db.batch=async statements=>{
   if(!fired&&statements[0].sql.includes('UPDATE consultation_auth_account')){
    fired=true;a.db.batch=original;newer=await signedIn(a);
   }
   return original(statements);
  };
  assert.equal((await a.auth.revokeAll(request({method:'POST',cookie:caller.cookie,csrf:caller.body.csrfToken}))).status,200);
  assert.equal((await a.auth.requirePrivateAccess(request({cookie:newer.cookie}))).error.status,401);
 });
 await test('explicit local rotation preserves records and invalidates old sessions',()=>{
  const dir=privateSyntheticDirectory('qy-consult-rotate-'),path=join(dir,'synthetic.sqlite');
  try {
   const payload=password=>JSON.stringify({username:'synthetic-qy',password,confirmation:password});
   const run=(args,password)=>spawnSync(process.execPath,['scripts/setup-consultation-account-local.mjs','--local-db',path,...args],{encoding:'utf8',input:payload(password)});
   const init=run(['--initialize'],secret);assert.equal(init.status,0);
   let db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; CREATE TABLE synthetic_consultation_records(id INTEGER PRIMARY KEY,value TEXT)');db.prepare('INSERT INTO synthetic_consultation_records VALUES(1,?)').run('synthetic-preserve');
   db.prepare('INSERT INTO consultation_auth_sessions VALUES(?,1,?,?,1,?,?,NULL)').run('synthetic-old',randomSecret(),randomSecret(),epoch,epoch+SESSION_MS);db.close();
   const replacement=randomSecret();
   assert.equal(run(['--rotate','--expected-version','1'],replacement).status,1);
   const result=run(['--rotate','--expected-version','1','--authorized-local-recovery'],replacement);
   assert.equal(result.status,0);assert(!result.stdout.includes(replacement));assert(!result.stderr.includes(replacement));
   db=new DatabaseSync(path);try {
    const account=db.prepare('SELECT * FROM consultation_auth_account').get();assert.equal(account.password_version,2);
    assert.equal(db.prepare('SELECT value FROM synthetic_consultation_records').get().value,'synthetic-preserve');
    assert.notEqual(db.prepare('SELECT revoked_at FROM consultation_auth_sessions').get().revoked_at,null);
    assert.equal(db.prepare('SELECT count(*) n FROM consultation_auth_audit').get().n,2);
   } finally {db.close();}
   db=new DatabaseSync(path);let baseline;
   try{baseline=JSON.stringify({account:db.prepare('SELECT * FROM consultation_auth_account').get(),audit:db.prepare('SELECT * FROM consultation_auth_audit ORDER BY id').all(),records:db.prepare('SELECT * FROM synthetic_consultation_records').all()});}finally{db.close();}
   assert.equal(run(['--rotate','--expected-version','1','--authorized-local-recovery'],replacement).status,1);
   db=new DatabaseSync(path);try{assert.equal(JSON.stringify({account:db.prepare('SELECT * FROM consultation_auth_account').get(),audit:db.prepare('SELECT * FROM consultation_auth_audit ORDER BY id').all(),records:db.prepare('SELECT * FROM synthetic_consultation_records').all()})===baseline,true);}finally{db.close();}
  } finally {
   const target=realpathSync(dir),root=realpathSync(tmpdir()),part=relative(root,target);
   if(!part||part.startsWith('..')||isAbsolute(part))throw Error('Unsafe temporary cleanup target');
   rmSync(target,{recursive:true,force:true});
  }
 });
 if(process.env.QY_MINIFLARE_PATH) {
  const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local synthetic control")}}',compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-auth'},d1Persist:false,rootPath:tmpdir(),cf:false,telemetry:{enabled:false}}));
  try {
   const db=await mf.getD1Database('DB');await db.batch(schemaStatements.map(sql=>db.prepare(sql)));
   await db.prepare('INSERT INTO consultation_auth_account VALUES(1,?,1,?,?,?,?,1,?)').bind('synthetic-qy',record.algorithm,record.iterations,record.salt,record.hash,epoch).run();
   const auth=createConsultationAuth({db,origin,clock:()=>epoch});
   await test('local D1 login, authorization and logout',async()=>{
    const result=await auth.login(request({method:'POST'}),{username:'synthetic-qy',password:secret});assert.equal(result.status,200);
    const body=await result.json(),cookie=result.headers.get('set-cookie').split(';')[0];
    assert.equal((await auth.requirePrivateAccess(request({cookie}))).principal.accountId,1);
    assert.equal((await auth.logout(request({method:'POST',cookie,csrf:body.csrfToken}))).status,200);
    assert.equal((await auth.requirePrivateAccess(request({cookie}))).error.status,401);
   });
   await test('local D1 bounded concurrent login attempts',async()=>{
    const results=await Promise.all(Array.from({length:9},()=>auth.login(request({method:'POST'}),{username:'unknown',password:randomSecret()})));
    assert(results.every(r=>r.status===401));assert.equal((await db.prepare('SELECT attempts FROM consultation_auth_control').first()).attempts,5);
   });

   for(const method of ['logout','revokeAll'])for(const invalidation of ['revoked','credential-version','disabled','expired']) {
    await test('local D1 atomic '+method+' rejects '+invalidation,async()=>{
     await db.prepare('UPDATE consultation_auth_account SET enabled=1').run();
     await db.prepare('UPDATE consultation_auth_control SET attempts=0,locked_until=0').run();
     let time=epoch,hook=null;
     const binding={prepare(sql){const item={sql,values:[],bind(...args){item.values=args;return item;},
      first(){return db.prepare(sql.replaceAll(DB_TIME,String(time))).bind(...item.values).first();},
      run(){return db.prepare(sql.replaceAll(DB_TIME,String(time))).bind(...item.values).run();}};return item;},
      async batch(items){if(hook){const run=hook;hook=null;await run();}return db.batch(items.map(item=>db.prepare(item.sql.replaceAll(DB_TIME,String(time))).bind(...item.values)));}};
     const service=createConsultationAuth({db:binding,origin,clock:()=>time});
     const login=await service.login(request({method:'POST'}),{username:'synthetic-qy',password:secret});assert.equal(login.status,200);
     const body=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
     const principal=(await service.requirePrivateAccess(request({cookie}))).principal;
     let baseline;
     const snapshot=async()=>JSON.stringify({sessions:(await db.prepare('SELECT * FROM consultation_auth_sessions ORDER BY id').all()).results,audit:(await db.prepare('SELECT * FROM consultation_auth_audit ORDER BY id').all()).results,account:await db.prepare('SELECT password_version,enabled FROM consultation_auth_account').first()});
     hook=async()=>{
      if(invalidation==='revoked')await db.prepare('UPDATE consultation_auth_sessions SET revoked_at=? WHERE id=?').bind(epoch,principal.sessionId).run();
      if(invalidation==='credential-version')await db.prepare('UPDATE consultation_auth_account SET password_version=password_version+1').run();
      if(invalidation==='disabled')await db.prepare('UPDATE consultation_auth_account SET enabled=0').run();
      if(invalidation==='expired')time=epoch+SESSION_MS;
      baseline=await snapshot();
     };
     assert.equal((await service[method](request({method:'POST',cookie,csrf:body.csrfToken}))).status,401);
     assert.equal((await snapshot())===baseline,true);
    });
   }
   await test('local D1 rollback and foreign keys',async()=>{
    const before=(await db.prepare('SELECT count(*) n FROM consultation_auth_sessions').first()).n;
    await assert.rejects(db.batch([
     db.prepare('INSERT INTO consultation_auth_sessions VALUES(?,?,?,?,?,?,?,NULL)').bind(crypto.randomUUID(),1,randomSecret(),randomSecret(),1,epoch,epoch+SESSION_MS),
     db.prepare("INSERT INTO consultation_auth_audit VALUES('bad',1,NULL,'login_success',?)").bind(epoch)
    ]),/consultation authorization failed/);
    assert.equal((await db.prepare('SELECT count(*) n FROM consultation_auth_sessions').first()).n,before);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
   });
  } finally {await mf.dispose();}
 }

 if(process.env.QY_MINIFLARE_PATH) {
  const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
  const worker=`import {createConsultationAuth} from './auth.js';
   export default {async fetch(request,env){
    const service=createConsultationAuth({db:env.DB,origin:'${origin}',clock:()=>${epoch}});
    const path=new URL(request.url).pathname;
    if(path==='/login')return service.login(request,await request.json());
    if(path==='/logout')return service.logout(request);
    const auth=await service.requirePrivateAccess(request);
    return auth.error||Response.json({ok:true,principal:auth.principal});
   }};`;
  const modules=[{type:'ESModule',path:'worker.js',contents:worker},
   ...['auth.js','auth-crypto.js','foundation.js'].map(name=>({type:'ESModule',path:name,contents:readFileSync(new URL('../functions/lib/consultation/'+name,import.meta.url),'utf8')}))];
  const mf=new Miniflare(convertV4MiniflareOptions({modules,compatibilityDate:'2026-10-07',d1Databases:{DB:'synthetic-runtime-auth'},d1Persist:false,rootPath:tmpdir(),cf:false,telemetry:{enabled:false}}));
  try {
   const db=await mf.getD1Database('DB');await db.batch(schemaStatements.map(sql=>db.prepare(sql)));
   await db.prepare('INSERT INTO consultation_auth_account VALUES(1,?,1,?,?,?,?,1,?)').bind('synthetic-qy',record.algorithm,record.iterations,record.salt,record.hash,epoch).run();
   await test('actual local workerd 600000-iteration login, guard and logout',async()=>{
    const result=await mf.dispatchFetch(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'synthetic-qy',password:secret})});
    assert.equal(result.status,200);const body=await result.json(),cookie=result.headers.get('set-cookie').split(';')[0];
    assert.equal((await mf.dispatchFetch(origin+'/private',{headers:{cookie}})).status,200);
    assert.equal((await mf.dispatchFetch(origin+'/logout',{method:'POST',headers:{origin,'content-type':'application/json',cookie,'x-qy-consultation-csrf':body.csrfToken}})).status,200);
    assert.equal((await mf.dispatchFetch(origin+'/private',{headers:{cookie}})).status,401);
   });
  } finally {await mf.dispose();}
 }
 await test('service emits no credential or private-data logs',()=>assert.deepEqual(emitted,[]));
 originalLog('RESULT: '+passed+' passed, 0 failed; local synthetic authentication only');
} finally {
 for(const db of created)db.close();globalThis.fetch=originalFetch;
 console.log=originalLog;console.error=originalError;console.warn=originalWarn;
}