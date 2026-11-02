# Stage 8 — Final live-system acceptance

Execution date: **2026-11-02**. Final decision: **CONDITIONALLY ACCEPTED**. Required core real-system integration and final automated regressions are **PASS**. The existing isolated Vue → Laravel → MySQL system scenario passed on its **first and only execution**, with independent authenticated API and SQL persistence reconciliation. Optional external/operational gates remain separately identified; production readiness is not established by local acceptance.

## Final execution identity and authorization

| Item                         | Verified value                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend starting/final HEAD | `14c1f53600da06fc29fc4cb3d0f4ec249f4733c9`; initially clean; final report change uncommitted, no push/deployment                                             |
| Backend starting/final HEAD  | `f618bba290f919dc3561b0462c59b3b86ade82d8`; clean and unchanged                                                                                              |
| Backend root                 | Sibling `../student-planner-backend`, listener working directory public/                                                                                     |
| Runtime                      | Retained isolated user/network namespace; frontend localhost:5173 and Laravel localhost:8000 within that context                                             |
| Laravel                      | `APP_ENV=testing`, expected APP_URL, private key/storage/session configuration; 25 applied migrations and none pending                                       |
| Effective SQL identity       | mysql / **studentplanneracceptance** / **planner_acceptance_app@localhost**; verified by SQL, listener environment/root and genuine HTTP-session persistence |
| Dedicated account            | Exactly one retained user, ID **1**, profile timezone **Europe/Kyiv**; genuine browser state refreshed after the scenario's logout                           |
| Operator grant               | Operator-authored `.auth/f7-grant.json`, mode 0600; approved `2026-11-02T18:49:10.210985+00:00`, expires `2026-11-02T20:49:10.210985+00:00`                  |
| Granted scope                | Nonvaluable business mutations for user 1 in studentplanneracceptance; `database_disposable=false`, `allow_registration=false`, `allow_dispatch=false`       |

Re-entered the retained namespace with `nsenter --preserve-credentials`; no infrastructure, database or account was recreated and no migration was repeated. Before any business request, the unchanged `authorizeLive('system')` checked effective backend identity, schema, private paths and grant timestamps. An additional scope check confirmed the exact acceptance database/account and all three excluded permissions. Existing `liveSafety.ts` remained unchanged. The grant was not generated, edited, renewed or self-approved by the agent.

Initial read-only checks confirmed the authorized account's persisted password hash/timezone/session and empty business-domain tables; there were no prior system fixture ledgers. The shared application and PHPUnit schemas were never used for fixtures. Their original read-only table-definition/count/checksum snapshots remained identical after the final acceptance checks. Backend application code, migrations, shared `.env` and shared servers were not changed.

## Actual live outcomes and retained persistence

`npm run test:live:system` ran inside the existing namespace with `F7_LIVE_ALLOW_MUTATIONS=1`, `F7_LIVE_GRANT=.auth/f7-grant.json` and `F7_BACKEND_ROOT` set to the verified sibling checkout. **Exit 0: 1 passed (12.5 seconds), no retries.** It used real Laravel requests and MySQL. Its helper serves only frontend assets; no backend response was mocked. The separate dispatcher branch remained disabled and annotated BLOCKED.

| Core category                         | Status | Actual persisted evidence                                                                                                                                                                                                                                                           |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and session lifecycle  | PASS   | Earlier authorized registration/login/profile/refresh/logout checks; system verified same owner, refresh, CSRF-less PATCH rejection, logout 204 then profile 401/protected redirect; same user later logged in again for independent reads                                          |
| Authenticated live reads              | PASS   | Existing detailed suite passed before mutations and again afterward: **2 passed, zero skipped**; all ten endpoints returned authenticated 200 Resources                                                                                                                             |
| Academic Context                      | PASS   | Institution 1, Period 1, eight Subjects and eight Teachers; independent collection/detail GETs and SQL verified owned institution/period associations                                                                                                                               |
| Schedule and manual Lesson            | PASS   | 15 imported active Lessons plus manually created blocker Lesson 16; all 16 detail GETs matched the effective schedule, UTC instants and reference associations                                                                                                                      |
| XLSX upload and parsing               | PASS   | Actual multipart `public/examples/schedule-example.xlsx`; Batch 1 persisted 15 initially invalid occurrence rows, corrected through eight Subject/Teacher references, revalidated to 15 valid rows                                                                                  |
| XLSX commit and duplicates            | PASS   | Batch 1 committed all 15 Lessons; stale concurrent Batch 2 commit returned the asserted **409**, then fresh reviewed duplicate/noop commit persisted with 15 duplicate rows and no extra imported Lessons. SQL retains both committed Batches and all 30 occurrence rows.           |
| Tasks/Subtasks and progress           | PASS   | Task 1 priority 3 and persisted deadline; child 1 owns its independent pending state. Task completion persisted while child stayed pending; progress GET is 0 of 1 children, 0%.                                                                                                    |
| Preferences, availability, free slots | PASS   | Persisted limits 45 daily/90 weekly minutes, 5-minute break, 15–30 minute Sessions; seven recurring 20:00–22:00 windows; actual server slots/range/timezone verified                                                                                                                |
| Study Plan and explicit consent       | PASS   | UI preview/review/confirmation created Sessions 1–4 with 30/15/30/15 minute allocations: **5,400 seconds** for estimated 180-minute work; independent GETs verified the actual returned allocations. Presented partial-result consent began unchecked before explicit confirmation. |
| Adaptive replanning                   | PASS   | Real blocker Lesson 16 affected Session 1; UI preview/confirmation preserved original 1 as rescheduled and created replacement 5. Separate consent controls were respected when presented; no unplaced-cancellation case is inferred.                                               |
| Session rescheduling/cancellation     | PASS   | Manual reschedule retained 5 as rescheduled and created 6; cancellation persisted 6 as cancelled. SQL replacement chain is **1 → 5 → 6**. Sessions 2–4 remain planned, independently of Task completion.                                                                            |
| Absolute/relative Reminders           | PASS   | Reminders 1–4 cover Session/Task/Subtask/absolute modes. Task/child deadline shifts changed triggers by the asserted −60/−30 minute offsets; Session cancellation and Task completion cancelled related Reminders. All four final statuses are cancelled with null sent_at.         |
| Progress, Trends and Comparison       | PASS   | Real on-time Task completion at `2026-11-02T18:56:06Z`, independent pending child, seven daily buckets with six genuine zero-activity dates, previous-period zero versus current one and signed Task delta **+1**                                                                   |
| Independent API/MySQL persistence     | PASS   | Additional **66 authenticated GETs**, then separate read-only SQL reconciliation of counts, ownership, Lesson times/associations, deadlines, Session lineage/statuses and Reminder targets/triggers matched the retained API records                                                |

Period 1 covers **2026-11-16 through 2026-11-22** in Europe/Kyiv. Original allocations were November 16/17 at 20:00–20:30 and 20:35–20:50 local time. Adaptive replacement 5 was November 16 at 20:55–21:25; manual replacement 6 was November 22 at 20:00–20:30. Future-period statistics independently matched **3 planned / 3,600 scheduled seconds**, **2 rescheduled / 3,600 seconds**, **1 cancelled / 1,800 seconds**, and zero completed/missed Sessions. These future records do not establish elapsed Session completion, missed-session behavior or known/unknown actual-duration aggregation.

Retained IDs: user **1**; Institution **1**; Period **1**; Subjects **1–8**; Teachers **1–8**; Batches **1, 2**; imported Lessons **1–15**; manual Lesson **16**; Task/Subtask **1/1**; availability windows **1–7**; Sessions **1–6**; Reminders **1–4**. There is one preference record, 30 import rows and **zero Notifications or AI records**. Private fixture ledger: `.auth/system-fixtures-1793645758289.jsonl`. No business record was deleted or purged. Preserve these fixtures and the designated account for repeatable demonstration; the original system harness requires an empty account and must not be replayed against this populated one.

