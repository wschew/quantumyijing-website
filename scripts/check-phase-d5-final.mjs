import fs from "node:fs";

const affiliateFile =
  "functions/api/admin/bank-transfer-affiliate.js";

const verifyFile =
  "functions/api/admin/bank-transfer-verify.js";

const paymentVerify =
  "functions/api/admin/payment-verify.js";

const genericVerify =
  "functions/api/admin/generic-payment-verify.js";

const doku =
  "functions/api/payment/doku/_shared.js";


for(const file of [
  affiliateFile,
  verifyFile,
  paymentVerify,
  genericVerify,
  doku
]){
  if(!fs.existsSync(file)){
    throw new Error(
      `Missing D5 source: ${file}`
    );
  }
}


const affiliate=
  fs.readFileSync(
    affiliateFile,
    "utf8"
  );

const verify=
  fs.readFileSync(
    verifyFile,
    "utf8"
  );


const affiliateTokens=[
  "ensureFullyPaidBankTransferAffiliate",
  "verified_paid",
  "affiliate_commissions",
  "affiliate_customer_attributions",
  "gross_sale",
  "order.total",
  "commission_type",
  "commission_value"
];

for(const token of affiliateTokens){

  if(!affiliate.includes(token)){
    throw new Error(
      `Missing D5 affiliate token: ${token}`
    );
  }
}


const verifyTokens=[
  "ensureFullyPaidBankTransferAffiliate",
  "affiliateProcessing",
  "if(fullyPaid)",
  "provisionMembershipForVerifiedOrder"
];

for(const token of verifyTokens){

  if(!verify.includes(token)){
    throw new Error(
      `Missing D5 verifier token: ${token}`
    );
  }
}


const fullPaidIndex=
  verify.indexOf(
    "if(fullyPaid)"
  );

const affiliateIndex=
  verify.indexOf(
    "ensureFullyPaidBankTransferAffiliate"
  );

if(
  fullPaidIndex < 0 ||
  affiliateIndex < 0
){
  throw new Error(
    "D5 fully-paid affiliate integration missing."
  );
}


/*
 * The actual call must be inside the fully-paid block.
 * Ignore the import occurrence.
 */
const callIndex=
  verify.indexOf(
    "await ensureFullyPaidBankTransferAffiliate"
  );

if(
  callIndex < fullPaidIndex
){
  throw new Error(
    "Affiliate processing must execute only after fully-paid check."
  );
}


/*
 * Bank-transfer affiliate gross must be based on
 * the full order amount, not the latest installment.
 */
if(
  affiliate.includes(
    "payment_amount"
  )
){
  throw new Error(
    "D5 affiliate helper must not use latest payment_amount as commission gross."
  );
}


if(
  !affiliate.includes(
    "const gross="
  ) ||
  !affiliate.includes(
    "money(order.total)"
  )
){
  throw new Error(
    "D5 affiliate helper must use full order total as gross."
  );
}


console.log(
  "PASS — Phase D5 final affiliate/instalment regression guard."
);