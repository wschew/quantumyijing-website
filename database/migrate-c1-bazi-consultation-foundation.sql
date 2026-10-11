-- C1-C1 foundation only. No seed data, provider calls, scheduler or activation.
-- Apply once to an independently verified schema; do not replay automatically.
CREATE TABLE consultation_promotions (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 product_id INTEGER CHECK(product_id IS NULL OR typeof(product_id)='integer') NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 version INTEGER CHECK(version IS NULL OR typeof(version)='integer') NOT NULL CHECK(version>0),
 currency TEXT NOT NULL CHECK(length(trim(currency))>0) DEFAULT 'MYR' CHECK(currency='MYR'),
 selling_price_sen INTEGER CHECK(selling_price_sen IS NULL OR typeof(selling_price_sen)='integer') NOT NULL CHECK(typeof(selling_price_sen)='integer' AND selling_price_sen>0 AND selling_price_sen<=130000),
 starts_on TEXT NOT NULL CHECK(length(trim(starts_on))>0),
 ends_on TEXT NOT NULL CHECK(length(trim(ends_on))>0),
 timezone TEXT NOT NULL CHECK(length(trim(timezone))>0) DEFAULT 'Asia/Kuala_Lumpur' CHECK(timezone='Asia/Kuala_Lumpur'),
 state TEXT NOT NULL CHECK(length(trim(state))>0) DEFAULT 'Draft' CHECK(state IN ('Draft','Inactive','Active','Expired','Revoked')),
 approved_by TEXT,
 approved_at INTEGER CHECK(approved_at IS NULL OR typeof(approved_at)='integer'),
 CHECK(length(starts_on)=10 AND length(ends_on)=10 AND date(starts_on,'+0 days') IS starts_on AND date(ends_on,'+0 days') IS ends_on AND ends_on>=starts_on),
 CHECK(state<>'Active' OR (approved_by IS NOT NULL AND length(trim(approved_by))>0 AND approved_at IS NOT NULL)),
 UNIQUE(product_id,version)
);
CREATE TABLE consultation_bookings (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 reference TEXT NOT NULL CHECK(length(trim(reference))>0) UNIQUE,
 product_id INTEGER CHECK(product_id IS NULL OR typeof(product_id)='integer') NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 service_code TEXT NOT NULL CHECK(length(trim(service_code))>0) DEFAULT 'BAZI' CHECK(service_code='BAZI'),
 customer_id INTEGER CHECK(customer_id IS NULL OR typeof(customer_id)='integer') NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 enquiry_id INTEGER CHECK(enquiry_id IS NULL OR typeof(enquiry_id)='integer') REFERENCES enquiries(id) ON DELETE RESTRICT,
 practitioner_id INTEGER CHECK(practitioner_id IS NULL OR typeof(practitioner_id)='integer') REFERENCES coaches(id) ON DELETE RESTRICT,
 state TEXT NOT NULL CHECK(length(trim(state))>0) CHECK(state IN ('Submitted','UnderReview','Offered','PaymentPending','Confirmed','Completed','ReportReady','ReportDelivered','Declined','OfferExpired','CancelledForfeited','NoShowForfeited','ExceptionReview','OwnerReview','ProviderRemedyPending')),
 current_offer_id TEXT REFERENCES consultation_offers(id) ON DELETE RESTRICT,
 original_start_at INTEGER CHECK(original_start_at IS NULL OR typeof(original_start_at)='integer'),
 current_start_at INTEGER CHECK(current_start_at IS NULL OR typeof(current_start_at)='integer'),
 current_end_at INTEGER CHECK(current_end_at IS NULL OR typeof(current_end_at)='integer'),
 completed_at INTEGER CHECK(completed_at IS NULL OR typeof(completed_at)='integer'),
 terminal_at INTEGER CHECK(terminal_at IS NULL OR typeof(terminal_at)='integer'),
 report_due_at INTEGER CHECK(report_due_at IS NULL OR typeof(report_due_at)='integer'),
 private_retention_until INTEGER CHECK(private_retention_until IS NULL OR typeof(private_retention_until)='integer'),
 report_channel TEXT NOT NULL CHECK(length(trim(report_channel))>0) CHECK(report_channel IN ('email','whatsapp')),
 free_reschedule_used INTEGER CHECK(free_reschedule_used IS NULL OR typeof(free_reschedule_used)='integer') NOT NULL DEFAULT 0 CHECK(free_reschedule_used IN (0,1)),
 row_version INTEGER CHECK(row_version IS NULL OR typeof(row_version)='integer') NOT NULL DEFAULT 0 CHECK(row_version>=0),
 created_at INTEGER CHECK(created_at IS NULL OR typeof(created_at)='integer') NOT NULL,
 updated_at INTEGER CHECK(updated_at IS NULL OR typeof(updated_at)='integer') NOT NULL,
 CHECK((current_start_at IS NULL AND current_end_at IS NULL) OR (current_start_at IS NOT NULL AND current_end_at IS NOT NULL AND current_end_at=current_start_at+5400000))
);
CREATE TABLE consultation_offers (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 booking_id TEXT NOT NULL CHECK(length(trim(booking_id))>0) REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 revision INTEGER CHECK(revision IS NULL OR typeof(revision)='integer') NOT NULL CHECK(revision>0),
 state TEXT NOT NULL CHECK(length(trim(state))>0) CHECK(state IN ('Issued','Accepted','PaymentReceived','Verified','Expired','Superseded','Revoked','ExceptionReview')),
 practitioner_id INTEGER CHECK(practitioner_id IS NULL OR typeof(practitioner_id)='integer') NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
 start_at INTEGER CHECK(start_at IS NULL OR typeof(start_at)='integer') NOT NULL,
 end_at INTEGER CHECK(end_at IS NULL OR typeof(end_at)='integer') NOT NULL CHECK(end_at=start_at+5400000),
 issued_at INTEGER CHECK(issued_at IS NULL OR typeof(issued_at)='integer') NOT NULL,
 expires_at INTEGER CHECK(expires_at IS NULL OR typeof(expires_at)='integer') NOT NULL CHECK(expires_at=issued_at+172800000),
 regular_price_sen INTEGER CHECK(regular_price_sen IS NULL OR typeof(regular_price_sen)='integer') NOT NULL CHECK(regular_price_sen=130000),
 selling_price_sen INTEGER CHECK(selling_price_sen IS NULL OR typeof(selling_price_sen)='integer') NOT NULL CHECK(typeof(selling_price_sen)='integer' AND selling_price_sen>0 AND selling_price_sen<=regular_price_sen),
 currency TEXT NOT NULL CHECK(length(trim(currency))>0) CHECK(currency='MYR'),
 promotion_id TEXT REFERENCES consultation_promotions(id) ON DELETE RESTRICT,
 promotion_version INTEGER CHECK(promotion_version IS NULL OR typeof(promotion_version)='integer'),
 order_id INTEGER CHECK(order_id IS NULL OR typeof(order_id)='integer') UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
 policy_version TEXT NOT NULL CHECK(length(trim(policy_version))>0),
 policy_hash TEXT NOT NULL CHECK(length(trim(policy_hash))>0) CHECK(length(policy_hash)=64 AND policy_hash NOT GLOB '*[^a-f0-9]*'),
 snapshot_hash TEXT NOT NULL CHECK(length(trim(snapshot_hash))>0) CHECK(length(snapshot_hash)=64 AND snapshot_hash NOT GLOB '*[^a-f0-9]*'),
 accepted_at INTEGER CHECK(accepted_at IS NULL OR typeof(accepted_at)='integer'),
 acceptance_policy_hash TEXT,
 acceptance_snapshot_hash TEXT,
 acceptance_customer_id INTEGER CHECK(acceptance_customer_id IS NULL OR typeof(acceptance_customer_id)='integer') REFERENCES customers(id) ON DELETE RESTRICT,
 issued_by TEXT NOT NULL CHECK(length(trim(issued_by))>0),
 UNIQUE(booking_id,revision),
 CHECK(start_at>=issued_at+259200000),
 CHECK((state NOT IN ('Accepted','PaymentReceived','Verified') AND accepted_at IS NULL AND acceptance_policy_hash IS NULL AND acceptance_snapshot_hash IS NULL AND acceptance_customer_id IS NULL) OR (accepted_at IS NOT NULL AND accepted_at>=issued_at AND accepted_at<expires_at AND acceptance_policy_hash IS NOT NULL AND acceptance_snapshot_hash IS NOT NULL AND acceptance_policy_hash=policy_hash AND acceptance_snapshot_hash=snapshot_hash AND acceptance_customer_id IS NOT NULL))
);
CREATE TABLE consultation_slot_reservations (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 booking_id TEXT NOT NULL CHECK(length(trim(booking_id))>0) REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 offer_id TEXT NOT NULL CHECK(length(trim(offer_id))>0) UNIQUE REFERENCES consultation_offers(id) ON DELETE RESTRICT,
 practitioner_id INTEGER CHECK(practitioner_id IS NULL OR typeof(practitioner_id)='integer') NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
 start_at INTEGER CHECK(start_at IS NULL OR typeof(start_at)='integer') NOT NULL,
 end_at INTEGER CHECK(end_at IS NULL OR typeof(end_at)='integer') NOT NULL CHECK(end_at=start_at+5400000),
 state TEXT NOT NULL CHECK(length(trim(state))>0) CHECK(state IN ('Held','Confirmed','Released')),
 hold_expires_at INTEGER CHECK(hold_expires_at IS NULL OR typeof(hold_expires_at)='integer'),
 CHECK(state<>'Held' OR hold_expires_at IS NOT NULL)
);
CREATE TABLE consultation_private_intakes (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 booking_id TEXT NOT NULL CHECK(length(trim(booking_id))>0) REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 revision INTEGER CHECK(revision IS NULL OR typeof(revision)='integer') NOT NULL CHECK(revision>0),
 encrypted_payload BLOB NOT NULL CHECK(typeof(encrypted_payload)='blob' AND length(encrypted_payload)>0),
 key_version TEXT NOT NULL CHECK(length(trim(key_version))>0),
 payload_schema_version INTEGER CHECK(payload_schema_version IS NULL OR typeof(payload_schema_version)='integer') NOT NULL CHECK(payload_schema_version>0),
 consent_version TEXT NOT NULL CHECK(length(trim(consent_version))>0),
 consented_at INTEGER CHECK(consented_at IS NULL OR typeof(consented_at)='integer') NOT NULL,
 verified_contact_reference TEXT NOT NULL CHECK(length(trim(verified_contact_reference))>0),
 adult_self_booking INTEGER CHECK(adult_self_booking IS NULL OR typeof(adult_self_booking)='integer') NOT NULL CHECK(adult_self_booking=1),
 retention_until INTEGER CHECK(retention_until IS NULL OR typeof(retention_until)='integer'),
 lawful_hold INTEGER CHECK(lawful_hold IS NULL OR typeof(lawful_hold)='integer') NOT NULL DEFAULT 0 CHECK(lawful_hold IN (0,1)),
 hold_reason TEXT,
 deleted_at INTEGER CHECK(deleted_at IS NULL OR typeof(deleted_at)='integer'),
 UNIQUE(booking_id,revision)
);
CREATE TABLE consultation_reschedule_requests (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 booking_id TEXT NOT NULL CHECK(length(trim(booking_id))>0) REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 requested_at INTEGER CHECK(requested_at IS NULL OR typeof(requested_at)='integer') NOT NULL,
 appointment_start_snapshot INTEGER CHECK(appointment_start_snapshot IS NULL OR typeof(appointment_start_snapshot)='integer') NOT NULL,
 original_start_snapshot INTEGER CHECK(original_start_snapshot IS NULL OR typeof(original_start_snapshot)='integer') NOT NULL,
 request_type TEXT NOT NULL CHECK(length(trim(request_type))>0) CHECK(request_type IN ('Free','Additional','Late')),
 state TEXT NOT NULL CHECK(length(trim(state))>0) CHECK(state IN ('Pending','Approved','Declined','Withdrawn','OwnerReview')),
 replacement_start_at INTEGER CHECK(replacement_start_at IS NULL OR typeof(replacement_start_at)='integer'),
 eligibility INTEGER CHECK(eligibility IS NULL OR typeof(eligibility)='integer') NOT NULL CHECK(eligibility IN (0,1)),
 decided_by TEXT,
 decided_at INTEGER CHECK(decided_at IS NULL OR typeof(decided_at)='integer'),
 exception_reason TEXT
);
CREATE TABLE consultation_reports (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 booking_id TEXT NOT NULL CHECK(length(trim(booking_id))>0) REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 version INTEGER CHECK(version IS NULL OR typeof(version)='integer') NOT NULL CHECK(version>0),
 object_key TEXT NOT NULL CHECK(length(trim(object_key))>0) UNIQUE,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^a-f0-9]*'),
 size_bytes INTEGER CHECK(size_bytes IS NULL OR typeof(size_bytes)='integer') NOT NULL CHECK(size_bytes>0),
 mime_type TEXT NOT NULL CHECK(length(trim(mime_type))>0) CHECK(mime_type='application/pdf'),
 state TEXT NOT NULL CHECK(length(trim(state))>0) CHECK(state IN ('Uploaded','Validated','Reviewed','Released','Deleted')),
 reviewed_by TEXT,
 reviewed_at INTEGER CHECK(reviewed_at IS NULL OR typeof(reviewed_at)='integer'),
 released_at INTEGER CHECK(released_at IS NULL OR typeof(released_at)='integer'),
 retention_until INTEGER CHECK(retention_until IS NULL OR typeof(retention_until)='integer') NOT NULL,
 lawful_hold INTEGER CHECK(lawful_hold IS NULL OR typeof(lawful_hold)='integer') NOT NULL DEFAULT 0 CHECK(lawful_hold IN (0,1)),
 hold_reason TEXT,
 deleted_at INTEGER CHECK(deleted_at IS NULL OR typeof(deleted_at)='integer'),
 UNIQUE(booking_id,version)
);
CREATE TABLE consultation_deliveries (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 booking_id TEXT NOT NULL CHECK(length(trim(booking_id))>0) REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 report_id TEXT REFERENCES consultation_reports(id) ON DELETE RESTRICT,
 channel TEXT NOT NULL CHECK(length(trim(channel))>0) CHECK(channel IN ('email','whatsapp')),
 template_version TEXT NOT NULL CHECK(length(trim(template_version))>0),
 deduplication_key TEXT NOT NULL CHECK(length(trim(deduplication_key))>0) UNIQUE,
 state TEXT NOT NULL CHECK(length(trim(state))>0) CHECK(state IN ('Pending','Sending','AcceptedByProvider','Delivered','Failed','Unknown','FollowUp','Cancelled')),
 provider_message_id TEXT,
 attempt_count INTEGER CHECK(attempt_count IS NULL OR typeof(attempt_count)='integer') NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 accepted_at INTEGER CHECK(accepted_at IS NULL OR typeof(accepted_at)='integer'),
 delivered_at INTEGER CHECK(delivered_at IS NULL OR typeof(delivered_at)='integer'),
 failed_at INTEGER CHECK(failed_at IS NULL OR typeof(failed_at)='integer'),
 failure_category TEXT,
 customer_channel_authorization_reference TEXT,
 deadline_at INTEGER CHECK(deadline_at IS NULL OR typeof(deadline_at)='integer') NOT NULL,
 CHECK(state<>'Delivered' OR delivered_at IS NOT NULL)
);
CREATE TABLE consultation_events (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 booking_id TEXT NOT NULL CHECK(length(trim(booking_id))>0) REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 offer_id TEXT REFERENCES consultation_offers(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL CHECK(length(trim(event_type))>0),
 previous_state TEXT,
 new_state TEXT,
 actor_role TEXT NOT NULL CHECK(length(trim(actor_role))>0) CHECK(actor_role IN ('owner','practitioner','booking_admin','customer','system')),
 actor_reference TEXT NOT NULL CHECK(length(trim(actor_reference))>0),
 occurred_at INTEGER CHECK(occurred_at IS NULL OR typeof(occurred_at)='integer') NOT NULL,
 correlation_id TEXT NOT NULL CHECK(length(trim(correlation_id))>0),
 command_id TEXT NOT NULL CHECK(length(trim(command_id))>0) UNIQUE,
 sanitized_metadata TEXT NOT NULL CHECK(length(trim(sanitized_metadata))>0) DEFAULT '{}' CHECK(json_valid(sanitized_metadata))
);
CREATE INDEX idx_consultation_bookings_customer ON consultation_bookings(customer_id,state);
CREATE INDEX idx_consultation_bookings_schedule ON consultation_bookings(practitioner_id,current_start_at,state);
CREATE UNIQUE INDEX idx_consultation_current_offer ON consultation_offers(booking_id) WHERE state IN ('Issued','Accepted','PaymentReceived');
CREATE INDEX idx_consultation_offer_expiry ON consultation_offers(state,expires_at);
CREATE INDEX idx_consultation_slots_overlap ON consultation_slot_reservations(practitioner_id,start_at,end_at,state);
CREATE INDEX idx_consultation_intake_retention ON consultation_private_intakes(retention_until,deleted_at);
CREATE INDEX idx_consultation_reschedule_pending ON consultation_reschedule_requests(booking_id,state,eligibility);
CREATE INDEX idx_consultation_report_retention ON consultation_reports(retention_until,deleted_at);
CREATE INDEX idx_consultation_delivery_followup ON consultation_deliveries(state,deadline_at);
CREATE INDEX idx_consultation_events_booking ON consultation_events(booking_id,occurred_at);
CREATE INDEX idx_consultation_promotion_product ON consultation_promotions(product_id,state,starts_on,ends_on);
CREATE TRIGGER consultation_offer_snapshot_immutable BEFORE UPDATE ON consultation_offers
 WHEN NEW.id IS NOT OLD.id
 OR NEW.booking_id IS NOT OLD.booking_id
 OR NEW.revision IS NOT OLD.revision
 OR NEW.practitioner_id IS NOT OLD.practitioner_id
 OR NEW.start_at IS NOT OLD.start_at
 OR NEW.end_at IS NOT OLD.end_at
 OR NEW.issued_at IS NOT OLD.issued_at
 OR NEW.expires_at IS NOT OLD.expires_at
 OR NEW.regular_price_sen IS NOT OLD.regular_price_sen
 OR NEW.selling_price_sen IS NOT OLD.selling_price_sen
 OR NEW.currency IS NOT OLD.currency
 OR NEW.promotion_id IS NOT OLD.promotion_id
 OR NEW.promotion_version IS NOT OLD.promotion_version
 OR NEW.policy_version IS NOT OLD.policy_version
 OR NEW.policy_hash IS NOT OLD.policy_hash
 OR NEW.snapshot_hash IS NOT OLD.snapshot_hash
 OR NEW.issued_by IS NOT OLD.issued_by
 BEGIN SELECT RAISE(ABORT,'consultation offer snapshot immutable'); END;
CREATE TRIGGER consultation_original_appointment_immutable BEFORE UPDATE ON consultation_bookings
 WHEN OLD.original_start_at IS NOT NULL AND NEW.original_start_at IS NOT OLD.original_start_at
 BEGIN SELECT RAISE(ABORT,'original appointment immutable'); END;
CREATE TRIGGER consultation_slot_insert_overlap BEFORE INSERT ON consultation_slot_reservations
 WHEN NEW.state IN ('Held','Confirmed') AND EXISTS(SELECT 1 FROM consultation_slot_reservations r WHERE r.practitioner_id=NEW.practitioner_id AND r.state IN ('Held','Confirmed') AND r.start_at<NEW.end_at AND r.end_at>NEW.start_at)
 BEGIN SELECT RAISE(ABORT,'consultation slot overlap'); END;
CREATE TRIGGER consultation_slot_update_overlap BEFORE UPDATE ON consultation_slot_reservations
 WHEN NEW.state IN ('Held','Confirmed') AND EXISTS(SELECT 1 FROM consultation_slot_reservations r WHERE r.id<>OLD.id AND r.practitioner_id=NEW.practitioner_id AND r.state IN ('Held','Confirmed') AND r.start_at<NEW.end_at AND r.end_at>NEW.start_at)
 BEGIN SELECT RAISE(ABORT,'consultation slot overlap'); END;

-- Additional boundary constraints. These do not substitute for authenticated API guards.
CREATE TRIGGER consultation_relationship_0_insert BEFORE INSERT ON consultation_bookings
 WHEN NEW.current_offer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_offers o WHERE o.id=NEW.current_offer_id AND o.booking_id=NEW.id AND o.practitioner_id=NEW.practitioner_id AND o.start_at=NEW.current_start_at AND o.end_at=NEW.current_end_at)
 BEGIN SELECT RAISE(ABORT,'booking current offer mismatch'); END;