## Defects, recovery and verification scope

No production integration defect was demonstrated, and no frontend/backend application or harness change was needed in this execution. No new regression test was added without a defect. The existing system scenario passed first time; no mutation was retried and no additional account was created.

The first private read-only reconciliation script incorrectly expected Task completion to cancel planned Sessions. Actual GET Session 2 returned the legitimate planned state. Inspected `TaskService::complete`: it completes the Task and synchronizes Reminders, while Session lifecycle remains independent. Corrected that **diagnostic expectation only**, then repeated authenticated reads and SQL inspection successfully. Its subsequent login reused the same user and genuine Laravel authentication. No application logic, assertion in the committed system harness, or persisted business state was changed to make that diagnostic pass.

Direct manual Lesson cancellation/replacement, all availability edit/delete/overlap variations, cross-owner negative requests and fault-injected import rollback/concurrent-writer races were **NOT RUN** live. The successful import commit and controlled stale-preview 409 do not claim exhaustive failure atomicity/race coverage. Those existing deterministic/source checks remain separately attributed; exactly one authorized user was retained.

## Final automated verification

One final regression pass follows the successful integration/reconciliation; no unrelated full audit or preliminary suite repetition was performed.

| Command                                                                                   | Status | Result                                                         |
| ----------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `npm run test:live:system`                                                                | PASS   | Exit 0; 1 passed, first and only run                           |
| `npm run test:live:read` after reauthentication                                           | PASS   | Exit 0; 2 passed, zero skipped; no business mutations          |
| Private API and SQL persistence reconciliation                                            | PASS   | 66 authenticated GETs plus independent exact-schema SQL checks |
| `npm run type-check`                                                                      | PASS   | Exit 0                                                         |
| `npm test`                                                                                | PASS   | Exit 0; 382 tests / 14 files                                   |
| `npm run build`                                                                           | PASS   | Exit 0; type checking and production bundle                    |
| `npm run test:e2e -- --workers=4 --retries=0 --output=test-results/stage8-final-chromium` | PASS   | Exit 0; **54 passed (58.4 seconds)**, no retries               |
| `npm run format:check`                                                                    | PASS   | Exit 0; all matched files comply                               |
| `git diff --check`                                                                        | PASS   | Exit 0; no whitespace errors                                   |

Cross-browser and standalone overlapping accessibility suites are **NOT RUN** in this execution: no UI behavior changed; the final Chromium suite includes existing axe/keyboard checks. Historical Firefox/WebKit evidence is retained below. No commit or push was performed, so no hosted CI result is claimed for the working-tree report.

Private evidence remains under ignored `.auth/`: operator grant and validation digest, runtime/HTTP identity, registration evidence, genuine browser state, fixture ledger, live logs, `persisted-api-evidence.json` and `persisted-db-evidence.json`. Passwords/cookies/provider keys are absent from this report and Git. Final regression logs are `/tmp/stage8-final-{types,unit,build,chromium}.log`; browser artifacts are ignored under `test-results/stage8-final-chromium`.

## Separate remaining gates and decision

| Separate gate                                                   | Status  | Remaining limitation                                                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reminder dispatcher and delivered Notification/read idempotency | BLOCKED | Explicitly unauthorized; false dispatch/disposal grant flags, no dispatch opt-in. No dispatcher ran and inbox remains genuinely empty.                                                                                                                        |
| Paid OpenAI provider and live Tool/history verification         | BLOCKED | Explicitly unauthorized; no paid call or AI record. Backend provider credentials remain empty in acceptance configuration.                                                                                                                                    |
| Figma source parity                                             | BLOCKED | No approved exports or restored source access supplied; previously limited integration was not retried. Missing desktop/mobile light/dark groups remain listed in historical report.                                                                          |
| Remaining historical statistics edges                           | BLOCKED | Only real on-time Task completion/zero-day/delta cases passed. Completed Subtasks, late work, elapsed completed/missed Sessions and known/unknown actual minutes need separately authorized legitimate elapsed fixtures. No backdating or clock manipulation. |
| HTTPS staging and production infrastructure                     | BLOCKED | No supplied staging infrastructure/authorization; TLS/proxy/deployed cookie/scheduler operations unverified.                                                                                                                                                  |
| Production deployment                                           | NOT RUN | Explicitly unauthorized; no deployment.                                                                                                                                                                                                                       |

**Decision: CONDITIONALLY ACCEPTED.** The isolated runtime, dedicated authentication, authenticated reads, complete real-system scenario, independent MySQL persistence and final regressions all passed; no critical integration defect remains demonstrated. The optional gates above limit external-service and production-readiness claims, not the established core integration result. Proceeding to **Stage 9 — Project Documentation and Defense Preparation** is recommended. No new stage has been started, and no production deployment is authorized by this decision.

---

# Earlier Stage 8 — Registration and provisioning execution history

The following records preserve earlier decisions and prerequisites at their original execution times; the final live-system evidence above supersedes their formerly blocked core categories.

Execution date: **2026-11-02**. Current decision: **BLOCKED**, pending the operator-authored unexpired F7 mutation grant. The retained isolated runtime, dedicated registration/login/session, authenticated live reads and independent MySQL user/session persistence are now **PASS**. The core business scenario remains unexecuted. No dispatcher or paid provider calls were executed. Earlier provisioning/preflight evidence and the historical F8.1 report below are preserved with their original execution scope.

## Authorized registration and authenticated acceptance

The current authorized execution started clean at frontend `cbaba4030200a9a36ef47093de6b7fab41b46b22`; backend remained clean at `f618bba290f919dc3561b0462c59b3b86ade82d8`. The operator explicitly approved exactly one retained user, privately generated credentials, genuine authentication and live reads, and permitted nonvaluable business fixtures subject to a separately operator-authored grant. No additional registration permission is needed for this account.

Reused the existing namespace and PHP/frontend processes without infrastructure recreation or migrations. The existing runtime probe and actual HTTP cookie/session binding again confirmed the exact backend root, `APP_ENV=testing`, mysql/studentplanneracceptance, `planner_acceptance_app@localhost`, private storage and all 25 migrations with none pending. Immediately before registration, SQL inspection confirmed zero users and empty business-domain tables.

Created **one user, ID 1**, through the existing Registration UI with timezone **Europe/Kyiv**. The real CSRF-protected Laravel registration returned **201**. Independent profile GETs and refresh preserved the same ID/timezone. Logout returned **204**, subsequent profile returned **401**, and protected navigation redirected to login. Logged back in through the existing Login UI (**200**), refreshed, verified the authenticated profile again, and saved genuine browser storage state under ignored `.auth/authorized.json`. Private credentials are `.auth/acceptance-user.json`; both files are mode **0600**. No password, cookie value, email address or full response payload is included in this report.

Independent read-only Laravel/MySQL verification confirmed exactly one user, the generated credential's password hash, persisted timezone, and the genuine saved browser cookie's session row belonging to user 1 in studentplanneracceptance. Every business-domain table was still empty. The original databases' table lists, definitions, counts and checksums still matched their pre-provisioning snapshots after registration/read testing. Backend source/shared configuration remain unchanged.

