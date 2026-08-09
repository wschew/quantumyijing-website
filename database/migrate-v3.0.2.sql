-- Quantum YiJing v3.0.2
-- Run ONCE only after v3.0.1.

ALTER TABLE products ADD COLUMN language_en TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN language_zh TEXT NOT NULL DEFAULT '';

UPDATE products
SET
  language_en = 'Chinese with English transcription',
  language_zh = '中文授课，并提供英文文字转录',
  updated_at = CURRENT_TIMESTAMP
WHERE sku = 'YJ12';

SELECT sku, language_en, language_zh
FROM products
WHERE sku = 'YJ12';
