# F8.1 — Real integration acceptance

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
