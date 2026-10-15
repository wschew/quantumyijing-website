# Quantum YiJing C1 - Step 2D-B4A

Passkey security hardening and integration architecture

Date: 2026-10-15 (Asia/Kuala_Lumpur)

**Design only. CONDITIONAL candidate for isolated B4B implementation; integration and deployed Cloudflare Free qualification remain BLOCKED.** This document authorizes no implementation, deployment, provisioning, real enrollment or change to active C1 authentication.

## 1. Verified baseline and evidence

Branch `c1-bazi-consultation-development`; full HEAD `d083ebc4670af19d52edb7818060137167b6f81f`. Initial working tree was clean. The read-only migration verifier returned `ok:true`, all 15 pins, zero remote operations; it also checks order/inventory, prerequisites and compatibility sources. No AGENTS.md was found in the workspace inventory.

Only this new document is changed. Existing runtime authentication, business SQL, PBKDF2, frozen Academy modules, all pinned migrations, manifest, configuration and prior evidence remain untouched. No server control, staging, commit, push, merge or tag. Public plan documentation was read; no Cloudflare operational/account API, remote provisioning, deployment, real credential or provider integration was used. Port 8789 was not restarted.

Evidence keys used below:

| Key | Exact reference |
|---|---|
| E1 | `docs/quantum-yijing-c1-u3-b2b-step-2d-b3-report.md`: previous Free/readiness assessment and integration conflicts |
| E2 | `docs/quantum-yijing-c1-step2db2b-measurements.json`: reconciled observations, raw management samples and browser summaries |
| E3 | `.local-c1-package-step2db2b-rarnbZ/result.json`: owner browser 21 passes, zero failures/no setupError; SHA-256 recorded in E2: `cb8786147089770c52eff8f5eedb0dfd53a556c3869d0d9c5a57440c38c351a2` |
| E4 | `.local-c1-package-step2db2b-regression/management-final-v3.json` and `.log`: 17 management checks, restart/revocation, all five backward windows, audit rollback and cleanup |
| E5 | `.local-c1-package-step2db2b-regression/d1.json` and `.log`: 65 D1 checks, post-verification barriers and rollback |
| E6 | `scripts/webauthn-d1-worker.mjs`, `webauthn-d1-schema.sql`, `webauthn-synthetic-validation.mjs`: current isolated implementation |
| E7 | `functions/lib/consultation/auth.js`, `auth-crypto.js`, `workflow-guards.js`, `customer-contact.js`: existing authorization and embedded transaction guards |
| E8 | `database/migrate-c1-consultation-auth.sql`, `database/c1-migration-manifest.json`; `functions/lib/consultation/preview-composition.js`, `preview-adapter.js`, `workflow-handler.js`; `consultation-pages/worker.js`: schema, contract, routing and isolation constraints |

Existing results are evidence of the old implementation, not tests of this design. Browser 21, management 17, D1 65 and the two 247-check validator modes overlap semantically; do not sum them as unique security cases. E2 separately reconciles 982 C1 checks including six reproducibility checks. No runtime suites were rerun in this documentation phase. The earlier Chrome sandbox failure and owner-verified standalone authentication 50/50 remain separate evidence; this design does not turn either into a new Codex browser/authentication pass.

## 2. Non-negotiable invariants and trust boundaries

1. Business authority requires an enabled account, at least two approved active custody groups, a current passkey-authenticated session and every existing C1 authorization condition. A valid admission MAC, one proof, enrollment grant or cached principal is never business authority.
2. No public bootstrap, recovery, unlock, maintenance or emergency password endpoint. No ADMIN_TOKEN, coach/affiliate/portal credential or reduced-strength PBKDF2 fallback.
3. Challenge attempts, proof consumption, counter CAS, epochs, session/provenance and audit commit under database-enforced conditions. Asynchronous verification never substitutes for the final SQL guard.
4. Anonymous admission cannot deduct authenticated control capacity. Validating an ordinary session does not update last-seen time or a rate bucket on every request.
5. No two-key business gate bypass during loss/recovery. Lockdown may remove authority; restoration requires two independently controlled approved authenticators.
6. Same-database transactional authorization is retained. No separate authorization service or cross-binding cache bypasses business SQL.

Text trust-boundary diagram:

```text
 UNTRUSTED: Internet, payloads/headers, browser JavaScript, submitted credential IDs
                 |
 [TB1 request admission]
 exact configured HTTPS origin/path/method; byte/deadline bounds; local MAC checks
                 |
       +---------+------------------------------------------+
       | anonymous login                                  | protected control/read
       | signed pre-auth admission + HttpOnly nonce cookie | opaque C1 cookie + gate MAC
       |                                                   | mutation: bound CSRF header
       +-----------------------+---------------------------+
                               |
 [TB2 proof verification: bounded parser, RP/origin, signature, UP/UV]
 NO database authority from browser claims; no trust in MAC as authentication
                               |
 [TB3 server-owned PRIMARY D1, one transaction/snapshot]
 account enabled/mode + legacy version + auth/key/policy epochs
 live session/provenance + credential/custody + challenge/operation binding
 atomic counter/proof/CAS + mutation/session + immutable audit
                               |
 [TB4 C1 authority contract]
 existing session/CSRF checks AND new passkey predicates
 embedded guards inside every relevant business mutation/read snapshot
                               |
 consultation scope only; existing customer/OTP/ownership/business rules retained

 TRUSTED, SEPARATE OFFLINE CONTROL PLANE (no HTTP route):
 independently authorized operator + custody inventory + restore/recovery record
 -> scoped bootstrap/repair grant in isolated D1; cannot issue business session
 -> two-key possession/custody checks -> guarded activation
```

The owner/operator and database administration boundary remains trusted and powerful. A compromised server MAC key can defeat the admission filter but cannot by itself satisfy WebAuthn or SQL session checks. A compromised database administrator can replace public keys/epochs; no local SQL scheme protects against that administrator. A compromised exact-RP browser origin can solicit misleading signatures; fresh UV is not a trusted display of transaction details.

## 3. Threat matrix

