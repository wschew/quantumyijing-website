import fs from "node:fs";

const apiFile =
  "functions/api/admin/course-entitlements.js";

if (!fs.existsSync(apiFile)) {
  throw new Error(
    `Missing ${apiFile}`
  );
}

const api =
  fs.readFileSync(
    apiFile,
    "utf8"
  );

const required = [
  "course_entitlements",
  "course_entitlement_events",
  "Only course products may receive course entitlements",
  "Student does not belong to entitlement customer",
  "Source membership customer does not match entitlement customer",
  "Pending",
  "Active",
  "Paused",
  "Expired",
  "Revoked",
  "student_linked",
  "student_unlinked",
  "activated",
  "resumed",
  "expired",
  "revoked",
  'action === "create"',
  'action === "status"',
  'action === "link-student"',
  "customer_enquiry_links",
  "product_type"
];

for (const token of required) {
  if (!api.includes(token)) {
    throw new Error(
      `Missing required C2 token: ${token}`
    );
  }
}

const forbiddenMutations = [
  /INSERT\s+INTO\s+orders/i,
  /UPDATE\s+orders/i,
  /DELETE\s+FROM\s+orders/i,

  /INSERT\s+INTO\s+payments/i,
  /UPDATE\s+payments/i,
  /DELETE\s+FROM\s+payments/i,

  /INSERT\s+INTO\s+memberships/i,
  /UPDATE\s+memberships/i,
  /DELETE\s+FROM\s+memberships/i,

  /INSERT\s+INTO\s+subscriptions/i,
  /UPDATE\s+subscriptions/i,
  /DELETE\s+FROM\s+subscriptions/i,

  /INSERT\s+INTO\s+affiliate_/i,
  /UPDATE\s+affiliate_/i,
  /DELETE\s+FROM\s+affiliate_/i
];

for (
  const pattern of
  forbiddenMutations
) {
  if (pattern.test(api)) {
    throw new Error(
      `Forbidden financial/lifecycle mutation found: ${pattern}`
    );
  }
}

if (
  !api.includes(
    "TRANSITIONS"
  )
) {
  throw new Error(
    "Controlled entitlement transition map missing."
  );
}

if (
  !api.includes(
    "Expired: new Set([])"
  )
) {
  throw new Error(
    "Expired entitlement must remain terminal."
  );
}

if (
  !api.includes(
    "Revoked: new Set([])"
  )
) {
  throw new Error(
    "Revoked entitlement must remain terminal."
  );
}

console.log(
  "PASS — Phase C2 course entitlement service regression guard."
);