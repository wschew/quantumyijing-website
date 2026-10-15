// LOCAL SYNTHETIC ONLY. No active C1 imports, remote bindings or recovery routes.
import {b64,hash,validate} from './webauthn-synthetic-validation.mjs';
const token=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const digest=async s=>{if(typeof s!=='string'||s.length>5500)throw Error('token');return b64(await hash(new TextEncoder().encode(s)));};
const active='(SELECT count(*) FROM (SELECT 1 FROM credential WHERE revoked=0 AND key_epoch=(SELECT key_epoch FROM account WHERE id=1) LIMIT 2))=2';
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
  const limit={get:60,create:20,finish:120,control:30,session:120}[scope];
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
  await this.atomic('1',[],[this.plan('UPDATE account SET epoch=epoch+1,key_epoch=key_epoch+1,closed=0,bootstrap_hash=? WHERE id=1',bootstrapHash),this.event('owner-reset')]);
 }
 async revokeCredential(raw,id){const h=await digest(raw);await this.atomic(liveSession+' AND EXISTS(SELECT 1 FROM credential WHERE id=? AND revoked=0 AND key_epoch=(SELECT key_epoch FROM account WHERE id=1))',[h,Date.now(),id],[this.plan('UPDATE credential SET revoked=1 WHERE id=? AND key_epoch=(SELECT key_epoch FROM account WHERE id=1)',id),this.plan('UPDATE account SET epoch=epoch+1 WHERE id=1'),this.event('credential-revoked',id)]);}
 async requireSession(raw){const h=await digest(raw);if(!(await this.first(`SELECT 1 ok WHERE ${liveSession}`,h,Date.now())))throw Error('session');return h;}
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
  const now=Date.now(),raw=token(),sh=await digest(raw);
  let condition=liveChallenge,args=[h,now],plans=[this.plan('UPDATE challenge SET used=1 WHERE hash=?',h)];
  if(row.kind==='create'){
   condition+=' AND '+(row.bootstrap?'EXISTS(SELECT 1 FROM account WHERE id=1 AND closed=0) AND (SELECT count(*) FROM credential WHERE revoked=0 AND key_epoch=(SELECT key_epoch FROM account WHERE id=1))<2':liveSession);
   if(!row.bootstrap)args.push(row.authority,now);
   plans.push(this.plan('INSERT INTO credential(id,key,count,key_epoch) SELECT ?,?,?,key_epoch FROM account WHERE id=1',result.id,JSON.stringify(result.key),result.count),this.plan(`UPDATE account SET closed=1 WHERE id=1 AND ${active}`));
  }else{
   condition+=` AND ${active} AND EXISTS(SELECT 1 FROM credential WHERE id=? AND count=? AND revoked=0 AND key_epoch=(SELECT key_epoch FROM account WHERE id=1))`;args.push(result.id,stored.count);
   plans.push(this.plan('UPDATE credential SET count=? WHERE id=?',result.count,result.id),this.plan('INSERT INTO session SELECT ?,?,epoch,0 FROM account WHERE id=1',sh,now+300000));
  }
  await this.atomic(condition,args,plans);return row.kind==='get'?raw:null;
 }
 async logout(raw){const h=await digest(raw);await this.atomic(liveSession,[h,Date.now()],[this.plan('UPDATE session SET revoked=1 WHERE hash=?',h),this.event('logout',h)]);}
 async revokeAll(raw){const h=await digest(raw);await this.atomic(liveSession,[h,Date.now()],[this.plan('UPDATE account SET epoch=epoch+1 WHERE id=1'),this.event('revoke-all',h)]);}
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
  const scope=path==='/begin'?(x.kind==='create'?'create':'get'):path==='/finish'?'finish':path==='/session'?'session':['/logout','/revoke-all','/revoke-credential'].includes(path)?'control':null;
  if(scope)await s.admit(scope);
  switch(path){
   case '/begin':result=await s.begin(x.kind,x.authority);break;
   case '/finish':result=await s.finish(x.challenge,x.response);break;
   case '/session':await s.requireSession(x.session);result=true;break;
   case '/logout':await s.logout(x.session);result=true;break;
   case '/revoke-credential':await s.revokeCredential(x.session,x.id);result=true;break;
   case '/revoke-all':await s.revokeAll(x.session);result=true;break;
   default:return Response.json({result:null},{status:404});
  }
 }catch{status=400;result=null;}
 return Response.json({result},{status});
}};