| Current command/check                                                                                   | Status  | Actual result                                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Existing identity/runtime/HTTP binding diagnostics inside retained namespace                            | PASS    | Exact isolated root, environment, runtime account and schema; no pending migrations                                     |
| Private `.auth/register-acceptance.mjs` through real Registration/Login UI                              | PASS    | One registration POST; registration 201, profile/refresh 200, logout 204, rejection 401, login 200, genuine saved state |
| Private `.auth/verify-user.php`                                                                         | PASS    | Exactly one persisted user and authenticated session; password hash/timezone verified; no business fixtures             |
| `F7_READ_STORAGE_STATE=.auth/authorized.json F7_READ_USER_ID=1 npm run test:live:read` inside namespace | PASS    | Exit 0; **2 passed, zero skipped**                                                                                      |
| `php .auth/verify-shared.php` after registration/read checks                                            | PASS    | Both existing databases unchanged from original snapshots                                                               |
| `npm run test:live:system`                                                                              | BLOCKED | NOT EXECUTED; operator-authored grant absent                                                                            |

All ten authenticated reads returned **200**: Profile, Planning Preferences, Study Availability, Free Slots, StudySessions, Reminders, Notification Inbox, Progress Statistics, Daily Trends and Period Comparison. Detailed assertions passed for nullable fields, pagination/empty states, date/timezone metadata, interval shape, independent work populations, daily buckets, cross-report totals, signed deltas and session restoration. Because the designated account has no business fixtures, this proves actual authenticated empty-state Resource compatibility; it does not prove populated allocations, import persistence, Reminder synchronization or nonzero historical metrics.

Private sanitized evidence is `.auth/registration-evidence.json`, `.auth/user-persistence.json`, `.auth/current-runtime-identity.json`, `.auth/current-http-binding.json` and `.auth/authenticated-read.log`. No request trace/video/HAR or synthetic session was used. No confirmed product defect emerged from these checks, so no product source fix or redundant full regression run preceded the blocked system scenario. A final complete regression pass remains due after that scenario and any fixes.

The operator was provided the verified F7 grant fields: localhost:8000 origin, environment testing, connection mysql, database studentplanneracceptance, user 1, storage `.auth/authorized.json`, verified root/account isolation and explicit fixture permissions. The operator must author actual approval/expiry timestamps and the file itself; `database_disposable`, `allow_registration` and `allow_dispatch` remain false. No grant was generated or self-approved. No academic/import/planning/Reminder fixture has yet been created.

## Earlier continuation preflight at committed frontend baseline

On the subsequent final-acceptance request, the frontend started clean at `b1a1c86af5509d614f6a6b69267386df3b7c135b`; backend remained clean at `f618bba290f919dc3561b0462c59b3b86ade82d8`. The frontend commit contains the earlier provisioning report and test improvements described below. Its passing hosted CI was supplied by the operator; no new hosted run is claimed for this report update.

The original namespace and private Laravel/frontend processes were still alive and shared the recorded network namespace. Re-entered it with `nsenter --preserve-credentials --target "$(cat .auth/namespace.pid)" --user --net`; plain nsenter initially refused its supplementary-group setup, and preserving the existing credentials succeeded. No replacement namespace, database/account creation or migration was needed. The existing probe again confirmed `APP_ENV=testing`, expected APP_URL, mysql/studentplanneracceptance, all 25 migrations with none pending, and required columns. The runtime diagnostic confirmed `planner_acceptance_app@localhost`, zero users and empty domain tables. A fresh actual CSRF HTTP request and independent cookie/session lookup again verified the listener's checkout/storage/environment and session persistence in the exact acceptance database. Private evidence is `.auth/current-runtime-identity.json` and `.auth/current-http-binding.json`.

Explicit permission for **one retained application-user registration and private test credentials** was requested through the user-input tool. No affirmative answer was available when this preflight stopped. This is the **single immediate authorization blocker**: no user was registered, no authenticated state was synthesized, and neither live suite was run again. Once registration is approved and its actual user ID/session are established, the separately required operator-authored mutation grant remains the next boundary. No grant was generated. The automated results below are from the prior execution, not new runs; only this continuation's documentation formatting and diff checks were repeated.

## Repository and audit scope

| Repository | Starting and final HEAD                    | Final working tree                                                      |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Frontend   | `1f705361741f5f35645d83b119c496c7344046a9` | Uncommitted live-test and acceptance-report changes; no push/deployment |
| Backend    | `f618bba290f919dc3561b0462c59b3b86ade82d8` | Clean; shared `.env`, application code and migrations unchanged         |

Read the current frontend/backend AGENTS instructions, F8.1 setup report, F8 final acceptance, F7 verification, deployment/demo guides, live safety/probe/browser helpers, read/system specs and all live Playwright configurations. Inspected only the additional Resource/type contracts needed for stronger read assertions. No historical whole-codebase audit or baseline full-suite rerun preceded the changes. Starting hosted CI success is operator-supplied baseline evidence; this uncommitted working tree has no hosted CI result.

## Actual isolated environment

| Property               | Verified result                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolchain              | Node 22.23.1, npm 11.20.0, PHP 8.5.11, Laravel 13.33.0, MySQL server 8.4.10                                                                                                |
| Backend checkout       | Sibling `../student-planner-backend`, exact HEAD above                                                                                                                     |
| Host preflight         | MySQL available; host inspection found no listeners on 8000/5173 at this execution, unlike historical F8.1. No shared service was stopped or replaced.                     |
| Process isolation      | `unshare --user --map-root-user --net` succeeded; loopback enabled inside a separate network namespace. PHP/frontend preview and Chromium live checks ran in this context. |
| Browser origins        | Frontend `http://localhost:5173`, backend `http://localhost:8000`; existing origin guards unchanged                                                                        |
| Laravel identity       | `APP_ENV=testing`, expected APP_URL, default mysql connection, application timezone UTC                                                                                    |
| Effective SQL database | `SELECT DATABASE()` = **studentplanneracceptance**                                                                                                                         |
| Runtime SQL identity   | `CURRENT_USER()` = **planner_acceptance_app@localhost**; schema-only SELECT/INSERT/UPDATE/DELETE                                                                           |
| Migration SQL identity | **planner_acceptance_migrator@localhost**; schema-only SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/INDEX/REFERENCES                                                      |
| Account isolation      | Both SHOW GRANTS results contain global USAGE only plus their exact schema grant. Neither has global administrative privileges or GRANT OPTION.                            |
| Schema                 | 28 tables; all 25 existing migrations applied; no pending migrations; all required probe columns present                                                                   |
| Session                | Database driver, private cookie name, path `/`, null domain, HttpOnly=true, Secure=false, SameSite=lax                                                                     |
| CORS/Sanctum           | Credentialed CORS exactly `http://localhost:5173`; stateful localhost ports 5173 and 8000                                                                                  |
| Private runtime        | New private APP_KEY, separate runtime/migration passwords, ignored `.auth/` mode 0700, credential files mode 0600; private Laravel storage and cache/manifest paths        |
| External services      | OpenAI credentials explicitly empty, mail array transport; loopback-only namespace provides no external provider route                                                     |

Provisioning checked both schema and account names before any DDL; there were no collisions. Executed the previously reviewed SQL grants without expanding them. Applied only ordinary `artisan migrate --force --no-interaction` after checking the exact SQL schema, migration account, mysql driver and private storage path. Never ran fresh/reset/wipe/rollback/truncate/seed, or PHPUnit against its existing test database.

Before provisioning, recorded read-only table lists, SHOW CREATE TABLE hashes, row counts and CHECKSUM TABLE results for **both** `student_planner` and `student_planner_testing`. Comparisons after provisioning and again after the final browser run were identical. All acceptance writes were limited by runtime grants to the new schema; neither existing database was changed by this work.

### Independent HTTP/database binding

The stock Laravel development router runs from the backend's public directory inside the namespace. A real HTTP GET `/sanctum/csrf-cookie` returned 204. Privately decrypted its genuine server-issued session cookie using the dedicated APP_KEY and independently found that session ID in the new schema. Also checked the listener's public-directory working directory and selected inherited DB/key/storage/session settings against the runtime configuration. No diagnostic HTTP endpoint, invented cookie or backend edit was used.

