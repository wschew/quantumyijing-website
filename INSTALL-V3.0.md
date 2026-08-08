# Install Quantum YiJing® v3.0

1. Work only on `v2-development`.
2. Copy the v3.0 update files into the repository, replacing matching files.
3. In Cloudflare D1 → `quantumyijing-enquiries` → Console, run `database/migrate-v3.0.sql` ONCE.
4. Verify YJ12 exists with:
   `SELECT sku,slug,status,price,early_bird_price,early_bird_end FROM products WHERE sku='YJ12';`
5. Commit: `Add v3.0 automated product and sales funnel`
6. Push origin and wait for Cloudflare Preview.
7. Open `/product/yj12-yijing-science-of-prediction?utm_source=facebook&utm_medium=paid_social&utm_campaign=yj12_sep2026&aff=AFFTEST01`.
8. Submit one test registration. Check CRM, Marketing and Sales & Commerce.

Expected today (before 31 Aug 2026): effective YJ12 amount RM1,400. From 1 Sep 2026 it automatically becomes RM1,800.
