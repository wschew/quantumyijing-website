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
  fs.readFileSync(engineFile, "utf8");

const membership =
  fs.readFileSync(membershipFile, "utf8");

const paymentVerify =
  fs.readFileSync(paymentVerifyFile, "utf8");

const doku =
  fs.readFileSync(dokuFile, "utf8");


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
  "verified_amount_mismatch",
  '"course_entitlement"'
];

for (const token of requiredEngineTokens) {
  if (!engine.includes(token)) {
    throw new Error(
      `Missing C3 engine token: ${token}`
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
      `C3 engine must not mutate protected tables: ${rx}`
    );
  }
}


/*
 * Important control-flow guard:
 * inspect ONLY provisionMembershipForVerifiedOrder(),
 * not later GET/POST route handlers.
 */
const start =
  membership.indexOf(
    "export async function provisionMembershipForVerifiedOrder"
  );

if (start < 0) {
  throw new Error(
    "Verified-payment orchestrator missing."
  );
}

const nextExport =
  membership.indexOf(
    "export async function ",
    start + 10
  );

const orchestrator =
  nextExport > start
    ? membership.slice(start, nextExport)
    : membership.slice(start);


const renewalCall =
  orchestrator.indexOf(
    "processVerifiedSubscriptionRenewal"
  );

const renewalHandled =
  orchestrator.indexOf(
    "if(subscriptionRenewal?.handled)"
  );

const courseCall =
  orchestrator.indexOf(
    "provisionCourseEntitlementsForVerifiedOrder"
  );

const courseHandled =
  orchestrator.indexOf(
    "if(courseProvisioning?.handled)"
  );

const membershipTry =
  orchestrator.indexOf(
    "try {",
    courseHandled
  );


if (renewalCall < 0) {
  throw new Error(
    "Subscription renewal call missing from verified-payment orchestrator."
  );
}

if (renewalHandled < renewalCall) {
  throw new Error(
    "Subscription renewal short-circuit missing."
  );
}

if (courseCall < 0) {
  throw new Error(
    "Course provisioning call is not inside verified-payment orchestrator."
  );
}

if (courseCall <= renewalHandled) {
  throw new Error(
    "Course provisioning must execute after renewal handling."
  );
}

if (courseHandled <= courseCall) {
  throw new Error(
    "Course handled short-circuit missing."
  );
}

if (
  membershipTry < 0 ||
  membershipTry <= courseHandled
) {
  throw new Error(
    "Normal membership provisioning must remain after course handling."
  );
}


/*
 * There must be exactly one executable course provisioning call
 * in membership-provision.js.
 */
const courseCallCount =
  (
    membership.match(
      /await\s+provisionCourseEntitlementsForVerifiedOrder\s*\(/g
    ) || []
  ).length;

if (courseCallCount !== 1) {
  throw new Error(
    `Expected exactly one course provisioning execution call; found ${courseCallCount}.`
  );
}


/*
 * Do not allow the course execution call to leak into the
 * GET/POST route handlers after the orchestrator.
 */
const afterOrchestrator =
  nextExport > start
    ? membership.slice(nextExport)
    : "";

if (
  afterOrchestrator.includes(
    "await provisionCourseEntitlementsForVerifiedOrder"
  )
) {
  throw new Error(
    "Course provisioning call found outside verified-payment orchestrator."
  );
}


if (
  !paymentVerify.includes(
    "provisionMembershipForVerifiedOrder"
  )
) {
  throw new Error(
    "Admin verified-payment hook missing."
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
  "PASS — Phase C3 verified course provisioning control flow."
);