# Stage F6 — Reminders, Inbox and Progress Reports

Verification date: **2026-10-30**. This milestone verifies frontend behavior with deterministic HTTP fixtures matched to Laravel source. It does not establish real scheduler delivery, MySQL aggregation or live Reminder mutation success.

## Repository audit

Started clean on `main`, HEAD **6a3791dcc45874f956f3b0adb6c50ef2ee988fa2** (`Add next step with testing and integrations`). Existing F1–F5 implementation was preserved. Read AGENTS.md, README and verification history; inspected Router/guards, cookie/CSRF client, auth/theme state, API/types, Dashboard progress, Tasks/Subtasks/StudySessions, AI reminder review/receipts/refresh, timezone utilities, shared UI, responsive styles, tests and CI.

Backend reference HEAD: **f618bba290f919dc3561b0462c59b3b86ade82d8**. Read reminders, progress-statistics, progress-trends, progress-comparisons, tasks, study-session-lifecycle, ai-subtask-reminder-actions, frontend-api-contract and architecture documentation. Checked routes, Reminder/Notification/Progress Resources, Form Requests, Controllers, owner Policies, Reminder rules/target/mutation/delivery and Notification inbox Services, and report contracts. Actual implementation takes precedence.

Figma tools were unavailable; direct file access also failed. Reused established Manrope and semantic light/dark Academic Minimalism tokens, thin borders and shadow-free surfaces. Browser screenshots were inspected; original frames were not compared. No pixel-perfect claim.

Ending branch/HEAD remain unchanged; implementation is left uncommitted for review. No backend file/configuration/migration/schema changes, database resets, account creation, dispatcher execution, unrelated data mutation or paid AI requests. Historical F1–F5 documents are untouched.

## Routes and architecture

| Route                    | Function                                                                   |
| ------------------------ | -------------------------------------------------------------------------- |
| `/reminders`             | Paginated status/paired UTC-bound filters, refresh, readable history.      |
| `/reminders/new`         | Absolute or relative creation, owned Task/Subtask/Session selection.       |
| `/reminders/:id`         | Current detail, explicit cancellation, safe GET recovery.                  |
| `/reminders/:id/edit`    | Scheduled-only mode-specific partial editing.                              |
| `/inbox`                 | All/unread pagination, explicit persisted mark-read, target navigation.    |
| `/statistics`            | Separate lifetime current populations and period progress.                 |
| `/statistics/trends`     | All daily buckets/charts/tables, period totals and detailed daily metrics. |
| `/statistics/comparison` | Equal, ordered periods; complete server totals/deltas/observations.        |

All routes inherit session restoration and auth guards. `api/reminders.ts`, `notifications.ts`, `statistics.ts` use the existing centralized client unchanged. AI reminder reads delegate to the same API module. Shared contracts extend existing Reminder/Progress types; `types/statistics.ts` aliases metric shapes instead of copying them. `useReminderTargets` handles only paginated/owned selectors and bounded Session reads. Page-local orchestration uses `useResource` and aborts stale reads; no new Pinia domain store or dependency.

Focused Reminder form/card/target-link and Statistics summary/chart/range components remain presentational. `PageNavigation` shares server pagination controls. Input utilities validate transport/date constraints, not planning/synchronization/statistical business rules. CSS charts normalize only visual bar width and expose every underlying number in a semantic table; no invented percentages or aggregated totals.

Desktop navigation scrolls if necessary. Ten mobile destinations use two rows of five links, with safe-area/content clearance. Dashboard gains links without more API calls. Task, child and Session context links preselect only explicitly supplied IDs verified through owned reads. AI receipts provide direct Reminder links while retaining distinct action-confirmation semantics.

## Exact API contracts

