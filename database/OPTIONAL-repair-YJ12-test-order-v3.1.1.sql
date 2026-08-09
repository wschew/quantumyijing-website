-- OPTIONAL exact-match repair for the user's YJ12 Bank Transfer TEST order.
-- Run ONLY if this exact TEST order exists and should be RM1,400.

UPDATE order_items
SET
  list_unit_price = 1800,
  discount_amount = 400,
  final_unit_price = 1400,
  unit_price = 1400,
  line_total = 1400,
  pricing_rule = 'Early Bird'
WHERE order_id = (
  SELECT id FROM orders
  WHERE order_reference = 'QY-20260809-336CCE'
    AND customer_email = 'test@example.com'
  LIMIT 1
);

UPDATE orders
SET subtotal = 1400,
    total = 1400,
    updated_at = CURRENT_TIMESTAMP
WHERE order_reference = 'QY-20260809-336CCE'
  AND customer_email = 'test@example.com';

SELECT o.order_reference,o.customer_email,o.total,
       oi.list_unit_price,oi.discount_amount,oi.final_unit_price,oi.pricing_rule
FROM orders o
JOIN order_items oi ON oi.order_id=o.id
WHERE o.order_reference='QY-20260809-336CCE';
