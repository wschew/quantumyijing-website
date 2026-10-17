-- Stage A2: additive only; apply after guest and selfservice additions.
CREATE TABLE consultation_discount_codes (
 id TEXT PRIMARY KEY NOT NULL,
 product_id INTEGER NOT NULL REFERENCES products(id),
 verifier TEXT NOT NULL UNIQUE CHECK(length(verifier)=64 AND verifier NOT GLOB '*[^0-9a-f]*'),
 description TEXT NOT NULL CHECK(length(description)<=160),
 final_price_sen INTEGER NOT NULL CHECK(final_price_sen>0 AND final_price_sen<=130000),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 issued_by TEXT NOT NULL REFERENCES consultation_auth_sessions(id),
 revoked_at INTEGER,
 redeemed_booking_id TEXT UNIQUE REFERENCES consultation_bookings(id),
 redeemed_at INTEGER,
 CHECK((redeemed_booking_id IS NULL)=(redeemed_at IS NULL)),
 CHECK(revoked_at IS NULL OR redeemed_at IS NULL)
);
CREATE TRIGGER consultation_discount_immutable BEFORE UPDATE ON consultation_discount_codes
WHEN NEW.id IS NOT OLD.id OR NEW.product_id IS NOT OLD.product_id OR NEW.verifier IS NOT OLD.verifier OR NEW.description IS NOT OLD.description OR NEW.final_price_sen IS NOT OLD.final_price_sen OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at OR NEW.issued_by IS NOT OLD.issued_by OR OLD.revoked_at IS NOT NULL OR OLD.redeemed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Immutable discount'); END;
CREATE INDEX consultation_discount_inventory ON consultation_discount_codes(product_id,created_at DESC);
CREATE TRIGGER consultation_discount_no_delete BEFORE DELETE ON consultation_discount_codes
BEGIN SELECT RAISE(ABORT,'Discount audit retention'); END;
CREATE TABLE consultation_offer_prices (
 offer_id TEXT PRIMARY KEY NOT NULL REFERENCES consultation_offers(id),
 regular_price_sen INTEGER NOT NULL CHECK(regular_price_sen=130000),
 base_price_sen INTEGER NOT NULL CHECK(base_price_sen>0 AND base_price_sen<=regular_price_sen),
 discount_id TEXT REFERENCES consultation_discount_codes(id),
 discount_description TEXT,
 final_price_sen INTEGER NOT NULL CHECK(final_price_sen>0 AND final_price_sen<=base_price_sen),
 CHECK(discount_id IS NOT NULL OR final_price_sen=base_price_sen)
);
CREATE TRIGGER consultation_offer_prices_immutable BEFORE UPDATE ON consultation_offer_prices
BEGIN SELECT RAISE(ABORT,'Immutable price breakdown'); END;
CREATE TRIGGER consultation_offer_prices_no_delete BEFORE DELETE ON consultation_offer_prices
BEGIN SELECT RAISE(ABORT,'Price audit retention'); END;
CREATE TRIGGER consultation_offer_prices_consistent BEFORE INSERT ON consultation_offer_prices
WHEN NOT EXISTS(SELECT 1 FROM consultation_offers o WHERE o.id=NEW.offer_id AND o.regular_price_sen=NEW.regular_price_sen AND o.selling_price_sen=NEW.final_price_sen) OR (NEW.discount_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_discount_codes d JOIN consultation_offers o ON o.id=NEW.offer_id JOIN consultation_bookings b ON b.id=o.booking_id WHERE d.id=NEW.discount_id AND d.product_id=b.product_id AND d.redeemed_booking_id=b.id AND d.final_price_sen=NEW.final_price_sen AND d.description=NEW.discount_description))
BEGIN SELECT RAISE(ABORT,'Price breakdown mismatch'); END;
CREATE TABLE consultation_pricing_events (
 id TEXT PRIMARY KEY NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('PromotionDraft','PromotionApproved','PromotionRevoked','DiscountIssued','DiscountRevoked')),
 subject_id TEXT NOT NULL,
 session_id TEXT NOT NULL REFERENCES consultation_auth_sessions(id),
 created_at INTEGER NOT NULL
);
CREATE TRIGGER consultation_pricing_events_immutable BEFORE UPDATE ON consultation_pricing_events
BEGIN SELECT RAISE(ABORT,'Immutable pricing audit'); END;
CREATE TRIGGER consultation_pricing_events_no_delete BEFORE DELETE ON consultation_pricing_events
BEGIN SELECT RAISE(ABORT,'Pricing audit retention'); END;
CREATE TRIGGER consultation_promotion_overlap_insert BEFORE INSERT ON consultation_promotions
WHEN NEW.state='Active' AND EXISTS(SELECT 1 FROM consultation_promotions p WHERE p.product_id=NEW.product_id AND p.state='Active' AND p.starts_on<=NEW.ends_on AND p.ends_on>=NEW.starts_on)
BEGIN SELECT RAISE(ABORT,'Overlapping promotion'); END;
CREATE TRIGGER consultation_promotion_overlap_update BEFORE UPDATE ON consultation_promotions
WHEN NEW.state='Active' AND EXISTS(SELECT 1 FROM consultation_promotions p WHERE p.id<>OLD.id AND p.product_id=NEW.product_id AND p.state='Active' AND p.starts_on<=NEW.ends_on AND p.ends_on>=NEW.starts_on)
BEGIN SELECT RAISE(ABORT,'Overlapping promotion'); END;
CREATE TRIGGER consultation_promotion_approval_immutable BEFORE UPDATE ON consultation_promotions
WHEN OLD.approved_at IS NOT NULL AND (NEW.approved_at IS NOT OLD.approved_at OR NEW.approved_by IS NOT OLD.approved_by OR NEW.selling_price_sen IS NOT OLD.selling_price_sen OR NEW.starts_on IS NOT OLD.starts_on OR NEW.ends_on IS NOT OLD.ends_on OR NEW.version IS NOT OLD.version OR NEW.product_id IS NOT OLD.product_id OR NEW.currency IS NOT OLD.currency OR NEW.timezone IS NOT OLD.timezone)
BEGIN SELECT RAISE(ABORT,'Immutable approved promotion'); END;
CREATE TRIGGER consultation_promotion_no_delete BEFORE DELETE ON consultation_promotions
BEGIN SELECT RAISE(ABORT,'Promotion audit retention'); END;