CREATE TRIGGER consultation_relationship_0_update BEFORE UPDATE ON consultation_bookings
 WHEN NEW.current_offer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_offers o WHERE o.id=NEW.current_offer_id AND o.booking_id=NEW.id AND o.practitioner_id=NEW.practitioner_id AND o.start_at=NEW.current_start_at AND o.end_at=NEW.current_end_at)
 BEGIN SELECT RAISE(ABORT,'booking current offer mismatch'); END;
CREATE TRIGGER consultation_relationship_1_insert BEFORE INSERT ON consultation_offers
 WHEN NEW.acceptance_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_bookings b WHERE b.id=NEW.booking_id AND b.customer_id=NEW.acceptance_customer_id)
 BEGIN SELECT RAISE(ABORT,'acceptance customer mismatch'); END;
CREATE TRIGGER consultation_relationship_1_update BEFORE UPDATE ON consultation_offers
 WHEN NEW.acceptance_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_bookings b WHERE b.id=NEW.booking_id AND b.customer_id=NEW.acceptance_customer_id)
 BEGIN SELECT RAISE(ABORT,'acceptance customer mismatch'); END;
CREATE TRIGGER consultation_relationship_2_insert BEFORE INSERT ON consultation_offers
 WHEN (NEW.promotion_id IS NULL) <> (NEW.promotion_version IS NULL) OR (NEW.promotion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_promotions p JOIN consultation_bookings b ON b.id=NEW.booking_id WHERE p.id=NEW.promotion_id AND p.version=NEW.promotion_version AND p.product_id=b.product_id))
 BEGIN SELECT RAISE(ABORT,'promotion snapshot mismatch'); END;