| Endpoint                                 | Contract consumed                                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/reminders`                     | Resource pagination; `status`, paired canonical UTC `trigger_from`/`trigger_to`, `page`, `per_page` (≤100).                                          |
| POST `/api/reminders`                    | Absolute: `trigger_at`, optional message/one target; relative: compatible `anchor`, integer `offset_minutes`, one target, optional nullable message. |
| GET `/api/reminders/{id}`                | Current or historical Reminder Resource.                                                                                                             |
| PATCH `/api/reminders/{id}`              | Changed message/time for absolute, message/offset for relative.                                                                                      |
| POST `/api/reminders/{id}/cancel`        | Empty JSON object; returned current Resource.                                                                                                        |
| GET `/api/notifications`                 | Paginated `unread_only=true                                                                                                                          | false`, page/per_page. False includes read and unread. |
| POST `/api/notifications/{uuid}/read`    | No business body; returned server read timestamp, idempotent.                                                                                        |
| GET `/api/statistics/progress`           | start_date/end_date, standard Resource envelope.                                                                                                     |
| GET `/api/statistics/trends`             | Same local date range; daily aggregation, all date buckets and totals.                                                                               |
| GET `/api/statistics/reports/comparison` | Only baseline/current start/end dates; equal nominal lengths and baseline end before current start.                                                  |

Existing Task, nested Subtask and bounded StudySession API selectors are reused. No unsupported search/sort, owner/timezone query, Reminder deletion/reopen/manual delivery, bulk notification read/delete, target discovery or export endpoints.

### Reminder and Inbox semantics

Absolute creation omits anchor/offset; relative creation omits trigger_at and sends exactly one target/compatible anchor. Offset is JSON integer -32768..32767. General reminders require meaningful text, max 500 Unicode characters. Nullable targeted messages remain supported. Server eligibility and future-time checks stay authoritative. Task/Subtask missing-deadline hints do not calculate a trigger or substitute a parent/successor.

PATCH never submits the full Resource, target, mode, anchor, status or historical timestamps. Unchanged UTC values are preserved. Sent/cancelled records have no edit/cancel controls. Cancellation uses a focus-managed explicit dialog and never claims to undo delivered messages. Cancelled reminders are not resurrected on reopening work.

List time bounds are both omitted or supplied, ordered and ≤366 elapsed days. Profile-zone local inputs use existing Temporal conversion to exact UTC seconds; DST gaps/folds are rejected. Recurring/planning time rules were not changed.

Inbox reads do not mark visible records read. Only an explicit action submits POST; response `read_at` is authoritative, followed by a safe list refresh. created_at labels delivery-in-app; trigger_at labels intended trigger. Future public types use safe generic labels; Vue escapes message text. Historical targets may be unavailable without removing history. Task/Session links are direct; a standalone Subtask ID has no exposed parent lookup, so navigation opens Tasks with the exact child ID explained, without inventing a parent or scanning all records.

Lost Reminder creation delivery blocks resubmission and points to list inspection, since the new ID may be unknown. Known cancellation failures/conflicts refresh GET without replay. Read failures do not invent a timestamp. All existing 401/419, safe error and no automatic mutation retry behavior remains.

**Server delivery boundary:** scheduled Reminder ≠ sent Reminder ≠ committed in-app notification ≠ explicit read acknowledgment. Laravel scheduler/`reminders:dispatch-due` and ReminderDeliveryService own delivery. The browser has no dispatch timer, notification creator or status-sent mutation. An empty Inbox may mean the scheduler has not dispatched anything. No push/email/SMS/realtime channel was implemented.

### Statistics and report semantics

All ranges use exact real local labels (years 0001–9999), ≤31 inclusive nominal dates, independent of DST elapsed hours. Report ranges never become unrelated UTC dates. Comparison validates both complete equal-length ranges and strict baseline-before-current ordering before transport; Laravel remains authoritative.

Current Task/Subtask counts are separate lifetime current-state populations. Completion metrics are period activity. No parent/child summation or historical pending snapshot. All five persisted Session statuses retain counts/scheduled seconds. Known actual minutes, known-duration count and unknown-duration count remain separate. Unknown is not zero; scheduled seconds never fill absent actual minutes.

Trends retain zero-filled dates and server order. Separate Task/Subtask completion, completed Session and known-minute charts have numeric table alternatives. Detailed daily sections expose all five statuses and all completion metrics. Sessions belong to original starts_at local date; crossing midnight is not split; predecessor/successor records remain distinct.

Comparison renders all completion metrics, five Session status counts/seconds and actual-duration fields for baseline/current/server delta, including negatives. Direction labels are factual, not value judgments. Unknown-duration observations explicitly mark the known-minute comparison incomplete. Reopened/deleted work can change previous completion activity: reports are current persisted snapshots, not immutable historical status reconstruction. No productivity scoring, forecasts, recommendations or backend report persistence/export.

## Automated verification

Environment: Node **v22.23.1**, npm **11.20.0**, existing lockfile/dependencies. Baseline `npm test`: **283 passed / 12 files**.

Final regression results: **359 unit/component tests in 13 files**, including 76 new F6 tests; **38 Chromium browser tests**, including six new F6 cases (three journeys × two viewports). Existing AI receipt-link assertions were extended.

- `npm run type-check`: PASS (`vue-tsc --build`, including test/E2E TypeScript).
- `npm test`: PASS, 359/359 tests, 13/13 files.
- `npm run build`: PASS, TypeScript plus Vite production build, 206 transformed modules.
- `npm run test:e2e`: PASS, 38/38 desktop/mobile Chromium tests.
- Changed-file Prettier check: PASS, all 43 changed `.ts`/`.vue`/`.css`/`.md` files (paths supplied programmatically to `npx prettier --check`).
- `git diff --check`: PASS; no whitespace errors.
- `npx playwright test e2e/activity.spec.ts`: PASS, 6/6 after adding explicit console-error assertions and viewport screenshots.

F6 unit/component coverage includes absolute/general/targeted/relative payloads, signed limits, meaningful text, nullable messages, partial PATCH and unchanged UTC, DST rejection, filters/pagination, all lifecycle histories, owned/inaccessible context, cancellation confirmation, validation errors, CSRF/cookies and no retry for 401/404/409/419/422/5xx. Inbox covers explicit/idempotent reads, unknown types, missing targets, escaping, pagination and uncertainty. Reports cover 31-date boundaries, independent populations, all Session statuses, unknown minutes, zero days/accessible tables, complete signed deltas/directions, empty/error/retry and comparison validation. Held-response tests cover duplicate submissions, uncertain create/cancel and stale read cancellation. Existing AI tests also assert receipt-based Reminder links.

Three new mocked Chromium journeys run on desktop/mobile: absolute/relative/edit/cancel/history; Inbox filters/read/target links; Progress/ranges/zero-day Trends/Comparison/unknown-duration warnings. They assert decoded CSRF headers, persisted response usage, session reload, both themes, keyboard Escape, no unhandled page errors and widths 320/390/768/1024/1440 without horizontal overflow. Failure traces and review screenshots use ignored `test-results/`. Early development failures (a Vue template typo, test typing and overly broad/incorrect browser selectors) were corrected before final verification; existing assertions were not removed or weakened.

CI was inspected: Node24.12, npm ci, typecheck, unit tests, production build, Chromium mocked E2E and failure artifacts. No CI change required. No hosted Actions run was triggered/claimed.

## Live verification boundaries and next milestone

**F6 live Reminder mutations, actual scheduler-to-Inbox delivery and live statistics aggregation: NOT RUN.** No confirmed isolated authenticated F6 environment/account was configured. No account was created or existing retained account reused. Tests use actual frontend/browser plus deterministic HTTP fixtures; they do not prove MySQL calculations or Laravel scheduler execution.

Historical F1–F2 real Laravel/MySQL PASS remains in its report. F3 paid-provider, F4 direct planning mutations and F5 real XLSX commit remain separate unexecuted boundaries; this milestone does not close or rewrite them. No paid inference or reminder dispatcher was run.

Remaining design/browser limits: Figma unavailable, Chromium desktop/mobile viewport coverage only, no physical-device/Safari/Firefox validation. No real-time inbox refresh or global unread counter; explicit refresh and supported unread query totals are shown. Read-only-only inbox filter and direct parentless Subtask deep links are not available from current contracts. Backend report-file export is out of scope.

Recommended final integration milestone: configure an isolated staging account/database, verify direct planning and supported XLSX import transactions, Reminder synchronization and real scheduler delivery/read lifecycle, and compare read-only reports against prepared server data. Preserve paid-AI opt-in separately, then complete Figma, keyboard/screen-reader, Safari/Firefox and deployment checks.
