# Quantum YiJing® v3.3.2 — Release Notes

## Affiliate Programme public page
Adds a public affiliate landing page and application form.

## Application data
Collects:
- Full name / display name
- Email
- WhatsApp/mobile
- Country
- Individual/Company
- Bank name
- Bank account holder name
- Bank account number
- Privacy consent
- Affiliate Programme terms acceptance

## Application workflow
New applications are stored as `Pending`.

Because `affiliates.affiliate_code` is already NOT NULL + UNIQUE, pending applications receive an internal temporary code beginning with `PENDING-`.

The public applicant never uses that temporary value.

## Approval workflow
On approval:
- status becomes `Approved`
- permanent code is generated (`QY-A0001`, etc.)
- membership starts immediately
- expiry is calculated from `affiliate_membership_months` (currently 12)
- renewal status becomes `Active`

## Privacy
The Affiliate Admin list masks bank account numbers and does not return full account numbers to the browser.

## Email
If Resend is configured:
- QY receives new-application notification
- approved affiliate receives welcome email with Affiliate Code

## Next stage
v3.3.3 should implement:
- referral-link persistence
- 30-day initial referral window
- last-valid-referral-wins logic
- 12-month customer attribution after first verified paid order
- YJ12 Register & Pay separation from Enquiry
- automatic affiliate commission ledger creation
