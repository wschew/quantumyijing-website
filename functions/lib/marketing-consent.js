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

  if (
    normalizedChannel === "whatsapp"
  ) {
    return raw
      .replace(/\D/g, "")
      .slice(0, 30);
  }

  if (
    normalizedChannel === "email"
  ) {
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
    throw new Error(
      "Database is required"
    );
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

  const row =
    await db.prepare(`
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

  return (
    consent?.status === "opted_in"
  );
}