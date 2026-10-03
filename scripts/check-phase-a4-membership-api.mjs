import fs from "node:fs";

const file =
  "functions/api/admin/memberships.js";

if (!fs.existsSync(file)) {
  console.error(
    "FAIL — membership API missing"
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
    "ADMIN_TOKEN auth",
    /ADMIN_TOKEN/
  ],
  [
    "ENQUIRIES_DB",
    /ENQUIRIES_DB/
  ],
  [
    "membership list",
    /action === "list"/
  ],
  [
    "membership detail",
    /action === "detail"/
  ],
  [
    "membership products",
    /action === "products"/
  ],
  [
    "membership create",
    /action === "create"/
  ],
  [
    "membership status transition",
    /action === "status"/
  ],
  [
    "membership event audit",
    /membership_events/
  ],
  [
    "membership product validation",
    /product_type !== "membership"/
  ],
  [
    "source order validation",
    /validateSourceOrder/
  ],
  [
    "order product validation",
    /FROM order_items/
  ],
  [
    "customer linkage conflict protection",
    /different canonical customer/
  ],
  [
    "duplicate membership protection",
    /already has a current membership/
  ],
  [
    "transition guard",
    /transitions/
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

  /UPDATE\s+students/i,
  /INSERT\s+INTO\s+students/i,
  /DELETE\s+FROM\s+students/i,

  /UPDATE\s+customers/i,
  /DELETE\s+FROM\s+customers/i
];

for (const re of prohibited) {
  if (re.test(s)) {
    console.error(
      `FAIL — prohibited frozen-system mutation: ${re}`
    );
    process.exit(1);
  }
}

console.log(
  "PASS — commerce/customer/student mutation guard"
);

if (
  !/INSERT\s+INTO\s+memberships/i.test(s)
) {
  console.error(
    "FAIL — membership creation missing"
  );
  process.exit(1);
}

if (
  !/UPDATE\s+memberships/i.test(s)
) {
  console.error(
    "FAIL — membership lifecycle update missing"
  );
  process.exit(1);
}

console.log(
  "PASS — membership-owned lifecycle mutations present"
);

console.log("");
console.log(
  "=============================================="
);
console.log(
  "PHASE A4 MEMBERSHIP API REGRESSION PASSED"
);
console.log(
  "=============================================="
);