The first private server launch used the checkout root as its working directory and returned 500 because the stock router could not find index.php. Corrected the private launch procedure to use public/, then verified the successful 204 and persistence binding above. This was an acceptance-process configuration error; it produced no domain data and required no application change.

At the original provisioning run's final runtime inspection, **users=0**, **sessions=3**, and every domain table was empty. The three ordinary transport sessions are real isolated MySQL persistence, not evidence of business transactions. That original run had no application fixture identifiers or authenticated storage state; the later authorized registration above supersedes this account/session limitation.

## Test improvements and actual commands

`e2e/read.live.spec.ts` now validates authenticated Resource fields instead of accepting only a generic data key: designated profile/timezone, nullable preference fields, availability times, range metadata and UTC intervals/durations, paginated/empty collections, progress populations, ordered daily buckets, cross-report totals and signed comparison deltas. Its authenticated branch subsequently **passed** for the newly authorized account as recorded above; the earlier skipped runs below remain historical evidence.

`e2e/system.live.spec.ts` now creates a private mode-0600 fixture ledger under `.auth/` after authorization. API mutations, XLSX uploads and UI confirmations record returned identifiers/statuses immediately, before subsequent assertions, rather than retaining only a final attachment after success. It records no request bodies, response bodies, preview tokens, passwords or cookies. No ledger or system fixture was generated in this run because the authorization gate was not satisfied. Existing `liveSafety.ts` and its authorization/expiry/dispatch checks are unchanged.

| Command                                                                             | Actual outcome                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `php e2e/support/inspect-backend.php ../student-planner-backend`                    | PASS; initial read-only shared-root metadata only                                                                              |
| `php .auth/provision.php`                                                           | PASS with host execution permission; new schema/accounts, verified grants, unchanged shared snapshots                          |
| `bash .auth/migrate.sh`                                                             | PASS with host execution permission; exact guarded new schema only, 25 migrations, runtime probe and empty-domain counts       |
| `unshare --user --map-root-user --net bash .auth/namespace.sh`                      | PASS with host execution permission; isolated processes and private environment                                                |
| Private CSRF HTTP request plus `php .auth/http-binding.php` inside namespace        | PASS after correcting private router working directory; actual session bound to new database                                   |
| `npm run test:live:read` inside namespace                                           | Exit 0 twice: **1 anonymous test passed, 1 authenticated test skipped** each time; second run follows assertion changes        |
| `npm run type-check`                                                                | Final exit 0; a generic Playwright matcher typing error introduced during assertion editing was corrected before the final run |
| `npm test`                                                                          | Exit 0; **382 passed / 14 files**                                                                                              |
| `npm run build`                                                                     | Exit 0; types and production bundle                                                                                            |
| `npm run test:e2e -- --workers=4 --retries=0 --output=test-results/stage8-chromium` | Exit 0; **54 passed**, including existing accessibility tests, no retries; mocked API evidence                                 |
| `npm run format:check`                                                              | Exit 0 after final report formatting                                                                                           |
| `git diff --check`                                                                  | Exit 0                                                                                                                         |
| `php .auth/verify-shared.php`                                                       | PASS; both existing databases identical to pre-provisioning snapshots                                                          |
| `php .auth/final-runtime.php` inside namespace                                      | PASS; exact runtime identity, zero users/domain records, three transport sessions                                              |

Cross-browser and separate overlapping a11y suites were NOT RUN in this execution because only live harness/documentation changed. Historical F8 has 81 Firefox/WebKit passes; current Chromium includes its existing axe checks. No application behavior, dependency, API abstraction or backend business logic was changed. No demonstrated critical product defect was found; core behavior cannot be inferred from the blocked live scenario.

## Current acceptance matrix

| Category                                                  | Status  | Current evidence or missing prerequisite                                                                                                                                                        |
| --------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated database/accounts/migrations                     | PASS    | Verified new schema, least-privilege roles, 25 migrations, existing schemas unchanged                                                                                                           |
| Private process configuration and HTTP identity           | PASS    | Namespace, private key/storage, actual HTTP session persisted in exact database                                                                                                                 |
| Anonymous CORS/CSRF/protected routes                      | PASS    | Real browser CSRF/cookies and ten protected read 401s                                                                                                                                           |
| Designated account, login/profile/timezone/session/logout | PASS    | Exactly one authorized user (ID 1); real registration/login/profile/refresh/logout and SQL session verification                                                                                 |
| Authenticated reads for all ten requested endpoints       | PASS    | Current live-read command: 2 passed, zero skipped; all ten actual authenticated HTTP 200 Resources                                                                                              |
| Academic Context and association integrity                | BLOCKED | No operator grant or authorized persistent fixtures                                                                                                                                             |
| Manual/effective Lessons and cancellation/replacement     | BLOCKED | System scenario not run; supplementary lifecycle fixtures also unexecuted                                                                                                                       |
| Real XLSX parse/references/revalidation/commit/409/noop   | BLOCKED | Existing supported workbook/harness retained; no real upload                                                                                                                                    |
| Tasks/Subtasks, independent states/progress               | BLOCKED | No real domain mutations                                                                                                                                                                        |
| Preferences/availability/free slots                       | BLOCKED | Anonymous boundaries only; no authenticated configuration or intervals                                                                                                                          |
| Study Plan preview/confirmation/allocations               | BLOCKED | No actual persisted StudySessions                                                                                                                                                               |
| Adaptive replanning and consent                           | BLOCKED | No actual affected/replacement records                                                                                                                                                          |
| Absolute/relative Reminder synchronization                | BLOCKED | No actual Reminder fixtures                                                                                                                                                                     |
| Progress/Trends/Comparison against real records           | BLOCKED | No authenticated report or prepared historical activity                                                                                                                                         |
| Dispatcher/Notification delivery/read idempotency         | BLOCKED | Separate operator disposal/dispatch permission, grant and opt-in absent                                                                                                                         |
| Historical on-time/late/Session/duration/zero-day cases   | BLOCKED | Separate fixture authorization and natural-time preparation absent; no SQL backdating or clock changes                                                                                          |
| Paid AI provider/history/Tools                            | BLOCKED | Separate paid permission and credentials absent; no provider request                                                                                                                            |
| Figma parity                                              | BLOCKED | Previously reported access/plan limit; no restored access or approved exports supplied. No repeat attempt or parity claim. Missing desktop/mobile light/dark screen groups remain listed below. |
| Unit/types/build/Chromium/accessibility                   | PASS    | Current automated results above; browser APIs mocked outside the explicitly labeled live checks                                                                                                 |
| Firefox/WebKit                                            | NOT RUN | Historical evidence retained; no relevant UI changes                                                                                                                                            |
| Exact final hosted CI                                     | NOT RUN | Changes uncommitted/unpushed; no new completed run claimed                                                                                                                                      |
| HTTPS staging/release infrastructure                      | BLOCKED | No actual staging destinations/access supplied                                                                                                                                                  |
| Production deployment                                     | NOT RUN | Not authorized                                                                                                                                                                                  |

## Private handoff and authorization still required

The provisioned schema/accounts/configuration are retained. Private execution artifacts are under ignored `.auth/`: runtime/migration env files, backend storage, grant-free diagnostics/scripts, HTTP session binding, initial/final counts, shared-schema snapshots and isolated server/live-read logs. Regression logs are `/tmp/stage8-{format,types,unit,build,chromium}.log`; Chromium artifacts are ignored under `test-results/stage8-chromium`. None contains a committed credential. The acceptance namespace/processes were retained for continuation; its private namespace and PID files identify the context. Keep the same namespace for registration, browser state and live tests. Never route these checks to a host/shared process as a shortcut.