CREATE TRIGGER consultation_relationship_2_update BEFORE UPDATE ON consultation_offers
 WHEN (NEW.promotion_id IS NULL) <> (NEW.promotion_version IS NULL) OR (NEW.promotion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_promotions p JOIN consultation_bookings b ON b.id=NEW.booking_id WHERE p.id=NEW.promotion_id AND p.version=NEW.promotion_version AND p.product_id=b.product_id))
 BEGIN SELECT RAISE(ABORT,'promotion snapshot mismatch'); END;
CREATE TRIGGER consultation_relationship_3_insert BEFORE INSERT ON consultation_slot_reservations
 WHEN NOT EXISTS(SELECT 1 FROM consultation_offers o WHERE o.id=NEW.offer_id AND o.booking_id=NEW.booking_id AND o.practitioner_id=NEW.practitioner_id AND o.start_at=NEW.start_at AND o.end_at=NEW.end_at AND (NEW.state<>'Held'
 OR NEW.hold_expires_at=o.expires_at))
 BEGIN SELECT RAISE(ABORT,'reservation offer mismatch'); END;
CREATE TRIGGER consultation_relationship_3_update BEFORE UPDATE ON consultation_slot_reservations
 WHEN NOT EXISTS(SELECT 1 FROM consultation_offers o WHERE o.id=NEW.offer_id AND o.booking_id=NEW.booking_id AND o.practitioner_id=NEW.practitioner_id AND o.start_at=NEW.start_at AND o.end_at=NEW.end_at AND (NEW.state<>'Held'
 OR NEW.hold_expires_at=o.expires_at))
 BEGIN SELECT RAISE(ABORT,'reservation offer mismatch'); END;
