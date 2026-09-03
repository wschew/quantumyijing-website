# Quantum YiJing v3.3.11d2 — Course Registration Email Hotfix

Replace only:

functions/api/enquiry.js

No D1 migration required.

## Corrected behaviour

### Genuine enquiry
- Saved to enquiries
- QY receives internal website enquiry email
- Customer receives enquiry acknowledgement
- "1–2 working days" wording remains

### Course registration with a successfully created order
- Registration/enquiry record is still saved
- Order is still created
- NO enquiry email is sent to the customer
- NO enquiry email is sent to QY
- Customer proceeds to DOKU payment
- Successful payment confirmation remains handled by the post-payment workflow

## Source of truth

The suppression rule uses the actual order creation result:

const isCourseRegistration = !!orderInfo?.orderReference;

This avoids relying only on the incoming createOrder flag.

## Preview test

1. Submit a fresh YJ12 registration.
2. Confirm D1 contains the new order with payment_status Pending and payment_provider DOKU.
3. Before clicking/completing payment, confirm:
   - no customer "Enquiry Received" email
   - no QY "[Website Enquiry]" email
4. Complete DOKU Sandbox payment and verify the normal payment confirmation workflow.