| Threat / actor | Current gap or attack | Proposed control | Residual / status |
|---|---|---|---|
| Anonymous caller floods control | Current control=30/min is charged before session verification; can block logout/revoke | Separate protected lanes, locally authenticated gate+CSRF filter, current authority before any protected-budget debit | Bucket separation testable; global resource availability BLOCKED |
| Login/challenge flood | Anonymous begin allocates D1 rows and writes | Small account-wide durable budgets, bounded outstanding rows, one attempt per challenge, admission before crypto | New login can deliberately be denied under attack; CONDITIONAL |
| Repeated bad signatures / valid-ticket replay | CPU and database work despite no login | Atomic one-attempt reservation before signature work; browser binding; replay lookup never creates another event/session | Network/lookup/Worker quota attack remains BLOCKED |
| Caller-controlled source keys | Unlimited rate-bucket rows | Fixed scope IDs; browser/operation state only in globally capped tables; no unbounded IP/name map | Trusted operator cannot evade caps casually; CONDITIONAL |
| Token guessing | Arbitrary cookies reach database | Random C1 bearer plus a bound admission MAC checked before lookup; MAC is only filter | Forged/invalid requests still spend Worker CPU; CONDITIONAL |
| Stolen browser cookie | Current bearer can enroll keys within session lifetime | CSRF + fresh operation-bound UV; two existing custody groups for key/policy changes | XSS/browser compromise still dangerous; CONDITIONAL |
| Same provider/device holds two keys | Distinct IDs do not establish independence | Operator-approved custody groups; distinct groups in proof quorum; synced-provider credentials share a group | Physical independence not cryptographically proven by none attestation; BLOCKED |
| Concurrent use / stale verification | Read/crypto can precede revoke/reset | Database epoch/counter/session/proof CAS at final commit, including business SQL | Local mechanism PASS, proposed extensions CONDITIONAL |
| Time rollback / fixed-window burst | Current lower window denies but boundary allows bursts | Persistent no-backward budget state; short and long token buckets plus UTC-day cap; reject clock anomalies | External trusted clock/restore history unproven; CONDITIONAL |
| Audit/database quota failure | Partial mutation or successful response without evidence | Mandatory audit and effect in same transaction; fail closed; bounded failure summaries | Database unavailable means server revocation cannot be guaranteed; BLOCKED availability |
| Snapshot restore | Restores revoked keys, epochs and grants | Disabled restore mode; external revocation inventory; rotate epochs/grants before reopening | Offline rehearsal and operator authority CONDITIONAL |
| Slow/oversized input | Byte cap alone does not bound duration/concurrency | 20,000-byte maximum, bounded signed fields, parser limits, deadline/cancellation and concurrency cap | Exact runtime cancellation behavior requires tests; CONDITIONAL |
| Shared-origin XSS | /qy is not a WebAuthn security boundary | Existing CSP/frame denial; trusted RP UI; no client actor/role trust | Separate origin is a separate deployment/RP decision; BLOCKED broader assurance |
| Public password or recovery bypass | Retains takeover and CPU path | No new fallback; future cutover explicitly disables legacy login/session eligibility in passkey mode | Active route changes outside B4B; BLOCKED integration |

## 4. Admission and resource policy

### 4.1 Admission filters are not authorization

Preserve the opaque 64-hex `__Host-QY_CONSULTATION` C1 cookie. Add a separate short-lived Secure/HttpOnly/SameSite=Strict/host-only admission cookie, provisionally `__Host-QY_CONSULTATION_GATE`, MACed with a dedicated HMAC-SHA256 key. A fixed bounded encoding binds version, key ID, account, session ID/token digest, CSRF digest, expiry and route classes. Do not reuse password, encryption, OTP, fingerprint or business keys. Accept a previous MAC key only within a bounded existing-ticket lifetime; unknown/missing keys deny, never fall back to an unfiltered control route.

Check MAC, lifetime, cookie-token binding and mutation CSRF digest locally before any protected D1 lookup. Recheck the actual stored session, CSRF and epochs in D1 before granting authority or committing. The filter is not a new authorization system. Logout success or reads cannot be inferred from the MAC. A revoked session may retain a valid MAC until expiry; live D1 still denies it. No gate cookie renewal/extension without fresh authentication; cap its lifetime at the session's five-minute absolute expiry.

Anonymous login uses a separate non-authoritative pre-auth cookie and short-lived signed admission ticket, both browser-bound. Minting them does not allocate a D1 identity or grant consultation authority. Exact-origin JSON POST remains mandatory. Ticket minting can be attacked for CPU/requests; it is not a CAPTCHA, rate guarantee or proof of a person. Never accept a caller-supplied account, scope, bucket key or claimed trusted proxy header.

### 4.2 Exact lanes and provisional caps for B4B tests

Numbers below are policy hypotheses, not approved production limits. Account-wide state is authoritative in D1, never in a Worker isolate. Routine controls have a separate normal-traffic allocation from anonymous budgets.

| Scope / trusted identity | Reservation point / provisional bound | Exhaustion behavior |
|---|---|---|
| `ANON_LOGIN_BEGIN`, fixed account ID | Atomic account budget before challenge insert: short token bucket capacity 4/refill 1 per 15s; long bucket capacity 12/refill 1 per 75s; 500 admissions per UTC day | No challenge insert; generic backoff; cannot debit control/read state |
| Anonymous outstanding challenges | Maximum 128 live/attempt-reserved rows globally; maximum 4 per MAC-authenticated pre-auth binding; expiry 60s | Reject rather than evict a live challenge; an attacker cannot create an uncapped browser-key table |
| `LOGIN_ATTEMPT`, challenge hash + pre-auth binding | Exactly one atomic attempt reservation per challenge before expensive signature verification; reservation also checks fixed account finish budget (e.g. 600/day) | Invalid signature burns that challenge; retry requires another bounded begin; no repeated crypto on one ticket |
| `AUTH_READ`, current session | No durable per-request bucket, no last-seen write; MAC filter then fresh primary-consistent read/business snapshot | Invalid MAC: no D1; invalid session: no writes; valid reads still cost queries |
| `SESSION_LOGOUT`, current session | No anonymous/global-control bucket; live session+CSRF bound mutation; at most one effective revocation/audit per session | Duplicate/stale request clears this browser cookie without another state change/event |
| `ADMIN_MANAGE`, fixed account + bounded operation ID | Verify live session+CSRF before reservation; max 2 pending operations, 4 ordinary operations/day; all queued operations/proofs capped globally | Existing grant may complete within expiry; no unauthenticated reservation; never blocks logout/lockdown |
| `PROOF_ATTEMPT`, bounded operation+credential | One attempt per issued proof challenge, max 3 proof roles/operation; 120s operation expiry | Bad signature invalidates that challenge; new grant requires fresh reservation |
| `SESSION_REVOKE_ALL`, authenticated fresh UV | Dedicated maximum 4 successful transitions/hour; one effect per operation ID; not charged to ANON or ADMIN_MANAGE | Online normal revoke-all can pause; one-way emergency suspension remains separately eligible |
| `EMERGENCY_SUSPEND`, authenticated fresh UV | Monotonic ACTIVE -> QUARANTINED/disabled; one effective transition per enabled generation; no normal-lane admission dependency | Cannot repeat effect/audit or reenable via this lane; restoration offline only |
| Bootstrap/repair/restore/cleanup | Offline owner authority; fixed-size grants and bounded maintenance; no public scope/route | Fail closed, retain evidence, no automatic unlock or cleanup drain |

