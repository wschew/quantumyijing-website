# Quantum YiJing® v3.3.3 — Affiliate Login & Private Dashboard

This is the first private Affiliate Portal release.

## Features

Approved affiliates can:

- Activate their own portal password.
- Log in with email + password.
- Use secure HttpOnly session cookies.
- Reset forgotten passwords.
- View only their own affiliate data.
- View Affiliate Code and membership expiry.
- View KPI cards:
  - Total Sales
  - Commission Earned
  - Pending Commission
  - Commission Paid
- View 12-month Monthly Total Sales graph.
- View 12-month Monthly Sales by Product Category graph:
  - Courses
  - Consultations
  - Books / eBooks
  - Digital Products
  - Physical Products
  - Memberships
  - Events
  - Other
- View Sales & Commission Statement.
- View Monthly Payout History.
- View ready-made affiliate links for eligible QY products.

## SECURITY MODEL

- Passwords are NEVER stored as plaintext.
- Passwords use PBKDF2-SHA256 + unique random salt.
- Session tokens are random and only SHA-256 hashes are stored in D1.
- Browser session cookie is HttpOnly + Secure + SameSite=Lax.
- Password reset/activation tokens are stored hashed.
- Every private portal API derives the affiliate ID from the authenticated session.
- Affiliate ID is NOT accepted from the browser for private data queries.

This prevents one affiliate from changing a URL/request to read another affiliate's records.

---

# STEP 1 — COPY FILES

Copy the full v3.3.3 package into the existing project.

Do not delete the existing v3.3.2e Affiliate Admin files.

---

# STEP 2 — RUN D1 MIGRATION ON PREVIEW

Important:
Cloudflare D1 Console may reject a large comment + SQL batch.

Run these sections carefully.

## 2A. Add affiliate auth columns

Run one statement at a time:

```sql
ALTER TABLE affiliates ADD COLUMN portal_enabled INTEGER NOT NULL DEFAULT 0;
```

```sql
ALTER TABLE affiliates ADD COLUMN portal_activated_at TEXT NOT NULL DEFAULT '';
```

```sql
ALTER TABLE affiliates ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
```

```sql
ALTER TABLE affiliates ADD COLUMN password_salt TEXT NOT NULL DEFAULT '';
```

```sql
ALTER TABLE affiliates ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 210000;
```

```sql
ALTER TABLE affiliates ADD COLUMN last_login_at TEXT NOT NULL DEFAULT '';
```

```sql
ALTER TABLE affiliates ADD COLUMN last_password_changed_at TEXT NOT NULL DEFAULT '';
```

## 2B. Create activation table

```sql
CREATE TABLE IF NOT EXISTS affiliate_activation_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE
);
```

## 2C. Create reset table

```sql
CREATE TABLE IF NOT EXISTS affiliate_password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE
);
```

## 2D. Create session table

```sql
CREATE TABLE IF NOT EXISTS affiliate_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE
);
```

## 2E. Create indexes

```sql
CREATE INDEX IF NOT EXISTS idx_affiliate_activation_affiliate
ON affiliate_activation_tokens(affiliate_id);
```

```sql
CREATE INDEX IF NOT EXISTS idx_affiliate_activation_expiry
ON affiliate_activation_tokens(expires_at);
```

```sql
CREATE INDEX IF NOT EXISTS idx_affiliate_reset_affiliate
ON affiliate_password_reset_tokens(affiliate_id);
```

```sql
CREATE INDEX IF NOT EXISTS idx_affiliate_reset_expiry
ON affiliate_password_reset_tokens(expires_at);
```

```sql
CREATE INDEX IF NOT EXISTS idx_affiliate_sessions_affiliate
ON affiliate_sessions(affiliate_id);
```

```sql
CREATE INDEX IF NOT EXISTS idx_affiliate_sessions_expiry
ON affiliate_sessions(expires_at);
```

## Verify

```sql
PRAGMA table_info(affiliates);
```

and

```sql
SELECT name
FROM sqlite_master
WHERE type='table'
AND name LIKE 'affiliate_%'
ORDER BY name;
```

You should see the new:
- affiliate_activation_tokens
- affiliate_password_reset_tokens
- affiliate_sessions

---

# STEP 3 — COMMIT / PUSH PREVIEW

Suggested commit:

`v3.3.3 secure affiliate login and private dashboard`

Wait for Cloudflare Preview deployment.

---

# STEP 4 — TEST WITH EXISTING APPROVED AFFILIATE

For your test Affiliate ID 1 or 2, open:

`/admin-affiliate-portal.html`

Enter:
- existing Admin Token
- Affiliate ID

Click:
`Send Activation Email`

The affiliate should receive a bilingual activation email.

---

# STEP 5 — ACTIVATE PASSWORD

Click the activation link from the email.

It opens:

`/affiliate-activate.html?token=...`

Create a password of at least 10 characters.

After successful activation:
open:

`/affiliate-login.html`

Sign in with the affiliate's email + new password.

---

# STEP 6 — PRIVATE DASHBOARD

After login:

`/affiliate-dashboard.html`

Verify:
- Affiliate name
- Affiliate Code
- Membership expiry
- Total Sales
- Commission Earned
- Pending Commission
- Commission Paid
- Monthly Total Sales graph
- Monthly Sales by Product Category graph
- Affiliate links
- Commission statement
- Payout history

With no affiliate sales, graphs and statements will naturally show zero/empty data.

---

# STEP 7 — PASSWORD RESET

Open:

`/affiliate-forgot.html`

Enter affiliate email.

Confirm reset email arrives.

Set a new password through:

`/affiliate-reset.html?token=...`

All existing portal sessions are revoked after a successful password reset.

---

# IMPORTANT: CURRENT APPROVAL EMAIL

v3.3.3 provides an Admin tool to send the portal activation email manually.

After v3.3.3 is verified, the next refinement can automatically send the activation link directly as part of the normal Affiliate Approval workflow, so Admin does not need to open a second page.

---

# IMPORTANT: PRODUCT LINKS

The portal currently builds eligible links as:

`/lp/<product-slug>.html?aff=<AFFILIATE_CODE>`

If a product later uses a different public-page URL structure, we should update the link generator accordingly.

---

# PRODUCTION

Do not run the migration on Production until the full Preview portal flow has been tested:
Activation → Login → Dashboard → Logout → Forgot Password → Reset Password.
