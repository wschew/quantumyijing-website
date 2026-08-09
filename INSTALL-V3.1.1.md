# Quantum YiJing v3.1.1 — Pricing + International Currency Display

## Main changes
1. Manual Admin orders now apply the active Early Bird price automatically.
2. Order items preserve List Price, Discount, Final Selling Price and Pricing Rule.
3. Public product pages show an optional display-currency converter.
4. Supported display currencies:
   MYR, USD, SGD, RMB/CNY, GBP, AUD, EUR, JPY, HKD, THB.
5. MYR remains the official product/checkout currency.
6. The selected display currency/rate/amount is saved with new public orders for reference.
7. Transaction / Settlement Reference is clearly labelled in the Payment dialog.

## Install
1. Stay on `v2-development`.
2. Replace the files in this update.
3. Run `database/migrate-v3.1.1.sql` ONCE.
4. Commit:
   `Add v3.1.1 pricing and international currency display`
5. Push Origin and wait for the green Cloudflare Preview.
6. Test YJ12:
   - New Admin order total should be RM1,400 while Early Bird is active.
   - Currency selector must include `RMB / CNY`.
   - Switching display currency must not change the official MYR payable price.

## Existing YJ12 test order
The earlier test order `QY-20260809-336CCE` was created before the pricing correction, so it remains RM1,800 unless repaired.
An OPTIONAL exact-match repair script is included:
`database/OPTIONAL-repair-YJ12-test-order-v3.1.1.sql`
Run it only if you want that specific TEST order corrected to RM1,400.
