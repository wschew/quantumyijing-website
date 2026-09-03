# v3.3.16n — Affiliate Application Form Layout Cleanup

Changes:
- Removed the extra agreement line:
  "I have read and agree to the Quantum YiJing® Affiliate Program Terms & Conditions (QY-AFF-2026-08-V1)."
- Kept only the existing consent checkbox and existing T&C agreement + View Terms link.
- Moved both checkboxes and Submit Application to the bottom, after the embedded T&C.
- Removed the separate Nationality field.
- Country now supplies the compliance country/nationality value to the existing backend.
- Identification Type and Identification Number now appear immediately after Country.
- Malaysian country entry auto-selects NRIC / MyKad.
- No D1 migration.
- No payment/commission/payout/attribution logic changes.

Install:
1. Replace current affiliate.html with affiliate-v3.3.16n.html (or rename it to affiliate.html).
2. Replace affiliate-v3.3.16j.js with the supplied file.
3. Commit and push.
4. Test EN and 中文.
