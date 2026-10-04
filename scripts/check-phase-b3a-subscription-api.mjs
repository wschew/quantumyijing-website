import fs from "node:fs";

const file =
  "functions/api/admin/subscriptions.js";

if (!fs.existsSync(file)) {
  throw new Error(`Missing ${file}`);
}

const src =
  fs.readFileSync(file,"utf8");

const required = [
  "create-plan",
  "cancel-at-period-end",
  "subscription_plans",
  "subscriptions",
  "subscription_events",
  "subscription_orders",
  "membership_id",
  "plan_id",
  "customer_id",
  "auto_renew",
  "cancel_at_period_end"
];

for (const token of required) {
  if (!src.includes(token)) {
    throw new Error(`Missing required subscription token: ${token}`);
  }
}

const forbiddenWrites = [
  /\bINSERT\s+INTO\s+orders\b/i,
  /\bUPDATE\s+orders\b/i,
  /\bDELETE\s+FROM\s+orders\b/i,

  /\bINSERT\s+INTO\s+payments\b/i,
  /\bUPDATE\s+payments\b/i,
  /\bDELETE\s+FROM\s+payments\b/i,

  /\bINSERT\s+INTO\s+memberships\b/i,
  /\bUPDATE\s+memberships\b/i,
  /\bDELETE\s+FROM\s+memberships\b/i,

  /\bINSERT\s+INTO\s+membership_events\b/i,
  /\bUPDATE\s+membership_events\b/i,
  /\bDELETE\s+FROM\s+membership_events\b/i
];

for (const rx of forbiddenWrites) {
  if (rx.test(src)) {
    throw new Error(
      `Phase B3A must not mutate Phase A/financial tables: ${rx}`
    );
  }
}

if (!src.includes("Only Manual plans are supported")) {
  throw new Error(
    "Manual-renewal safety gate missing."
  );
}

if (!src.includes("Membership does not belong to the supplied customer")) {
  throw new Error(
    "Customer/membership ownership guard missing."
  );
}

if (!src.includes("Subscription plan product does not match membership product")) {
  throw new Error(
    "Product compatibility guard missing."
  );
}

console.log(
  "PASS — Phase B3A subscription API regression guard."
);