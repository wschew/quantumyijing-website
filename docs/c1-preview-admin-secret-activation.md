# C1 Preview administrator secret activation

Owner-run only. No Academy ADMIN_TOKEN, real customer data or Production bindings.

1. In a private password manager, generate and save 32 random bytes encoded as exactly 64 lowercase hexadecimal characters. This is the new C1-only administrator credential. Do not reuse the old password or the keyring. No secret belongs in Git, command arguments, logs or plaintext files.
2. From the repository root, install privately using Wrangler's hidden interactive prompt (do not pipe or echo the secret):

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='f87d6f0679c6fe4c1c08af320850b52c'
npx.cmd wrangler pages secret put CONSULTATION_ADMIN_SECRET --project-name qy-c1-consultation-preview --env preview --config .local-c1-package-preview-aligned/wrangler.jsonc
```

If a C1 administrator secret already exists, stop: replacing it is credential rotation requiring explicit approval and session revocation. Do not touch CONSULTATION_KEYRING. Install only in Preview, never Production.

3. Revoke earlier sessions by incrementing the existing password_version once, guarded by its current version. First read the version; then obtain owner approval for the exact guarded UPDATE and sanitized audit in one D1 atomic batch. Do not rerun an unguarded increment. Leave password_algorithm, password_iterations, password_salt and password_hash unchanged. No account recreation or public enrollment. Existing sessions compare password_version on every authorization and become invalid immediately after the increment. This change does not reset lockout.

4. Rebuild into a new directory and copy the existing verified configuration (all Production/default gates remain false and unbound):

```powershell
$env:QY_ESBUILD_PATH='C:\Users\WIN10\AppData\Local\npm-cache\_npx\32026684e21afda6\node_modules\esbuild\lib\main.js'
node scripts/build-consultation-pages.mjs .local-c1-package-preview-admin-secret
Copy-Item .local-c1-package-preview-aligned/wrangler.jsonc .local-c1-package-preview-admin-secret/wrangler.jsonc
npx.cmd wrangler pages deploy .local-c1-package-preview-admin-secret/public --project-name qy-c1-consultation-preview --branch c1-bazi-consultation-development --config .local-c1-package-preview-admin-secret/wrangler.jsonc
```

5. On the approved branch alias, sign in as qyadmin using the new secret. Check one login, authenticated read, CSRF-protected mutation and logout. Measure deployed CPU; local Node CPU does not prove Free compliance. Keep testing synthetic-only. The old password no longer authenticates; the existing hash remains unchanged for historical integrity.

Secret login uses SHA-256 digests and workerd timingSafeEqual when available, otherwise the existing fixed-length non-early-exit comparison (not a guaranteed constant-time JS primitive). Missing/malformed server secret returns the same public 503 without fallback. Secret is used only for login; all business requests retain the existing C1 session/SQL guards. Provisioning and private session revocation remain owner-controlled.
