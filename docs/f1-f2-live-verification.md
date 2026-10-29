# F1–F2 real Laravel integration verification — 2026-10-29

## Outcome and repository state

**PASS: the implemented F1/F2 workflows are functionally verified against the actual local Laravel REST API and MySQL database.** The previous missing `users.timezone` registration blocker is resolved. This report supplements the historical [F1](f1-verification.md) and [F2](f2-verification.md) reports; their earlier failures remain valid historical observations.

Started with a clean working tree on `main`, HEAD `137be978b3824d13cf54b823fc92a40ef59dde2c` (`Add part of second step`). Inspected AGENTS.md, both earlier reports, README, the existing API client/modules/types, auth store, router, relevant views/forms/composables and browser test configuration. Checked actual backend Requests, Resources, Services, routes and Academic/Schedule contracts where needed.

Ended on the same branch and HEAD with the verification changes uncommitted. No commit or push was requested. Application source, dependencies, lockfile, authentication architecture and routes were preserved. The backend working tree remained clean; no backend source, configuration, migrations or infrastructure were modified. Only this frontend's live harness and documentation changed.

## Backend readiness and database blocker resolution

The developer applied the existing migrations before this continuation. Verification used read-only diagnostics:

- `curl --max-time 5 -s -D /tmp/f12-ready-headers.txt -o /tmp/f12-ready-body.json -w '%{http_code}' -H 'Accept: application/json' -H 'Origin: http://localhost:5173' http://localhost:8000/api/profile` returned 401 with `Access-Control-Allow-Origin: http://localhost:5173` and `Access-Control-Allow-Credentials: true`.
- `php artisan env` returned `local`.
- `php artisan migrate:status --no-ansi` showed all 25 existing migrations as `Ran`, including `add_timezone_to_users_table`.
- A read-only `php artisan tinker --execute` probe of the configured application environment, connection driver and `Schema::hasColumn('users', 'timezone')` returned `local`, `mysql`, and `users.timezone present`. No credentials or database contents were dumped.

No migrations were rerun. Real browser registration then returned **201**, with a User Resource containing exactly `id`, `name`, `email`, `timezone` and the persisted `Europe/Kyiv` value. Authenticated profile retrieval, reload and later login confirmed persistence through the running HTTP application, beyond the CLI schema check.

## Live test method and safety

`npm run test:live` builds the existing application and runs Chromium against the SPA origin `http://localhost:5173`. Only frontend assets are fulfilled from `dist`; **no request to Laravel at port 8000 is mocked or intercepted**. Browser CORS, Laravel stateful sessions, CSRF, validation and authorization stay enabled. The existing Chromium loopback permission is retained. Configuration rejects a non-local API origin and uses one worker with zero retries.

The browser timezone is explicitly UTC while the persisted profile uses Europe/Kyiv and, during profile verification, America/New_York. This makes accidental browser-timezone conversion detectable. Test-only lesson fixtures and security probes use browser `fetch` with the same real CORS/cookie boundary; all implemented CRUD screens are exercised through their UI. Lesson setup does not add a lesson-management feature to the application.

Requests are audited using only method, path and HTTP status. Passwords, cookies, CSRF values and request bodies are excluded from that audit. Cleanup first verifies the unique newly registered owner's ID. It uses existing REST endpoints only; it never resets the database, purges retained history or cleans unrelated accounts.

## Real endpoints and workflows exercised

