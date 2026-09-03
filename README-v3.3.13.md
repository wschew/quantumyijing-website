# Quantum YiJing v3.3.13 — Course WhatsApp Invitation Admin

This version adds a controlled batch onboarding tool for paid course registrants.

## Files

- admin-course-whatsapp.html
- admin-course-whatsapp.js
- functions/api/admin/course-whatsapp-courses.js
- functions/api/admin/course-whatsapp-recipients.js
- functions/api/admin/course-whatsapp-send.js
- migrate-v3.3.13.sql
- functions/api/payment/doku/notify.js
- README-v3.3.13.md

## IMPORTANT — D1 migration

Run `migrate-v3.3.13.sql` on Preview D1 before testing.

## Admin workflow

1. Open `/admin-course-whatsapp.html`
2. Enter Admin Token
3. Select course (e.g. YJ12)
4. Paste official WhatsApp group invite URL
5. Load paid registrants
6. Select pending recipients
7. Click Send WhatsApp Invitation
8. System records Sent / Failed status and sent date

Only orders with `payment_status='Paid'` are listed.

## Duplicate protection

Each course/order pair is unique in `course_whatsapp_invitations`.
Already-sent recipients are skipped unless "Allow resend" is checked.

## Payment email polish included

The v3.3.12c payment emails are also polished:
- QY logo added to the customer payment confirmation header
- QY logo added to the internal Payment Received header
- Customer confirmation says a separate follow-up email will provide WhatsApp group joining details

## No automatic WhatsApp invite at payment time

The WhatsApp invitation is deliberately admin-controlled.
This allows QY to create/finalize the course group first and send the invitation to a selected batch of paid registrants.
