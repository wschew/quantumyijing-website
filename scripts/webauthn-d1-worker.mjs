// LOCAL SYNTHETIC ONLY. No active C1 imports, remote bindings or recovery routes.
import {b64,hash,validate} from './webauthn-synthetic-validation.mjs';
import {hexToken,binding,cookies,seal,open} from './webauthn-d1-policy.mjs';
const token=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const digest=async s=>{if(typeof s!=='string'||s.length>5500)throw Error('token');return b64(await hash(new TextEncoder().encode(s)));};
const twoKeys='(SELECT count(*) FROM (SELECT 1 FROM credential WHERE revoked=0 AND key_epoch=(SELECT key_epoch FROM account WHERE id=1) LIMIT 2))=2';
const active=`${twoKeys} AND (SELECT mode FROM security_state WHERE id=1)='ACTIVE' AND (SELECT count(*) FROM (SELECT DISTINCT g.group_id FROM credential c JOIN credential_custody g ON g.id=c.id WHERE c.revoked=0 AND c.key_epoch=(SELECT key_epoch FROM account WHERE id=1) LIMIT 2))=2`;
// Recheck time in SQL at the atomic boundary, after asynchronous verification.
const dbNow="CAST(unixepoch('subsec')*1000 AS INTEGER)";
const liveSession=`EXISTS(SELECT 1 FROM session s,account a WHERE a.id=1 AND s.hash=? AND s.revoked=0 AND s.expires>max(?,${dbNow}) AND s.epoch=a.epoch) AND ${active}`;
const liveChallenge=`EXISTS(SELECT 1 FROM challenge c,account a WHERE a.id=1 AND c.hash=? AND c.used=0 AND c.expires>max(?,${dbNow}) AND c.epoch=a.epoch)`;
export class D1Passkeys {
 constructor(db){this.db=db;this.stats={statements:0,rowsRead:0,rowsWritten:0,d1DurationMs:0,metadataComplete:true};}
 plan(sql,...v){return this.db.prepare(sql).bind(...v);}
 record(results){for(const r of results){this.stats.rowsRead+=r.meta.rows_read;this.stats.rowsWritten+=r.meta.rows_written;this.stats.d1DurationMs+=r.meta.duration;}return results;}
 async query(sql,...v){
  try{
   // LOCAL_TEST_QUERY_BOUNDARY: inert marker for harness-only source instrumentation.
   this.stats.statements++;
   return this.record([await this.plan(sql,...v).all()])[0];
  }catch(e){this.stats.metadataComplete=false;throw e;}
 }
 async first(sql,...v){return (await this.query(sql,...v)).results[0];}
 async atomic(condition,values,plans){
  // A false guard MUST raise SQL error: zero changed rows alone would not roll back.
  const batch=[this.plan(`INSERT INTO atomic_guard SELECT CASE WHEN ${condition} THEN 1 ELSE 0 END`,...values),...plans,this.plan('DELETE FROM atomic_guard')];
  try{
   // LOCAL_TEST_ATOMIC_BOUNDARY: inert marker for harness-only source instrumentation.
   this.stats.statements+=batch.length;
   this.record(await this.db.batch(batch));
  }catch(e){this.stats.metadataComplete=false;throw e;}
 }
 event(kind,subject=null){return this.plan(`INSERT INTO security_event(at,kind,epoch,subject) SELECT ${dbNow},?,epoch,? FROM account WHERE id=1`,kind,subject);}
 // Failed attempts commit separately, before cryptographic validation. Fixed
 // account-wide buckets bound cardinality but permit shared-account lockout.
 async admit(scope){
  const limit={get:60,finish:120}[scope];
  if(!limit)throw Error('scope');
  const r=await this.query(`INSERT INTO rate_bucket(scope,window,hits) VALUES(?,CAST(${dbNow}/60000 AS INTEGER),1)
   ON CONFLICT(scope) DO UPDATE SET window=excluded.window,hits=CASE WHEN rate_bucket.window=excluded.window THEN rate_bucket.hits+1 ELSE 1 END
   WHERE rate_bucket.window<excluded.window OR (rate_bucket.window=excluded.window AND rate_bucket.hits<?) RETURNING hits`,scope,limit);
  if(!r.results.length)throw Error('admission');
 }
 // Offline only. Natural expiry plus grace protects every live row. Fixed 100
 // candidates/table, atomic batch, no cursor or unbounded drain loop.
 async cleanup(){
  const day=86400000;
  const plans=[['challenge','hash','expires',day],['session','hash','expires',7*day],['security_event','id','at',90*day]]
   .map(([table,key,time,cutoff])=>this.plan(`DELETE FROM ${table} WHERE ${key} IN (SELECT ${key} FROM ${table} WHERE ${table==='security_event'?'hold=0 AND ':''}${time}<${dbNow}-? ORDER BY ${time},${key} LIMIT 100)`,cutoff));
  plans.push(this.plan(`DELETE FROM rate_bucket WHERE scope IN (SELECT scope FROM rate_bucket WHERE window<CAST(${dbNow}/60000 AS INTEGER)-1440 LIMIT 100)`));
  this.stats.statements+=plans.length;
  try{return this.record(await this.db.batch(plans));}catch(e){this.stats.metadataComplete=false;throw e;}
 }
 // Trusted offline database capability. Never dispatched over HTTP.
 async ownerReset(bootstrapHash){
  await this.atomic('1',[],[this.plan('UPDATE account SET epoch=epoch+1,key_epoch=key_epoch+1,closed=0,bootstrap_hash=? WHERE id=1',bootstrapHash),this.plan("UPDATE security_state SET mode='ACTIVE' WHERE id=1"),this.event('owner-reset')]);
 }
 async requireSession(raw){const h=await digest(raw);if(!(await this.first(`SELECT 1 ok WHERE ${liveSession}`,h,Date.now())))throw Error('session');return h;}
 async bound(raw,g){
  const h=await this.requireSession(raw);
  if(h!==g.hash||!(await this.first('SELECT 1 ok FROM session_binding b JOIN credential c ON c.id=b.credential_id JOIN account a ON a.id=1 WHERE b.hash=? AND b.csrf_hash=? AND b.credential_id=? AND c.revoked=0 AND c.key_epoch=a.key_epoch',h,g.csrf,g.credential)))throw Error('binding');return h;
 }
 async controlOptions(raw,g,action,target,secret){
  if(!['suspend','revoke-all','revoke-credential'].includes(action))throw Error('action');
  const h=await this.bound(raw,g),a=await this.first('SELECT * FROM account WHERE id=1'),now=Date.now();
  if(action==='revoke-credential'&&(typeof target!=='string'||target.length>1400||!/^[A-Za-z0-9_-]+$/.test(target)||target===g.credential))throw Error('target');
  const challenge=token(),ticket=await seal({v:1,kind:'control',action,target:action==='revoke-credential'?target:null,hash:h,csrf:g.csrf,credential:g.credential,epoch:a.epoch,keyEpoch:a.key_epoch,issued:now,expires:now+60000,challenge,handle:a.handle,origin:'https://synthetic.invalid'},secret);
  return {kind:'get',challenge,rpId:'synthetic.invalid',origin:'https://synthetic.invalid',userHandle:a.handle,userVerification:'required',ticket,credential:g.credential};
 }
 async control(raw,g,action,target,ticket,response,secret){
  const t=await open(ticket,secret),now=Date.now();
  if(t.v!==1||t.kind!=='control'||t.action!==action||t.target!==(action==='revoke-credential'?target:null)||t.hash!==g.hash||t.csrf!==g.csrf||t.credential!==g.credential||t.origin!=='https://synthetic.invalid'||!Number.isSafeInteger(t.issued)||!Number.isSafeInteger(t.expires)||t.expires-t.issued!==60000||t.issued>now||t.expires<=now)throw Error('control ticket');
  await this.bound(raw,g);
  const stored=await this.first('SELECT * FROM credential WHERE id=? AND revoked=0 AND key_epoch=?',t.credential,t.keyEpoch);
  const verified=await validate(response,{kind:'get',challenge:t.challenge,rpId:'synthetic.invalid',origin:'https://synthetic.invalid',userHandle:t.handle},stored&&{...stored,key:JSON.parse(stored.key)});
  let condition=liveSession+` AND EXISTS(SELECT 1 FROM session_binding WHERE hash=? AND csrf_hash=? AND credential_id=?) AND EXISTS(SELECT 1 FROM account WHERE id=1 AND epoch=? AND key_epoch=?) AND ?>${dbNow} AND ?<=${dbNow} AND EXISTS(SELECT 1 FROM credential WHERE id=? AND count=? AND revoked=0 AND key_epoch=?)`;
  const args=[g.hash,now,g.hash,g.csrf,g.credential,t.epoch,t.keyEpoch,t.expires,t.issued,stored.id,stored.count,t.keyEpoch];
  const plans=[this.plan('UPDATE credential SET count=? WHERE id=?',verified.count,stored.id)];
  if(action==='revoke-credential'){
   condition+=' AND EXISTS(SELECT 1 FROM credential c JOIN credential_custody target ON target.id=c.id JOIN credential_custody actor ON actor.id=? WHERE c.id=? AND c.revoked=0 AND c.key_epoch=? AND actor.group_id<>target.group_id)';args.push(t.credential,target,t.keyEpoch);
   plans.push(this.plan('UPDATE credential SET revoked=1 WHERE id=?',target),this.plan(`UPDATE security_state SET mode='QUARANTINED' WHERE id=1 AND NOT (${twoKeys})`));
  }
  if(action==='suspend')plans.push(this.plan("UPDATE security_state SET mode='SUSPENDED' WHERE id=1"));
  // Advancing the epoch consumes this ticket and EVERY pending session/control
  // challenge, so no unbounded nonce table or public recovery path is needed.
  plans.push(this.plan('UPDATE account SET epoch=epoch+1 WHERE id=1'),this.event(action==='suspend'?'account-suspended':action==='revoke-all'?'revoke-all':'credential-revoked',action==='revoke-credential'?target:null));
  await this.atomic(condition,args,plans);
 }
 async begin(kind,authority){
  if(!['create','get'].includes(kind))throw Error('kind');
  const a=await this.first('SELECT * FROM account WHERE id=1');
  const auth=kind==='create'?await digest(authority):null,bootstrap=kind==='create'&&!a.closed&&auth===a.bootstrap_hash;
  const challenge=token(),h=await digest(challenge),now=Date.now();
  const condition=kind==='get'?active:bootstrap?'EXISTS(SELECT 1 FROM account WHERE id=1 AND closed=0 AND bootstrap_hash=?)':liveSession;
  const args=kind==='get'?[]:bootstrap?[auth]:[auth,now];
  await this.atomic(condition,args,[this.plan('INSERT INTO challenge SELECT ?,?,?,epoch,0,?,? FROM account WHERE id=1',h,kind,now+60000,auth,bootstrap?1:0)]);
  return {kind,challenge,rpId:'synthetic.invalid',origin:'https://synthetic.invalid',userHandle:a.handle,userVerification:'required',attestation:'none',pubKeyCredParams:[{type:'public-key',alg:-7}]};
 }
 async finish(challenge,response){
  const h=await digest(challenge),row=await this.first('SELECT c.*,a.handle,a.epoch current_epoch FROM challenge c,account a WHERE c.hash=? AND a.id=1',h);
  if(!row||row.used||row.expires<=Date.now()||row.epoch!==row.current_epoch)throw Error('challenge');
  const stored=await this.first('SELECT * FROM credential WHERE id=? AND revoked=0 AND key_epoch=(SELECT key_epoch FROM account WHERE id=1)',response.id);
  const result=await validate(response,{kind:row.kind,challenge,rpId:'synthetic.invalid',origin:'https://synthetic.invalid',userHandle:row.handle},stored&&{...stored,key:JSON.parse(stored.key)});
  const now=Date.now(),raw=hexToken(),sh=await digest(raw);
  let condition=liveChallenge,args=[h,now],plans=[this.plan('UPDATE challenge SET used=1 WHERE hash=?',h)];
  if(row.kind==='create'){
   condition+=' AND '+(row.bootstrap?'EXISTS(SELECT 1 FROM account WHERE id=1 AND closed=0) AND (SELECT count(*) FROM credential WHERE revoked=0 AND key_epoch=(SELECT key_epoch FROM account WHERE id=1))<2':liveSession);
   if(!row.bootstrap)args.push(row.authority,now);
   plans.push(this.plan('INSERT INTO credential(id,key,count,key_epoch) SELECT ?,?,?,key_epoch FROM account WHERE id=1',result.id,JSON.stringify(result.key),result.count),this.plan(`UPDATE account SET closed=1 WHERE id=1 AND ${twoKeys}`));
  }else{
   condition+=` AND ${active} AND EXISTS(SELECT 1 FROM credential WHERE id=? AND count=? AND revoked=0 AND key_epoch=(SELECT key_epoch FROM account WHERE id=1))`;args.push(result.id,stored.count);
   const csrf=hexToken(),csrfHash=await digest(csrf);
   plans.push(this.plan('UPDATE credential SET count=? WHERE id=?',result.count,result.id),this.plan('INSERT INTO session SELECT ?,?,epoch,0 FROM account WHERE id=1',sh,now+300000),this.plan('INSERT INTO session_binding VALUES(?,?,?)',sh,csrfHash,result.id));
   this.issued={raw,hash:sh,csrf,csrfHash,credential:result.id,issued:now,expires:now+300000};
  }
  await this.atomic(condition,args,plans);return row.kind==='get'?raw:null;
 }
 async logout(raw,g){const h=await digest(raw);await this.atomic(liveSession+' AND EXISTS(SELECT 1 FROM session_binding b JOIN credential c ON c.id=b.credential_id JOIN account a ON a.id=1 WHERE b.hash=? AND b.csrf_hash=? AND b.credential_id=? AND c.revoked=0 AND c.key_epoch=a.key_epoch)',[h,Date.now(),h,g.csrf,g.credential],[this.plan('UPDATE session SET revoked=1 WHERE hash=?',h),this.event('logout',h)]);}
}
globalThis.fetch=async()=>{throw Error('outbound disabled');};
const MAX_REQUEST_BYTES=20000;
export async function readBoundedJSON(req){
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_REQUEST_BYTES)){await req.body?.cancel();throw Error('body bound');}
 const reader=req.body?.getReader();if(!reader)throw Error('body');
 const chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_REQUEST_BYTES)throw Error('body bound');chunks.push(value);}
 }catch(e){try{await reader.cancel();}catch{}throw e;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export default {async fetch(req,env){
 const s=new D1Passkeys(env.SYNTHETIC_PASSKEY_DB);let result,status=200;
 try{
  if(req.method!=='POST'||req.headers.get('content-type')!=='application/json')return new Response('unsupported',{status:415});
  const x=await readBoundedJSON(req);
  const path=new URL(req.url).pathname;
  if(path==='/finish'&&!/^[a-f0-9]{64}$/.test(env.SYNTHETIC_CONTROL_KEY||''))throw Error('control key unavailable');
  const known=['/begin','/finish','/session','/logout','/revoke-all','/revoke-credential','/control-options','/suspend'];
  if(known.includes(path)&&(new URL(req.url).origin!=='https://synthetic.invalid'||req.headers.get('origin')!=='https://synthetic.invalid'||![null,'same-origin'].includes(req.headers.get('sec-fetch-site'))))throw Error('origin');
  // B4B-1 has NO public enrollment/repair. Two-approver lifecycle is deferred,
  // not implemented as a weaker single-session route. Fixtures use offline calls.
  if(path==='/begin'&&x.kind==='create'||path==='/finish'&&x.response?.response?.attestationObject!==undefined)throw Error('offline enrollment only');
  let g;
  if(['/session','/logout','/revoke-all','/revoke-credential','/control-options','/suspend'].includes(path))g=await binding(req,x.session,env.SYNTHETIC_CONTROL_KEY,'https://synthetic.invalid');
  const scope=path==='/begin'?'get':path==='/finish'?'finish':null;
  if(scope)await s.admit(scope);
  switch(path){
   case '/begin':result=await s.begin(x.kind,x.authority);break;
   case '/finish':result=await s.finish(x.challenge,x.response);break;
   case '/session':await s.bound(x.session,g);result=true;break;
   case '/logout':await s.bound(x.session,g);await s.logout(x.session,g);result=true;break;
   case '/control-options':result=await s.controlOptions(x.session,g,x.action,x.id,env.SYNTHETIC_CONTROL_KEY);break;
   case '/suspend':await s.control(x.session,g,'suspend',null,x.ticket,x.proof,env.SYNTHETIC_CONTROL_KEY);result=true;break;
   case '/revoke-credential':await s.control(x.session,g,'revoke-credential',x.id,x.ticket,x.proof,env.SYNTHETIC_CONTROL_KEY);result=true;break;
   case '/revoke-all':await s.control(x.session,g,'revoke-all',null,x.ticket,x.proof,env.SYNTHETIC_CONTROL_KEY);result=true;break;
   default:return Response.json({result:null},{status:404});
  }
 }catch{status=400;result=null;s.issued=null;}
 const headers=new Headers({'cache-control':'no-store','x-content-type-options':'nosniff'});
 if(new URL(req.url).pathname==='/logout')for(const name of ['__Host-QY_CONSULTATION','__Host-QY_CONSULTATION_GATE'])headers.append('set-cookie',name+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
 if(s.issued){try{for(const c of await cookies(s.issued,env.SYNTHETIC_CONTROL_KEY,'https://synthetic.invalid'))headers.append('set-cookie',c);}catch{return Response.json({result:null},{status:503});}}
 return Response.json({result,csrfToken:s.issued?.csrf},{status,headers});
}};
