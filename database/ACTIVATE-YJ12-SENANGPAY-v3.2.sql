-- Quantum YiJing v3.2
-- Run this ONLY AFTER:
-- 1) SENANGPAY_MERCHANT_ID and SENANGPAY_SECRET_KEY are configured in Cloudflare,
-- 2) SENANGPAY_MODE is set,
-- 3) Return URL and Callback URL are configured in the senangPay dashboard,
-- 4) you are ready to test online checkout.

UPDATE products
SET senangpay_enabled=1, payment_provider='SenangPay', updated_at=CURRENT_TIMESTAMP
WHERE sku='YJ12';

SELECT sku,name_en,price,early_bird_price,early_bird_end,payment_provider,senangpay_enabled
FROM products
WHERE sku='YJ12';
