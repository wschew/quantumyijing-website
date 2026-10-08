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

  /\bINSERT\s+INTO\s+order_items\b/i,
  /\bUPDATE\s+order_items\b/i,
  /\bDELETE\s+FROM\s+order_items\b/i,
  /\bINSERT\s+INTO\s+memberships\b/i,
  /\bDELETE\s+FROM\s+memberships\b/i,
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

// Membership extension/event insertion is permitted only inside manual renewal.
const renewalStart=src.indexOf("async function renewSubscription(");
const renewalEnd=src.indexOf("async function scheduleCancel(",renewalStart);
const outsideRenewal=src.slice(0,renewalStart)+src.slice(renewalEnd);
if(renewalStart<0 || renewalEnd<0 || /\bUPDATE\s+memberships\b|\bINSERT\s+INTO\s+membership_events\b/i.test(outsideRenewal)){
  throw new Error("Entitlement mutation must remain confined to manual renewal.");
}
const renewal=src.slice(renewalStart,renewalEnd);
if((renewal.match(/\bUPDATE\s+memberships\b/gi)||[]).length!==1 ||
   !/UPDATE memberships\s+SET\s+ends_at=\?,\s+updated_at=CURRENT_TIMESTAMP\s+WHERE id=\?/i.test(renewal)){
  throw new Error("Only the existing membership end-date update is permitted.");
}
for(const token of ["validateRenewalOrder(db,order,subscription.customer_id)","findRenewalCompletion","INSERT INTO subscription_renewal_executions"]){
  if(!src.includes(token)) throw new Error(`Renewal hardening guard missing: ${token}`);
}
const preview=src.slice(src.indexOf("async function previewRenewalA6E("),src.indexOf("export async function onRequestGet"));
if(!preview.includes("validateRenewalOrder(db,order,subscription.customer_id)") || /\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/i.test(preview)){
  throw new Error("Renewal preview must validate evidence and remain read-only.");
}
for(const file of ["functions/lib/subscription-renewal-validation.js","functions/lib/subscription-renewal-completion.js"]){
  const helper=fs.readFileSync(file,"utf8");
  if(/\b(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE)\b/i.test(helper)) throw new Error(`Helper must remain read-only: ${file}`);
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

// Both execution paths must assert the captured snapshot inside the ledger
// transaction, and only the deliberate assertion may trigger bounded retries.
for(const file of ['functions/api/admin/subscriptions.js','functions/api/admin/subscription-renewal.js']){
 const code=fs.readFileSync(file,'utf8');
 for(const token of ['renewalSnapshotGuard','CASE WHEN ${guard.sql} THEN ? ELSE NULL END',
   '...guard.params','isRenewalSnapshotConflict','RENEWAL_MAX_ATTEMPTS','findRenewalCompletion']){
   if(!code.includes(token)) throw new Error(`Concurrency guard missing in ${file}: ${token}`);
 }
}

// Preserve financial/customer table protection, including destructive DDL and REPLACE.
for(const file of ['functions/api/admin/subscriptions.js','functions/api/admin/subscription-renewal.js',
 'functions/lib/subscription-renewal-validation.js','functions/lib/subscription-renewal-completion.js']){
 const code=fs.readFileSync(file,'utf8');
 const financialMutation=/\b(?:INSERT(?: OR \w+)? INTO|REPLACE INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE)\s+(?:orders|order_items|payments|receipts|payment_verification_events|customers|products)\b/i;
 if(financialMutation.test(code)) throw new Error(`Frozen table mutation detected: ${file}`);
}

// Lifecycle decisions must use business snapshots and transaction-local row
// counts. Entitlement mutation remains confined to renewal above.
const automationFile='functions/api/admin/subscription-lifecycle-automation.js';
const lifecycleHelper='functions/lib/subscription-lifecycle-concurrency.js';
const lifecycleCode=fs.readFileSync(automationFile,'utf8');
const helperCode=fs.readFileSync(lifecycleHelper,'utf8');
for(const code of [src.slice(src.indexOf('async function changeStatus('),renewalStart),
  src.slice(renewalEnd,src.indexOf('async function previewRenewalA6E(')),lifecycleCode]){
  for(const token of ['lifecycleSnapshotGuard','WHERE ${guard.sql}','...guard.params','WHERE changes()=1','lifecycleUpdateChanged']){
    if(!code.includes(token))throw new Error(`Lifecycle concurrency protection missing: ${token}`);
  }
}
if(!src.includes('Subscription state changed. Refresh before retrying this lifecycle action.')){
  throw new Error('Stale administrative operations must require explicit refresh.');
}
for(const token of ['current_period_end','grace_ends_at','cancel_at_period_end','cancelled_at','paused_at','expired_at',' IS ?']){
  if(!helperCode.includes(token))throw new Error(`Lifecycle snapshot field/predicate missing: ${token}`);
}
if(/\b(?:INSERT(?: OR \w+)? INTO|REPLACE INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE)\b/i.test(helperCode)){
  throw new Error('Lifecycle helper must only build read-only predicates.');
}
for(const code of [lifecycleCode,helperCode]){
  const frozenMutation=/\b(?:INSERT(?: OR \w+)? INTO|REPLACE INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE)\s+(?:orders|order_items|payments|receipts|payment_verification_events|customers|products|memberships|membership_events)\b/i;
  if(frozenMutation.test(code))throw new Error('Lifecycle implementation must not mutate financial or entitlement tables.');
}

// The automation endpoint may write only subscription lifecycle state/audit.
// This also protects frozen tables beyond the named financial fixtures above.
for(const match of lifecycleCode.matchAll(/\b(?:INSERT(?: OR \w+)? INTO|REPLACE INTO|UPDATE|DELETE FROM|ALTER TABLE|DROP TABLE)\s+(\w+)/gi)){
  if(!['subscriptions','subscription_events'].includes(match[1].toLowerCase())){
    throw new Error(`Unexpected lifecycle write target: ${match[1]}`);
  }
}

console.log(
  "PASS — Phase B3A subscription API regression guard."
);