The short bucket permits a burst of 4 plus refill, not a strict four attempts in every rolling minute. The long bucket bounds that burst across minute changes. The daily cap is UTC-day based: it can permit two adjacent-day allocations across a rolling 24 hours, subject to both token buckets; do not advertise it as a sliding daily quota. This explicit combination prevents a fixed-minute rollover from resetting every allowance simultaneously. Include newly minted sessions (max 8 concurrent, new login fails rather than silently evicting an existing session) in an owner-reviewed daily resource envelope.

### 4.3 Protecting logout and revocation capacity

Requests missing a valid gate-cookie/token/CSRF binding cannot reserve protected state or consume its logical allowance. Unknown cookies never create buckets. Current authority is checked before any protected reservation and again at commit; stale gate replays cannot append failure audits or advance security epochs. A challenged proof is not evidence until cryptographically verified.

Logout needs the current session and CSRF, not an authenticator: making logout depend on fresh UV or anonymous allowance would trap a user. Always permit local cookie deletion; server-side revocation is reported successful only after commit or a proven already-invalid session. A duplicate/logout retry returns an idempotent generic response with no duplicate audit. A D1 error returns unavailable while clearing local cookies; it must not falsely promise that another copy of the bearer has been revoked. Five-minute expiry is the fallback exposure bound, not a substitute for revocation.

Revoke-all and emergency suspension require a live session and a fresh operation-bound UV assertion. Anonymous flooding cannot spend these lanes' counters. Normal management/revoke budgets never suppress the monotonic emergency-suspension transition. Once a compromised key itself performs a valid lockdown, authority is already removed; only the offline restore/repair procedure can reactivate it. A stolen key capable of UV is a stronger adversary than unauthenticated traffic; availability sacrifice on one-key lockdown is intentional.

Emergency suspension must not depend on the two normal pending-operation slots or login/proof issuance budgets. Use a dedicated, short-lived, MAC-authenticated stateless lockdown challenge bound to the live session/pre-auth browser binding, exact action/parameters, account and captured generations. No pending row or protected allowance is allocated before its signature passes. Its final transaction verifies current authority, consumes a unique nonce receipt, CAS-updates the signing counter, applies the one-way state transition and audits atomically. Replays fail by nonce, counter and changed state. This special lane can only remove authority, never enroll, reenable, change policy or issue a session; it still satisfies the same C1 authorization conjunction. B4B must test it explicitly rather than silently borrowing a normal queue slot. It saves no Worker-CPU or lookup cost for an admitted abusive caller.

**No global availability guarantee:** a MAC cannot stop Worker requests, and a legitimate or stolen admitted token can still force lookups. Exact distributed replay/read-rate enforcement requires state; zero-write reads cannot simultaneously supply a perfect global per-request limiter. Volatile local concurrency/rate filters are best-effort load shedding, never authority. Whole-account request/read/write exhaustion, database downtime or saturated transport can still prevent legitimate controls. A separately verified Free-compatible upstream policy and offline response plan remain BLOCKED requirements. No paid product or bypass is assumed.

### 4.4 Clock, concurrency, errors and restarts

- Persist budget state and last-observed time. For a relevant durable reservation, database time below stored time denies without refilling/resetting/decrementing protected state. Forward time refills at most the configured capacity; never accumulate unlimited tokens. Evaluate every cap/update with one SQL guard/transaction; concurrent contenders cannot overspend a cap.
- Each relevant reservation checks a nondecreasing account security-time watermark. Authorization reads reject database time earlier than session/proof issuance or the stored watermark; they do not update that watermark on every read. This detects only rollback relative to persisted observations, not arbitrary small rollback after the latest observation. Larger clock/restore anomalies require quarantine and offline investigation. No strong monotonic-clock claim is made.
- Finish attempt reservation commits separately before crypto: a crash/bad signature consumes the attempt but cannot create a session. Successful authentication later consumes its reserved challenge in the guarded business-auth transaction. A reserved challenge is never reopened after a timeout. This deliberately favors replay safety over seamless retry; no duplicate session is issued after a lost response.
- Budget/guard read or write failure denies with sanitized unavailable status. A failed authorization never falls back to a local cache, password or missing-cap check. A rollback of the final transaction leaves counters/proof acceptance/authentication state unchanged except previously committed admission/attempt reservations, which are documented costs.
- Pending operation state, caps, proof attempts, epochs and idempotency records persist across restart. In-memory state is not a source of truth. Recreated Workers cannot refill allowances or revive grants. MAC key availability/rotation must be stable across restarts; a missing key denies, with no runtime provisioning fallback.

## 5. Administrator lifecycle and proof quorum

### 5.1 Custody model and modes

Use explicit modes `UNINITIALIZED`, `ENROLLMENT_ONLY`, `ACTIVE`, `QUARANTINED` and `DISABLED`; no business session outside ACTIVE. An approved credential has a server-owned custody-group ID, public key, immutable registration metadata, key generation, revision, signature counter and revoked status. Inventory records group/operator approval and minimal label, never a claim of hardware attestation. Active credential cap is 4; approval requires at least two active approved groups.

Two credentials on one device, one sync account, one provider recovery domain or one accessible backup are ONE custody group unless the owner independently demonstrates separate control. Clients cannot nominate/modify group membership. None attestation does not cryptographically prove a physical device, its manufacturer or independence. B4B can test simulated groups and fail-closed policy, but physical-custody assurance remains BLOCKED until an owner-controlled device/custody process is validated.

