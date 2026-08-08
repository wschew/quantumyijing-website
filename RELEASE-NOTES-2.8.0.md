# Quantum YiJing v2.8.0 — Marketing CRM

v2.8 connects the Digital Business Platform marketing funnel to the Academy Operating System.

## Added
- Academy Operating System version updated to v2.8
- Marketing module in `/admin`
- Enquiries by source analytics
- Campaign performance analytics
- Affiliate referral analytics
- Landing-page attribution analytics
- Recent attributed-enquiry table
- Marketing source, campaign and affiliate information in CRM records
- Source/campaign/affiliate CRM filters
- Marketing fields in CRM CSV export
- UTM term capture (`utm_term`) for paid-search campaigns

## Attribution fields
- marketing_source
- utm_source
- utm_medium
- utm_campaign
- utm_content
- utm_term
- campaign_code
- affiliate_code
- landing_page
- referrer

## Security / privacy
- No advertising cookie is required by this attribution system.
- Attribution is saved only when an enquiry is submitted.
- The existing admin token still protects CRM data.

## Database
Run `database/migrate-v2.8.sql` once after the v2.7 migration.
