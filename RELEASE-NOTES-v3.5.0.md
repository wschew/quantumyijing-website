# Quantum YiJing Academy Operating System v3.5.0

## Funnel and affiliate integration

- Makes `/funnel/yj12/` the question-first entry to the YJ12 marketing funnel.
- Keeps the full English course page at `/funnel/yj12/course.html` and the Chinese page at `/funnel/yj12/zh.html`.
- Preserves affiliate and campaign attribution through the questions, lead form, and course-registration links.
- Adds optional English and Chinese lead forms that save attributed enquiries to the existing CRM enquiry workflow.
- Adds Funnels as the eighth Admin navigation item and provides a central funnel-management page at `/admin-funnels.html`.
- Makes the YJ12 funnel selectable from the affiliate dashboard.
- Adds v3.5.0 cache identifiers so browsers load the updated funnel and affiliate files after deployment.

## Deployment

No database migration is required. Deploy the repository normally and verify `/funnel/yj12/`, `/admin-funnels.html`, and the affiliate dashboard after the deployment finishes.