### 5.2 Actions requiring zero, one or two authenticators

“Fresh” means a new signed UV assertion for that exact operation, not a cookie's age, remembered UV flag or a prior login assertion. Proposed operation lifetime is 120 seconds with no extension; ordinary login and public challenge lifetime remain 60 seconds.

| Action | Required proof / authority | Effect and gate |
|---|---|---|
| Ordinary read or ordinary scoped business action | Current WebAuthn session; business mutation also requires CSRF; no new device assertion unless operation policy says so | Still rechecks all SQL guards; account already has two approved groups |
| Logout this session | Session+CSRF; ZERO fresh authenticators | Remove only this session; local cookie deletion always possible |
| Routine administrator login | ONE fresh UV assertion from an active key | Permitted only with ACTIVE mode and at least two approved active groups |
| Revoke all sessions | ONE fresh UV assertion + live session+CSRF | Advance auth epoch, audit, expire all grants; no removal of credential inventory |
| Emergency account suspension | ONE fresh UV assertion + live session+CSRF, or separately authorized offline owner | One-way lockdown/disable; no one-key reactivation or new business session |
| Report/revoke a suspected compromised key | ONE fresh UV assertion from a different surviving key + session+CSRF | Revoke target/advance epoch; if fewer than two groups remain, atomically quarantine; cannot replace/reenable online with that one key |
| Add key or approve custody mapping | TWO fresh existing-key assertions from distinct approved groups + session+CSRF, plus candidate key possession proof | Activate only after all approvals and a new-key assertion; candidate proof does not substitute for either existing approval |
| Planned replacement/removal preserving access | TWO independent existing-key approvals, candidate possession if replacing | Atomic final set has at least two approved groups; revoke old key and invalidate affected authority |
| Change security/RP/custody/retention policy, destructive complete key revocation | TWO independent fresh approvals + session+CSRF; RP change also requires offline ceremony plan | Policy/key epoch update or disabled-all-keys state; no public authority to undo it |
| Lost-device repair, lost-all-keys recovery, bootstrap, restore, reactivation | Offline independently authorized owner; TWO approved final-group possession proofs before ACTIVE | No online one-key business login or public reset. Lost old-key proofs are not required from unavailable devices, but replacement final quorum is never waived |

For one-key defensive target revocation, the actor cannot claim independent approval by using another credential in its own group. It may still trigger emergency suspension instead. Complete account revocation means disabled mode + key/auth epoch advance + grant invalidation + audit; it never erases inventory or audit history. An offline owner can always authorize a fail-closed disable/reset with the same record-preserving conditions; it cannot directly issue a business session. Two-key destructive online actions do not create an online reactivation path.

### 5.3 Operation-bound proof collection

Create a bounded operation record containing server-owned type, account/session, parameter digest (target/new-key digest/custody groups), starting legacy/auth/key/policy versions, expiry and random operation ID. Each signer receives its own random challenge bound to that operation and credential. Validate signature, RP/origin, UP/UV, user/account binding and strictly increasing counter with the existing conservative profile. Store a proof only through guarded challenge-attempt consumption and counter CAS; a mere browser Boolean or posted credential ID is insufficient.

For a new key whose digest is not yet known, use a bounded DRAFT stage for registration under the same pending-operation cap (at most two pending candidate keys). It grants no approval or business rights. After verifying the registration envelope, a one-time CAS seals the candidate digest and all operation parameters, then issues possession/approval challenges for that sealed version. No existing-key approval may be collected before sealing or carried across resealing; resealing is not allowed. The two existing approvers and candidate assertion therefore approve the exact same immutable key/intent, not an unknown future key. Pending candidates are separate from the four-active-key limit and enter ACTIVE only through finalization.

Finalization rechecks caller session/CSRF, operation expiry, all captured versions, active signer credentials, distinct group quorum, target parameters, candidate proof, minimum final group count and unused operation. Consume operation/proofs, apply effect, advance applicable epochs and append audit in ONE D1 batch. A zero-row guard must raise a real SQL error. Earlier proof collection can have advanced signer counters; failure of finalization does not roll back already committed independent proofs or reopen them. It also never grants a partial enrollment/business session. Concurrent finalizers produce one effect/event.

An operation is bound to the approving session and immutable parameters; cannot be repurposed as login, another key addition, another browser or a later policy generation. Keep consumed operation receipts until expiry plus margin; late requests cannot recreate the operation. No grant refresh using only a bearer cookie. A lost response gets a non-authoritative status check bound to the same session; it does not reexecute the mutation or disclose a new session bearer.

### 5.4 Initial bootstrap, loss and restore

The first owner authority is offline. A private operator tool verifies explicit account/mode/version and records an expiring single-use bootstrap manifest with RP/origin, purpose, two intended custody approvals and expiry (proposed 10 minutes). No HTTP command can create, redeem or refresh bootstrap authority. A trusted maintenance enrollment UI at the exact eventual RP origin collects registration and fresh assertion evidence; an offline verifier/install tool applies it under the manifest. The private UI/channel and genuine-host verification procedure remain a required design/operational gate; localhost keys are not portable to a deployed RP. B4B simulates this with synthetic evidence only.

Until two approved groups have both registered and freshly asserted, mode remains ENROLLMENT_ONLY; no ordinary C1 session exists. Atomic activation consumes the manifest, closes bootstrap, sets policy/key/auth generations and emits audit. Resuming an interrupted manifest never reopens a consumed grant, silently replaces the selected RP or renews its expiry. No real owner grant travels through a URL, log, source fixture or public endpoint.

If one device is lost, a protective revocation may quarantine the account. Offline owner authority creates a narrowly scoped repair manifest: surviving-device proof plus independently controlled replacement-device proof establish the final two groups. If no device survives, require independent owner verification and two fresh replacement groups; revoke the old key generation before reactivation. Offline authority is an operator/custody boundary, not knowledge of an account ID, password, email or cloud-sync recovery account. No old business session or password is sufficient to authorize this process.

