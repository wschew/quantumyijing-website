// Exact repository DDL projections, not a claim about current deployed schema.
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {root,canonical,sha} from './consultation-migration-verifier.mjs';
export const sources=Object.freeze([
 ['database/schema.sql',['enquiries']],
 ['database/migrate-v2.7.sql',['products','orders','order_items','payments']],
 ['database/migrate-v4.0-customer-membership-foundation.sql',['customers','customer_identifiers','customer_enquiry_links']],
 ['migrate-v3.4.0-coach-foundation.sql',['coaches']]
]);
export function compatibilityDDL(){
 const statements=[],provenance=[];
 for(const [path,tables] of sources){
  const sql=canonical(readFileSync(new URL(path,root)));
  provenance.push({path,sha256:sha(sql)});
  for(const table of tables){
   const pattern=new RegExp('CREATE TABLE IF NOT EXISTS '+table+' \\([\\s\\S]*?\\n\\);','i');
   const match=sql.match(pattern);if(!match)throw Error('Repository schema contract missing: '+table);
   statements.push(match[0]);
  }
 }
 for(const path of ['database/migrate-v3.1.sql','migrate-v3.3.15.sql']){
  const sql=canonical(readFileSync(new URL(path,root)));provenance.push({path,sha256:sha(sql)});
  statements.push(...sql.matchAll(/ALTER TABLE payments ADD COLUMN[^;]+;/g).map(m=>m[0]));
 }
 return {statements,provenance};
}
export function createCompatibilityFixture(){
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON');for(const sql of compatibilityDDL().statements)db.exec(sql);
  db.exec("INSERT INTO customers(id,customer_reference,display_name,email,status) VALUES(1,'SYNTHETIC-001','Synthetic Customer','customer@example.invalid','Active'); INSERT INTO products(id,sku,slug,product_type,name_en,status,price,currency) VALUES(1,'CONSULT-BAZI','synthetic-bazi','consultation','Synthetic Bazi','Draft',1300,'MYR'); INSERT INTO coaches(id,coach_code,full_name,email,status) VALUES(1,'SYNTHETIC-COACH','Synthetic Practitioner','practitioner@example.invalid','Approved');");
  return db;
 }catch(e){db.close();throw e;}
}
