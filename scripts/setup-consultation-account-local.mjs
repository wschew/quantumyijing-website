// Explicit LOCAL initialization/rotation only. No network, remote D1 or ADMIN_TOKEN.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,realpathSync,openSync,closeSync,lstatSync} from 'node:fs';
import {resolve,dirname,extname,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {newPasswordRecord} from '../functions/lib/consultation/auth-crypto.js';
export async function readLocalCredentialInput(stream) {
 const decoder=new TextDecoder('utf-8',{fatal:true});
 let text='',bytes=0;
 for await(const chunk of stream) {
  if(!(chunk instanceof Uint8Array)) throw Error('Byte input required');
  bytes+=chunk.byteLength;
  if(bytes>4096) throw Error('Input limit');
  text+=decoder.decode(chunk,{stream:true});
 }
 text+=decoder.decode();
 return JSON.parse(text);
}
function requirePrivateWindowsAccess(path) {
 if(process.platform!=='win32') throw Error('Windows local administration required');
 // Read ACLs only. Never change permissions; fail closed on unknown/broad grants.
 const script=`$ErrorActionPreference='Stop'
 $current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $acl=Get-Acl -LiteralPath $env:QY_LOCAL_AUTH_PATH
 $owner=([Security.Principal.NTAccount]$acl.Owner).Translate([Security.Principal.SecurityIdentifier]).Value
 $trusted=@($current,'S-1-5-18','S-1-5-32-544')
 if($trusted -notcontains $owner){exit 1}
 foreach($entry in $acl.Access){
  if($entry.AccessControlType -eq 'Allow'){
   $sid=$entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
   if($trusted -notcontains $sid){exit 1}
  }
 }
 exit 0`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{
  env:{...process.env,QY_LOCAL_AUTH_PATH:path},encoding:'utf8',timeout:15000
 });
 if(result.status!==0) throw Error('Private Windows access prerequisite not verified');
}
async function main() {
 try {
  const args=process.argv.slice(2);
  const initialize=args.length===3&&args[0]==='--local-db'&&args[2]==='--initialize';
  const rotate=args.length===6&&args[0]==='--local-db'&&args[2]==='--rotate'&&args[3]==='--expected-version'&&args[5]==='--authorized-local-recovery';
  const expectedVersion=rotate?Number(args[4]):null;
  if(!initialize&&!rotate) throw Error('Explicit local administrative arguments required');
  if(rotate&&(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)) throw Error('Expected version required');
  const path=resolve(args[1]);
  const parent=realpathSync(dirname(path));
  const worktree=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
  const temporary=realpathSync(tmpdir());
  const inside=root=>{const part=relative(root,parent);return part===''||(!part.startsWith('..')&&!isAbsolute(part));};
  if(!/^[A-Za-z0-9_-]{1,100}\.sqlite$/.test(basename(path))||extname(path)!=='.sqlite'||(!inside(worktree)&&!inside(temporary))) throw Error('Approved local path required');
  if(initialize&&existsSync(path)) throw Error('New local database required');
  if(rotate&&(!existsSync(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||realpathSync(path)!==path)) throw Error('Existing regular local database required');
  requirePrivateWindowsAccess(parent);
  if(rotate) requirePrivateWindowsAccess(path);
  const credentials=await readLocalCredentialInput(process.stdin);
  if(typeof credentials.username!=='string'||!/^[a-z0-9_-]{3,64}$/.test(credentials.username)||credentials.password!==credentials.confirmation) throw Error('Invalid setup input');
  const record=await newPasswordRecord(credentials.password);
  credentials.password=null;credentials.confirmation=null;
  if(initialize) closeSync(openSync(path,'wx',0o600));
  const db=new DatabaseSync(path);
  try {
   db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
   try {
    const time=Date.now();
    if(initialize) {
     db.exec(readFileSync(new URL('../database/migrate-c1-consultation-auth.sql',import.meta.url),'utf8'));
     db.prepare('INSERT INTO consultation_auth_account VALUES(1,?,1,?,?,?,?,1,?)').run(credentials.username,record.algorithm,record.iterations,record.salt,record.hash,time);
    } else {
     // In-place CAS, never replacement/import/reset. Transaction rollback preserves all data.
     const result=db.prepare(`UPDATE consultation_auth_account SET password_algorithm=?,password_iterations=?,password_salt=?,password_hash=?,password_version=password_version+1
      WHERE id=1 AND username=? AND password_version=?`).run(record.algorithm,record.iterations,record.salt,record.hash,credentials.username,expectedVersion);
     if(result.changes!==1) throw Error('Local recovery version/identity conflict');
     db.prepare('UPDATE consultation_auth_sessions SET revoked_at=? WHERE account_id=1 AND revoked_at IS NULL').run(time);
     db.prepare('UPDATE consultation_auth_control SET attempts=0,window_started_at=?,locked_until=0 WHERE id=1').run(time);
    }
    db.prepare('INSERT INTO consultation_auth_audit VALUES(?,1,NULL,?,?)').run(crypto.randomUUID(),initialize?'provisioned':'credential_rotated',time);
    db.exec('COMMIT');
   } catch {db.exec('ROLLBACK');throw Error('Local administrative transaction rejected');}
  } finally {db.close();}
  console.log(initialize?'LOCAL ACCOUNT PROVISIONED. No remote resources changed.':'LOCAL CREDENTIAL ROTATED IN PLACE. Existing records preserved.');
 } catch {
  console.error('Local administrative action failed. Credentials are not included in this error.');
  process.exitCode=1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();