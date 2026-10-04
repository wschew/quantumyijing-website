import fs from "node:fs";

const file =
  "database/migrate-v4.0-subscription-foundation.sql";

if (!fs.existsSync(file)) {
  throw new Error(`Missing ${file}`);
}

const sql =
  fs.readFileSync(file, "utf8");

const requiredTables = [
  "subscription_plans",
  "subscriptions",
  "subscription_orders",
  "subscription_events"
];

for (const table of requiredTables) {
  if (!new RegExp(
    `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`,
    "i"
  ).test(sql)) {
    throw new Error(`Missing CREATE TABLE for ${table}`);
  }
}

const protectedTables = [
  "customers",
  "memberships",
  "membership_events",
  "products",
  "orders",
  "order_items",
  "payments"
];

for (const table of protectedTables) {
  const dangerous = new RegExp(
    `\\b(?:ALTER\\s+TABLE|DROP\\s+TABLE|DELETE\\s+FROM|UPDATE|INSERT\\s+INTO)\\s+${table}\\b`,
    "i"
  );

  if (dangerous.test(sql)) {
    throw new Error(
      `Protected table mutation detected: ${table}`
    );
  }
}

if (!sql.includes("REFERENCES memberships(id)")) {
  throw new Error(
    "subscriptions must reference memberships"
  );
}

if (!sql.includes("REFERENCES orders(id)")) {
  throw new Error(
    "subscription_orders must reference orders"
  );
}

if (!sql.includes("REFERENCES products(id)")) {
  throw new Error(
    "subscription_plans must reference products"
  );
}

if (!sql.includes("'Manual'")) {
  throw new Error(
    "Manual renewal mode missing"
  );
}

if (!sql.includes("auto_renew")) {
  throw new Error(
    "auto_renew field missing"
  );
}

console.log(
  "PASS — Phase B2 subscription schema migration guard."
);