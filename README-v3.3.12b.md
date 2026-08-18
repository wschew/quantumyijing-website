# Quantum YiJing v3.3.12b — Enquiry Message Confirmation

Built on v3.3.12a.

Replace:
- functions/product/[slug].js
- functions/api/enquiry.js

No D1 migration required.
No DOKU/payment changes.

Enquiry behaviour:
- If the customer types a question, that exact message is stored and appears in both the QY internal enquiry email and the customer's confirmation.
- If the customer leaves the message blank, the website supplies a default enquiry message using the course name.
- The customer confirmation now shows "Your Message / Question" and "您的留言 / 问题".

Registration behaviour:
- Message remains optional.
- Registration sends no enquiry emails.
- Existing order and DOKU payment flow is unchanged.
