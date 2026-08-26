Quantum YiJing® Academy Operating System
v3.4.1e1 — Course Enquiry Syntax Fix

This is a corrective patch for v3.4.1e deployment failure.

CAUSE
The client-side success message used JavaScript template literals inside the server-side HTML template literal in /functions/product/[slug].js. Cloudflare Wrangler therefore parsed the Chinese success text as server JavaScript and stopped with: Expected ";".

FIX
The two client-side success messages now use ordinary string concatenation. No behavior or database changes.

NO SQL MIGRATION REQUIRED.

REPLACE ONLY
/functions/product/[slug].js

TEST
1. Replace the failed v3.4.1e [slug].js with this v3.4.1e1 file.
2. Commit/push to Preview.
3. Cloudflare deployment should complete.
4. Open /product/quantum-self-hypnosis and verify Enquire About This Course.