Registration was explicitly approved and completed once, with actual user ID 1. Credentials and genuine browser state are retained privately, and authenticated reads passed. Do not register another account or run the legacy account-creating smoke. The only immediate missing operator action is authoring the separate F7 grant for the already approved business fixtures.

Before persistent domain fixtures, the operator must independently author `.auth/f7-grant.json` with the verified `environment=testing`, `connection=mysql`, `database=studentplanneracceptance`, actual user ID/storage path, explicit fixture permission and timestamps no more than 24 hours apart. See the unchanged F7 schema below. The agent did **not** author or self-approve that grant. Leave dispatch/paid AI disabled unless separately authorized. Only after a valid grant is supplied may the exact existing `test:live:system` command execute. Inspect any ledger/persisted records before retrying a partial run; retain history and never reset the database.

**Decision: BLOCKED.** Infrastructure, dedicated authentication and authenticated API reads passed. Real business integration is waiting only for the required operator-authored grant; it has not executed and cannot be counted as accepted. The final complete regression pass follows integration and any fixes. Optional delivery/provider/Figma/historical/staging gates remain separate. This is neither core acceptance nor production-readiness approval.

---

# F8.1 — Real integration acceptance (historical)

Date: 2026-10-30. Starting frontend HEAD: `acc037553558a37006cb72a6eb541db15432fe21` on clean `main`. Backend HEAD: `f618bba290f919dc3561b0462c59b3b86ade82d8`, clean. Full real-system acceptance remains **BLOCKED** pending an authorized acceptance environment/account/session/grant. This report continues [F8](f8-final-acceptance.md); historical reports are preserved.

Final frontend HEAD remains the same; the three F8.1 documentation files are uncommitted for review. No push, backend edit or deployment occurred.

## Infrastructure findings

The existing read-only probe passed against the current Laravel root. Laravel is 13.33.0, PHP 8.5.11, MySQL 8.4.10; Node 22.23.1 and npm 11.20.0 are available. Effective APP_ENV is local, APP_URL is `http://localhost:8000`, application timezone UTC, connection/driver mysql and SQL database `student_planner`. All 25 migrations are applied, no migrations are pending, users.timezone exists and all listed acceptance columns in 12 tables are present.

MySQL metadata inspection found two relevant schemas:

| Schema                    | Observed state                                                                                                                                                                                              | Authorization conclusion                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `student_planner`         | 28 tables; configured application database                                                                                                                                                                  | Shared/valuable status unknown; no mutation permission.                                                                                                                         |
| `student_planner_testing` | 28 tables, 25 applied migrations, no pending migrations, all probe columns present. An initial nine-domain-table count was followed by exact counts of all tables: migrations=25 and all 27 other tables=0. | This is the schema named in backend phpunit.xml. Empty at inspection time does not establish dedicated use/disposability. Do not repurpose it or run PHPUnit during acceptance. |

Only counts/metadata were returned; no user records or secret values were printed or copied into the report. The configured MySQL account has broad administrative privileges on `*.*`, including schema/user administration. It is unsuitable as the proposed least-privilege acceptance runtime account. No privileges were changed. No `studentplanneracceptance` schema was found.

The host HTTP listener at port 8000 is PHP PID 7065, serving the backend's public/ directory through Laravel's stock development router. Its selected inherited identity has APP_ENV=local and no DB override; no cached configuration exists. Reconstructing that process environment for the same read-only bootstrap returned `student_planner`, mysql and the same 25 migrations. This strengthens root/configuration binding without exposing an HTTP diagnostic endpoint; it does not authorize that database for mutations. Host Vite PID 7124 serves the frontend on port 5173. Neither service was stopped or reconfigured.

The effective local session settings are database driver, path `/`, domain=null, Secure=false, HttpOnly=true and SameSite=lax. Sanctum stateful entries are localhost:5173/8000; credentialed CORS allows exactly `http://localhost:5173`. MySQL's Unix socket is `/var/lib/mysql/mysql.sock`.

No `.auth/` directory or read/mutation/dispatch/paid-AI authorization variables were supplied. No designated acceptance user exists in the empty test schema, and none was selected from the current application database.

## Operator setup — proposed, not executed

This is a concrete review procedure. **Database/user creation, migrations, private runtime configuration and initial account creation below require explicit operator approval.** No command in this section was executed as provisioning. The current application database, PHPUnit database, backend `.env`, source and migrations must remain unchanged. System mutations still require the separate operator-authored F7 grant; dispatch and paid AI are excluded from provisioning approval.

### Separate the HTTP process without stopping existing services

A transient user/network namespace was tested non-destructively: it could bind its own loopback port 8000 while host PID 7065 continued listening at the host's port 8000. The probe closed immediately. No application ran in that namespace and no database was written.

The proposed acceptance process, browser and harness can run together in such a namespace. They retain the exact guarded `http://localhost:5173` / `http://localhost:8000` origins. They connect to the isolated MySQL schema through the existing Unix socket, which does not require access to the host TCP loopback. This is a separate loopback network, not a redirect or relaxation of liveSafety. With loopback only, external paid-provider calls are unavailable; paid AI remains a separate later exercise.

### Create the isolated schema and schema-scoped accounts

After approval, a DBA uses a private authenticated client to execute the following template once, substituting locally chosen secrets. Stop on a preexisting schema/account collision; do not add IF NOT EXISTS or drop existing objects. Never place real secrets into Git, command arguments, captured transcripts or this report.

```sql
CREATE DATABASE studentplanneracceptance
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'planner_acceptance_migrator'@'localhost'
  IDENTIFIED BY '<PRIVATE_MIGRATOR_PASSWORD>';
CREATE USER 'planner_acceptance_app'@'localhost'
  IDENTIFIED BY '<PRIVATE_RUNTIME_PASSWORD>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
  ON studentplanneracceptance.* TO 'planner_acceptance_migrator'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE
  ON studentplanneracceptance.* TO 'planner_acceptance_app'@'localhost';
```

