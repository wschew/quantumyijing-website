import fs from "node:fs";

const renewalFile =
  "functions/api/admin/subscription-renewal.js";

const provisionFile =
  "functions/api/admin/membership-provision.js";

for (const file of [
  renewalFile,
  provisionFile
]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}`);
  }
}

const renewal =
  fs.readFileSync(
    renewalFile,
    "utf8"
  );

const provision =
  fs.readFileSync(
    provisionFile,
    "utf8"
  );


const requiredRenewalTokens = [
  "processVerifiedSubscriptionRenewal",
  "subscription_orders",
  "order_type",
  '"Renewal"',
  "validateRenewalOrder",
  "UPDATE memberships",
  "UPDATE subscriptions",
  "UPDATE subscription_orders",
  "INSERT INTO membership_events",
  "INSERT INTO subscription_events",
  "RenewalOrder:",
  "findRenewalCompletion",
  "new_membership_end"
];

for (const token of requiredRenewalTokens) {
  if (!renewal.includes(token)) {
    throw new Error(
      `Missing B3B renewal token: ${token}`
    );
  }
}


const validation=fs.readFileSync("functions/lib/subscription-renewal-validation.js","utf8");
for(const token of ["verification_status='Verified'","customer_enquiry_links","NULLIF(gross_amount,0)","paid + 0.005"]){
  if(!validation.includes(token)) throw new Error(`Shared payment/ownership check missing: ${token}`);
}

const forbiddenFinancialWrites = [
  /\bUPDATE\s+orders\b/i,
  /\bINSERT\s+INTO\s+orders\b/i,
  /\bDELETE\s+FROM\s+orders\b/i,

  /\bUPDATE\s+payments\b/i,
  /\bINSERT\s+INTO\s+payments\b/i,
  /\bDELETE\s+FROM\s+payments\b/i,

  /\bUPDATE\s+order_items\b/i,
  /\bINSERT\s+INTO\s+order_items\b/i,
  /\bDELETE\s+FROM\s+order_items\b/i
];

for (const rx of forbiddenFinancialWrites) {
  if (rx.test(renewal + fs.readFileSync("functions/lib/subscription-renewal-validation.js","utf8") + fs.readFileSync("functions/lib/subscription-renewal-completion.js","utf8"))) {
    throw new Error(
      `Renewal engine must not mutate financial tables: ${rx}`
    );
  }
}


if (
  !provision.includes(
    "processVerifiedSubscriptionRenewal"
  )
) {
  throw new Error(
    "Membership provisioning integration missing."
  );
}

if (
  !provision.includes(
    'provisioning_type:"subscription_renewal"'
  )
) {
  throw new Error(
    "Renewal short-circuit missing."
  );
}


const importCount =
  (
    provision.match(
      /subscription-renewal\.js/g
    ) || []
  ).length;

if (importCount !== 1) {
  throw new Error(
    `Expected one renewal import; found ${importCount}`
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

console.log(
  "PASS — Phase B3B verified renewal regression guard."
);