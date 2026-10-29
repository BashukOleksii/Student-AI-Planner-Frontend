# Stage F4 — Study Planning Workspace

Local verification date: **2026-10-30**. This report distinguishes deterministic frontend verification from live Laravel/MySQL execution.

## Repository audit and state

Started on clean `main` at **35fbb5ff24eb917f44cf0a2650fd2ddc44a58bf7** (`End next step with integration`). F1–F3 were already implemented. Read AGENTS.md, current README/verification history, routes/auth/client/types, date utilities, UI/layout/theme components, AI reviews/receipts/domain refresh, test fixtures, live configurations and CI. The existing Vue/Vite architecture and dependencies were preserved.

Read the backend planning settings/foundation/constraints/work-selection, automatic planning, persistence, adaptive replanning, session lifecycle, frontend contract and architecture references. Verified routes, Requests, Resources, controllers, StudySession Policy and the persistence/lifecycle Services for exact fields, acceptance rules and transaction/replay semantics. Actual source takes precedence over historical stage descriptions.

Figma design-to-code instructions were read; no Figma inspection tools were available. Existing Academic Minimalism variables, local Manrope, shadow-free cards/dialogs and responsive layout were retained. Browser screenshots were inspected, but original Figma frames were not compared; no pixel-perfect parity is claimed.

Ending branch/HEAD remain unchanged. Changes are uncommitted and unstaged; no commit/push was requested. Backend working tree was clean at audit and final verification. No backend source/config/migration/schema changes, database resets, account creation, unrelated cleanup or paid AI requests were performed. Historical F1–F3 reports were preserved.

## Routes and completed workflows

| Route                    | Function                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `/planning`              | Workflow overview and working navigation to every planning area.                                       |
| `/planning/preferences`  | Read/save five nullable integer limits, breaks and session durations.                                  |
| `/planning/availability` | Weekly ISO weekday overview and interval create/edit/delete.                                           |
| `/planning/free-time`    | Bounded free-slot query and minimum-duration filter.                                                   |
| `/planning/preview`      | Scoped automatic-plan review, partial consent, explicit confirmation and persisted results.            |
| `/planning/sessions`     | Bounded unpaginated session/history listing grouped by profile-local date.                             |
| `/planning/sessions/:id` | Detail, completion/actual time, explicit miss/cancel, reviewed immediate reschedule and actual result. |
| `/planning/replanning`   | Complete adaptive review, separate consents, confirmation and committed changes.                       |

All routes use existing Sanctum restoration/guards and support direct navigation/refresh. Sidebar/mobile navigation includes Planning; the internal planning navigation exposes all functional sections. Existing public routes and F1–F3 screens remain intact.

Dashboard reads the next seven local calendar dates and presents upcoming planned self-study records separately from academic Lessons. Schedule links into Planning and Study Sessions. AI planning receipts now link to the workspace and specific receipt-provided session IDs; persistent AI decisions and durable replay semantics remain unchanged.

## Architecture and important files

- `src/api/planning.ts`: preferences, availability, free slots and direct plan/adaptive calls through the existing native-fetch client.
- `src/api/studySessions.ts`: bounded reads, detail and lifecycle endpoints. `api/activity.ts` delegates its existing session reads here, preserving F3 callers without duplicate endpoint logic.
- `src/types/planning.ts`: request/resource/review/result types; reuses the existing `StudySession` contract. Heterogeneous public work diagnostics retain typed structured values.
- `src/composables/usePlanningScope.ts`: local scope/date/page state and existing abortable `useResource` for Tasks/Subtasks; explicit parent/child identity and server pagination.
- `src/components/planning/`: navigation, date range fields, session cards and complete review rendering. The shared escaped structured field renderer is reused for known public review sections rather than a raw JSON dump.
- `src/views/PlanningView.vue`, `PlanningSettingsView.vue`, `AvailabilityView.vue`, `FreeTimeView.vue`, `PlanPreviewView.vue`, `StudySessionsView.vue`, `StudySessionView.vue`: route orchestration and local form/mutation state.
- `src/utils/planning.ts`: input/calendar validation and presentation only; no allocation, overlap detection, capacity accounting or feasibility algorithm.
- `src/styles/planning.css`: token-based layout, consent/warning and mobile styling.
- `tests/helpers/planningBackend.ts`, `tests/planning.test.ts`, `e2e/planning.spec.ts`: deterministic contracts and workflows. Existing core E2E mock now handles the Dashboard's session read; assertions were retained.

