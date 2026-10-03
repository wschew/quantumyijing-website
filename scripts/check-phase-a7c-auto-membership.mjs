import fs from "node:fs";

const provision =
  fs.readFileSync(
    "functions/api/admin/membership-provision.js",
    "utf8"
  );

const verify =
  fs.readFileSync(
    "functions/api/admin/payment-verify.js",
    "utf8"
  );

const doku =
  fs.readFileSync(
    "functions/api/payment/doku/_shared.js",
    "utf8"
  );

function requirePattern(
  name,
  text,
  regex
) {
  if (!regex.test(text)) {
    console.error(`FAIL — ${name}`);
    process.exit(1);
  }

  console.log(`PASS — ${name}`);
}


/* =========================================================
   MEMBERSHIP CORE
   ========================================================= */

requirePattern(
  "safe provisioning export",
  provision,
  /export async function provisionMembershipForVerifiedOrder/
);

requirePattern(
  "full verified-payment gate preserved",
  provision,
  /verification_status = 'Verified'/
);

requirePattern(
  "Paid External gate preserved",
  provision,
  /status IN \('Paid','External'\)/
);

requirePattern(
  "full balance gate preserved",
  provision,
  /verifiedPaid >= orderTotal - 0\.005/
);

requirePattern(
  "non-blocking hook error handling",
  provision,
  /MEMBERSHIP VERIFIED-PAYMENT HOOK FAILED/
);


/* =========================================================
   ADMIN PAYMENT VERIFIER
   ========================================================= */

requirePattern(
  "admin verifier imports provisioning hook",
  verify,
  /provisionMembershipForVerifiedOrder/
);

const verifyCalls =
  (
    verify.match(
      /provisionMembershipForVerifiedOrder\s*\(/g
    ) || []
  ).length;

if (verifyCalls < 2) {
  console.error(
    `FAIL — expected >=2 verifier provisioning references; found ${verifyCalls}`
  );
  process.exit(1);
}

console.log(
  "PASS — normal + already-verified recovery hooks"
);

requirePattern(
  "payment still transitions to Verified",
  verify,
  /verification_status='Verified'/
);

requirePattern(
  "accounting eligibility preserved",
  verify,
  /accounting_eligible=1/
);

requirePattern(
  "payment verification ledger preserved",
  verify,
  /INSERT INTO payment_verification_events/
);

requirePattern(
  "affiliate commission hook preserved",
  verify,
  /ensureProductAffiliateCommission/
);

requirePattern(
  "customer attribution hook preserved",
  verify,
  /ensureCustomerAttribution/
);

requirePattern(
  "customer receipt preserved",
  verify,
  /CustomerReceipt/
);

requirePattern(
  "internal accounting notice preserved",
  verify,
  /InternalPaymentNotice/
);

requirePattern(
  "membership hook result returned",
  verify,
  /membership_provisioning/
);


/* =========================================================
   DOKU
   ========================================================= */

requirePattern(
  "DOKU imports provisioning hook",
  doku,
  /provisionMembershipForVerifiedOrder/
);

requirePattern(
  "DOKU markPaid preserved",
  doku,
  /export async function markPaid/
);

requirePattern(
  "DOKU payment Paid preserved",
  doku,
  /status='Paid'/
);

requirePattern(
  "DOKU payment Verified preserved",
  doku,
  /verification_status='Verified'/
);

requirePattern(
  "DOKU hash verification preserved",
  doku,
  /gateway_hash_verified=1/
);

requirePattern(
  "DOKU order Paid preserved",
  doku,
  /payment_status='Paid'/
);

requirePattern(
  "DOKU membership post-hook returned",
  doku,
  /membership_provisioning/
);


/* =========================================================
   ENTITLEMENT SERVICE MUST NOT MUTATE FINANCIAL TABLES
   ========================================================= */

const financialMutations = [
  /UPDATE\s+payments/i,
  /INSERT\s+INTO\s+payments/i,
  /DELETE\s+FROM\s+payments/i,

  /UPDATE\s+orders/i,
  /INSERT\s+INTO\s+orders/i,
  /DELETE\s+FROM\s+orders/i
];

for (const regex of financialMutations) {
  if (regex.test(provision)) {
    console.error(
      `FAIL — provisioning service mutates financial table: ${regex}`
    );
    process.exit(1);
  }
}

console.log(
  "PASS — provisioning remains read-only against orders/payments"
);

console.log("");
console.log(
  "=================================================="
);
console.log(
  "PHASE A7C AUTOMATIC MEMBERSHIP HOOK REGRESSION PASSED"
);
console.log(
  "=================================================="
);