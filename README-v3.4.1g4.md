# Quantum YiJing v3.4.1g4
## Coach Payment Notification Hotfix

### Scope
This is a small code-only hotfix. No D1 migration is required.

### Replace
- `functions/api/admin/coach-payouts.js`

### What changes
When an Approved Coach payout is marked Paid:

1. The payout is first recorded as Paid in D1.
2. A bilingual payment notice is sent to the Coach.
3. A separate internal payout confirmation is sent to QY.
4. Resend failures are logged to Cloudflare, but do NOT reverse the accounting transaction.

### QY notification address
The code uses the first available value:

- `QY_ACCOUNTING_EMAIL`
- `QY_ADMIN_EMAIL`
- `ADMIN_EMAIL`
- fallback: `info@quantumyijing.com`

No new environment variable is required if `info@quantumyijing.com` is the intended QY notification mailbox.

### Existing accounting behavior preserved
This patch does NOT change:
- commission calculation
- supplementary same-month payout support
- Draft / Approved / Paid workflow
- coach bank list
- Excel export
- payout-item duplicate protection
- course/service assignment logic

### Important testing note
Your RM6 test payout is already Paid. The existing Mark Paid endpoint correctly prevents a Paid payout from being marked Paid again, so it will NOT resend the email for that already-Paid record.

For a clean v3.4.1g4 test, create a NEW small Coach payout test item (for example RM7), finalize it, then run:

Eligible → Create Draft → Approve → Export bank list → Mark Paid

At Mark Paid, verify:
- Coach receives `Quantum YiJing® Coach Commission Paid / 导师佣金已支付`
- QY receives the internal Coach payout confirmation
- payout remains Paid even if email delivery fails

If email does not arrive, inspect Cloudflare Function logs for:
- `coach payout email`
- `coach payout email exception`
- `RESEND_API_KEY missing`
