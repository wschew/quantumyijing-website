import assert from 'node:assert/strict';
import {SyntheticPasskeys} from './webauthn-synthetic-store.mjs';
import {authenticator,response,concat,encodeCBOR} from './webauthn-synthetic-fixtures.mjs';
import {b64,bytes,cbor,validate} from './webauthn-synthetic-validation.mjs';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
let mf,verify=validate;
if(process.argv.includes('--workerd')){
 const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)(process.env.QY_MINIFLARE_PATH);
 const entry=`import {validate} from './webauthn-synthetic-validation.mjs';globalThis.fetch=async()=>{throw Error('outbound disabled')};export default{async fetch(req){try{const x=await req.json();return Response.json({result:await validate(x.response,x.expected,x.credential)});}catch{return Response.json({error:true});}}}`;
 mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'entry.mjs',contents:entry},...['webauthn-synthetic-validation.mjs','consultation-passkey-bench-fixture.mjs'].map(name=>({type:'ESModule',path:name,contents:readFileSync(new URL(name,import.meta.url),'utf8')}))],compatibilityDate:'2026-10-07',cf:false,telemetry:{enabled:false}}));
 verify=async(response,expected,credential)=>{const res=await mf.dispatchFetch('http://localhost/verify',{method:'POST',body:JSON.stringify({response,expected,credential})});const body=await res.json();if(body.error)throw Error('validation');return body.result;};
}
const service=clock=>new SyntheticPasskeys(clock,verify);
let passed=0;const test=async(name,fn)=>{await fn();console.log('PASS '+name);passed++;};
let now=1000000;const s=service(()=>now),a=await authenticator(),b=await authenticator();
try{
 // Both ceremonies traverse the same validator. Assertion fixtures are signed
 // over the exact supplied bytes, so negatives cannot pass via a stale signature.
 for(const kind of ['create','get']){
  const expected={kind,challenge:'synthetic-client-data-challenge',rpId:s.rpId,origin:s.origin,userHandle:s.userHandle};
  const base={type:'webauthn.'+kind,challenge:expected.challenge,origin:expected.origin,crossOrigin:false};
  const credential={id:a.id,key:a.publicKey,count:1},encode=value=>new TextEncoder().encode(value),json=value=>encode(JSON.stringify(value));
  const invalid=[];
  for(const field of ['type','challenge','origin']){
   invalid.push([field+' missing',()=>{const x={...base};delete x[field];return json(x);}]);
   for(const [label,value] of [['empty',''],['wrong string','wrong'],['number',1],['boolean',false],['null',null],['array',[]],['object',{}]])invalid.push([field+' '+label,()=>json({...base,[field]:value})]);
  }
  for(const [label,value] of [['true',true],['string true','true'],['string false','false'],['empty string',''],['zero',0],['one',1],['null',null],['array',[]],['object',{}]])invalid.push(['crossOrigin '+label,()=>json({...base,crossOrigin:value})]);
  for(const field of ['tokenBinding','topOrigin'])for(const [label,value] of [['string',s.origin],['null',null],['boolean',false],['number',0],['array',[]],['object',{}],['present binding',{status:'present',id:'synthetic'}],['supported binding',{status:'supported'}]])invalid.push([field+' '+label,()=>json({...base,[field]:value})]);
  for(const field of ['type','challenge','origin','crossOrigin','tokenBinding','topOrigin']){
   const good=Object.hasOwn(base,field)?base[field]:null;
   invalid.push(['duplicate '+field+' matching',()=>encode('{'+JSON.stringify(field)+':'+JSON.stringify(good)+','+JSON.stringify(base).slice(1,-1)+(Object.hasOwn(base,field)?'':','+JSON.stringify(field)+':null')+'}')]);
   if(Object.hasOwn(base,field)){
    invalid.push(['duplicate '+field+' invalid then valid',()=>encode('{'+JSON.stringify(field)+':"wrong",'+JSON.stringify(base).slice(1))]);
    invalid.push(['duplicate '+field+' escaped key',()=>encode('{"\\u'+field.charCodeAt(0).toString(16).padStart(4,'0')+field.slice(1)+'":'+JSON.stringify(good)+','+JSON.stringify(base).slice(1))]);
   }
  }
  invalid.push(['nested duplicate future member',()=>encode(JSON.stringify(base).slice(0,-1)+',"future":{"a":1,"\\u0061":2}}')]);
  for(const [label,value] of [['null',null],['array',[]],['string','client'],['number',1],['boolean',false]])invalid.push(['root '+label,()=>json(value)]);
  invalid.push(['truncated JSON',()=>encode('{')],['trailing JSON',()=>encode(JSON.stringify(base)+'{}')],['trailing comma',()=>encode(JSON.stringify(base).slice(0,-1)+',}')],['JSON comment',()=>encode(JSON.stringify(base)+'/*no*/')],['unescaped control',()=>encode(JSON.stringify(base).slice(0,-1)+',"future":"\n"}')]);
  for(const [label,raw] of [['overlong',[0xc0,0xaf]],['surrogate',[0xed,0xa0,0x80]],['truncated',[0xe2,0x82]],['continuation',[0x80]],['invalid byte',[0xff]]])invalid.push(['UTF-8 '+label,()=>concat(encode(JSON.stringify(base).slice(0,-1)+',"future":"'),raw,encode('"}'))]);
  invalid.push(['UTF-8 BOM',()=>concat([0xef,0xbb,0xbf],json(base))],['UTF-16 encoding',()=>new Uint8Array(Buffer.from(JSON.stringify(base),'utf16le'))],['excessive JSON nesting',()=>encode(JSON.stringify(base).slice(0,-1)+',"future":'+'['.repeat(18)+'0'+']'.repeat(18)+'}')]);
  for(const [name,raw] of invalid)await test(kind+' client data rejects '+name,async()=>{const r=await response(a,expected,{count:2,clientDataBytes:raw()});await assert.rejects(verify(r,expected,credential));});
  const missing={...base};delete missing.crossOrigin;
  const escaped=JSON.stringify(base).replace('"type"','"t\\u0079pe"').replace('webauthn.','webauthn\\u002e');
  for(const [name,raw] of [['false crossOrigin',json(base)],['missing crossOrigin',json(missing)],['whitespace and member order',encode(JSON.stringify(Object.fromEntries(Object.entries(base).reverse()),null,2))],['escaped keys and values',encode(escaped)],['unknown future members',json({...base,future:{a:[1,true,null,{b:'quotes " comma , brace } slash \\'}]}})]])await test(kind+' client data accepts '+name,async()=>{const r=await response(a,expected,{count:2,clientDataBytes:raw});assert.equal((await verify(r,expected,credential)).id,a.id);});
 }
 await test('bootstrap authority required',()=>assert.rejects(s.begin('create','wrong')));
 await test('login blocked before two keys',()=>assert.rejects(s.begin('get')));
 const registration=await s.begin('create',s.bootstrap);
 for(const [name,patch] of [
  ['origin',{client:{origin:'https://parent.invalid'}}],['challenge',{client:{challenge:'wrong'}}],['type',{client:{type:'webauthn.get'}}],['cross origin',{client:{crossOrigin:true}}],['top origin',{client:{topOrigin:s.origin}}],
  ['UV',{flags:65}],['UP',{flags:68}],['reserved flags',{flags:71}],['extension flags',{flags:197}],['BS without BE',{flags:85}],['backup eligible',{flags:77}],['AT missing',{flags:5}],
  ['RP hash',{authPatch:d=>d[0]^=1}],['credential ID',{authPatch:d=>d[55]^=1}],['COSE algorithm',{cosePatch:c=>c.set(3,-257)}],['COSE curve',{cosePatch:c=>c.set(-1,2)}],['COSE point',{cosePatch:c=>c.set(-2,new Uint8Array(32))}],
  ['attestation format',{attestationPatch:c=>c.set('fmt','packed')}],['nonempty attestation',{attestationPatch:c=>c.set('attStmt',new Map([['sig',new Uint8Array(1)]]))}]
 ])await test('registration rejects '+name,async()=>assert.rejects(s.finish(registration,await response(a,registration,patch))));
 await test('registration succeeds after invalid attempts',async()=>assert.equal(await s.finish(registration,await response(a,registration)),null));
 await test('registration replay rejected',async()=>assert.rejects(s.finish(registration,await response(a,registration))));
 await test('one key cannot log in',()=>assert.rejects(s.begin('get')));
 await test('same key under another ID rejected',async()=>{const o=await s.begin('create',s.bootstrap);await assert.rejects(s.finish(o,await response({...a,id:b.id},o)));assert.equal(s.active().length,1);});
 await test('second distinct key enrolled',async()=>{const o=await s.begin('create',s.bootstrap);await s.finish(o,await response(b,o));assert.equal(s.active().length,2);});
 await test('bootstrap permanently closes',()=>assert.rejects(s.begin('create',s.bootstrap)));
 const o=await s.begin('get');
 for(const [name,patch] of [
  ['wrong origin',{client:{origin:'https://other.invalid'}}],['wrong challenge',{client:{challenge:'bad'}}],['wrong type',{client:{type:'webauthn.create'}}],['cross origin',{client:{crossOrigin:true}}],['missing UV',{flags:1}],['missing UP',{flags:4}],['AT',{flags:69}],['ED',{flags:133}],['RP hash',{authPatch:d=>d[0]^=1}],['zero counter',{count:0}],['same counter',{count:1}],['user handle',{userHandle:'wrong'}],['backup eligibility',{flags:13}]
 ])await test('authentication rejects '+name,async()=>assert.rejects(s.finish(o,await response(a,o,{count:2,...patch}))));
 for(const [name,mutate] of [
  ['signature',r=>{const x=bytes(r.response.signature);x[x.length-1]^=1;r.response.signature=b64(x);}],['truncated DER',r=>r.response.signature=b64(bytes(r.response.signature).slice(0,-1))],['trailing DER',r=>r.response.signature=b64(concat(bytes(r.response.signature),[0]))],
  ['unknown ID',r=>r.id=r.rawId=b64(new Uint8Array(32))],['raw ID mismatch',r=>r.rawId=b.id],['envelope type',r=>r.type='password'],['client extension',r=>r.clientExtensionResults={appid:true}],['missing extension result',r=>delete r.clientExtensionResults],['oversize client',r=>r.response.clientDataJSON='a'.repeat(5501)],['noncanonical encoding',r=>r.response.clientDataJSON+='='],['bad JSON',r=>r.response.clientDataJSON=b64(new TextEncoder().encode('{'))],['auth trailing',r=>r.response.authenticatorData=b64(concat(bytes(r.response.authenticatorData),[0]))]
 ])await test('authentication rejects '+name,async()=>{const r=await response(a,o,{count:2});mutate(r);await assert.rejects(s.finish(o,r));});
 let session;
 await test('valid assertion issues hashed session',async()=>{session=await s.finish(o,await response(a,o,{count:2}));await s.requireSession(session);assert(!JSON.stringify(s.db.prepare('SELECT * FROM session').all()).includes(session));});
 await test('authentication replay rejected',async()=>assert.rejects(s.finish(o,await response(a,o,{count:3}))));
 await test('second authenticator can log in and logout',async()=>{const q=await s.begin('get');const t=await s.finish(q,await response(b,q,{count:2}));await s.logout(t);await assert.rejects(s.requireSession(t));});
 await test('expired challenge rejected',async()=>{const q=await s.begin('get');now+=60000;await assert.rejects(s.finish(q,await response(a,q,{count:3})));});
 await test('concurrent replay has exactly one winner and one session',async()=>{const q=await s.begin('get'),r=await response(a,q,{count:3}),before=s.db.prepare('SELECT count(*) n FROM session').get().n;const results=await Promise.allSettled([s.finish(q,r),s.finish(q,r)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(s.db.prepare('SELECT count(*) n FROM session').get().n,before+1);});
 await test('concurrent different challenges enforce counter CAS',async()=>{const q=await s.begin('get'),r=await s.begin('get');const results=await Promise.allSettled([s.finish(q,await response(a,q,{count:4})),s.finish(r,await response(a,r,{count:4}))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);});
 await test('expired session rejected',async()=>{now+=300000;await assert.rejects(s.requireSession(session));});
 await test('new enrollment needs live session',()=>assert.rejects(s.begin('create',session)));
 const fresh=await s.begin('get');session=await s.finish(fresh,await response(b,fresh,{count:3}));
 const pending=await s.begin('get');
 await test('lost device revocation invalidates every session and pending challenge',async()=>{await s.revokeCredential(session,a.id);await assert.rejects(s.requireSession(session));await assert.rejects(s.finish(pending,await response(b,pending,{count:4})));await assert.rejects(s.begin('get'));await assert.rejects(s.begin('create',s.bootstrap));});
 await test('owner recovery revokes all state without enabling login',async()=>{s.recover(b.id);assert.equal(s.active().length,0);await assert.rejects(s.begin('get'));});
 await test('trusted owner recovery requires two fresh enrollments',async()=>{
  const oldBootstrap=s.bootstrap,newBootstrap=s.resetEnrollment();assert.notEqual(newBootstrap,oldBootstrap);
  await assert.rejects(s.begin('create',oldBootstrap));
  for(const key of [await authenticator(),await authenticator()]){const q=await s.begin('create',newBootstrap);await s.finish(q,await response(key,q));}
  assert.equal(s.active().length,2);await assert.rejects(s.begin('create',newBootstrap));
 });
 await test('pending bootstrap enrollment cannot exceed initial two slots',async()=>{
  const isolated=service();try{const keys=await Promise.all([authenticator(),authenticator(),authenticator()]);const qs=await Promise.all(keys.map(()=>isolated.begin('create',isolated.bootstrap)));
   for(let i=0;i<2;i++)await isolated.finish(qs[i],await response(keys[i],qs[i]));
   await assert.rejects(isolated.finish(qs[2],await response(keys[2],qs[2])));assert.equal(isolated.active().length,2);
   assert.equal(isolated.db.prepare('SELECT used FROM challenge WHERE used=0').all().length,1);
  }finally{isolated.close();}
 });
 await test('enrollment completion rechecks session logout',async()=>{
  const isolated=service();try{const keys=await Promise.all([authenticator(),authenticator(),authenticator()]);for(const key of keys.slice(0,2)){const q=await isolated.begin('create',isolated.bootstrap);await isolated.finish(q,await response(key,q));}
   const q=await isolated.begin('get'),t=await isolated.finish(q,await response(keys[0],q,{count:2}));const enroll=await isolated.begin('create',t);await isolated.logout(t);
   await assert.rejects(isolated.finish(enroll,await response(keys[2],enroll)));assert.equal(isolated.active().length,2);
  }finally{isolated.close();}
 });
 await test('UV session authorizes additional independent key',async()=>{
  const isolated=service();try{const keys=await Promise.all([authenticator(),authenticator(),authenticator()]);for(const key of keys.slice(0,2)){const q=await isolated.begin('create',isolated.bootstrap);await isolated.finish(q,await response(key,q));}
   const q=await isolated.begin('get'),t=await isolated.finish(q,await response(keys[0],q,{count:2}));const enroll=await isolated.begin('create',t);await isolated.finish(enroll,await response(keys[2],enroll));assert.equal(isolated.active().length,3);
  }finally{isolated.close();}
 });
 await test('session insert failure rolls back challenge and counter atomically',async()=>{
  const isolated=service();try{const keys=await Promise.all([authenticator(),authenticator()]);for(const key of keys){const q=await isolated.begin('create',isolated.bootstrap);await isolated.finish(q,await response(key,q));}
   const q=await isolated.begin('get'),r=await response(keys[0],q,{count:2});
   isolated.db.exec("CREATE TRIGGER reject_session BEFORE INSERT ON session BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
   await assert.rejects(isolated.finish(q,r));assert.equal(isolated.active().find(c=>c.id===keys[0].id).count,1);assert.equal(isolated.db.prepare('SELECT count(*) n FROM session').get().n,0);
   isolated.db.exec('DROP TRIGGER reject_session');const t=await isolated.finish(q,r);await isolated.requireSession(t);
  }finally{isolated.close();}
 });
 await test('expiry is rechecked after asynchronous signature verification',async()=>{
  let time=1000;const isolated=new SyntheticPasskeys(()=>time,async(...args)=>{const result=await verify(...args);if(args[1].kind==='get')time+=60000;return result;});
  try{const keys=await Promise.all([authenticator(),authenticator()]);for(const key of keys){const q=await isolated.begin('create',isolated.bootstrap);await isolated.finish(q,await response(key,q));}
   const q=await isolated.begin('get');await assert.rejects(isolated.finish(q,await response(keys[0],q,{count:2})));assert.equal(isolated.db.prepare('SELECT count(*) n FROM session').get().n,0);
  }finally{isolated.close();}
 });
 for(const [name,raw] of [['duplicate keys',Uint8Array.of(162,1,1,1,2)],['indefinite',Uint8Array.of(191,255)],['truncated',Uint8Array.of(88,32,0)],['nonminimal',Uint8Array.of(24,1)]])await test('CBOR rejects '+name,()=>assert.throws(()=>cbor(raw)));
 await test('CBOR trailing attestation rejected',async()=>{const q={kind:'create',challenge:'test',rpId:s.rpId,origin:s.origin},r=await response(a,q);r.response.attestationObject=b64(concat(bytes(r.response.attestationObject),[0]));await assert.rejects(verify(r,q));});
 console.log('RESULT '+passed+' passed, 0 failed; '+(mf?'workerd validation + Node/SQLite state':'Node validation + Node/SQLite state'));
}finally{s.close();if(mf)await mf.dispose();}
