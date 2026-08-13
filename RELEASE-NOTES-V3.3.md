# Quantum YiJing® v3.3 — Release Notes

## Theme

**YJ12 Affiliate Programme + Registration Foundation**

## Added

### Affiliate master database

New `affiliates` table supporting:

- Unique affiliate code
- Individual / Company account type
- Contact information
- Country
- Bank payout details
- Approval status
- Optional commission override
- Privacy consent and Affiliate Terms acceptance
- Administrative notes

### Affiliate commission ledger

New `affiliate_commissions` table supporting:

- Affiliate
- Customer name
- Order reference
- Product
- Gross sale
- Commission rate snapshot
- Commission amount snapshot
- Pending / Approved / Payable / Paid / Reversed / Cancelled lifecycle

Historical commission calculations remain unchanged if the programme rate is changed later.

### Monthly payouts

New:

- `affiliate_payouts`
- `affiliate_payout_items`

Designed for QY accounts staff to:

1. Review approved commissions
2. Prepare month-end payout
3. Transfer commission manually by bank
4. Enter bank transaction reference
5. Mark payout as Paid
6. Generate Affiliate Commission Statement / Remittance Advice

### Affiliate programme settings

New `affiliate_settings` table.

Initial defaults:

- Programme: Enabled
- Default commission: 20%
- Referral attribution: 30 days
- Commission holding period: 14 days
- Payout frequency: Monthly
- Customer name visible for affiliate reconciliation: Yes

All values are intended to become editable through QY Admin.

### Orders

New order fields:

- `customer_country`
- `affiliate_id`
- `affiliate_rate`
- `affiliate_commission`
- `affiliate_attribution_source`
- `affiliate_attributed_at`

Existing `orders.affiliate_code` is preserved.

### YJ12

YJ12 remains affiliate-enabled.

If no product-specific commission was already configured, migration initializes:

- Commission type: percentage
- Commission value: 20%

## Privacy design

Affiliate statements may show the referred customer's name for sales reconciliation.

They should not expose:

- customer email
- phone / WhatsApp
- address
- card/bank/payment credentials

Affiliate bank account numbers should be masked in normal Admin lists and revealed only where required for authorised payout work.

## Payment architecture

Affiliate payout is independent of SenangPay-DOKU.

DOKU remains responsible for customer payment processing.

Quantum YiJing owns:

- affiliate attribution
- commission calculation
- commission ledger
- payout approval
- manual bank transfer
- payout accounting
- affiliate commission statements

## Next v3.3 implementation stages

Database migration is the first stage.

The next code/UI stages are:

1. Affiliate Programme landing/application page
2. Affiliate approval + code generation in Admin
3. Referral cookie / attribution tracking
4. Separate YJ12 registration/payment workflow
5. Paid-order commission creation
6. Affiliate sales / commission reporting
7. Month-end payout management
