// Offline SQLite administration only. No SQL/credential export and no remote client.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readLocalCredentialInput} from './setup-consultation-account-local.mjs';
import {newPasswordRecord} from '../functions/lib/consultation/auth-crypto.js';
import {requirePreviewWorkflowConfiguration} from '../functions/lib/consultation/workflow-runtime.js';
import {root,verifyManifest,verifyApplied,sha} from './consultation-migration-verifier.mjs';
export async function provisionOffline(db,input){
 const manifest=verifyManifest(JSON.parse(readFileSync(new URL('database/c1-migration-manifest.json',root),'utf8')));
 const config=input?.config;
 requirePreviewWorkflowConfiguration({...config,enabled:'true'});
 if(config.syntheticOnly!==true||config.manifestSha256!==sha(JSON.stringify(manifest))||
  !/^[a-z0-9][a-z0-9-]{2,62}$/.test(config.isolatedPreviewProject)||config.isolatedPreviewProject==='quantumyijing-website'||
  ![config.isolatedPreviewProject+'.pages.dev'].some(h=>new URL(config.origin).hostname===h||new URL(config.origin).hostname.endsWith('.'+h)))throw Error('Offline identity rejected');
 if(!/^[a-z0-9_-]{3,64}$/.test(input.username)||input.password!==input.confirmation||!['initialize','rotate'].includes(input.action))throw Error('Offline credential input rejected');
 const record=await newPasswordRecord(input.password);input.password=null;input.confirmation=null;
 db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
 try{
  const marker=db.prepare('SELECT * FROM consultation_preview_environment WHERE id=1').get();
  if(!marker||marker.enabled!==0||marker.synthetic_only!==1||marker.database_id!==config.databaseId||marker.origin!==config.origin||marker.manifest_sha256!==config.manifestSha256)throw Error('Offline marker mismatch');
  const applied=verifyApplied(manifest,db.prepare('SELECT * FROM consultation_migration_ledger ORDER BY ordinal').all(),db.prepare('SELECT name,type FROM sqlite_master').all());
  if(applied.pending.length)throw Error('Incomplete offline schema');
  if(db.prepare("SELECT COUNT(*) n FROM customers c LEFT JOIN consultation_preview_synthetic_customers s ON s.customer_id=c.id WHERE s.customer_id IS NULL OR c.customer_reference NOT GLOB 'SYNTHETIC-*'").get().n)throw Error('Non synthetic inventory');
  const time=Date.now();
  if(input.action==='initialize'){
   if(input.expectedVersion!==undefined)throw Error('Unexpected recovery version');
   db.prepare('INSERT INTO consultation_auth_account VALUES(1,?,1,?,?,?,?,1,?)').run(input.username,record.algorithm,record.iterations,record.salt,record.hash,time);
  }else{
   if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw Error('Recovery version required');
   const result=db.prepare('UPDATE consultation_auth_account SET password_algorithm=?,password_iterations=?,password_salt=?,password_hash=?,password_version=password_version+1 WHERE id=1 AND username=? AND password_version=?').run(record.algorithm,record.iterations,record.salt,record.hash,input.username,input.expectedVersion);
   if(result.changes!==1)throw Error('Recovery conflict');
   db.prepare('UPDATE consultation_auth_sessions SET revoked_at=? WHERE account_id=1 AND revoked_at IS NULL').run(time);
   db.prepare('UPDATE consultation_auth_control SET attempts=0,window_started_at=?,locked_until=0 WHERE id=1').run(time);
  }
  db.prepare('INSERT INTO consultation_auth_audit VALUES(?,1,NULL,?,?)').run(crypto.randomUUID(),input.action==='initialize'?'provisioned':'credential_rotated',time);
  db.exec('COMMIT');
 }catch{db.exec('ROLLBACK');throw Error('Offline provisioning rejected');}
}
export function requirePrivateOfflineFile(path){
 if(process.platform!=='win32')throw Error('Private Windows offline administration required');
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(path)!==path||realpathSync(dirname(path))!==dirname(path)||!path.endsWith('.sqlite'))throw Error('Regular offline database required');
 const script=`$ErrorActionPreference='Stop'
 $current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $trusted=@($current,'S-1-5-18','S-1-5-32-544')
 foreach($path in @($env:QY_OFFLINE_DB,(Split-Path -LiteralPath $env:QY_OFFLINE_DB))){
  $acl=Get-Acl -LiteralPath $path
  if($trusted -notcontains ([Security.Principal.NTAccount]$acl.Owner).Translate([Security.Principal.SecurityIdentifier]).Value){exit 1}
  foreach($entry in $acl.Access){if($entry.AccessControlType -eq 'Allow' -and $trusted -notcontains $entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value){exit 1}}
 }
 exit 0`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:{...process.env,QY_OFFLINE_DB:path},windowsHide:true,stdio:'ignore',timeout:15000});
 if(result.status!==0)throw Error('Private offline ACL not verified');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4||process.argv[2]!=='--offline-db')throw Error();
  const path=resolve(process.argv[3]);requirePrivateOfflineFile(path);
  const input=await readLocalCredentialInput(process.stdin),db=new DatabaseSync(path);
  try{await provisionOffline(db,input);}finally{db.close();}
  console.log('OFFLINE account updated. No remote operation or credential export.');
 }catch{console.error('Offline administration rejected. No credential diagnostics.');process.exitCode=1;}
}
