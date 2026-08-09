# Quantum YiJing v3.0.2

This update does two things:
1. Adds a database-driven Language field to the dynamic product page.
2. Reduces the excessive empty blue space above About This Course.

## Install
1. Confirm v3.0.1 is already installed.
2. Replace `functions/product/[slug].js`.
3. Append `product-funnel-v3.0.2.css` to the BOTTOM of your existing `product-funnel.css`.
4. Run `database/migrate-v3.0.2.sql` in Cloudflare D1 ONCE only.
5. Commit to `v2-development` with:
   `Add v3.0.2 course language and hero spacing`
6. Push Origin.
7. Wait for the Cloudflare Preview green check.
8. Test YJ12 in both EN and 中文.

Expected:
EN: Language — Chinese with English transcription
中文: 授课语言 — 中文授课，并提供英文文字转录
