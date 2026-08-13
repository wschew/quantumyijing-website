# Quantum YiJing® v3.3.2d — Affiliate Analytics Dashboard

This package is cumulative over v3.3.2c for:
- Affiliate search by name/code/email/ID
- Payout date/reference + payout notification email
- Individual Affiliate Detail
- Affiliate Analytics Dashboard

## IMPORTANT: Preview first

### Step 1 — Copy files

Copy all files into the existing QY project.

### Step 2 — Add visitor tracker to Affiliate landing page

Open `affiliate.html`.

Immediately before the existing closing `</body>` tag, add:

```html
<script src="/affiliate-visit.js" defer></script>
```

Do not remove the existing `affiliate.js` script.

This records ONE anonymous unique browser visitor per month. No visitor name/email is collected simply for viewing the landing page.

### Step 3 — D1 Preview migration

Run:

```sql
CREATE TABLE IF NOT EXISTS affiliate_page_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  visited_at TEXT NOT NULL,
  visited_date TEXT NOT NULL,
  visited_month TEXT NOT NULL,
  landing_page TEXT NOT NULL DEFAULT '/affiliate',
  referrer TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_affiliate_visits_month
  ON affiliate_page_visits(visited_month);

CREATE INDEX IF NOT EXISTS idx_affiliate_visits_visitor_month
  ON affiliate_page_visits(visitor_id, visited_month);

CREATE INDEX IF NOT EXISTS idx_affiliate_visits_source
  ON affiliate_page_visits(utm_source, visited_month);
```

Verify:

```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name='affiliate_page_visits';
```

### Step 4 — Commit/push Preview

Suggested commit:
`v3.3.2d affiliate analytics dashboard`

### Step 5 — Test visitor tracking

Open `/affiliate.html` once, then run:

```sql
SELECT visited_month,COUNT(DISTINCT visitor_id)
FROM affiliate_page_visits
GROUP BY visited_month;
```

### Step 6 — Test Admin analytics

Open:
`/admin-affiliates.html`

Enter Admin Token, choose month, click **Load Dashboard**.

Dashboard contains:
1. Monthly Affiliate Funnel — latest 12 months:
   - Unique landing-page visitors
   - Applications
   - Approved affiliates
   - Active affiliates (at least 1 successfully paid affiliate sale that month)
2. Monthly Affiliate Sales
3. Affiliate Sales by Country
4. Top 10 Affiliates by paid sales value
5. KPI cards

## Data rules

- Visitor = unique anonymous browser visitor per month.
- Application = application submitted in that month.
- Approved = affiliate approved in that month.
- Active = affiliate with ≥1 successfully paid affiliate sale in that month.
- Sales = paid affiliate sales only.
- Reversed/cancelled commissions are excluded.

## Historical limitation

Landing-page visitor tracking starts only after v3.3.2d is deployed. Previous visitor counts cannot be reconstructed accurately.

## Note

`affiliate_page_visits.country` stores Cloudflare country code for future visitor-source analytics.
Current "Affiliate Sales by Country" uses the affiliate member's registered country.
