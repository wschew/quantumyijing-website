# Quantum YiJing v3.0.2a Hotfix

No D1 migration is required.

This hotfix:
1. Displays the database-driven Language card:
   EN: Chinese with English transcription
   中文: 中文授课，并提供英文文字转录
2. Makes the pre-filled registration message bilingual.
3. Preserves a visitor's typed message if they switch languages after editing.

Install:
1. Replace `functions/product/[slug].js`.
2. Commit to `v2-development`:
   `Fix v3.0.2 bilingual registration message and language card`
3. Push Origin.
4. Wait for the green Cloudflare Preview deployment.
5. Test EN and 中文.
