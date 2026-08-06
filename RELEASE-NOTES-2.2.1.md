# Quantum YiJing International Academy — v2.2.1

## Branded Email + Enquiry Database

### Added
- Permanent Cloudflare D1 storage for every valid website enquiry.
- Automatic Malaysia date and time, UTC timestamp, unique reference, status and source.
- Protected CSV export compatible with Microsoft Excel and Chinese text.
- Optional date-range and row-limit filters for exports.
- Database schema and setup instructions.

### Existing functionality retained
- Bilingual branded customer acknowledgement.
- Internal notification to `info@quantumyijing.com`.
- Resend integration and reply-to behavior.
- Honeypot, consent and server-side validation.

### Required Cloudflare configuration
- D1 binding: `ENQUIRIES_DB` for Preview and Production.
- Secret: `ENQUIRY_EXPORT_TOKEN` for Preview and Production.
- Existing `RESEND_API_KEY` remains unchanged.
