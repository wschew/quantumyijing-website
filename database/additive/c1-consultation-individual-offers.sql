-- Stage A4; apply once after 019. No existing data or constraints are changed.
CREATE TABLE consultation_guest_request_terms (
 booking_id TEXT PRIMARY KEY NOT NULL REFERENCES consultation_bookings(id),
 policy_version TEXT NOT NULL,
 policy_hash TEXT NOT NULL CHECK(length(policy_hash)=64 AND policy_hash NOT GLOB '*[^0-9a-f]*'),
 fingerprint_key_id TEXT NOT NULL,
 acknowledged_at INTEGER NOT NULL
);
CREATE TRIGGER consultation_guest_request_terms_immutable BEFORE UPDATE ON consultation_guest_request_terms
BEGIN SELECT RAISE(ABORT,'Immutable request acknowledgement'); END;
CREATE TRIGGER consultation_guest_request_terms_no_delete BEFORE DELETE ON consultation_guest_request_terms
BEGIN SELECT RAISE(ABORT,'Request acknowledgement retained'); END;
CREATE TABLE consultation_individual_offer_prices (
 offer_id TEXT PRIMARY KEY NOT NULL REFERENCES consultation_offers(id),
 command_id TEXT NOT NULL UNIQUE REFERENCES consultation_workflow_commands(command_id),
 regular_price_sen INTEGER NOT NULL CHECK(regular_price_sen=130000),
 base_price_sen INTEGER NOT NULL CHECK(typeof(base_price_sen)='integer' AND base_price_sen>0 AND base_price_sen<=regular_price_sen),
 final_price_sen INTEGER NOT NULL CHECK(typeof(final_price_sen)='integer' AND final_price_sen>0 AND final_price_sen<=base_price_sen),
 description TEXT NOT NULL CHECK(length(description)<=160),
 policy_text TEXT NOT NULL
);
CREATE TRIGGER consultation_individual_offer_prices_immutable BEFORE UPDATE ON consultation_individual_offer_prices
BEGIN SELECT RAISE(ABORT,'Immutable individual offer'); END;
CREATE TRIGGER consultation_individual_offer_prices_no_delete BEFORE DELETE ON consultation_individual_offer_prices
BEGIN SELECT RAISE(ABORT,'Individual offer audit retained'); END;
CREATE TRIGGER consultation_individual_offer_prices_consistent BEFORE INSERT ON consultation_individual_offer_prices
WHEN NOT EXISTS(SELECT 1 FROM consultation_offers o JOIN consultation_workflow_commands c ON c.booking_id=o.booking_id WHERE o.id=NEW.offer_id AND c.command_id=NEW.command_id AND o.regular_price_sen=NEW.regular_price_sen AND o.selling_price_sen=NEW.final_price_sen)
BEGIN SELECT RAISE(ABORT,'Individual offer price mismatch'); END;
