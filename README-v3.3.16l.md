# Quantum YiJing v3.3.16l — Affiliate T&C Single-Language / Duplicate Fix

This is a very small corrective patch on top of v3.3.16k.

## Problem fixed
1. English T&C appeared twice.
2. Chinese view showed both Chinese and English.

The cause is that the embedded bilingual T&C already exists inside the affiliate application,
while a separate full-terms block can also be present on the same page.

## Install
Replace ONLY:
- `affiliate-v3.3.16j.js`

No SQL.
No D1 migration.
No payment logic changes.
No commission logic changes.
No payout logic changes.
No attribution logic changes.

`affiliate-v3.3.16l.css` is included as an optional reference, but the required fix is entirely in the JS replacement.

## What the JS now does
- On the Affiliate Application page, automatically removes an accidentally appended `.qy-aff-full-terms` block.
- Ensures only one full-terms block can remain.
- EN shows English only.
- 中文 shows Chinese only.
- Checkbox wording follows the selected language.
- Existing nationality / ID / T&C compliance saving remains unchanged.

## Preview test
1. Open Affiliate application.
2. EN -> expand T&C -> ONE English copy only.
3. 中文 -> expand T&C -> Chinese only, NO English underneath.
4. EN again -> English only.
5. Confirm application form still submits normally.
