import fs from "node:fs";

const migration=
  fs.readFileSync(
    "database/migrate-v4.0-phase-e3-pos-hardening.sql",
    "utf8"
  );

const pos=
  fs.readFileSync(
    "functions/api/admin/pos.js",
    "utf8"
  );


const requiredMigration=[
  "pos_sale_executions",
  "request_key TEXT PRIMARY KEY",
  "request_fingerprint",
  "'Processing'",
  "'Completed'",
  "'Failed'"
];

for(const token of requiredMigration){

  if(!migration.includes(token)){
    throw new Error(
      `Missing E3 migration token: ${token}`
    );
  }
}


const requiredPos=[
  "request_id is required for POS sale idempotency",
  "request_fingerprint",
  "sha256Text",
  "loadExecution",
  "completedExecutionResult",
  "cleanupFailedOrder",
  "This POS request is already being processed",
  "request_id was already used for a different POS sale",
  "Course and membership POS sales require canonical customer identity",
  "await db.batch([",
  "CASE",
  "WHEN changes()=1",
  "execution_status='Completed'",
  "execution_status='Failed'",
  'action==="void"',
  "Paid POS sale cannot be voided directly"
];

for(const token of requiredPos){

  if(!pos.includes(token)){
    throw new Error(
      `Missing E3 POS token: ${token}`
    );
  }
}


if(
  !pos.includes(
    '["course","membership"]'
  )
){
  throw new Error(
    "Entitlement-product POS protection missing."
  );
}


if(
  !pos.includes(
    "stock_on_hand="
  ) ||
  !pos.includes(
    "stock_on_hand-?"
  )
){
  throw new Error(
    "Atomic POS stock deduction missing."
  );
}


console.log(
  "PASS — Phase E3 POS hardening regression guard."
);