# Synthetic local Bazi workflow

From this worktree run Windows PowerShell:

    powershell -NoProfile -File scripts/Start-Consultation-Workflow-Local.ps1

Confirm SYNTHETIC and enter a temporary masked demonstration password; never use Production credentials. Open the printed HTTPS loopback URLs. The one-day self-signed local certificate needs a browser exception for this loopback host only. Nothing is uploaded. Closing the process destroys all synthetic records, credentials, keys and mock messages.

1. Sign into the QY page with the displayed non-secret account name and temporary password.
2. Use the customer page's synthetic login and create its consultation context.
3. QY independently reviews the synthetic account-bound contact; select trusted WhatsApp or Email on the customer page. Obtain the mocked code from the protected QY outbox.
4. Separately verify the chosen report-delivery contact using its mock challenge; submit adult self-booking intake and separate purpose-specific consents.
5. QY reviews the request and proposes a 90-minute Zoom appointment at least 72 elapsed hours ahead. Customer accepts the immutable offer and policy within 48 hours.
6. Use only the explicitly labelled synthetic capture control. Reconciliation is separate: timely full capture can confirm; late or unknown evidence stays in review. Independent finance review requires an evidence reference/hash and explicit verification, then a separate reconciliation command. Never use real order/customer/payment identifiers in this demo.
7. Rescheduling, pending-request protection, expiry, completion after the full session and manual report preparation/delivery/follow-up/deletion are supported. Historical synthetic automated fixtures exercise later lifecycle stages without weakening time guards or requiring a real three-day wait. No PDF is stored or sent.

Before remote Preview: separately approve an isolated database/origin, keys and rotation/recovery, account provisioning, policy text/hash, deployment and public-controller mounting. Provide distributed encrypted mock delivery and verify runtime CPU limits/browser behavior. Real providers, checkout and report channel changes remain separately controlled integrations.

## Canonical customer search

After dedicated QY sign-in, search above the independent review form. Fictional active IDs 1?4 support name, email, phone and ID queries; customer 4 has a Chinese display name. Selecting a result fills the canonical ID and clears stale contact/evidence/attestation fields. It never verifies identity or grants contact trust. Contacts are masked in results; do not search real customers in this local demo. Search reads the canonical customers table only and returns at most 20 active records.

## U1 booking and case-management usability

The customer journey shows verification, private intake, submission, offer, payment pending and verified confirmation as separate stages. Offer cards display server-provided MYT timestamps and price; acceptance alone does not confirm a booking. QY cases show canonical customer IDs (not private intake), payment readiness, report deadlines and state-specific actions. Use the status filter and inline management form instead of browser prompts. Cancel clears the form without submitting; server authorization, version, schedule and payment guards remain authoritative. No live checkout, promotion activation, Zoom integration or PDF storage/delivery is added. Validate these changes in a disposable local fixture; restart the owner demonstration only after separate approval.

U1 validation observation: an initial parallel synthetic workflow run returned HTTP 401 during customer context creation. The standalone rerun passed all 48 checks. The intermittent cause is unresolved; this is an observation, not a confirmed application defect. Authentication was not changed. Final U1 validation recorded 476 passing checks across eight suites (13 booking UI, 29 language, 18 resume, 15 report navigation, 188 account/workflow SQLite-D1, 48 local workflow, 23 runtime, 142 foundation). Real-browser visual acceptance remains pending.
