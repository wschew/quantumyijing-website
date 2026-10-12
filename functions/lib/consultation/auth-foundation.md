# C1-C2A-1 consultation authentication security foundation

LOCAL ONLY. No public authentication, intake or report endpoint is wired. No existing
admin, coach, affiliate or customer authentication is modified. ADMIN_TOKEN is not read
or accepted. One owner-approved QY consultation account has full consultation scope;
shared use attributes activity to that account/session, not an individual human.

## Passwords, cookies and guards

PBKDF2-HMAC-SHA256: 600000 iterations, random 32-byte salt, 20+ characters and <=128
UTF-8 bytes. Never lower the work factor to work around runtime limits.
Source: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
Session and CSRF secrets are independently random 256-bit values; only SHA-256 hashes
are stored. Fixed-length JS comparison has no early mismatch exit, but is NOT claimed
to provide guaranteed constant-time execution.

The __Host-QY_CONSULTATION cookie is Secure, HttpOnly, SameSite=Strict, Path=/, without
Domain; absolute lifetime is eight hours. Duplicate/malformed cookies, expired/revoked
sessions, disabled accounts and version mismatch are rejected. SQL prevents session
rebinding/extension/revival and unversioned credential replacement/version rollback.

Create the service with a trusted HTTPS origin and server-owned primary D1-compatible
binding. Do not derive these from request payloads or Host headers. Read authorization
allows GET/HEAD only; POST JSON mutations require exact Origin and a session-bound CSRF
header. Every future operation must call the guard; copied principals or client roles
are not authority. Customer ownership, privacy consent and private storage are C1-C2A-2.

## Atomic revocation and login

Initial request authentication is advisory, never the sole mutation authorization.
Logout's conditional UPDATE checks token hash, CSRF hash, active session, account enabled
state, matching generation and expiry using SQLite's clock inside the transaction.
Revoke-all makes the same checks while conditionally advancing password_version, which
also serves as the session generation. It then revokes all sessions in that transaction.
The immediately following audit INSERT requires changes()=1. Zero rows raise the fixed
authorization-failure trigger and roll back the entire D1 batch, with no success audit.
Other database failures return sanitized 503; authority failures return generic 401.

Advancing generation rejects an older in-flight login at its guarded session INSERT.
A login committed before revoke-all is revoked; a new login authenticated against the
new generation after revoke-all may succeed. No session can be resurrected. Successful
login, its audit and attempt reset also commit atomically. Future private mutations need
the same in-transaction authorization pattern, not application prechecks alone.

## Bounded failure evidence

An atomic singleton attempt bucket reserves at most five attempts per fifteen-minute
window and imposes a fifteen-minute lock. All usernames use this bucket; aliases and
concurrent Workers do not evade it. Failed reserved attempts update one fixed summary
row (saturating failure_count and last_failed_at); throttled requests create NO failure
or audit rows and do not update the summary. Attempts/locked_until retain useful lock
state. Successful authenticated actions have immutable, fixed-field audit events.
No audit field accepts submitted usernames, passwords, tokens, birth data or report data.

The single-account lock still permits temporary denial of new logins. Database queries
are still required to evaluate throttling. Before public exposure, approve request-volume
controls and operational monitoring; do not add an unauthenticated unlock/reset endpoint.

## Explicit local provisioning and recovery

Windows PowerShell 5.1 and Node with node:sqlite are required. Use a dedicated PRIVATE
local directory below this worktree or Windows Temp. The tools only READ ACLs and refuse
unknown owners or allow grants outside the current Windows identity, SYSTEM and local
Administrators. Broadly accessible Temp roots are refused. Existing permissions are
never changed automatically. Tests create NEW private synthetic directories and clean
up only their verified paths. There is no default account/password or first-visitor flow.

Initialization (the .sqlite file must not exist):

    .\scripts\Setup-Consultation-Account-Local.ps1 -LocalDatabase '<private-local-directory>\consultation.sqlite'

Use masked password/confirmation prompts and save the new credential privately in the
owner's encrypted password manager. No password is passed through argv or environment,
printed or stored in source/evidence. Input is capped at 4096 bytes and decoded with a
fatal streaming UTF-8 decoder. Invalid input fails safely. Memory erasure of every managed
string cannot be guaranteed; use a trusted local machine and avoid process dumps/logging.

Recovery/rotation requires an explicit owner-authorized LOCAL OS administrative action;
private Windows file access, not the shared ADMIN_TOKEN, is the administrative boundary.
Read only the username and password_version metadata using a trusted local SQLite client.
Then enter a fresh password privately and supply that exact expected version:

    .\scripts\Setup-Consultation-Account-Local.ps1 -LocalDatabase '<private-local-directory>\consultation.sqlite' -Mode Rotate -ExpectedVersion <verified-version> -AuthorizeLocalRecovery

The operator must type ROTATE. The Node tool also requires --authorized-local-recovery.
It rejects remote paths/interfaces, symlinks and unknown/broad ACLs. BEGIN IMMEDIATE wraps
an exact username/version CAS, salted credential replacement, generation advancement,
session revocation, lock reset and credential_rotated audit event. Exactly one account
row must change; otherwise all changes roll back. Consultation records and prior audits
are preserved. A disabled account stays disabled. Never replace, reset, reimport or delete
the consultation database for credential recovery. Never roll back to an old password or
reenable old sessions. Inspect failures; do not automatically retry. No remote recovery
interface or real credential rotation is implemented/executed by this task.

## Validation and remaining integration conditions

Synthetic tests cover split UTF-8, both revoke/login orderings, stale/expired/disabled
callers, zero-row CAS, full rollback, bounded failure records, private Windows storage,
record-preserving local rotation and real local D1/workerd behavior. Set QY_MINIFLARE_PATH
to an existing cached installation; run node scripts/test-consultation-auth.mjs. No network
providers or dependency download are required. No real account has been created.

Before Preview/public wiring: independent review, measured live plan CPU budget for the
unchanged hash cost, primary-database semantics, trusted origin/body limits, private
operator storage, logging/transport review, request-volume protections and explicit
owner authorization. Local workerd success does not certify live plan CPU limits.
Do not start C1-C2A-2 or expose private intake/report routes under this milestone.