| Area                  | Real endpoints                                                                                                                    | Verified behavior                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication        | GET `/sanctum/csrf-cookie`; POST `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`; GET `/api/profile`                  | CSRF 204, registration 201 and X-XSRF-TOKEN header, browser session/XSRF cookies, exact User Resource, authenticated profile, reload restoration, protected navigation, logout, unauthenticated 401/redirect, invalid credentials 422, successful subsequent login and intended destination.                                                                                                                 |
| Profile               | GET/PATCH `/api/profile`                                                                                                          | Name/email/timezone editing and reload persistence; invalid IANA timezone 422 with field error; login using changed email; Europe/Kyiv → America/New_York → Europe/Kyiv; light/dark controls.                                                                                                                                                                                                                |
| Dashboard/statistics  | GET `/api/schedule/today`, `/api/tasks`, `/api/statistics/progress?start_date=...&end_date=...`                                   | Real greeting, new-account empty schedule/tasks/statistics, populated lesson and task, backend pending total and valid inclusive calendar-date queries. No fabricated fallback data.                                                                                                                                                                                                                         |
| Schedule              | GET `/api/schedule/today`, `/api/schedule/date/{date}`, `/api/schedule/week/{date}`                                               | Populated today, correct Europe/Kyiv 10:00–11:30 display from real UTC fixture, teacher/room, next/previous date, populated seven-day week, and empty day/week after fixture removal. Metadata timezone/date range checked.                                                                                                                                                                                  |
| Academic Context      | GET/POST `/api/education-institutions`, `/api/academic-periods`, `/api/subjects`, `/api/teachers`; GET/PATCH/DELETE each `/{id}`  | All four resources created, listed, loaded for editing, edited and deleted. Institution associations and nullable teacher association checked; Period ordered dates/client validation and persisted end-date edit; duplicate Institution/Period/Subject names rejected with backend 422/field errors; Subject mixed-case hex color/code preserved. Newly created/renamed Subject available in Task selector. |
| Academic dependencies | DELETE `/api/academic-periods/{id}`, `/api/subjects/{id}`                                                                         | Linked Period deletion refused with 422 and a visible dismissible confirmation error; Subject deletion still refused after lesson soft deletion. No destructive retry or promised cascade. Period detached before fixture deletion so ordinary Period CRUD can complete.                                                                                                                                     |
| Tasks                 | GET/POST `/api/tasks`; GET/PATCH/DELETE `/api/tasks/{id}`; POST `/{id}/complete`, `/{id}/reopen`                                  | UI create with Subject, description, priority and 45-minute estimate; canonical deadline `2026-11-12T10:30:00Z` from Kyiv 12:30; edit/priority change and null clearing of description, Subject, estimate and deadline; restore deadline; complete/reopen; confirmed delete/204 and list refresh.                                                                                                            |
| Subtasks              | GET/POST `/api/tasks/{task}/subtasks`; GET/PATCH/DELETE `/{subtask}`; POST `/{subtask}/complete`, `/{subtask}/reopen`, `/reorder` | Two ordered children, parent deadline rejection 422 and field error, canonical child UTC deadlines, editing/detail reads, untouched deadline preservation, complete/reopen, complete ID permutation for move-down, delete cancellation and confirmation, refreshed collection. Wrong-parent nested detail returns 404.                                                                                       |
| Progress              | GET `/api/tasks/{task}/progress`                                                                                                  | Authoritative null with zero children, 0%, 50%, 100%, and null after deletion. Completing parent leaves children pending; completing all children leaves parent pending. No frontend calculation or dependent Session/Reminder mutation added.                                                                                                                                                               |
| Security              | POST `/api/tasks` without X-XSRF-TOKEN; GET `/api/profile` after logout                                                           | Real 419 rejects the mutation and leaves no task; real 401 after logout. No bearer tokens, credential localStorage or disabled security checks.                                                                                                                                                                                                                                                              |
| Schedule fixture only | POST/PATCH/DELETE `/api/lessons`                                                                                                  | Existing REST contract used to arrange a real lesson, detach its Period and soft-delete it for schedule/dependency verification. Production UI remains schedule-view-only.                                                                                                                                                                                                                                   |

Deadline rerendering was checked with the same stored instant: Kyiv 12:30 appears as New York 05:30 for 2026-11-12. Editing only the title in that timezone omits `deadline_at` from PATCH and preserves `2026-11-12T10:30:00Z`. Existing unit tests additionally cover DST gaps, repeated times, calendar arithmetic and untouched ambiguous instants; a live browser clock was not moved across a DST transition.

## Executed commands and actual results

Local versions: Node **22.23.1**, npm **11.20.0**.

