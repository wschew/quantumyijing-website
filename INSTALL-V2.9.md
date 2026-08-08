# Quantum YiJing v2.9 — Sales & Commerce CRM

1. Stay on `v2-development`.
2. Replace the files from the v2.9 update package.
3. In Cloudflare D1 (`quantumyijing-enquiries`) run `database/migrate-v2.9.sql` once. It only creates indexes; it does not delete or alter existing records.
4. Commit: `Add v2.9 Sales and Commerce CRM` and push origin.
5. Open the latest Preview `/admin`. The header should show `Academy Operating System · v2.9` and a new `Sales & Commerce` tab.
6. Create one test Product, for example `QY-MEM-2026`, Membership, RM 100, Website / SenangPay, Active.
7. Create a test Order for that product. Use Pending for a website/SenangPay order. For a Google Play Books sale use Google Play Books / Google / External.
8. Confirm sales-channel, provider, payment-status and revenue cards update correctly.

Security: v2.9 does NOT place SenangPay merchant secrets in browser JavaScript or GitHub and does NOT activate live SenangPay checkout yet. Google Play Books and other marketplaces remain external payment channels.