No new dependency, global planning store, second HTTP/auth client, generic CRUD framework or execution engine was introduced. Read resources abort superseded/unmounted requests; preview responses cannot update an abandoned view. Mutations are serialized, never silently replayed.

## Exact backend contracts consumed

| Endpoint                                                         | Contract preserved                                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET/PUT `/api/planning-preferences`                              | Five present nullable JSON integer keys, 1–65535; no invented defaults. GET may be all-null without a physical row.                                         |
| GET/POST `/api/study-availability-windows`; PATCH/DELETE `/{id}` | Unpaginated owned windows, ISO weekday 1–7, recurring local HH:MM:SS, exact `24:00:00` end, DELETE 204. No unsupported window detail endpoint.              |
| GET `/api/planning/free-slots`                                   | Required local calendar dates, at most 31 inclusive dates, optional canonical positive `min_slot_minutes`; Resource data and timezone/range meta preserved. |
| POST `/api/planning/study-plans/preview`                         | Dates and optional numeric/null parent/child IDs only; public plan plus opaque token/expiration.                                                            |
| POST `/api/planning/study-plans/confirm`                         | Token and genuine boolean `accept_partial`; 201 public plan with actual persisted Session Resources.                                                        |
| POST `/api/planning/replanning/preview`                          | Same scope/date contract; all original/replacement classifications, release IDs, exact shortfalls, work results, warnings/exclusions and summary.           |
| POST `/api/planning/replanning/confirm`                          | Token plus boolean `accept_partial` and `accept_unplaced_cancellation`; 200 applied/original statuses/replacements/summary.                                 |
| GET `/api/study-sessions`; GET `/{id}`                           | Bounded unpaginated range with meta; detail Resource. All five lifecycle statuses retained.                                                                 |
| POST `/{id}/complete`, `/miss`, `/cancel`                        | Complete `{}` or integer actual_minutes; miss/cancel `{}`. Final time/status eligibility remains server-controlled.                                         |
| POST `/{id}/reschedule`                                          | Two canonical UTC whole-second timestamps; 201 original/replacement/actual transfer summary. No invented preview endpoint.                                  |

Task list/detail, nested Subtask list/progress and existing auth/domain reads are reused. Successful direct confirmation refreshes sessions/free slots/Tasks and selected Task/Subtask/progress data. Destination views always fetch current data on navigation. Session lifecycle reloads the affected session immediately; range/Dashboard/free-time views are freshly fetched on return.

## Consent, uncertainty, history and security

- Protected tokens stay solely in transient component memory. They are removed before review rendering and are absent from browser storage, URLs, logs and fixtures embedded in production code. Scope changes/discard/unmount destroy the active token. No token decoding/reconstruction occurs.
- A preview is explicitly a proposal. Empty plans and adaptive reviews without actionable changes have no confirmation operation.
- Partial plan acceptance starts unchecked. Adaptive shorter/unplaced results require partial acceptance; unplaced source cancellation requires an independent unchecked permission. Consent uses the server summary, never a frontend feasibility calculation. Known destructive consequences and all material review fields remain visible.
- Direct confirmation and AI confirmation remain separate. Direct responses lack durable receipt replay. Network/5xx uncertainty and stale/conflicting/expired reviews disable the old confirmation, perform safe current-domain reads and direct the student to inspect sessions and obtain a new review. There is no automatic mutation retry. A conflict does not establish that the first request failed. Consent-only validation can be corrected explicitly while the same review remains valid.
- Confirmed results survive auxiliary refresh errors and remain distinguished from proposals. Errors are rendered with the existing safe status/validation infrastructure, with session/CSRF handling unchanged.
- Availability never converts to UTC. Date ranges use Temporal calendar arithmetic rather than 24-hour assumptions. Manual input uses persisted profile timezone, rejects DST gaps/folds and sends UTC whole seconds. Exact intervals include local offsets and seconds for repeated-hour clarity.
- Only planned sessions expose lifecycle controls. Server time constraints remain authoritative. Historical states are never inferred or reopened. Task/Subtask lifecycle remains independent. Cancellation/rescheduling explicitly describes scheduled reminder cancellation without transfer.
- Text is escaped by Vue; no untrusted HTML, provider credentials, bearer tokens, browser planning dispatcher or direct database/provider access was introduced.

