import fs from "node:fs";

const migrationFile =
  "database/migrate-v4.0-phase-d-financial-documents-bank-transfer.sql";

const apiFile =
  "functions/api/admin/financial-documents.js";

for(const file of [
  migrationFile,
  apiFile
]){
  if(!fs.existsSync(file)){
    throw new Error(
      `Missing Phase D file: ${file}`
    );
  }
}

const migration=
  fs.readFileSync(
    migrationFile,
    "utf8"
  );

const api=
  fs.readFileSync(
    apiFile,
    "utf8"
  );


const migrationTokens=[
  "CREATE TABLE IF NOT EXISTS invoices",
  "CREATE TABLE IF NOT EXISTS invoice_items",
  "CREATE TABLE IF NOT EXISTS receipt_items",
  "CREATE TABLE IF NOT EXISTS bank_transfer_submissions",
  "CREATE TABLE IF NOT EXISTS bank_transfer_events",
  "REFERENCES receipts(id)",
  "REFERENCES orders(id)",
  "REFERENCES payments(id)"
];

for(const token of migrationTokens){
  if(!migration.includes(token)){
    throw new Error(
      `Missing Phase D migration token: ${token}`
    );
  }
}


const forbiddenMigration=[
  /\bALTER\s+TABLE\s+orders\b/i,
  /\bALTER\s+TABLE\s+payments\b/i,
  /\bALTER\s+TABLE\s+receipts\b/i,
  /\bDROP\s+TABLE\b/i
];

for(const rx of forbiddenMigration){
  if(rx.test(migration)){
    throw new Error(
      `Forbidden Phase D migration operation: ${rx}`
    );
  }
}


const requiredApi=[
  "createInvoice",
  "submitBankTransfer",
  "invoice_items",
  "bank_transfer_submissions",
  "bank_transfer_events",
  "verification_status='Verified'",
  '"create-invoice"',
  '"submit-bank-transfer"'
];

for(const token of requiredApi){
  if(!api.includes(token)){
    throw new Error(
      `Missing Phase D API token: ${token}`
    );
  }
}


const forbiddenApiWrites=[
  /\bUPDATE\s+orders\b/i,
  /\bINSERT\s+INTO\s+orders\b/i,
  /\bDELETE\s+FROM\s+orders\b/i,

  /\bUPDATE\s+payments\b/i,
  /\bINSERT\s+INTO\s+payments\b/i,
  /\bDELETE\s+FROM\s+payments\b/i,

  /\bUPDATE\s+receipts\b/i,
  /\bINSERT\s+INTO\s+receipts\b/i,
  /\bDELETE\s+FROM\s+receipts\b/i,

  /\bUPDATE\s+memberships\b/i,
  /\bUPDATE\s+subscriptions\b/i,
  /\bUPDATE\s+course_entitlements\b/i
];

for(const rx of forbiddenApiWrites){
  if(rx.test(api)){
    throw new Error(
      `D1+D2 API must not mutate protected lifecycle tables: ${rx}`
    );
  }
}

console.log(
  "PASS — Phase D1+D2 financial document foundation regression guard."
);