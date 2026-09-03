# Quantum YiJing Marketing Automation Scheduler

This isolated Cloudflare Worker invokes the authenticated marketing automation
bulk runner once per hour. The checked-in configuration targets the Preview
Pages deployment only.

Security properties:

- The Worker defines only a `scheduled` handler and no public `fetch` handler.
- `workers_dev` is disabled.
- `ADMIN_TOKEN` must be stored as a Cloudflare encrypted secret and is never
  committed to Git.
- The Pages endpoint independently verifies the bearer token.
- The existing runner processes no more than 20 due automations per invocation.

Do not change `AUTOMATION_RUN_URL` to the Production domain until the Preview
scheduler has been deployed, invoked, and its logs verified successfully.
