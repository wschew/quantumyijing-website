// Review/local-test library only. No database client, CLI or remote executor.
import {readFileSync} from 'node:fs';
import {root,canonical,sha,verifyManifest} from './consultation-migration-verifier.mjs';
import {compatibilityDDL} from './consultation-schema-compatibility.mjs';
import {requirePreviewWorkflowConfiguration} from '../functions/lib/consultation/workflow-runtime.js';
import {PREVIEW_ORIGIN,PAGES_PROJECT,PREVIEW_BRANCH} from '../functions/lib/consultation/pages-boundary.js';
// Lex quoted strings/identifiers and comments before considering semicolons.
// CASE...END inside a trigger must not terminate BEGIN...END.
export function splitMigrationSQL(sql){
 const tokens=sql.matchAll(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:[^\]])*\]|[A-Za-z_][A-Za-z_0-9]*|;|[^]/g);
 let start=0,words=[],stack=[],trigger=false;const statements=[];
 for(const match of tokens){const token=match[0],word=token.toUpperCase();
  if(/^(?:--|\/\*)/.test(token))continue;
  if(/^[A-Za-z_]/.test(token)){
   words.push(word);if(words.slice(0,4).includes('TRIGGER')&&words[0]==='CREATE')trigger=true;
   if(trigger&&['BEGIN','CASE'].includes(word))stack.push(word);
   if(trigger&&word==='END'){if(!stack.length)throw Error('Unbalanced migration');stack.pop();}
  }
  if(token===';'&&(!trigger||stack.length===0)){
   const statement=sql.slice(start,match.index+1).trim();if(words.length)statements.push(statement);
   start=match.index+1;words=[];trigger=false;
  }
 }
 if(stack.length||sql.slice(start).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,'').trim())throw Error('Incomplete migration');
 return statements;
}
export function reviewedMigrationUnits(attestation){
 requirePreviewWorkflowConfiguration({...attestation,environment:'preview',enabled:'true'});
 if(attestation.project!==PAGES_PROJECT||attestation.databaseName!=='qy-c1-consultation-preview-db'||
  attestation.branch!==PREVIEW_BRANCH||attestation.origin!==PREVIEW_ORIGIN||attestation.slot!=='preview'||
  attestation.freshDatabase!==true||attestation.ownerApprovedHostname!==true||attestation.independentlyVerifiedUuid!==true)
  throw Error('Independent Preview attestation required');
 const manifest=verifyManifest(JSON.parse(readFileSync(new URL('database/c1-migration-manifest.json',root),'utf8')));
 const projection=compatibilityDDL();
 const prerequisite=projection.statements.join('\n')+'\n'+canonical(readFileSync(new URL(manifest.prerequisites[0].path,root)));
 return {manifest,prerequisiteSha256:sha(prerequisite),provenance:projection.provenance,units:[
  {ordinal:0,statements:splitMigrationSQL(prerequisite)},
  ...manifest.migrations.map(m=>({ordinal:m.ordinal,path:m.path,sha256:m.sha256,statements:splitMigrationSQL(canonical(readFileSync(new URL(m.path,root)))),ledger:{sql:'INSERT INTO consultation_migration_ledger(ordinal,path,canonical_sha256,applied_at) VALUES(?,?,?,?)',values:[m.ordinal,m.path,m.sha256]}}))
 ]};
}
