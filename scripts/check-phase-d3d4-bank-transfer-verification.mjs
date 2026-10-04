import fs from "node:fs";

const migrationFile =
  "database/migrate-v4.0-phase-d3d4-bank-transfer-verification.sql";

const verifyFile =
  "functions/api/admin/bank-transfer-verify.js";

const courseFile =
  "functions/api/admin/course-entitlement-provision.js";

for(const file of [
  migrationFile,
  verifyFile,
  courseFile
]){
  if(!fs.existsSync(file)){
    throw new Error(
      `Missing D3+D4 file: ${file}`
    );
  }
}

const migration=
  fs.readFileSync(
    migrationFile,
    "utf8"
  );

const verify=
  fs.readFileSync(
    verifyFile,
    "utf8"
  );

const course=
  fs.readFileSync(
    courseFile,
    "utf8"
  );


const requiredVerify=[
  "bank_transfer_verification_executions",
  "INSERT INTO payments",
  "payment_verification_events",
  "accounting_eligible",
  "INSERT INTO receipts",
  "receipt_items",
  "verified_paid",
  "fullyPaid",
  "provisionMembershipForVerifiedOrder",
  '"start-review"',
  '"verify"',
  '"reject"'
];

for(const token of requiredVerify){
  if(!verify.includes(token)){
    throw new Error(
      `Missing D3+D4 verification token: ${token}`
    );
  }
}


if(
  !course.includes(
    "verified_paid_total"
  )
){
  throw new Error(
    "Course engine does not contain cumulative verified-payment support."
  );
}


if(
  !course.includes(
    "verified_payment_count"
  )
){
  throw new Error(
    "Course engine cumulative payment-count guard missing."
  );
}


const forbiddenPaymentSourceWrites=[
  "functions/api/admin/payment-verify.js",
  "functions/api/admin/generic-payment-verify.js",
  "functions/api/payment/doku/_shared.js"
];

for(const file of forbiddenPaymentSourceWrites){
  if(!fs.existsSync(file)){
    throw new Error(
      `Protected payment source missing: ${file}`
    );
  }
}


if(
  /\bDELETE\s+FROM\s+payments\b/i.test(
    verify
  )
){
  throw new Error(
    "Bank transfer verifier must never delete payment records."
  );
}


if(
  /\bDELETE\s+FROM\s+receipts\b/i.test(
    verify
  )
){
  throw new Error(
    "Bank transfer verifier must never delete receipt records."
  );
}


console.log(
  "PASS — Phase D3+D4 bank transfer verification regression guard."
);