CREATE TRIGGER consultation_relationship_4_insert BEFORE INSERT ON consultation_deliveries
 WHEN NEW.report_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_reports r WHERE r.id=NEW.report_id AND r.booking_id=NEW.booking_id)
 BEGIN SELECT RAISE(ABORT,'delivery report mismatch'); END;
CREATE TRIGGER consultation_relationship_4_update BEFORE UPDATE ON consultation_deliveries
 WHEN NEW.report_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_reports r WHERE r.id=NEW.report_id AND r.booking_id=NEW.booking_id)
 BEGIN SELECT RAISE(ABORT,'delivery report mismatch'); END;
CREATE TRIGGER consultation_relationship_5_insert BEFORE INSERT ON consultation_events
 WHEN NEW.offer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_offers o WHERE o.id=NEW.offer_id AND o.booking_id=NEW.booking_id)
 BEGIN SELECT RAISE(ABORT,'event offer mismatch'); END;
CREATE TRIGGER consultation_relationship_5_update BEFORE UPDATE ON consultation_events
 WHEN NEW.offer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_offers o WHERE o.id=NEW.offer_id AND o.booking_id=NEW.booking_id)
 BEGIN SELECT RAISE(ABORT,'event offer mismatch'); END;
CREATE TRIGGER consultation_booking_identity_immutable BEFORE UPDATE ON consultation_bookings
 WHEN NEW.id IS NOT OLD.id OR ((NEW.customer_id IS NOT OLD.customer_id
 OR NEW.product_id IS NOT OLD.product_id) AND EXISTS(SELECT 1 FROM consultation_offers WHERE booking_id=OLD.id))
 BEGIN SELECT RAISE(ABORT,'booking offer ownership immutable'); END;
