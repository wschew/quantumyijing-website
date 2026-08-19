# Quantum YiJing v3.3.13a — Saved WhatsApp Group per Course

Built on v3.3.13.

Run `migrate-v3.3.13a.sql` on Preview D1.

New:
- One saved WhatsApp group per course/product.
- Admin stores a friendly group name and the WhatsApp-generated `https://chat.whatsapp.com/...` invitation link.
- Selecting YJ12 automatically loads the saved YJ12 group.
- Batch sending always reads the saved link from D1, reducing the risk of sending the wrong course link.
- Personal mobile numbers are not used or exposed.

Replace/add:
- migrate-v3.3.13a.sql
- admin-course-whatsapp.html
- admin-course-whatsapp.js
- functions/api/admin/course-whatsapp-group.js
- functions/api/admin/course-whatsapp-send.js

All other v3.3.13 files remain unchanged.