## Executed checks

Final commands ran sequentially as `npm run type-check && npm test && npm run build && npm run test:e2e`, exiting 0. Intermediate failures were fixed rather than suppressed. Formatting used `npm run format`, followed by changed-file formatting/checking with `git ls-files --modified --others --exclude-standard -z | xargs -0 npx prettier --write` and the corresponding `--check`. The original unrelated Vite configuration formatting was preserved.

| Command              | Final result                                                           |
| -------------------- | ---------------------------------------------------------------------- |
| `npm run type-check` | **PASS**, exit 0.                                                      |
| `npm test`           | **PASS**, 213 tests in 11 files; 49 new F4 tests, 5.09 s.              |
| `npm run build`      | **PASS**, type checking + Vite production build, exit 0.               |
| `npm run test:e2e`   | **PASS**, 26/26 Chromium tests (13 journeys × desktop/mobile), 23.9 s. |
| `npm run format`     | **PASS**, executed; changed-file Prettier check also passed.           |
| `git diff --check`   | **PASS**, exit 0.                                                      |

F4 adds 49 unit/component/contract tests and two browser journeys run in both projects. Coverage includes all-null/full-key preferences and clearing, bounds/server validation, canonical recurring times/Sunday/24:00/overnight/overlap rejection/deletion, date/DST/31-date bounds, empty/free slots, work scope, complete review and receipts, partial/independent consents, stale/expired/session errors, uncertain direct confirmation with safe GET recovery, no automatic retries, duplicate-click prevention, preview abort, preserved historical states and all supported lifecycle operations.

Browser coverage includes the complete preferences → availability → slots → partial plan → persisted sessions → manual transfer → adaptive double-consent journey, committed-but-lost response recovery, explicit completion, Dashboard/Schedule/AI navigation, light/dark themes, widths 320/390/768/1024/1440 and no unhandled page errors/uncontrolled horizontal overflow. Screenshots are written under `test-results/planning-*/adaptive-review.png`.

Intermediate verification found and fixed formatter-sensitive multi-statement inline handlers by moving logic into named functions. Browser harness updates added the new Dashboard GET and used Chromium's canonical minute input form for zero-second datetime-local fills; resulting UTC seconds remain asserted. A new range test initially used an actually valid 31-date inclusive range; its fixture was corrected to 32 dates and now asserts the validation alert and absence of another request. No existing assertions or TypeScript settings were weakened.

CI was inspected and needs no change: Node 24.12, npm ci, type checking, unit tests, build and mocked Chromium suite with failure artifacts. No real Laravel/MySQL/OpenAI requirement was added. No hosted Actions execution is claimed.

## Real versus mocked verification and limitations

**F4 live Laravel planning verification: NOT RUN.** No explicitly configured disposable local account/database was supplied for these persistent planning/session mutations. No extra account was created and no existing history was purged. This is a deliberate verification boundary, not evidence of a backend outage. The previously recorded successful F1/F2 Laravel/MySQL verification remains historical evidence; it was not rerun or relabeled. Paid AI/provider inference was not executed.

All F4 contract integration is checked against actual backend source and deterministic HTTP mocks. Mocked tests do not prove real MySQL transactions, ownership Policies under a running server or paid AI execution. Operator-controlled direct planning smoke against an isolated account is the next integration check. Figma frame comparison, Safari/Firefox and physical-device/keyboard validation remain unverified. DST utilities are tested, but the browser suite uses Chromium viewport simulation.

Deliberate deferrals: atomic overnight availability creation (backend has only independent records), full Reminder/inbox UI, Excel import, Lesson CRUD, complex reports and background replanning. No fake navigation or business behavior was added for these areas.

Recommended next functional milestone: **Reminders and Notification Inbox Workspace**, integrated with existing Task/Subtask/StudySession anchors and the backend's actual delivery/history contracts, followed by isolated live F4 smoke verification.
