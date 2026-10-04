import fs from "node:fs";

const engineFile =
  "functions/api/admin/course-entitlement-provision.js";

const membershipFile =
  "functions/api/admin/membership-provision.js";

const paymentVerifyFile =
  "functions/api/admin/payment-verify.js";

const dokuFile =
  "functions/api/payment/doku/_shared.js";

for (const file of [
  engineFile,
  membershipFile,
  paymentVerifyFile,
  dokuFile
]) {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing required C3 file: ${file}`
    );
  }
}

const engine =
  fs.readFileSync(
    engineFile,
    "utf8"
  );

const membership =
  fs.readFileSync(
    membershipFile,
    "utf8"
  );

const paymentVerify =
  fs.readFileSync(
    paymentVerifyFile,
    "utf8"
  );

const doku =
  fs.readFileSync(
    dokuFile,
    "utf8"
  );

const requiredEngineTokens = [
  "provisionCourseEntitlementsForVerifiedOrder",
  "course_entitlements",
  "course_entitlement_events",
  "customer_enquiry_links",
  "verification_status",
  "Verified",
  "payment_status",
  "Paid",
  "source_order_id",
  "source_type='Order'",
  "product_type",
  "course",
  "Active",
  "verified_amount_mismatch",
  "canonical customer",
  "Automatically provisioned from verified paid order",
  "provisioning_type:",
  '"course_entitlement"'
];

for (const token of requiredEngineTokens) {
  if (!engine.includes(token)) {
    throw new Error(
      `Missing C3 provisioning token: ${token}`
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
  /\bDELETE\s+FROM\s+order_items\b/i,

  /\bUPDATE\s+memberships\b/i,
  /\bINSERT\s+INTO\s+memberships\b/i,
  /\bDELETE\s+FROM\s+memberships\b/i,

  /\bUPDATE\s+subscriptions\b/i,
  /\bINSERT\s+INTO\s+subscriptions\b/i,
  /\bDELETE\s+FROM\s+subscriptions\b/i
];

for (const rx of forbiddenFinancialWrites) {
  if (rx.test(engine)) {
    throw new Error(
      `Course entitlement provisioning must not mutate protected tables: ${rx}`
    );
  }
}

if (
  !membership.includes(
    "processVerifiedSubscriptionRenewal"
  )
) {
  throw new Error(
    "Existing subscription renewal integration missing."
  );
}

if (
  !membership.includes(
    'provisioning_type:"subscription_renewal"'
  )
) {
  throw new Error(
    "Existing subscription renewal short-circuit missing."
  );
}

if (
  !membership.includes(
    "provisionCourseEntitlementsForVerifiedOrder"
  )
) {
  throw new Error(
    "Course provisioning integration missing."
  );
}

const renewalCall =
  membership.indexOf(
    "processVerifiedSubscriptionRenewal"
  );

const courseCall =
  membership.indexOf(
    "provisionCourseEntitlementsForVerifiedOrder",
    renewalCall + 1
  );

if (
  renewalCall < 0 ||
  courseCall < 0 ||
  courseCall <= renewalCall
) {
  throw new Error(
    "Course provisioning must remain after subscription renewal handling."
  );
}

if (
  !paymentVerify.includes(
    "provisionMembershipForVerifiedOrder"
  )
) {
  throw new Error(
    "Admin payment verifier hook missing."
  );
}

if (
  !doku.includes(
    "provisionMembershipForVerifiedOrder"
  )
) {
  throw new Error(
    "DOKU verified-payment hook missing."
  );
}

console.log(
  "PASS — Phase C3 verified course entitlement provisioning regression guard."
);