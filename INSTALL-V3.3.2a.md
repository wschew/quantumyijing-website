# Quantum YiJing v3.3.2a

Fixes the confirmed Preview error:
`Cannot read properties of undefined (reading 'prepare')`

Cause: existing QY D1 binding is `ENQUIRIES_DB`; v3.3.2 used `env.DB`.

All new affiliate APIs now use:
`env.ENQUIRIES_DB || env.DB`

Also adds:
- EN / 中文 switch
- improved landing page
- summary terms + full T&C page
- compact one-page application form
- clearer submission errors

No SQL migration is required.

Copy all files over the v3.3.2 versions, commit/push to the development branch, then test:
1. `/affiliate.html`
2. switch EN / 中文
3. open `/affiliate-terms.html`
4. submit test application
5. expect `AFFAPP-...`
6. open `/admin-affiliates.html`
7. enter existing `ADMIN_TOKEN`
8. load Pending
9. approve
10. expect `QY-A0001`

Logo path currently used: `/images/logo.png`.
If your existing QY logo filename differs, change the `src` in the HTML files to the exact existing path.
