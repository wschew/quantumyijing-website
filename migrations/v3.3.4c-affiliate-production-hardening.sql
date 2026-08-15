-- Quantum YiJing® v3.3.4c — APPLY TO PREVIEW D1 FIRST
ALTER TABLE affiliates ADD COLUMN is_test_account INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_affiliates_test_account
ON affiliates(is_test_account, status);

UPDATE affiliates
SET is_test_account=1,
    notes=trim(COALESCE(notes,'') || ' INTERNAL QA / TEST ACCOUNT - EXCLUDE FROM BUSINESS REPORTING.')
WHERE affiliate_code IN ('QY-A0001','QY-A0002');

UPDATE affiliates
SET status='Archived',
    portal_enabled=0,
    admin_status_reason='Legacy test account archived before affiliate programme launch',
    admin_status_updated_at=CURRENT_TIMESTAMP,
    admin_status_updated_by='System',
    last_portal_disabled_at=CURRENT_TIMESTAMP
WHERE affiliate_code='QY-A0001';

UPDATE affiliates
SET status='Approved',
    portal_enabled=1,
    admin_status_reason='Permanent internal QA affiliate account',
    admin_status_updated_at=CURRENT_TIMESTAMP,
    admin_status_updated_by='System'
WHERE affiliate_code='QY-A0002';

SELECT id,affiliate_code,full_name,email,status,portal_enabled,is_test_account,admin_status_reason
FROM affiliates
WHERE affiliate_code IN ('QY-A0001','QY-A0002')
ORDER BY id;
