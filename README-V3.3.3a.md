# Quantum YiJing v3.3.3a

Cloudflare PBKDF2 compatibility patch.

Cloudflare Workers currently rejects PBKDF2 iteration counts above 100000.
v3.3.3 used 210000.

This patch changes:
- `_auth.js` default PBKDF2 iterations: 210000 -> 100000
- `activate.js` stored password_iterations: 210000 -> 100000

No SQL migration is required.

Replace the two files, commit/push Preview, then reuse the same activation link if it is still valid and unused.