Back up encrypted public-key/account/audit state and the custody/revocation inventory separately from private authenticators and admission MAC keys. Database backups contain no authenticator private keys and cannot substitute for a reserve device. Restores can roll back credentials, counters, grants, time state and epochs; an epoch stored in the restored database is not externally monotonic. Restore while disabled, reconcile external revocations/holds, rotate server keys/generations and require final two-group possession before reopening. Never restore/delete consultation business data merely to repair authentication. No real backup, key or restore is performed here.

### 5.5 Inventory, audit and retention

Record immutable events for grant issuance/closure, key registration and possession activation, quorum approval, rejected counter/replay summary, session issuance/logout, session revocation, key revocation, quarantine/disable, policy change, offline repair, restore and reactivation. Include account/session/operation references, approved credential/group references, actor authority type, policy/epoch versions, database time and outcome. Do not record tokens, CSRF, private keys, PIN/biometric data, raw signed responses or submitted personal labels. Shared account/device attribution is not proof of which human acted.

Login/control effects and required audit commit together. Aggregate/rate-bound denied-attempt evidence in fixed summaries; anonymous probes must not append unlimited audit events. Keep inventory history and audit immutable through explicit holds and owner-approved export/retention rules. Current prototype 1-day challenge, 7-day session and 90-day unheld-event grace are test defaults, not a legal compliance decision. Admission/proof replay markers can be deleted only after their authority is irreversibly expired/invalid. Reaching a pending-row/audit/storage soft ceiling closes new login/enrollment before emergency headroom is spent; do not auto-delete held records to keep accepting writes.

## 6. C1 authorization integration contract

### 6.1 Single authoritative principal and session

Future passkey issuance must create the existing C1-style random session ID, 256-bit 64-hex bearer and independent CSRF secret; store only hashes. Preserve Secure/HttpOnly/SameSite=Strict/Path=/ host-only cookie semantics. Add immutable provenance: method=WebAuthn, credential/group reference, UV authentication time, legacy password_version, auth_epoch, key_epoch, policy_version and scope. The gate cookie is an admission aid, not a second session authority. Do not return bearer tokens in JSON or browser storage.

Proposed absolute session lifetime: five minutes; no per-read sliding refresh or last-seen write. It fits within C1's existing eight-hour schema maximum but does not change the current configured eight-hour policy in this phase. Cookie expiry is not authorization: SQL checks issued_at <= database time < expires_at. Fresh UV is required per sensitive operation even within five minutes. A new login creates new random session/CSRF IDs; never promote a pre-auth/enrollment cookie or reuse an attacker-chosen identifier.

Every protected request applies this conjunction, not an alternative OR path:

```text
 existing C1: exact configured origin + valid session ID/bearer hash
   account id=1 AND enabled
   revoked_at IS NULL AND issued_at <= DB_NOW < expires_at
   session.password_version = account.password_version
   required method/JSON/Origin/Sec-Fetch-Site + session-bound CSRF on mutations
 AND proposed:
   ACTIVE mode AND two distinct approved active custody groups
   immutable provenance.method = WebAuthn
   provenance auth/key/policy generations match current account security state
   session credential remains active in that key generation
   session and provenance IDs/hashes/scope agree
```

No client role, actor ID, principal returned by a previous request or successful gate-MAC check replaces this predicate. Keep customer portal/context/OTP, ownership/consent and business invariants unchanged. No shared Academy/coach/affiliate/ADMIN_TOKEN authority is accepted.

### 6.2 Preserve SQL-level safety

E7 performs both JavaScript checks and in-transaction SQL authorization in workflow-guards and customer-contact. A future migration must extend ALL such guards with the conjunction above. A mutation's guarded update/insert, expected business-state CAS and audit share one transaction. Preflight JavaScript authorization is advisory. Failed/zero authorization raises an error; do not issue a success audit or partially update business data.

Authorization freshness uses server-owned primary-consistent D1 reads/snapshots and transaction guards. No cross-request authorization cache or read-replica assumption. A read linearizes at its authorized snapshot: a read concurrent with revocation may legitimately finish from a snapshot before revocation; a request beginning after committed revocation must fail. Mutations linearize at their guarded transaction. Do not promise cancellation of already returned data. Explicitly test both orderings and primary/read-after-write settings.

Session issuance rechecks account enablement, enrollment quorum, credential/policy versions and challenge/proof state after asynchronous crypto. Session ID, bearer/CSRF hashes, provenance and login audit commit together. Credential removal/epoch advance/audit is one transaction; subsequent guards fail even if old session rows remain. Global session revocation advances auth_epoch; whole-key reset advances key_epoch and auth_epoch; policy/custody changes advance policy_version and invalidate dependent grants. Retain legacy password_version checks and invalidate legacy sessions at any eventual cutover. Password rotation, disablement or revocation during verification cannot yield a usable new session.

Changes must remain in the dedicated C1 database containing the guarded business statements. A separately bound authentication database cannot participate in the current SQL join/batch boundary; a cached or signed principal bridge would weaken existing checks and is not proposed. The isolated B4B test binding stays separate; it only models a future same-database contract.

### 6.3 Origin, RP and schema compatibility

Choose a stable owner-approved exact HTTPS RP hostname and origin, not request Host, pages.dev parent, wildcard/branch pattern or deployment hash alias. Freeze the pair in server configuration before real enrollment; redirects/hostname changes need an explicit new-RP enrollment plan. Cross-origin ceremonies/frames/extensions remain rejected under the current strict profile. Signed clientData origin verification does not replace HTTP Origin, CSRF and browser-cookie binding. Preserve no-store, no CORS, CSP and frame denial. Same-origin customer XSS still threatens /qy; a separate admin origin requires a separately reviewed cookie/RP/deployment design.

Existing C1 session hashes/CSRF fields are 64-hex, not the prototype's base64url strings. Existing account enabled state, PBKDF2 fields/600,000 iteration constraint and session immutable triggers must not be removed. Its audit has a fixed vocabulary, immutable update/delete triggers and foreign-key references; prototype cleanup cannot delete referenced sessions/events under those rules. Propose separate constrained immutable passkey provenance/events or approved additive evolution, preserving legacy audit, rather than weakening existing triggers.

E8 enforces exactly 15 pinned migrations, live ledger/hash/object inventory and narrow binding/config allow-lists. Future C1 schema/manifest evolution and route cutover require separate authorization, upgrade/disable/rollback tests and full query/CPU profiling. Never modify the 15 historical migrations or turn off those checks. B4B must not change these files. No online password fallback or legacy-session promotion may bypass passkey mode; actual cutover policy remains outside B4B.

