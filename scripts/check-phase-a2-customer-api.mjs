import fs from "node:fs";

const file =
  "functions/api/admin/customers.js";

if (!fs.existsSync(file)) {
  console.error(
    "FAIL — customer API missing"
  );
  process.exit(1);
}

const s =
  fs.readFileSync(
    file,
    "utf8"
  );

const checks = [
  [
    "ADMIN_TOKEN authentication",
    /ADMIN_TOKEN/
  ],
  [
    "ENQUIRIES_DB binding",
    /ENQUIRIES_DB/
  ],
  [
    "customer list action",
    /action === "list"/
  ],
  [
    "customer detail action",
    /action === "detail"/
  ],
  [
    "customer create action",
    /action === "create"/
  ],
  [
    "resolve-enquiry action",
    /resolve-enquiry/
  ],
  [
    "email normalization",
    /normalizeEmail/
  ],
  [
    "phone normalization",
    /normalizePhone/
  ],
  [
    "identity conflict protection",
    /Identity conflict/
  ],
  [
    "customer identifiers",
    /customer_identifiers/
  ],
  [
    "enquiry linking",
    /customer_enquiry_links/
  ],
  [
    "membership read-only relation",
    /FROM memberships/
  ]
];

for (const [name, re] of checks) {
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

const forbidden = [
  /UPDATE\s+orders/i,
  /INSERT\s+INTO\s+orders/i,
  /UPDATE\s+payments/i,
  /INSERT\s+INTO\s+payments/i,
  /DELETE\s+FROM\s+orders/i,
  /DELETE\s+FROM\s+payments/i,
  /UPDATE\s+students/i,
  /INSERT\s+INTO\s+students/i,
  /UPDATE\s+products/i,
  /INSERT\s+INTO\s+memberships/i,
  /UPDATE\s+memberships/i
];

for (const re of forbidden) {
  if (re.test(s)) {
    console.error(
      `FAIL — prohibited frozen-system mutation detected: ${re}`
    );
    process.exit(1);
  }
}

console.log(
  "PASS — frozen commerce/student/membership mutation guard"
);

console.log("");
console.log(
  "=============================================="
);
console.log(
  "PHASE A2 CUSTOMER API REGRESSION PASSED"
);
console.log(
  "=============================================="
);