| Command              | Final result                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`             | PASS — 264 packages installed, 0 reported vulnerabilities.                                                                                                                     |
| `npm run type-check` | PASS — includes application, config, unit tests and E2E TypeScript.                                                                                                            |
| `npm test`           | PASS — **81 tests in 7 files**, final run 2.99 seconds. Deterministic mocked frontend tests.                                                                                   |
| `npm run build`      | PASS — type check and Vite production build, 94 modules.                                                                                                                       |
| `npm run test:e2e`   | PASS — **10 mocked Chromium tests**, desktop/mobile, 16.3 seconds. Includes existing F1 screens, Academic/Subtasks, themes and overflow checks at compact/intermediate widths. |
| `npm run test:live`  | PASS — **1 expanded real Laravel Chromium journey**, 14.8 seconds (15.7 seconds overall). No Laravel HTTP mocks.                                                               |
| `git diff --check`   | PASS.                                                                                                                                                                          |

The final live audit contains **204 real HTTP responses**: 163 × 200, 11 × 201, 14 × 204, 6 × 401, 1 × 404, 1 × 419 and 8 × 422. Non-success responses are deliberately asserted probes: unauthenticated profile reads; wrong-parent child access; missing CSRF; invalid profile timezone; duplicate Institution/Period/Subject; child deadline after parent; linked Period/history Subject deletion refusals; incorrect login. There were no 5xx responses, unexpected network failures, console errors or unhandled page errors. Read cancellations caused by navigation are allowed. Real schedule/navigation overflow checks also passed at 1440px and 390px.

The existing `.github/workflows/ci.yml` was inspected: Node 24.12.0, clean install, type checking, Vitest, production build, Chromium installation and the mocked E2E suite. It remains independent of Laravel/MySQL and needs no change. **No hosted GitHub Actions run was triggered or claimed.**

## Diagnosed intermediate runs and changes

1. The original live test passed immediately after migrations: 1 test, 9.2 seconds (10.1 seconds overall). This closed the actual database blocker before extending coverage.
2. The first expanded run reached Task editing, then Playwright `fill()` rejected a `datetime-local` value with trailing zero seconds. Chromium normalizes `:00`; the new harness now enters the accepted minute representation and still asserts exact whole-second UTC API values. No Laravel request failed at that step.
3. The next expanded run reached the intended Period DELETE 422, then a strict locator matched both the general alert and field-error list. The harness now selects the general alert explicitly. The invalid-login alert selector received the same correction before rerunning.
4. The final expanded run passed in full after the clean-install/offline regression checks above.

These were **new live-harness defects**, not production frontend integration defects. No application source correction was needed after the migrations. Existing Europe/Kiev → Europe/Kyiv normalization and editable registration timezone are preserved. No test assertions, TypeScript checks, backend validation or browser security were disabled.

Changed files:

- `e2e/live.spec.ts`: expanded real browser assertions, independent browser API probes/fixtures, strict mutation/status checks, owner-checked cleanup, safe request audit, retained-fixture metadata and screenshots.
- `playwright.live.config.ts`: explicit UTC browser timezone, desktop viewport, separate live artifact directory and 120-second allowance for the longer scenario; retries remain zero.
- `README.md`: current verified integration status, expanded live coverage and accurate fixture retention/safety instructions.
- `docs/f2-verification.md`: append-only link to this follow-up; earlier failure evidence retained.
- `docs/f1-f2-live-verification.md`: this current report. The historical F1 report is unchanged.

## Test-data side effects and artifacts

This pass created **four real isolated test accounts**: the passing original scenario, two diagnosed expanded-harness attempts, and the final passing expanded scenario. Accounts cannot be deleted through the current API. Two attempts reached lesson setup, so **two schedule-fixture Subjects and soft-deleted lesson histories remain** in their respective isolated accounts. Task/Subtask soft-deletion history also remains according to backend rules. Removable active fixtures were deleted and sessions logged out. No unrelated data was changed.

The final run retained owner ID **4**, schedule-history Subject ID **6**, and soft-deleted lesson ID **2**. These are local fixture identifiers, not credentials or stable IDs for future runs. Cleanup does not attempt to bypass historical reference restrictions.

Final artifacts under `test-results/live/live-live-F1-session-and-F-ac658-task-and-progress-workflows/`:

- `real-api-requests.json`: sanitized method/path/status audit.
- `retained-test-data.json`: owner and retained Subject IDs/history flag.
- `live-populated-schedule.png`, `live-schedule.png`: actual populated/empty Schedule screenshots; the populated screenshot was visually inspected.

Intermediate failure traces/error contexts were preserved under `/tmp/f12-live-diagnostics/datetime-fill/` and `/tmp/f12-live-diagnostics/alert-selector/`. Command logs are under `/tmp/f12-*.log`. These artifacts are local/ignored, not committed. Failure traces can contain temporary test credentials and must be reviewed before sharing.

## Remaining limits and next milestone

No live infrastructure blocker remains for F1/F2 in this confirmed local environment. This verifies the requested implemented functional workflows, not every possible backend validation combination or production deployment. The existing deterministic tests verify 409/5xx response handling and frontend 419 recovery without replaying a mutation; those failures were not injected into the live UI. Cross-owner access with a second account was not exercised live. Cross-browser, physical-device and deployed HTTPS/Sanctum-domain verification remain future checks.

Figma frames were not accessed during this continuation; no pixel-perfect comparison is claimed. Established Academic Minimalism tokens and components were preserved. No new visual design was introduced.

The recommended next coherent functional milestone is the **AI assistant read interface and explicit action confirmations**, after reviewing its actual backend conversation/proposal contracts. Lesson-management UI, Excel import, planning algorithms, reminder delivery and complex statistics remain deliberately outside F1/F2.