CREATE TRIGGER consultation_acceptance_immutable BEFORE UPDATE ON consultation_offers
 WHEN OLD.accepted_at IS NOT NULL AND (NEW.accepted_at IS NOT OLD.accepted_at
 OR NEW.acceptance_customer_id IS NOT OLD.acceptance_customer_id
 OR NEW.acceptance_policy_hash IS NOT OLD.acceptance_policy_hash
 OR NEW.acceptance_snapshot_hash IS NOT OLD.acceptance_snapshot_hash)
 BEGIN SELECT RAISE(ABORT,'acceptance evidence immutable'); END;
CREATE TRIGGER consultation_order_binding_immutable BEFORE UPDATE ON consultation_offers
 WHEN OLD.order_id IS NOT NULL AND NEW.order_id IS NOT OLD.order_id
 BEGIN SELECT RAISE(ABORT,'order binding immutable'); END;
CREATE TRIGGER consultation_report_identity_immutable BEFORE UPDATE ON consultation_reports
 WHEN NEW.id IS NOT OLD.id
 OR NEW.booking_id IS NOT OLD.booking_id
 BEGIN SELECT RAISE(ABORT,'report booking immutable'); END;
CREATE TRIGGER consultation_promotion_version_immutable BEFORE UPDATE ON consultation_promotions
 WHEN EXISTS(SELECT 1 FROM consultation_offers WHERE promotion_id=OLD.id) AND
 (NEW.id IS NOT OLD.id
 OR NEW.product_id IS NOT OLD.product_id
 OR NEW.version IS NOT OLD.version
 OR NEW.selling_price_sen IS NOT OLD.selling_price_sen
 OR NEW.starts_on IS NOT OLD.starts_on
 OR NEW.ends_on IS NOT OLD.ends_on
 OR NEW.currency IS NOT OLD.currency
 OR NEW.timezone IS NOT OLD.timezone)
 BEGIN SELECT RAISE(ABORT,'referenced promotion version immutable'); END;
