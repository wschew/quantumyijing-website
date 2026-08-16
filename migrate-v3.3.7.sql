-- Quantum YiJing v3.3.7
-- Flexible Final Agreed Fee per order
-- Apply to PREVIEW D1 first.

ALTER TABLE orders ADD COLUMN final_agreed_total REAL;
ALTER TABLE orders ADD COLUMN fee_adjustment_reason TEXT;
ALTER TABLE orders ADD COLUMN fee_adjusted_at TEXT;

-- Existing orders keep their current total unless Admin later applies an agreed fee.
UPDATE orders
SET final_agreed_total = total
WHERE final_agreed_total IS NULL;
