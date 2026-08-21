# Quantum YiJing v3.3.15h — Clean Sales Dashboard + Record Payment Fix

Built directly from the tested v3.3.15f baseline.

No D1 migration is required.

Replace:
- admin.html
- admin.js
- functions/api/admin.js

Changes:
1. Removed the three dashboard KPI boxes:
   - Platform / Provider Fees
   - Net Amount
   - Bank Received
2. Kept Gross Sales as the only money KPI.
3. Removed the complete Payment & Accounting Records table/section from Sales & Commerce.
4. Added Monthly Gross Sales graph for the latest 12 months.
5. Fixed the Orders -> Record Payment action:
   - payment data is still loaded in the background even though the accounting table is no longer displayed;
   - clicking Record Payment opens the existing payment for that exact order;
   - if payment data has not loaded yet, it is fetched immediately before opening the dialog.
6. The tested v3.3.15f verification, manual hash override, customer receipt and QY accounting receipt logic is unchanged.

Recommended test:
- Open Sales & Commerce: confirm only Gross Sales money KPI remains.
- Confirm Payment & Accounting Records section is gone.
- Confirm Monthly Gross Sales graph appears.
- Click Record Payment for test67 / another Pending order and confirm the payment dialog opens.
- Complete verification and confirm both receipt emails.
