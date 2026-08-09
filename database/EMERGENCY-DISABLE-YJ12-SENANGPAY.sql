-- Emergency switch: disables public SenangPay checkout without deleting data.
UPDATE products
SET senangpay_enabled=0, updated_at=CURRENT_TIMESTAMP
WHERE sku='YJ12';

SELECT sku,senangpay_enabled,payment_provider
FROM products WHERE sku='YJ12';
