import fs from "node:fs";

const migration=
  fs.readFileSync(
    "database/migrate-v4.0-phase-e-pos-logistics.sql",
    "utf8"
  );

const inventory=
  fs.readFileSync(
    "functions/api/admin/inventory.js",
    "utf8"
  );

const pos=
  fs.readFileSync(
    "functions/api/admin/pos.js",
    "utf8"
  );

const fulfilment=
  fs.readFileSync(
    "functions/api/admin/fulfilments.js",
    "utf8"
  );


const tables=[
  "product_fulfilment_settings",
  "inventory_balances",
  "inventory_movements",
  "order_fulfilments",
  "fulfilment_items",
  "fulfilment_events",
  "pos_sales"
];

for(const table of tables){

  if(!migration.includes(table)){
    throw new Error(
      `Missing Phase E table: ${table}`
    );
  }
}


const forbiddenMigration=[
  /\bALTER\s+TABLE\s+orders\b/i,
  /\bALTER\s+TABLE\s+payments\b/i,
  /\bALTER\s+TABLE\s+invoices\b/i,
  /\bALTER\s+TABLE\s+receipts\b/i,
  /\bALTER\s+TABLE\s+products\b/i,
  /\bDROP\s+TABLE\b/i
];

for(const rx of forbiddenMigration){

  if(rx.test(migration)){
    throw new Error(
      `Forbidden Phase E migration operation: ${rx}`
    );
  }
}


const posTokens=[
  "INSERT INTO orders",
  "INSERT INTO order_items",
  "INSERT INTO payments",
  "INSERT INTO payment_verification_events",
  "INSERT INTO invoices",
  "INSERT INTO receipts",
  "INSERT INTO pos_sales",
  "POS Sale",
  "stock_on_hand=stock_on_hand-?",
  "provisionMembershipForVerifiedOrder"
];

for(const token of posTokens){

  if(!pos.includes(token)){
    throw new Error(
      `Missing POS integration token: ${token}`
    );
  }
}


if(
  !fulfilment.includes(
    "Invalid fulfilment transition"
  )
){
  throw new Error(
    "Fulfilment transition guard missing."
  );
}


if(
  !inventory.includes(
    "Insufficient stock"
  )
){
  throw new Error(
    "Inventory negative-stock protection missing."
  );
}


console.log(
  "PASS — Phase E1+E2 POS/logistics regression guard."
);