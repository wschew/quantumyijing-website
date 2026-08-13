# Quantum YiJing v3.3.2b

Adds affiliate notifications and individual affiliate detail.

No SQL migration required.

Email workflow:
1. New application -> admin notification to info@quantumyijing.com
2. New application -> applicant acknowledgement email
3. Approval -> applicant acceptance email with Affiliate Code and membership expiry

Uses the same RESEND_API_KEY and info@quantumyijing.com internal mailbox as the enquiry system.

New individual affiliate backend:
- /admin-affiliate-detail.html?id=<ID>
- shows profile, masked bank account, membership, customer attribution, commissions and payouts

Copy files over v3.3.2a, commit/push Preview, and test using a NEW email address.
