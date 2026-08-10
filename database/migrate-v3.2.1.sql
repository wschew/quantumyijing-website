-- Quantum YiJing v3.2.1 - DOKU migration compatibility
-- Safe to run once after v3.2. Keeps legacy senangpay_enabled column as the online-checkout enable flag.
UPDATE products SET payment_provider='DOKU', updated_at=CURRENT_TIMESTAMP WHERE payment_provider='SenangPay';
UPDATE orders SET payment_provider='DOKU', updated_at=CURRENT_TIMESTAMP WHERE payment_provider='SenangPay' AND payment_status='Pending';
SELECT id,sku,name_en,payment_provider,senangpay_enabled FROM products ORDER BY id;
