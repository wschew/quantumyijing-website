# Quantum YiJing v3.3.12 — Separate Enquiry & Registration Flow

Replace:
1. functions/product/[slug].js
2. functions/api/enquiry.js

No D1 migration required.

## Cleanup
v3.3.11d1 and v3.3.11d2 workaround logic is removed. Registration/enquiry intent is now explicit.

## Button 1 — Ask for More Information / 课程咨询
- Same customer form
- createOrder=false
- Saves enquiry
- Sends QY enquiry notification
- Sends customer enquiry acknowledgement
- Does not create order
- Does not show payment button

## Button 2 — Register & Proceed to Payment / 报名并付款
- Same customer form
- createOrder=true
- submissionType=registration
- Saves registration and creates order
- Sends NO enquiry email to customer
- Sends NO enquiry email to QY
- Shows DOKU payment button
- Existing DOKU checkout continues unchanged
- Verified successful payment continues to post-payment confirmation workflow

## Test separately
A. Enquiry button:
  expect two enquiry emails, no order/payment button.
B. Registration button:
  expect order + payment button, zero enquiry emails.
C. Complete DOKU Sandbox payment:
  expect successful payment and QY payment/registration confirmation.
