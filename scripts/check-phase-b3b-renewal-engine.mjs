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
  "verification_status='Verified'",
  "UPDATE memberships",
  "UPDATE subscriptions",
  "UPDATE subscription_orders",
  "INSERT INTO membership_events",
  "INSERT INTO subscription_events",
  "RenewalOrder:",
  "alreadyProcessed",
  "new_membership_end"
];

for (const token of requiredRenewalTokens) {
  if (!renewal.includes(token)) {
    throw new Error(
      `Missing B3B renewal token: ${token}`
    );
  }
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
  if (rx.test(renewal)) {
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


console.log(
  "PASS — Phase B3B verified renewal regression guard."
);