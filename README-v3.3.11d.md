# Quantum YiJing v3.3.11d — Course Payment Email Cleanup

Replace:
- functions/api/enquiry.js
- functions/api/payment/doku/notify.js

No D1 migration required.

Changes:
- Genuine enquiries still receive the normal enquiry acknowledgement.
- Course registration/createOrder=true no longer sends the customer the generic "1–2 working days" enquiry email.
- Internal QY notification remains.
- Verified DOKU SUCCESS sends a QY "Payment & Registration Confirmed" email.
- QY confirmation includes product/course name, order reference, amount paid, DOKU, and PAID status.
- DOKU may continue to send its own invoice/receipt separately.
- Repeated DOKU SUCCESS notifications do not send duplicate QY confirmation emails.
- v3.3.11c DOKU signature logic is preserved unchanged.
