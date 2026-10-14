// Local read-only verifier. No SQL executor, network or automatic adoption.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const root=new URL('../',import.meta.url);
export const canonical=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(typeof bytes==='string'?new TextEncoder().encode(bytes):bytes).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyManifest(manifest,read=p=>readFileSync(new URL(p,root)),inventory=readdirSync(new URL('database/',root)).filter(p=>/^migrate-c1-.*\.sql$/.test(p)).map(p=>'database/'+p)){
 if(manifest.version!==1||manifest.checksum!=='sha256-utf8-bomless-lf'||!Array.isArray(manifest.migrations))throw Error('Invalid migration manifest');
 const seen=new Set();
 for(const [i,m] of manifest.migrations.entries()){
  if(m.ordinal!==i+1||seen.has(m.path)||m.after!==(i?manifest.migrations[i-1].path:null)||!/^database\/migrate-c1-[a-z0-9-]+\.sql$/.test(m.path))throw Error('Migration order invalid');
  seen.add(m.path);
  if(sha(canonical(read(m.path)))!==m.sha256)throw Error('Migration checksum drift');
  const actual=objects(canonical(read(m.path)));
  if(JSON.stringify(actual)!==JSON.stringify(m.objects))throw Error('Migration object drift');
 }
 if(JSON.stringify([...seen].sort())!==JSON.stringify([...inventory].sort()))throw Error('Migration inventory mismatch');
 for(const p of [...manifest.prerequisites,...manifest.compatibilitySources])if(sha(canonical(read(p.path)))!==p.sha256)throw Error('Prerequisite drift');
 return manifest;
}
export function objects(sql){return [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+(?:IF NOT EXISTS\s+)?([a-zA-Z0-9_]+)/gi)].map(m=>({type:m[1].toLowerCase(),name:m[2]}));}
export function verifyApplied(manifest,rows,schema){
 if(!Array.isArray(rows)||rows.length>manifest.migrations.length)throw Error('Invalid ledger');
 for(const [i,r] of rows.entries()){
  const m=manifest.migrations[i];
  if(r.ordinal!==m.ordinal||r.path!==m.path||r.canonical_sha256!==m.sha256||!Number.isSafeInteger(r.applied_at)||r.applied_at<1)throw Error('Applied migration drift');
 }
 for(const m of manifest.migrations)for(const o of m.objects){
  const exists=schema.some(s=>s.name===o.name&&s.type===o.type);
  if(exists!==(m.ordinal<=rows.length))throw Error('Schema and ledger disagree; manual investigation required');
 }
 return {applied:rows.map(r=>r.path),pending:manifest.migrations.slice(rows.length).map(m=>m.path)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const manifest=JSON.parse(readFileSync(new URL('database/c1-migration-manifest.json',root),'utf8'));
 verifyManifest(manifest);
 console.log(JSON.stringify({ok:true,migrations:manifest.migrations.length,remoteOperations:0,mode:'files-only; database ledger not inspected'}));
}
