-- Consultation-only annotations; orders/payments/accounting are never written by this migration.
CREATE TABLE consultation_capture_reviews (
 id TEXT NOT NULL PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 offer_id TEXT NOT NULL REFERENCES consultation_offers(id) ON DELETE RESTRICT,
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
 sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence>=1),
 captured_at INTEGER NOT NULL CHECK(typeof(captured_at)='integer'),
 evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 128 AND evidence_reference NOT GLOB '*[^A-Za-z0-9_-]*'),
 evidence_hash TEXT NOT NULL CHECK(length(evidence_hash)=64 AND evidence_hash NOT GLOB '*[^a-f0-9]*'),
 reviewed_by TEXT NOT NULL REFERENCES consultation_auth_sessions(id) ON DELETE RESTRICT,
 audit_id TEXT NOT NULL UNIQUE REFERENCES consultation_capture_audit(id) ON DELETE RESTRICT,
 reviewed_at INTEGER NOT NULL CHECK(typeof(reviewed_at)='integer' AND captured_at<=reviewed_at),
 UNIQUE(offer_id,sequence)
);
CREATE TABLE consultation_capture_audit (
 id TEXT NOT NULL PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 event TEXT NOT NULL CHECK(event IN ('OrderLinked','IndependentFinanceReview')),
 actor_reference TEXT NOT NULL REFERENCES consultation_auth_sessions(id) ON DELETE RESTRICT,
 occurred_at INTEGER NOT NULL
);
CREATE TRIGGER consultation_capture_review_insert BEFORE INSERT ON consultation_capture_reviews
 WHEN EXISTS(SELECT 1 FROM consultation_capture_reviews WHERE id=NEW.id OR audit_id=NEW.audit_id OR (offer_id=NEW.offer_id AND sequence=NEW.sequence))
 OR NOT EXISTS(SELECT 1 FROM consultation_capture_audit a WHERE a.id=NEW.audit_id AND a.booking_id=NEW.booking_id AND a.event='IndependentFinanceReview' AND a.actor_reference=NEW.reviewed_by AND a.occurred_at=NEW.reviewed_at)
 OR NEW.sequence<>COALESCE((SELECT MAX(sequence)+1 FROM consultation_capture_reviews WHERE offer_id=NEW.offer_id),1)
 OR NOT EXISTS(SELECT 1 FROM consultation_bookings b JOIN consultation_offers o ON o.id=b.current_offer_id JOIN payments p ON p.id=NEW.payment_id
 WHERE b.id=NEW.booking_id AND b.customer_id=NEW.customer_id AND o.id=NEW.offer_id AND o.order_id=NEW.order_id AND p.order_id=NEW.order_id)
 BEGIN SELECT RAISE(ABORT,'capture review rejected'); END;
CREATE TRIGGER consultation_capture_review_update BEFORE UPDATE ON consultation_capture_reviews BEGIN SELECT RAISE(ABORT,'capture evidence immutable'); END;
CREATE TRIGGER consultation_capture_review_delete BEFORE DELETE ON consultation_capture_reviews BEGIN SELECT RAISE(ABORT,'capture evidence immutable'); END;
CREATE TRIGGER consultation_capture_audit_insert BEFORE INSERT ON consultation_capture_audit
 WHEN EXISTS(SELECT 1 FROM consultation_capture_audit WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'capture audit rejected'); END;
CREATE TRIGGER consultation_capture_audit_update BEFORE UPDATE ON consultation_capture_audit BEGIN SELECT RAISE(ABORT,'capture audit immutable'); END;
CREATE TRIGGER consultation_capture_audit_delete BEFORE DELETE ON consultation_capture_audit BEGIN SELECT RAISE(ABORT,'capture audit immutable'); END;