## 7. Resource budget: measurements versus design estimates

Public documentation checked on 2026-10-15: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) list Free 10 ms CPU per invocation and 100,000 requests/day/account. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) list Free 50 queries/invocation and 500 MB/database. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) includes 5 million rows read/day and 100,000 written/day. No remaining allowance or deployed accounting was inspected. These are constraints, not evidence of compliance.

### 7.1 Verified old observations

E2/E4 admission-enabled local login begin/finish used 5/8 submission attempts; matched pairs used 13 attempts, 23 reported reads and 14/16/16 reported writes p50/p95/max. Session checks used 2 attempts and 1/2/2 writes. The large-stage revoke-all observation used 5 attempts and 7 writes despite 10,023 retained sessions; cleanup used 4 attempts and 200 returned writes on the tested expired-row workload. The 65-check harness bypasses admission and is not an equivalent request profile. Registration/finish, cryptographic or local wall/Node CPU values do not measure deployed Worker CPU.

Returned Miniflare/D1 metadata is an observation, not a remote billing guarantee; indexes/constraints/triggers can change costs. Application counters measure submission attempts, not exact execution, implicit transactions or internal retries. Failed batches lack full metadata; retained zero writes do not establish zero rolled-back work. Earlier B3 arithmetic remains illustrative, not a capacity forecast.

### 7.2 B4B provisional operation envelopes (NOT measured)

Assumptions: one account, <=4 active credentials, <=8 active sessions, <=128 pending login challenges, <=2 pending management operations and <=6 proof challenges, indexed point lookups, fixed scope state. Ranges count preflights and every batch member, guards/receipts and audit; not one query per batch. “Row mutations” means logical table inserts/updates/deletes before index/trigger billing, not billed writes. Indexed read ranges are targets to verify with plans/metadata, not certified scan bounds. C1 wrapper/business work is additional.

| Proposed operation | D1 submissions estimate | Rows examined target | Logical row mutations estimate |
|---|---:|---:|---:|
| Invalid MAC/origin/oversized input | 0 | 0 | 0; Worker CPU still spent |
| Valid ordinary auth read | 1 fused snapshot, or 1 preflight plus existing business snapshot | 3-12 per auth snapshot | **0** auth writes; business operation writes excluded |
| Anonymous login begin | 5-8 | 4-20 | 3-7 (fixed budgets, time state, challenge/guard) |
| Finish attempt reservation/preflight | 1-3 | 2-8 | 1-3 (single attempt + fixed budget) |
| Successful finish commit, additional to reservation | 6-9 | 4-16 | 5-9 (counter, consume, session/provenance/audit, guard/receipt) |
| Replay/bad assertion after reservation | 1-3 reservation/read submissions; no success batch | 1-8 | At most its one reservation/budget; no session/audit append |
| Logout first effect | 3-5 | 3-12 | 2-4 (one revoke and event, optional guard) |
| Duplicate/stale logout | 1-2, or 0 for locally expired/invalid gate | 0-8 | 0 effect/event; unavailable DB does not imply revoked |
| Management operation creation | 4-7 | 4-16 | 2-6 (authorized cap/state/operation/guard) |
| Each verified fresh proof | 4-7, plus any separate attempt-reservation preflight | 3-12 | 3-6 (attempt, counter, challenge/proof/guard) |
| Final two-group management effect | 5-9, after proofs collected | 6-24 | 4-9 (operation, effect, versions, audit/guard) |
| Emergency suspension or session revoke-all finalize | 4-9; include nonce/counter effect, or previously collected fresh proof as appropriate | 4-16 | 3-8, constant with retained history |
| Offline grant/repair activation | 5-9 per phase; possession-proof costs separate | 4-24 | 4-10 per phase; no business-row mutation |
| Bounded cleanup | 4-8 per call | <=100 candidates per eligible table plus indexes | <=100 deleted rows/table; index mutations extra |

Estimates must be replaced by B4B instrumented submissions, actual local metadata, failure traces and query plans. Any path above the provisional envelope requires explanation or redesign, not silently higher limits. Full packaged C1 requests must remain within a separately measured query budget below 50 with headroom; isolated estimates do not certify that. Extra HMAC gates reduce anonymous D1 work but add CPU/key-management cost, which is unqualified.

A design target of 20 logins/day at a pessimistic **30 reported/billed writes per complete login** would allocate 600 writes/day; this is a hypothetical planning allowance, NOT a conversion from the logical table above. Ten two-group management operations at an assumed 60 writes each add 600; cleanup budget 2,000 plus logout/control reserve 500 yields 3,700 modeled writes/day before business traffic, audit export, indexes beyond assumptions or attack. Actual approved normal-operation cap is four/day, so the ten-operation scenario is deliberately a stress allowance, not permitted workload. Do not mistake remaining arithmetic headroom for reserved Cloudflare capacity. Independent daily caps for admission/finalization and emergency headroom must be translated into actual worst-case row accounting before exposure.

Removing session-check writes is the most direct savings: 1,000 ordinary validations would avoid roughly 1,000-2,000 old local rate-bucket writes under E4's observed range, while retaining fresh D1 authorization reads. It does not eliminate query/request costs or provide a globally enforced zero-write read rate limit. No rolling session extension or credential enumeration scan is permitted on the ordinary guard path.

### 7.3 Storage and retention estimates

Provisional payload caps: login challenge <=2 KiB x128 (~256 KiB), session/provenance <=2 KiB x8 (~16 KiB), <=2 operations and <=6 proof records at <=2 KiB each (~16 KiB), current active credential records <=4 KiB x4 (~16 KiB). These are proposed serialized payload limits, not SQLite page allocation, index/WAL overhead or complete storage bounds. Keep an additional bounded spent/expired receipt history; it counts separately from pending rows and may not be evicted while its ticket/proof can still be accepted.

The session/operation figures cover active/pending state only. For example, 500 successful logins/day with seven days of post-expiry session retention would retain roughly 3,500 session/provenance records (~7 MiB at the assumed 2 KiB payload), before indexes/pages, current-day boundary effects and audit. Challenge and emergency nonce receipts need separate issuance-rate x retention calculations. Soft ceilings must include this history, not just the eight active sessions. Cleanup capacity has to exceed admitted arrivals after grace; the existence of a 100-row batch does not prove that progress.

