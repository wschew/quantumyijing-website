-- Stage A3: apply once after 018. Existing codes, prices and migrations are untouched.
CREATE TABLE consultation_price_invitations (
 discount_id TEXT PRIMARY KEY NOT NULL REFERENCES consultation_discount_codes(id),
 base_price_sen INTEGER NOT NULL CHECK(base_price_sen>0 AND base_price_sen<=130000),
 promotion_id TEXT REFERENCES consultation_promotions(id),
 promotion_version INTEGER,
 CHECK((promotion_id IS NULL)=(promotion_version IS NULL))
);
CREATE TRIGGER consultation_price_invitation_immutable BEFORE UPDATE ON consultation_price_invitations
BEGIN SELECT RAISE(ABORT,'Immutable invitation price basis'); END;
CREATE TRIGGER consultation_price_invitation_no_delete BEFORE DELETE ON consultation_price_invitations
BEGIN SELECT RAISE(ABORT,'Invitation audit retention'); END;
CREATE TRIGGER consultation_price_invitation_consistent BEFORE INSERT ON consultation_price_invitations
WHEN NOT EXISTS(SELECT 1 FROM consultation_discount_codes d WHERE d.id=NEW.discount_id AND d.final_price_sen<=NEW.base_price_sen AND d.redeemed_at IS NULL AND d.revoked_at IS NULL) OR (NEW.promotion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_promotions p JOIN consultation_discount_codes d ON d.id=NEW.discount_id WHERE p.id=NEW.promotion_id AND p.version=NEW.promotion_version AND p.product_id=d.product_id AND p.selling_price_sen=NEW.base_price_sen))
BEGIN SELECT RAISE(ABORT,'Invitation price basis mismatch'); END;