Neither account has global privileges, GRANT OPTION or access to the two existing schemas. The proposed database name avoids `_`/`%` wildcard ambiguity in database-level grants; see the [MySQL GRANT reference](https://dev.mysql.com/doc/refman/8.4/en/grant.html). The name becomes the exact grant/database identity if approved, not an assumed existing resource. Confirm each account's effective privileges using SHOW GRANTS and SELECT DATABASE(). Do not probe isolation with writes to another schema.

### Private process configuration and migrations

After approval, use `umask 077` and create ignored `.auth/` with mode 0700. Prepare two operator-owned files there: `acceptance-runtime.env` and `acceptance-migration.env`. They must be reviewed shell-compatible environment files, never committed. Runtime values are:

```dotenv
APP_ENV=testing
APP_DEBUG=false
APP_URL=http://localhost:8000
APP_KEY=REPLACE_PRIVATELY_WITH_NEW_ACCEPTANCE_KEY
DB_URL=
DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_SOCKET=/var/lib/mysql/mysql.sock
DB_DATABASE=studentplanneracceptance
DB_USERNAME=planner_acceptance_app
DB_PASSWORD=REPLACE_PRIVATELY
DB_CACHE_CONNECTION=mysql
DB_CACHE_LOCK_CONNECTION=mysql
SESSION_CONNECTION=mysql
SESSION_DRIVER=database
SESSION_DOMAIN=null
SESSION_SECURE_COOKIE=false
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
SESSION_COOKIE=planner_acceptance_session
SANCTUM_STATEFUL_DOMAINS=localhost:5173,localhost:8000
CORS_ALLOWED_ORIGINS=http://localhost:5173
CACHE_STORE=database
QUEUE_CONNECTION=sync
MAIL_MAILER=array
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=
LARAVEL_STORAGE_PATH=REPLACE_WITH_ABSOLUTE_FRONTEND_ROOT/.auth/backend-storage
APP_CONFIG_CACHE=REPLACE_WITH_ABSOLUTE_FRONTEND_ROOT/.auth/acceptance-config.php
```

Replace placeholders privately and quote shell-sensitive values before sourcing. `SESSION_DOMAIN=null` is Laravel dotenv's null value, not the string cookie domain "null". Keep acceptance-config.php absent; do not run config:cache on the shared backend root. The new private APP_KEY must be generated into the private file, not printed into logs. Set any inherited per-connection URL/cache/session overrides to the reviewed acceptance values; inspect the effective result before any migration.

The migration file supplies the same process settings/key/storage but uses planner_acceptance_migrator and its own private password. Do not use the runtime account for DDL. From the frontend root, after approval:

```sh
export F81_FRONTEND_ROOT="$PWD"
export F7_BACKEND_ROOT="$(realpath ../student-planner-backend)"
mkdir -p .auth/backend-storage/app/private .auth/backend-storage/framework/cache/data \
  .auth/backend-storage/framework/sessions .auth/backend-storage/framework/views \
  .auth/backend-storage/logs
(
  set -e
  set -a
  . "$F81_FRONTEND_ROOT/.auth/acceptance-migration.env"
  set +a
  cd "$F7_BACKEND_ROOT"
  php <<'PHP'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$db = Illuminate\Support\Facades\DB::connection();
$identity = $db->selectOne('SELECT DATABASE() AS name, CURRENT_USER() AS account');
if ($db->getDriverName() !== 'mysql' || $identity->name !== 'studentplanneracceptance'
    || $identity->account !== 'planner_acceptance_migrator@localhost') {
    fwrite(STDERR, "Acceptance migration identity mismatch; stop.\n");
    exit(1);
}
echo "Verified the exact acceptance schema and migrator identity.\n";
PHP
  php artisan migrate --force
  php artisan migrate:status
)
```

The existing inspect-backend.php expects a migrations table, so it is used **after** initial migration; it must not be treated as a bootstrap schema creator. The only migration command proposed is ordinary migrate against the verified new schema. No migrate:fresh, reset, truncate, seed or history deletion is needed. Afterward source runtime settings and run the existing probe; require exact new database, no pending migrations, every required column and zero users/domain fixtures before account creation. Confirm the runtime grants exclude DDL. Removing/disabling the migration account later is a separate DBA action, never silent cleanup.

### Run the existing applications and capture a genuine session

After approval and successful schema checks, build the frontend and enter the tested namespace from the frontend root:

```sh
unshare --user --map-root-user --net bash
set -e
ip link set lo up
set -a
. "$F81_FRONTEND_ROOT/.auth/acceptance-runtime.env"
set +a
php e2e/support/inspect-backend.php "$F7_BACKEND_ROOT"
(
  cd "$F7_BACKEND_ROOT"
  exec php artisan serve --host=127.0.0.1 --port=8000 --no-reload
) > "$F81_FRONTEND_ROOT/.auth/backend.log" 2>&1 &
F81_SERVER_PID=$!
npm run preview -- --host localhost --port 5173 --strictPort \
  > "$F81_FRONTEND_ROOT/.auth/frontend.log" 2>&1 &
F81_PREVIEW_PID=$!
trap 'kill "$F81_SERVER_PID" "$F81_PREVIEW_PID"' EXIT
npx playwright open --browser=chromium \
  --save-storage=.auth/authorized.json http://localhost:5173/login
```

The parent shell must export F81_FRONTEND_ROOT/F7_BACKEND_ROOT as above. Both processes, the operator browser and later test commands run **inside the same namespace**. Never stop the host's existing PHP/Vite services. The private storage root keeps acceptance uploads/logs separate from the shared application's storage. End the namespace only after capturing evidence; its exit trap stops only its own recorded processes. Keep schema/history/artifacts unless cleanup is separately approved.

An operator with a local GUI can use the Playwright open window. If no GUI is available, supply a genuine state captured by an approved interactive browser in this same isolated context; do not synthesize cookies or impersonate an existing user. Do not enable HAR/trace/video or use codegen that captures the password.

If no designated account exists, the separately approved initial account creation uses the existing Registration UI once; do not run the legacy registration smoke or create another account on every run. Keep its password privately. Log out through the real UI, verify protected rejection, log in again, reload profile and a protected route, and inspect GET /api/profile to record only the actual user ID/timezone. Confirm CSRF 204, login/profile 200, HttpOnly session, readable XSRF cookie and session restoration. Close the window to write `.auth/authorized.json`; logging out after capture invalidates it and requires a new capture.

Set the operator-provided ID and private path in that namespace and run:

```sh
export F7_READ_STORAGE_STATE=.auth/authorized.json
export F7_READ_USER_ID=<ACTUAL_AUTHENTICATED_USER_ID>
npm run test:live:read
```

Do not stop at a generic `data` envelope: inspect actual profile, nullable preferences, array/range metadata, Reminder/Inbox pagination and report metric structures against their existing TypeScript types. Check the profile timezone, all requested range labels, populated and genuine empty cases. A second account is only used with its own explicit permission. Owner isolation cannot be inferred from one account's 200 responses.

### Separate operator grant and live execution

Only after the operator verifies the running namespace/root, exact database, account isolation and saved session should the **operator** author `.auth/f7-grant.json` using the unchanged [F7 schema](f7-verification.md#operator-procedure-for-remaining-live-scenarios). Use actual approved/expires timestamps, at most 24 hours, exact user/database identity, allow_mutations=true, and explicit isolated/nonvaluable/root-match assertions. Leave database_disposable, allow_registration and allow_dispatch false unless separately approved. Provisioning permission is not this grant.

With that file supplied and validated, set F7_LIVE_ALLOW_MUTATIONS=1, F7_LIVE_GRANT and F7_BACKEND_ROOT and run `npm run test:live:system` inside the same namespace/runtime environment. Retain the emitted fixture IDs and a private incremental ledger; the harness's final attachment is unavailable if a run stops early. A failed run can leave a populated account; inspect records rather than blindly rerunning or deleting history.

The current system scenario covers genuine XLSX/reference/revalidate/commit/noop/409, planning/adaptive confirmation, reschedule/cancel and Reminder synchronization. It does not exhaust every availability update/delete/overlap, null preference, manual Lesson replacement/cancellation or elapsed completion/miss case. Record those separately through supported APIs with independent GETs. The backend permits complete once a Session has started; miss requires its end to have elapsed. Cancel/reschedule require a future start. No clock manipulation or backdating is allowed.

Dispatcher execution requires additional explicit database-wide isolation/disposability approval, database_disposable=true, allow_dispatch=true and F7_LIVE_ALLOW_DISPATCH=1. Provider calls require separate paid approval and a context with approved provider egress. Neither permission follows from this setup or system grant.

## Executed read-only integration

`npm run test:live:read` exited **0**, with **one anonymous browser test passed and one authorized-session test skipped**. The authenticated category is BLOCKED, not PASS. No existing account was chosen to avoid the missing setup. The browser served real built assets at localhost:5173 and fetched Laravel at localhost:8000 without API interception. GET /sanctum/csrf-cookie returned 204, XSRF and HttpOnly session cookies were present, and protected navigation redirected to login.

These exact requests returned 401 in the real browser:

| Protected GET endpoint               | Query                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `/api/profile`                       | None                                                                                                                  |
| `/api/planning-preferences`          | None                                                                                                                  |
| `/api/study-availability-windows`    | None                                                                                                                  |
| `/api/planning/free-slots`           | start_date=2026-10-01&end_date=2026-10-07                                                                             |
| `/api/study-sessions`                | Same October 1–7 range                                                                                                |
| `/api/reminders`                     | None                                                                                                                  |
| `/api/notifications`                 | unread_only=true                                                                                                      |
| `/api/statistics/progress`           | October 1–7 range                                                                                                     |
| `/api/statistics/trends`             | October 1–7 range                                                                                                     |
| `/api/statistics/reports/comparison` | baseline_start_date=2026-10-01&baseline_end_date=2026-10-07&current_start_date=2026-10-08&current_end_date=2026-10-14 |

There were **no authenticated HTTP 200 Resource responses**. No real ownership/pagination/timezone/empty-state/restore acceptance is inferred from these 401s or from SQL column presence. Historical F1/F2 live success remains separately recorded in its original report.

No system, legacy registration, dispatch or paid-provider command was executed. Their guards were inspected without launching an unauthorized suite, creating a grant or setting an opt-in. No real F4/F5/F6 mutation has a successful result to reconcile in this run. The existing full system harness remains ready for an operator-approved environment and grant; it is not proof that every requested scenario has executed.

## Historical statistics and live scenario limits

The future-oriented system fixture cannot establish the requested historical metrics. Once separately authorized, use actual backend operations and clock time: create pending estimated work and valid future Sessions, wait until real eligibility, complete one Session with known minutes and another without, and miss an ended Session. Keep the associated Tasks pending so Task completion does not invalidate unrelated planned fixtures. Complete a different Task and a child of a separate pending Task to prove independent populations.

For on-time versus late completion, use distinct authorized Tasks with real deadlines: complete one before its future deadline, let the other's deadline naturally elapse before completion. Do not backdate any record or manipulate clocks. Record IDs, deadlines, start/end/completed timestamps, scheduled seconds and known/null actual_minutes in a private ledger immediately. Reports covering those local dates must match independent record GETs. Compare equal ordered periods, signed deltas and genuine zero-activity dates; unknown minutes must remain unknown. Only records actually prepared/observed may determine expected metrics. No historical preparation was authorized or executed in F8.1.

The current system harness does not automatically prove every preference nullable/validation case, availability edit/delete/overlap, manual Lesson replacement/cancellation, full set of Session time transitions or specialized partial/unplaced outcome. An eventual green system test must not turn those missing live conditions into PASS. Use targeted supported REST/UI exercises after separate scenario authorization, preserve each successful mutation with independent GET evidence and retain history on interruption.

## Visual, accessibility and browser scope

One direct Figma access attempt failed through the available web tool. No Figma MCP inspection capability or approved exported frames were available; no repeated plan/rate-limit probes were made. Existing Academic Minimalism tokens, Manrope, light/dark surfaces, navigation and consent layouts were preserved. No measurements, source frame IDs or pixel parity were invented.

Required source evidence remains desktop/mobile and light/dark variants for Login, Registration, Dashboard, Schedule, Tasks, Study Planning, AI Assistant, AI confirmation, Reminders, Statistics, Excel Import and Settings. For each group the operator must provide actual file access or approved exports with source viewport dimensions and frame identity. Specific gaps include typography, spacing, colors, component dimensions/states, borders, navigation, dialogs and action review alignment. The number and dimensions of actual source frames are unknown; these are requested screen groups, not invented Figma frame metadata. Implementation screenshots remain supporting evidence only.

The final Chromium suite includes the existing 27-route/two-theme axe audits, dialog containment/restoration, keyboard navigation, semantic charts/tables, responsive navigation, reduced-motion/text-size smoke and large-data cases. Historical F8 records 81 passing Firefox/WebKit executions. F8.1 changes only documentation, so the long cross-browser suite and separate overlapping accessibility command were not rerun. The full Chromium command reruns the 16 audit test executions as part of its 54 tests. Native Safari, physical devices, real screen-reader testing and actual browser UI zoom were not performed.

## Automated verification and hosted CI

The GitHub API and connected job inspection confirmed [run 41023700450](https://github.com/BashukOleksii/Student-AI-Planner-Frontend/actions/runs/41023700450), completed successfully for **acc037553558a37006cb72a6eb541db15432fe21**. Install, format, types, unit, build and Chromium steps all succeeded. This closes the prior report's unpushed F8 CI gap for that exact committed baseline; it does not establish hosted success for new F8.1 documentation.

| Command/check                                                            | Exit / evidence                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm ci`                                                                 | 0; 266 packages installed, lockfile unchanged                                      |
| `npm run type-check`                                                     | 0                                                                                  |
| `npm test`                                                               | 0; 382 tests / 14 files                                                            |
| `npm run build`                                                          | 0; production bundle/type checking, not a deployment                               |
| `npm run test:e2e -- --workers=4 --output=test-results/f81-chromium`     | 0; 54 desktop/mobile Chromium tests, no retries, including the 16 audit executions |
| `npm run test:live:read`                                                 | 0; one passed / one authenticated test skipped                                     |
| `php e2e/support/inspect-backend.php ../student-planner-backend`         | 0; current effective database/configuration/schema                                 |
| Same probe with read-only `DB_DATABASE=student_planner_testing` override | 0; schema/columns present, APP_ENV still local in this CLI check                   |
| Temporary read-only metadata/count/privilege queries                     | 0; existing schemas and least-privilege gap described above                        |
| Reconstructed HTTP listener environment probe                            | 0; same backend root and current student_planner identity                          |
| Transient `unshare --user --map-root-user --net` bind probe              | 0; separate loopback 8000 available, host listener preserved                       |

Final `npm run format:check` and `git diff --check` both exited **0**. Local documentation links and secret-pattern checks passed. `git status --short` exited 0 and lists only README.md, docs/demo-scenario.md and the new docs/f8-live-acceptance.md. The backend status/diff checks exited 0 with no changes. Application, API, test, package and lockfile diffs are empty; `.auth/` remains absent. Both original host listener PIDs remained in place.

Logs are local `/tmp/f81-*.log`; browser output is ignored under `test-results/f81-chromium`. Temporary `/tmp/f81-inspect-mysql.php` is a read-only local diagnostic, not a new application endpoint or committed tool. No real credential/state file or sensitive HTTP trace was created. Cross-browser and standalone a11y commands were not rerun; the former retains historical F8 evidence and the latter would duplicate the current full suite's audit executions.

## Acceptance matrix

Status scope is explicit: product rows require **current real authenticated integration**, while accessibility/browser/build rows describe automated checks. BLOCKED means missing permission/environment; NOT RUN means no current execution. Historical mocked/real evidence stays labeled. A skipped test is never PASS.

| # / Category                    | Status  | Verification method and actual evidence                                                                                                               | Relevant endpoints/service                                                                | Finding, remaining issue and next action                                                                          |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1. Authentication               | BLOCKED | F8.1 real anonymous CSRF 204/cookies/protected 401 passed; no login/logout exercise. Historical F1/F2 login is separate.                              | `/sanctum/csrf-cookie`, POST `/api/auth/login`, `/api/profile`, POST `/api/auth/logout`   | Supply authorized isolated account/state; verify login, refresh, logout then 401.                                 |
| 2. Profile/timezone             | BLOCKED | SQL timezone column present; authenticated Resource not read.                                                                                         | GET/PATCH `/api/profile`                                                                  | Verify designated ID, persisted timezone, UTC/local presentation and session restore.                             |
| 3. Academic Context             | BLOCKED | Source/historical/deterministic evidence only; no current owned CRUD.                                                                                 | `/api/education-institutions`, `/api/academic-periods`, `/api/subjects`, `/api/teachers`  | Authorize fixtures and independently GET every created association.                                               |
| 4. Schedule/Lessons             | BLOCKED | No current authorized manual/effective Lesson scenario.                                                                                               | `/api/lessons`, `/{id}`, `/{id}/cancel`, `/{id}/replacement`, `/api/schedule/week/{date}` | Verify real creation/read, designated cancellation/replacement and effective schedule.                            |
| 5. XLSX import                  | BLOCKED | Supported workbook/harness already exist; no current parser/upload/commit.                                                                            | `/api/schedule-imports`, `/{id}`, `/{id}/revalidate`, `/{id}/commit`                      | Real multipart, references, persisted Batch, commit, Lessons, duplicate/noop and controlled 409 remain pending.   |
| 6. Tasks/Subtasks               | BLOCKED | Current deterministic regressions pass; no authorized real mutations.                                                                                 | `/api/tasks`, nested `/subtasks`, `/progress`, lifecycle/reorder routes                   | Approve owned fixtures; verify independent parent/child state and exact persisted deadlines.                      |
| 7. Planning Preferences         | BLOCKED | Anonymous GET 401; no authenticated values or PUT.                                                                                                    | GET/PUT `/api/planning-preferences`                                                       | Check null/full configuration, validation and persisted reload after authorization.                               |
| 8. Availability                 | BLOCKED | Anonymous GET 401; no real windows.                                                                                                                   | `/api/study-availability-windows`, PATCH/DELETE `/{id}`                                   | Verify recurring wall clock, CRUD and genuine overlap rejection.                                                  |
| 9. Free Slots                   | BLOCKED | Anonymous ranged GET 401; no server slot payload.                                                                                                     | `/api/planning/free-slots`                                                                | Verify real blockers, durations, range labels and profile timezone; no client calculation.                        |
| 10. Study Plan confirmation     | BLOCKED | No operator grant; preview/confirm never executed.                                                                                                    | `/api/planning/study-plans/preview`, `/confirm`, `/api/study-sessions`                    | Produce genuine allocation/review/consent and independently read persisted Sessions.                              |
| 11. Adaptive Replanning         | BLOCKED | No live preview/replacements; partial/unplaced conditions not produced.                                                                               | `/api/planning/replanning/preview`, `/confirm`                                            | Prepare actual blockers/shortfalls and verify both independent consents and original/replacement states.          |
| 12. StudySession lifecycle      | BLOCKED | Source eligibility inspected; no authorized future/elapsed fixtures.                                                                                  | `/api/study-sessions/{id}`, `/complete`, `/miss`, `/cancel`, `/reschedule`                | Complete after start, miss after end, future cancel/reschedule; GET every actual transition.                      |
| 13. Reminder synchronization    | BLOCKED | Existing prepared assertions only; no real Reminder create/edit/cancel/dependency effect.                                                             | `/api/reminders`, `/{id}`, `/{id}/cancel`, Task/child/Session lifecycle                   | Authorize absolute and all relative anchors; verify Laravel triggers and preserved histories via GET.             |
| 14. Scheduler delivery          | BLOCKED | No dispatcher invoked; separate disposal/dispatch permission absent.                                                                                  | `reminders:dispatch-due`, ReminderDeliveryService                                         | Explicit whole-database isolation/dispatch grant, due fixture, sent_at and exactly one persisted notification.    |
| 15. Notification Inbox          | BLOCKED | Anonymous GET 401; no authenticated list/read receipt.                                                                                                | `/api/notifications`, POST `/{id}/read`                                                   | Verify all pages, explicit read, repeated timestamp and independent list state.                                   |
| 16. Progress Statistics         | BLOCKED | No authenticated/nonzero historical report; no past fixture.                                                                                          | `/api/statistics/progress`                                                                | Authorized elapsed activity ledger must establish independent completions/statuses/seconds/known-null minutes.    |
| 17. Daily Trends                | BLOCKED | Anonymous 401; no real daily aggregation.                                                                                                             | `/api/statistics/trends`                                                                  | Match actual local-day activity, totals and genuine zero dates to ledger.                                         |
| 18. Period Comparison           | BLOCKED | Anonymous 401; no real equal-period totals/deltas.                                                                                                    | `/api/statistics/reports/comparison`                                                      | Match baseline/current/signed deltas and unknown-minute observations to recorded sources.                         |
| 19. AI Assistant                | BLOCKED | Deterministic browser tests only; no paid approval/state/conversation or provider execution.                                                          | `/api/ai/conversations`, `/{id}/messages`, `/actions/...`; Laravel Responses adapter      | Separate bounded paid opt-in; verify public assistant/Tool/history; separate approval before action confirmation. |
| 20. Figma visual parity         | BLOCKED | Direct source access failed; no approved exports; implementation screenshots only.                                                                    | Figma MockUps source frames                                                               | Obtain actual variants/identities/dimensions and compare all requested groups; no pixel-perfect claim.            |
| 21. Accessibility               | PASS    | Current full Chromium suite includes automated axe/keyboard/dialog/navigation/table checks; manual screen reader/zoom/device NOT RUN.                 | Existing `e2e/audit.spec.ts`, shared UI/routes                                            | Retain source semantics; perform manual checks separately before conformance/device claims.                       |
| 22. Cross-browser compatibility | NOT RUN | No F8.1 engine rerun. Historical F8: 81 Firefox/WebKit passed. Same application/test source; docs-only changes do not justify repeating full engines. | `playwright.cross-browser.config.ts`                                                      | Reuse labeled historical evidence; rerun if source changes. WebKit is not native Safari.                          |
| 23. Build and CI                | PASS    | Local checks pass; hosted run 41023700450 completed successfully for exact starting HEAD. New working-tree docs not hosted.                           | Repository scripts, `.github/workflows/ci.yml`                                            | Push only after review, then inspect that new commit's own completed CI.                                          |
| 24. HTTPS staging               | BLOCKED | No real staging origins/access/deployment authorization.                                                                                              | Actual HTTPS SPA/API/CSRF/session/static routes                                           | Use existing deployment acceptance record with actual domains; preserve localhost-only harness.                   |
| 25. Production deployment       | NOT RUN | No deployment performed or authorized.                                                                                                                | Hosting, scheduler/proxy/secrets operations                                               | Explicit operator release and independent deployed acceptance required.                                           |

## Persistent effects, files and final recommendation

No business fixture IDs were created: no account, Academic Context, Lesson, import Batch, Task/Subtask, Session, Reminder/Notification or AI record. Anonymous CSRF/session requests can persist ordinary transport-session metadata. No database/user/grant creation, migration, historical preparation, cleanup, scheduler or paid request occurred. Existing databases, HTTP/Vite services and backend source/configuration remained unchanged. No actual grant, storage state, provider key or environment secret was written into Git.

Repository changes: this report; `docs/demo-scenario.md` links current setup, spells out the fifteen presentation stops and clarifies Session timing/browser boundaries; README links current evidence and corrects hosted F8 status. No frontend application, API, test-harness, package or backend code changed. No new product bug was confirmed and no product fix was made. The corrections are operational guidance/evidence attribution.

**Recommendation: NOT YET ACCEPTED for full live-system acceptance.** Implemented functionality and automated release evidence remain available; real authenticated F4/F5/F6 effects, delivery/provider execution, historical reports, Figma parity and staging are not established. The academic demonstration runbook is prepared with honest fallbacks, but a complete live demonstration still requires authorized fixtures.

The smallest next operator action is to approve the reviewed isolated schema/scoped-account/migration/initial-user procedure above, or supply an existing authorized isolated environment/session. A provisioning approval request was issued while independent checks continued. Without that approval, no provisioning may start. After actual identity/session checks, the operator must separately author the existing live grant. Dispatch, paid AI and deployment remain separate decisions.
