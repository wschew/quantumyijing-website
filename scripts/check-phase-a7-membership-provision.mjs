import fs from "node:fs";

const file =
  "functions/api/admin/membership-provision.js";

if (!fs.existsSync(file)) {
  console.error(
    "FAIL — membership provisioning API missing"
  );
  process.exit(1);
}

const s =
  fs.readFileSync(
    file,
    "utf8"
  );

const required = [
  [
    "ADMIN_TOKEN authentication",
    /ADMIN_TOKEN/
  ],
  [
    "D1 binding",
    /ENQUIRIES_DB/
  ],
  [
    "membership product requirement",
    /product_type = 'membership'/
  ],
  [
    "canonical customer linkage",
    /customer_enquiry_links/
  ],
  [
    "verified Paid\/External criterion",
    /status IN \('Paid','External'\)/
  ],
  [
    "Verified criterion",
    /verification_status = 'Verified'/
  ],
  [
    "verified paid sum",
    /SUM\s*\(/
  ],
  [
    "full payment threshold",
    /verifiedPaid >= orderTotal - 0\.005/
  ],
  [
    "membership creation",
    /INSERT INTO memberships/
  ],
  [
    "membership activation",
    /UPDATE memberships/
  ],
  [
    "membership event audit",
    /INSERT INTO membership_events/
  ],
  [
    "created audit event",
    /'created'/
  ],
  [
    "activated audit event",
    /'activated'/
  ],
  [
    "duplicate current membership guard",
    /Customer already has a current membership/
  ],
  [
    "terminal membership guard",
    /will not be automatically reactivated/
  ]
];

for (const [name, re] of required) {
  if (!re.test(s)) {
    console.error(
      `FAIL — ${name}`
    );
    process.exit(1);
  }

  console.log(
    `PASS — ${name}`
  );
}

const prohibited = [
  /UPDATE\s+orders/i,
  /INSERT\s+INTO\s+orders/i,
  /DELETE\s+FROM\s+orders/i,

  /UPDATE\s+payments/i,
  /INSERT\s+INTO\s+payments/i,
  /DELETE\s+FROM\s+payments/i,

  /UPDATE\s+products/i,
  /INSERT\s+INTO\s+products/i,
  /DELETE\s+FROM\s+products/i,

  /UPDATE\s+customers/i,
  /INSERT\s+INTO\s+customers/i,
  /DELETE\s+FROM\s+customers/i,

  /UPDATE\s+enquiries/i,
  /INSERT\s+INTO\s+enquiries/i,
  /DELETE\s+FROM\s+enquiries/i,

  /UPDATE\s+students/i,
  /INSERT\s+INTO\s+students/i,
  /DELETE\s+FROM\s+students/i
];

for (const re of prohibited) {
  if (re.test(s)) {
    console.error(
      `FAIL — protected-table mutation detected: ${re}`
    );
    process.exit(1);
  }
}

console.log(
  "PASS — payment/accounting/customer/order mutation guard"
);

if (/accounting_eligible\s*=\s*1/i.test(s)) {
  console.error(
    "FAIL — membership access must not mutate accounting eligibility"
  );
  process.exit(1);
}

console.log(
  "PASS — accounting eligibility remains independent"
);

if (/settlement_status\s*=\s*'Reconciled'/i.test(s)) {
  console.error(
    "FAIL — membership activation must not require settlement reconciliation"
  );
  process.exit(1);
}

console.log(
  "PASS — settlement reconciliation is not an access gate"
);

console.log("");
console.log(
  "=================================================="
);
console.log(
  "PHASE A7A MEMBERSHIP PROVISIONING REGRESSION PASSED"
);
console.log(
  "=================================================="
);