Owner-approved audit soft ceiling: initially 10,000 compact events, <=1 KiB payload/event (~10 MiB payload before overhead), with holds and verified encrypted exports. Do not silently overwrite immutable events or enforce this by deleting held records. Soft-close new login/enrollment before the ceiling, with logical headroom for at least 32 emergency events; this is not a guarantee of physical free pages or D1 availability. Old key generations, spent receipts, index/page/WAL growth and failed cleanup need their own measured retention ledger. A quota failure still fails closed.

Cleanup uses exact expiry/grace indexes and bounded batches, never an unbounded request loop. Validate candidate rows, returned scans/writes, oldest eligible age and capacity under simultaneous arrivals. A scheduler is a separate future resource/authorization decision. Local CPU and storage evidence cannot establish deployed Free feasibility; deployed CPU, quota exhaustion, query/row billing, distributed load and account sharing remain BLOCKED.

## 8. B4B proposal: exact isolated scope

This is a proposed allow-list for a separately requested implementation, not current authorization to edit these files.

**Existing isolated files eligible for B4B modification:**

- `scripts/webauthn-d1-worker.mjs` - prototype dispatcher/state orchestration, not any active C1 route.
- `scripts/webauthn-d1-schema.sql` - append prototype-only schema definitions; no edits under database/migrations.
- `scripts/webauthn-synthetic-fixtures.mjs` - synthetic operation/quorum fixtures only; never real keys.
- `scripts/test-webauthn-d1.mjs` - retain original crypto/atomicity coverage while adapting transport and attempt-reservation expectations.
- `scripts/test-webauthn-d1-management.mjs` - lifecycle/cap/restart/fault coverage.
- `scripts/test-webauthn-browser.mjs` - gate/pre-auth/CSRF and virtual-group flows; preserve virtual/physical distinction.

**Exact new files proposed:**

- `scripts/webauthn-d1-policy.mjs` - bounded gate/ticket encoding and scope policy, no remote provider.
- `scripts/webauthn-d1-lifecycle.mjs` - bounded operation/proof/quorum and offline grant helpers.
- `scripts/webauthn-c1-contract-fixture.mjs` - test-only C1-shaped session/SQL contract model; imports/reads original safeguards without changing them.
- `scripts/test-webauthn-d1-policy.mjs`, `scripts/test-webauthn-d1-lifecycle.mjs`, `scripts/test-webauthn-c1-contract.mjs` - dedicated security/contract suites.
- `docs/quantum-yijing-c1-step2db4b-measurements.json`, `docs/quantum-yijing-c1-u3-b2b-step-2d-b4b-report.md` - new evidence/report, preserving earlier checkpoints.

`scripts/webauthn-synthetic-validation.mjs` and the DER helper remain unchanged unless an independently reviewed parser defect is separately scoped. Existing Node/store tests remain regression inputs. No package install, active C1 module, standalone authentication/password script, fixture holding real credentials, public route, deployment binding/config, frozen module, business SQL, migration or manifest is on this allow-list. Test-only barrier/fault controls stay generated in-memory or private object bindings, never HTTP-selectable.

### 8.1 Additive prototype-only schema proposal

Append new tables/indexes in the standalone script; use a fresh disposable database. No migration of retained owner evidence databases:

| Proposed object | Main fields / invariants |
|---|---|
| `admin_security_state` | Singleton mode, policy_version, legacy-version fixture, last security time, daily caps/soft ceilings; mirrors required C1 enabled/version semantics |
| `custody_group` | Small bounded inventory, operator approval/reference and generation; client cannot self-approve |
| `credential_policy` | Existing credential FK, group, revision, pending/possession-approved metadata; no new active key without approval |
| `session_provenance` | Existing session hash FK plus unique random session ID, created time, CSRF hash, credential/group, method, captured generations and scope; canonical C1 64-hex bearer/hash mapping |
| `login_attempt` | Challenge FK, pre-auth digest, immutable issue/expiry, reserved flag/time; one reservation and one successful consumption |
| `management_operation` | Unique operation ID, immutable type/parameter digest, actor session, versions, expiry, state/idempotency receipt; max two pending |
| `operation_proof` | Operation/challenge/credential/group references, accepted counter/version, expiry and consumed marker; unique operation-role/credential proof constraints |
| `offline_grant` | High-entropy digest, exact RP/origin/account/purpose, expected versions, expiry and consumption; no dispatcher route |
| `security_budget` | Fixed enum scope rows, token/refill/time/day fields, authorized-session/operation references only if globally bounded; no arbitrary attacker key |

Keep original challenge, credential, session, account, guard and event data; add constrained relations rather than silently changing stored meanings. Session storage may use canonical hex values in fresh B4B fixtures; never reinterpret old base64 evidence or present it as a C1-compatible session. Proposed provenance is part of the SAME authorization conjunction, not a parallel login that bypasses C1's model. Existing immutable C1 audit remains represented by test-only fixture guards, not weakened prototype cleanup. A full upgrade path is outside B4B; fresh isolated schema correctness does not prove production migration safety.

### 8.2 Required B4B checklist

