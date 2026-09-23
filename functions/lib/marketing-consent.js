/*
 * Quantum YiJing v3.9
 * Marketing Consent Foundation
 *
 * Shared consent logic for:
 * - WhatsApp marketing
 * - Email marketing
 * - Admin CRM
 * - Future campaign manager
 * - Future audience segmentation
 *
 * IMPORTANT:
 * No consent record = NOT eligible for marketing.
 * Only an explicit opted_in record is marketing-eligible.
 */

export function normalizeMarketingContact(
  channel,
  value
) {
  const normalizedChannel =
    String(channel || "")
      .trim()
      .toLowerCase();

  const raw =
    String(value || "")
      .trim();

  if (normalizedChannel === "whatsapp") {
    return raw
      .replace(/\D/g, "")
      .slice(0, 30);
  }

  if (normalizedChannel === "email") {
    return raw
      .toLowerCase()
      .slice(0, 320);
  }

  return "";
}

export async function getMarketingConsent({
  db,
  channel,
  contactValue
}) {
  if (!db) {
    throw new Error("Database is required");
  }

  const normalizedChannel =
    String(channel || "")
      .trim()
      .toLowerCase();

  if (
    normalizedChannel !== "whatsapp" &&
    normalizedChannel !== "email"
  ) {
    return null;
  }

  const normalizedContact =
    normalizeMarketingContact(
      normalizedChannel,
      contactValue
    );

  if (!normalizedContact) {
    return null;
  }

  const row = await db.prepare(`
    SELECT
      id,
      channel,
      contact_value,
      status,
      enquiry_id,
      consent_source,
      consent_text_version,
      consented_at,
      opted_out_at,
      created_at,
      updated_at
    FROM marketing_consents
    WHERE channel = ?
      AND contact_value = ?
    LIMIT 1
  `).bind(
    normalizedChannel,
    normalizedContact
  ).first();

  return row || null;
}

export async function isMarketingEligible({
  db,
  channel,
  contactValue
}) {
  const consent =
    await getMarketingConsent({
      db,
      channel,
      contactValue
    });

  return consent?.status === "opted_in";
}

export async function setMarketingConsent({
  db,
  channel,
  contactValue,
  status,
  enquiryId = null,
  source = "",
  consentTextVersion = "",
  notes = ""
}) {
  if (!db) {
    throw new Error("Database is required");
  }

  const normalizedChannel =
    String(channel || "")
      .trim()
      .toLowerCase();

  if (
    normalizedChannel !== "whatsapp" &&
    normalizedChannel !== "email"
  ) {
    throw new Error("Invalid marketing channel");
  }

  const normalizedContact =
    normalizeMarketingContact(
      normalizedChannel,
      contactValue
    );

  if (!normalizedContact) {
    throw new Error("Contact value is required");
  }

  const normalizedStatus =
    String(status || "")
      .trim()
      .toLowerCase();

  if (
    normalizedStatus !== "opted_in" &&
    normalizedStatus !== "opted_out"
  ) {
    throw new Error(
      "Invalid marketing consent status"
    );
  }

  const safeEnquiryId =
    Number(enquiryId) > 0
      ? Number(enquiryId)
      : null;

  const safeSource =
    String(source || "")
      .trim()
      .slice(0, 200);

  const safeVersion =
    String(consentTextVersion || "")
      .trim()
      .slice(0, 100);

  const safeNotes =
    String(notes || "")
      .trim()
      .slice(0, 1000);

  const eventType =
    normalizedStatus === "opted_in"
      ? "opt_in"
      : "opt_out";

  const current =
    await getMarketingConsent({
      db,
      channel: normalizedChannel,
      contactValue: normalizedContact
    });

  // Idempotency protection:
  // Repeated requests for the already-current consent state are a no-op.
  // A real state transition (opted_in <-> opted_out) is still audited.
  if (current && current.status === normalizedStatus) {
    return current;
  }

  const statements = [];

  if (!current) {
    statements.push(
      db.prepare(`
        INSERT INTO marketing_consents (
          channel,
          contact_value,
          status,
          enquiry_id,
          consent_source,
          consent_text_version,
          consented_at,
          opted_out_at,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?,
          CASE
            WHEN ? = 'opted_in'
            THEN CURRENT_TIMESTAMP
            ELSE ''
          END,
          CASE
            WHEN ? = 'opted_out'
            THEN CURRENT_TIMESTAMP
            ELSE ''
          END,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `).bind(
        normalizedChannel,
        normalizedContact,
        normalizedStatus,
        safeEnquiryId,
        safeSource,
        safeVersion,
        normalizedStatus,
        normalizedStatus
      )
    );
  } else {
    statements.push(
      db.prepare(`
        UPDATE marketing_consents
        SET
          status = ?,
          enquiry_id =
            COALESCE(?, enquiry_id),
          consent_source = ?,
          consent_text_version = ?,
          consented_at =
            CASE
              WHEN ? = 'opted_in'
              THEN CURRENT_TIMESTAMP
              ELSE consented_at
            END,
          opted_out_at =
            CASE
              WHEN ? = 'opted_out'
              THEN CURRENT_TIMESTAMP
              ELSE ''
            END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        normalizedStatus,
        safeEnquiryId,
        safeSource,
        safeVersion,
        normalizedStatus,
        normalizedStatus,
        current.id
      )
    );
  }

  statements.push(
    db.prepare(`
      INSERT INTO marketing_consent_events (
        marketing_consent_id,
        enquiry_id,
        channel,
        contact_value,
        event_type,
        source,
        consent_text_version,
        notes,
        created_at
      )
      SELECT
        id,
        ?,
        channel,
        contact_value,
        ?,
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP
      FROM marketing_consents
      WHERE channel = ?
        AND contact_value = ?
      LIMIT 1
    `).bind(
      safeEnquiryId,
      eventType,
      safeSource,
      safeVersion,
      safeNotes,
      normalizedChannel,
      normalizedContact
    )
  );

  await db.batch(statements);

  return await getMarketingConsent({
    db,
    channel: normalizedChannel,
    contactValue: normalizedContact
  });
}
