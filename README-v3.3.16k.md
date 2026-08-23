# Quantum YiJing v3.3.16k — Bilingual Affiliate T&C Correction

This is a presentation/content-only correction on top of v3.3.16j.

## No database migration
Do NOT run any new SQL for v3.3.16k.

## Replace
1. `affiliate-v3.3.16j.js`
2. `affiliate-v3.3.16j.css`

## Update the embedded application T&C
Because the v3.3.16j block was manually inserted into `affiliate.html`:
1. Open `affiliate.html`.
2. Locate `<section id="affiliateComplianceFields" ...>`.
3. Replace that entire v3.3.16j compliance/T&C section (including its script/link lines) with the complete contents of:
   `affiliate-v3.3.16j-form-snippet.html`

This preserves the same filenames so no other paths need changing.

## Full Terms page
`affiliate-terms-v3.3.16k-content-snippet.html` contains the matching bilingual T&C content.
Use it to replace the main Terms content area in the existing `affiliate-terms.html`, while keeping that page's existing QY header/footer and EN/中文 navigation.

## What changed
- Embedded T&C now changes with the existing EN / 中文 switch.
- Full Terms content is supplied in both English and Chinese.
- Agreement-checkbox wording changes with EN / 中文.
- Nationality/ID field labels and validation alerts are bilingual.
- Removed:
  `Final legal wording should be reviewed by QY's professional adviser before Production launch.`
- No payment logic changed.
- No commission logic changed.
- No payout logic changed.
- No attribution logic changed.
- No database schema changed.

## Quick Preview test
1. Open Affiliate Programme application page.
2. EN → open T&C → English.
3. 中文 → same T&C immediately changes to Chinese.
4. Checkbox wording also changes to Chinese.
5. Switch back to EN → English returns.
6. Confirm the removed internal legal-review sentence does not appear.
