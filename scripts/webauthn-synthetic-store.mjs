// TEST ONLY. Standalone in-memory SQLite; no production migrations or bindings.
import {DatabaseSync} from 'node:sqlite';
import {b64,hash,validate} from './webauthn-synthetic-validation.mjs';
const token=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const digest=async s=>b64(await hash(new TextEncoder().encode(s)));
export class SyntheticPasskeys {
 constructor(clock=()=>Date.now(),verify=validate){
  this.verify=verify;
  this.clock=clock;this.rpId='synthetic.invalid';this.origin='https://synthetic.invalid';this.userHandle=token();
  this.db=new DatabaseSync(':memory:');
  this.db.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE account(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL);
   INSERT INTO account VALUES(1,1);
   CREATE TABLE credential(id TEXT PRIMARY KEY,key TEXT NOT NULL UNIQUE,count INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE challenge(hash TEXT PRIMARY KEY,kind TEXT NOT NULL,expires INTEGER NOT NULL,epoch INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,authority TEXT,bootstrap INTEGER NOT NULL);
   CREATE TABLE session(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL,epoch INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);`);
 }
 epoch(){return this.db.prepare('SELECT epoch FROM account').get().epoch;}
 active(){return this.db.prepare('SELECT * FROM credential WHERE revoked=0').all();}
 async begin(kind,authority){
  if(!['create','get'].includes(kind))throw Error('kind');
  // Initial two enrollments require a test-only bootstrap capability. After
  // bootstrap closes, adding/replacing a key requires a live UV session.
  if(kind==='create'&&(this.bootstrapClosed||authority!==this.bootstrap))await this.requireSession(authority);
  if(kind==='get'&&this.active().length<2)throw Error('two authenticators required');
  const bootstrap=kind==='create'&&!this.bootstrapClosed&&authority===this.bootstrap;
  const challenge=token();this.db.prepare('INSERT INTO challenge VALUES(?,?,?,?,0,?,?)').run(await digest(challenge),kind,this.clock()+60000,this.epoch(),kind==='create'?await digest(authority):null,bootstrap?1:0);
  return {kind,challenge,rpId:this.rpId,origin:this.origin,userHandle:this.userHandle,userVerification:'required',attestation:'none',pubKeyCredParams:[{type:'public-key',alg:-7}],excludeCredentials:this.active().map(c=>({id:c.id,type:'public-key'}))};
 }
 bootstrap=token();
 async finish(options,response){
  // Only the challenge is accepted from the caller; all policy is server-owned.
  const h=await digest(options.challenge),row=this.db.prepare('SELECT * FROM challenge WHERE hash=?').get(h);
  if(!row||row.used||row.expires<=this.clock()||row.epoch!==this.epoch())throw Error('challenge');
  const expected={kind:row.kind,challenge:options.challenge,rpId:this.rpId,origin:this.origin,userHandle:this.userHandle};
  const stored=this.db.prepare('SELECT * FROM credential WHERE id=? AND revoked=0').get(response.id);
  const result=await this.verify(response,expected,stored&&{...stored,key:JSON.parse(stored.key)});
  const session=token(),sessionHash=await digest(session);
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const consumed=this.db.prepare('UPDATE challenge SET used=1 WHERE hash=? AND used=0 AND expires>? AND epoch=(SELECT epoch FROM account)').run(h,this.clock());
   if(consumed.changes!==1)throw Error('replay');
   if(row.kind==='create'){
    if(row.bootstrap){if(this.bootstrapClosed||this.active().length>=2)throw Error('bootstrap closed');}
    else{const authority=this.db.prepare('SELECT * FROM session WHERE hash=?').get(row.authority);if(!authority||authority.revoked||authority.expires<=this.clock()||authority.epoch!==this.epoch()||this.active().length<2)throw Error('enrollment authority');}
    this.db.prepare('INSERT INTO credential(id,key,count) VALUES(?,?,?)').run(result.id,JSON.stringify(result.key),result.count);
   }
   else{
    if(this.active().length<2)throw Error('two authenticators required');
    const updated=this.db.prepare('UPDATE credential SET count=? WHERE id=? AND count=? AND revoked=0').run(result.count,result.id,stored.count);
    if(updated.changes!==1)throw Error('counter race');
    this.db.prepare('INSERT INTO session VALUES(?,?,?,0)').run(sessionHash,this.clock()+300000,this.epoch());
   }
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  if(this.active().length>=2)this.bootstrapClosed=true;
  return row.kind==='get'?session:null;
 }
 async requireSession(raw){
  if(typeof raw!=='string')throw Error('session');
  const s=this.db.prepare('SELECT * FROM session WHERE hash=?').get(await digest(raw));
  if(!s||s.revoked||s.expires<=this.clock()||s.epoch!==this.epoch()||this.active().length<2)throw Error('session');return s;
 }
 async logout(raw){await this.requireSession(raw);this.db.prepare('UPDATE session SET revoked=1 WHERE hash=?').run(await digest(raw));}
 async revokeCredential(raw,id){await this.requireSession(raw);this.recover(id);}
 // Explicit test-only owner recovery capability, intentionally no HTTP surface.
 recover(id){this.db.exec('BEGIN IMMEDIATE');try{if(id)this.db.prepare('UPDATE credential SET revoked=1 WHERE id=?').run(id);this.db.exec('UPDATE account SET epoch=epoch+1; UPDATE session SET revoked=1; UPDATE challenge SET used=1; COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 // Trusted local owner resets enrollment after losing keys; no password bypass.
 resetEnrollment(){this.recover();this.db.exec('UPDATE credential SET revoked=1');this.bootstrap=token();this.bootstrapClosed=false;return this.bootstrap;}
 close(){this.db.close();}
}