- [ ] Freeze protocol invariants and operation/quorum table; every proposed endpoint has one documented admission and authority rule. No public bootstrap/recovery/repair path, metadata leak or test-control flag.
- [ ] Gate MAC wrong key/version/signature/token/CSRF/origin/expiry rejects before D1; valid MAC with revoked/stale/disabled session NEVER authorizes. Rotation, missing keys and restart fail closed.
- [ ] Flood all anonymous buckets and exhaust normal management while a legitimate logout, fresh-UV revoke and emergency suspend remain logically eligible. Invalid requests must not debit protected caps or append events. Include valid-but-stale MAC replay; measure residual reads.
- [ ] Force concurrent token/day/outstanding-row reservations across independent dispatches; no cap overspend. Test both fixed-day boundary behavior and short/long bucket burst math, backward time, large forward jumps, restart and expired grants.
- [ ] Reserve one challenge attempt before crypto; simultaneous replays verify/commit at most once. Crash/fault after reservation cannot reopen it. Counter/challenge/session/audit failures leave no partial authority; explicit retry/new-challenge policy is tested.
- [ ] Adapt the old identical-assertion barrier test: only one contender may pass attempt reservation and enter crypto. Force distinct challenges at the same credential counter past crypto to test competing final writes. Do not disable reservation in the public dispatcher just to make four identical requests reach its old barrier. Keep any lower-level SQL-only replay test explicitly distinguished from end-to-end behavior.
- [ ] Fill normal pending-operation slots and proof/anonymous budgets, then prove the dedicated stateless lockdown challenge still reaches a live-session/fresh-UV guarded commit; forged/stale/replayed lockdown tickets cannot write or expand authority. Measure its separate CPU/lookup exposure.
- [ ] Test two credentials in the same simulated custody group fail quorum; different group labels submitted by clients have no effect. Two groups with identical key/credential ID fail. Physical independence remains unclaimed.
- [ ] Session alone, prior-login UV, expired proof, one proof, wrong operation parameters, swapped challenge, wrong group, revoked signer and stale policy cannot add/replace keys or activate bootstrap. Candidate key must assert possession.
- [ ] Force two finalizers past verification, then race revoke/disable/password-version/key/policy changes, logout, expiry and cleanup. Exactly one authorized effect/event; never a stale business session. Admission/attempt reservations are separately accounted.
- [ ] Exercise loss of one/all devices, quarantine, offline-only repair and restore rollback. Attempt one-key login/activation and public grant redemption; all deny. Mode/epochs/grants/custody state survive Worker restart.
- [ ] Browser bootstrap uses the private harness/offline verifier interface, not a temporarily public create/bootstrap route. Exercise navigator creation and new-key assertions at the synthetic exact RP while keeping grant installation/final activation outside HTTP.
- [ ] C1 contract fixtures retain all original enabled/session/legacy-version/CSRF/SQL mutation checks as a conjunction. Test old password sessions, stale principals, session rebinding, expiry extension, business CAS failures and both business/revoke orderings. Do not edit or wire original guards.
- [ ] Ordinary authenticated reads have zero auth writes, fresh snapshot checks and no renewal; repeated logout creates one audit/effect. Verify no hidden full-table credential/session scan.
- [ ] Measure success, denial, reservation failure, post-commit lost-response behavior, proof collection, finalization, login, read, logout, revoke, suspend, offline grant and cleanup. Separate submitted attempts, returned metadata, incomplete failure metadata and unobservable internals. Save p50/p95/max and raw sample counts; label barrier waits and host CPU correctly.
- [ ] Retain broad strict JSON/UTF-8/CBOR/DER/ES256/UV/counter/RP regressions; byte/deadline/cancellation/concurrency limits; browser transport and registration-negative tests. A browser sandbox setup failure is reported separately from failed assertions.
- [ ] Run existing 247 Node and 247 workerd validator modes, retained persistent-D1 and management coverage, browser suite where environment permits, 982 distinct C1 acceptance including six reproducibility checks, all 15 pins, JS syntax and whitespace. Record new check counts rather than claiming preexisting totals automatically pass changed flows. Preserve owner 50/50 standalone-auth evidence and known Codex EPERM separately.

### 8.3 Acceptance, rollback and stop conditions

B4B acceptance requires deterministic races with confirmed post-verification arrivals, precise table/epoch/counter/event assertions, all negative quorum/authority tests, documented attempt-consumption behavior, no public maintenance path, no protected-lane debit by anonymous traffic and no business guard bypass. Every write path must stay within a documented measured local envelope; deviations are reviewed. No PASS label may cover physical custody, deployed CPU or a runtime that did not start. An evidence manifest must link tested source hashes, schema, versions, raw data and failures.

If policy/atomicity/clock assumptions fail, stop and mark that requirement BLOCKED; do not weaken controls. On rollback, dispose only the new test-owned runtime, retain its evidence, stop using the new isolated database and keep the committed B4A/B3 state intact. Do not reset the shared working tree, delete owner evidence or reuse an old database whose spent markers have been rolled back. Prototype-schema rollback means a fresh test database, not downgrading protected business data. No active route, server or credential needs a rollback because none is touched. A future production cutover requires its own rollback plan that leaves old passkey authority disabled rather than silently reactivating password sessions.

## 9. Unresolved-requirement classification and owner gate

| Requirement | Classification at B4A | Resolution needed |
|---|---|---|
| Baseline isolation, full HEAD, clean entry, 15 pins | PASS | Verified this phase |
| Existing local signature/UV/atomic challenge/counter mechanisms | PASS for existing profile | E2-E6; new proof/control design not implemented |
| Protected lanes cannot be debited by unauthenticated traffic | CONDITIONAL | B4B gate/authority-before-reservation tests |
| Ordinary fresh authorization with zero auth writes | CONDITIONAL | Fused contract fixture and query-plan evidence |
| Quorum, fresh operation-bound UV and new-key activation | CONDITIONAL | B4B schema/state machine and negative/race tests |
| Secure same-RP offline bootstrap/repair and custody procedure | CONDITIONAL | Owner-approved private UI/tool/handoff and rehearsal |
| Two independently controlled real authenticators | BLOCKED | Real custody/device evidence; sync-provider aliases do not qualify |
| Availability under full Worker/D1 quota or transport exhaustion | BLOCKED | Upstream Free-compatible protection and operational plan; no unconditional guarantee possible from local buckets |
| Clock monotonicity and restore safety | CONDITIONAL for bounded detection; BLOCKED for external monotonic assurance | Persisted checks, external custody/restore record, failure drills |
| Complete C1 same-database SQL compatibility | CONDITIONAL design; BLOCKED activation | Separate migration/contract evolution and whole-route tests |
| Production cookie/CSRF/RP/browser compatibility | CONDITIONAL | Final-shaped local/browser tests and explicit host/custody decisions |
| Physical/platform, synced-key and other-browser support | BLOCKED | Owner compatibility policy and actual device/browser evidence |
| Audit immutability, retention/holds and steady-state storage budget | CONDITIONAL | Measured indexed cleanup, exports, capacity and owner retention decisions |
| Deployed Cloudflare Free CPU/row accounting/distributed behavior | BLOCKED | Separately authorized synthetic deployment feasibility validation; no action here |
| Integration or production readiness | BLOCKED | Security, operational and Free gates above |

Stop for owner review. The only artifact produced by B4A is this design document. B4B implementation, any future C1 integration and any deployed Free validation each require their own explicit scope; none is inferred from approval of this document.
