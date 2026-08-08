# Quantum YiJing® v2.7.1 — Unified Bilingual Marketing Framework

## Purpose
v2.7.1 corrects the language-switching omission discovered during v2.7 Preview testing.

## Changes
- Adds complete EN / 中文 switching to the v2.7 marketing framework.
- Membership landing page is bilingual, including hero copy, benefits, form labels, consent text and footer.
- Events, Promotions, News and Products pages are bilingual.
- Privacy Policy, Terms of Use, Disclaimer, Refund Policy and Cookie Policy switch as full pages rather than showing a separate Chinese summary.
- Language choice persists between pages through the existing `qy-language` local-storage preference.
- Page titles also switch language.
- Existing enquiry submission, UTM/campaign attribution and affiliate tracking are unchanged.

## Database
No D1 migration is required for v2.7.1.

## Test
1. Open `/lp/membership.html` on the latest Preview deployment.
2. Click 中文 and confirm the whole page changes to Chinese.
3. Navigate to Events, Promotions, News, Products and Legal pages; they should remain Chinese.
4. Click EN; all pages should return to English.
5. Submit a campaign-tracked enquiry and confirm the enquiry and attribution still reach D1.
