UPDATE products SET senangpay_enabled=0, updated_at=CURRENT_TIMESTAMP WHERE payment_provider='DOKU';
SELECT id,sku,payment_provider,senangpay_enabled FROM products ORDER BY id;
