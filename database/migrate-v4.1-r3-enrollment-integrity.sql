-- Additive: preflight duplicate current memberships before applying.
-- Existing duplicates must be reviewed; this migration does not delete rows.
CREATE UNIQUE INDEX idx_subscriptions_one_current_membership
ON subscriptions(membership_id)
WHERE status IN ('Pending','Active','PastDue','Paused');
