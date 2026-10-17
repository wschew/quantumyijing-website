# C1 Stage A3 — Private invitation UI refinement

Local UI change complete; awaiting owner approval. No remote access/writes, deployment, Git staging/commit or server restart.

Valid invitations now show **Bazi Consultation — Your Private Booking Invitation**, **Complete Your Booking**, and **Confirm Booking at RM880**, with the actual server-validated amount substituted dynamically (including sen when applicable). Equivalent Chinese: **八字命理咨询 — 您的私人预约邀请**, **完成您的预约**, **以 RM880 确认预约**. The price summary, expiry, all contact/birth/appointment fields, terms and consent remain. Public visitors retain the original headings and button wording.

The existing first click still obtains the signed quotation; a separate explicit price/terms acceptance is still required before submission. PaymentPending remains the outcome, not payment or appointment confirmation. Labels refresh correctly on input changes, quotation review and language switching. No backend dependency or business-rule change was required.

Changed source files:

- `consultation-preview/customer.html` — two heading IDs only; public text/fields unchanged.
- `consultation-preview/guest-booking-ui.js` — invitation-only bilingual headings and dynamic button label.
- `scripts/test-consultation-invitations.mjs` — private/public wording, Chinese switching and RM900.50 dynamic-price assertions; deterministic test clock alignment.
- `scripts/test-consultation-pricing.mjs` — align native authentication and SQL fixture clocks; no runtime authentication change.
- `docs/c1-private-invitation-ui-refinement.md` — this checkpoint.

Local results: **102 invitation assertions, 57 Stage A assertions and 91 pricing assertions PASS**. JavaScript syntax, Git whitespace and 15 original migration-pin checks pass. Tests execute real UI handlers with synthetic DOM and actual packaged Worker/local transactional SQLite; no real-browser result is claimed. Existing workerd `spawn EPERM` and deployed Free CPU limitations remain unverified; this UI change introduces no backend work.

Prepared package: `.local-c1-package-preview-invitations-1792209415133`. Worker is byte-identical to the deployed Stage A3 package; QY Dashboard, migrations 017/018/019 and Preview configuration are unchanged. Customer HTML differs only by heading IDs; all displayed invitation wording is applied by the updated script after server validation. All package inventory hashes pass. Dedicated Preview D1 binding and disabled/unbound Production configuration are retained; secrets are not included or modified. Earlier packages are not overwritten.

**No migration is needed.** Proposed deployment only after separate owner approval:

```powershell
$package='.local-c1-package-preview-invitations-1792209415133'
$env:CLOUDFLARE_ACCOUNT_ID='f87d6f0679c6fe4c1c08af320850b52c'
npx.cmd wrangler pages deploy "$package/public" --project-name qy-c1-consultation-preview --branch c1-bazi-consultation-development --config "$package/wrangler.jsonc"
```

After approved deployment, open an unused valid invitation and verify the private headings, actual final price, expiry and Chinese switch; ordinary customer-page wording should remain unchanged. No payment simulation or existing-booking update is required for this UI smoke check.
