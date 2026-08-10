# v3.2.1 Release Notes
- Migrates website payment provider naming from SenangPay to DOKU for pending/new online checkout.
- Uses Cloudflare DOKU_CLIENT_ID + DOKU_SECRET_KEY; no credentials are stored in source.
- Adds server-side DOKU request signing foundation.
- Adds DOKU checkout start, status, return and notification endpoints.
- Fails closed until DOKU_CHECKOUT_ENDPOINT is explicitly configured.
- Browser return cannot mark an order paid.
- Preserves D1 gateway audit logging and accounting reconciliation design from v3.2.
- Preserves Bank Transfer and Google Play Books workflows.
