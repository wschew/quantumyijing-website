# Quantum YiJing v3.3.11c — DOKU Notification Signature Stable

Replace only:
functions/api/payment/doku/notify.js

No D1 migration is required.

Changes:
- Removed temporary raw-body/header diagnostics.
- Removed canonical/signature debug output.
- Removed secret fingerprint and Authorization comparison diagnostics.
- Removed unused basicAuthorization / Request-Id signature logic.
- Preserved the proven DOKU signature formula:
  Client ID
  Request Timestamp
  Request Target Path
  Digest
  joined with newline characters.

Verified before cleanup:
- Invoice QY-20260818-2A3CCF
- SUCCESS / COMPLETED
- signature matched
- hash_verified = 1
- amount and currency verified
- order updated to Paid
- payment provider DOKU
- HTTP 200 returned

After Preview deployment, run one final Sandbox payment and verify the order becomes Paid and payment_gateway_events shows hash_verified = 1.
