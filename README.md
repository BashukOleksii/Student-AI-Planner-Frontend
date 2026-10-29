# Student AI Planner — Frontend

Core MVP, Academic Workspace, confirmed AI Assistant and Study Planning Workspace (Stages F1–F4) for **AI Agent for a Student's Personal Learning Activity Planning Service**. This independent Vue application communicates only with the existing Laravel REST API. It contains no database access, AI orchestration or planning algorithms.

## Requirements and installation

Use Node.js **22.18+ in the 22.x line**, or **24.12+** (CI uses 24.12.0), and npm. The original Vue/Vite project is preserved. The lockfile pins reproducible dependencies.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. Start the backend separately at **http://localhost:8000** following its documentation. A running MySQL/database session setup belongs to the backend, never this frontend.

| Variable            | Example                 | Meaning                                                        |
| ------------------- | ----------------------- | -------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend origin, without `/api`; defaults to this local origin. |

Vite variables are public build-time configuration, not secrets. Restart Vite after changing `.env`; rebuild for a deployment. Never put credentials or private keys in `VITE_*` variables. Local environment files are ignored.

## Laravel setup and Sanctum

Configure the **backend's own environment** (do not put these values into the frontend `.env`):

```dotenv
APP_URL=http://localhost:8000
SANCTUM_STATEFUL_DOMAINS=localhost:5173,localhost:8000
CORS_ALLOWED_ORIGINS=http://localhost:5173
SESSION_DRIVER=database
SESSION_SECURE_COOKIE=false
SESSION_DOMAIN=null
```

Use `localhost` consistently. Mixing `localhost` and `127.0.0.1` changes cookie hosts and breaks the stateful SPA flow. Stateful domains include ports without a scheme; CORS origins include the scheme. Backend migrations/session storage and cleared Laravel configuration caches must be ready. Do not use wildcard credentialed CORS. Production requires HTTPS, secure cookies, exact allowlists and an appropriate first-party cookie domain; the local settings above are not production settings.

All fetches use `credentials: 'include'` and `Accept: application/json`. Before every login/registration, the client requests `GET /sanctum/csrf-cookie`. Mutations read the browser's `XSRF-TOKEN` cookie, URL-decode it, and send `X-XSRF-TOKEN`. The session cookie remains browser-managed and HttpOnly. There is **no JWT, bearer-token flow or authentication data in localStorage**.

`GET /api/profile` restores the session before protected views render, with one shared initialization request. Login/registration verify the resulting profile. A 401 clears the user and redirects to login with a local intended destination. Logout waits for the backend's 204 before clearing state; a failed logout is shown as a failure. A 419 exposes a **Restore session** control: it initializes CSRF and verifies the profile, then the student may deliberately resubmit. It never replays the failed mutation. Network errors and server failures also never trigger automatic mutation retries.

## Implemented functionality

- Ukrainian login, registration, logout, session restoration and protected routes. Unsupported remember-me/password-reset features are omitted.
- Responsive sidebar, compact mobile header and bottom navigation; only implemented destinations are linked.
- Dashboard: current-user greeting, local date, today's effective lessons, first five pending tasks in backend deadline order, authoritative pending/completed/overdue totals. Statistics use the first of the current local month through today (at most 31 dates).
- Schedule: today, selected date, day/week modes, previous/next period and return to today. Subjects/codes, lesson types, teachers, rooms and offset timestamps come from the backend. Week boundaries and effective replacements remain backend-controlled.
- Tasks: paginated listing, status/priority/subject/deadline upper-bound filters, detail/edit, creation with optional subject, nullable field clearing, complete/reopen and explicit delete confirmation. Ordering remains the backend's fixed ordering. A task can be created even when subject retrieval fails.
- Academic Workspace: owner-scoped Institutions, Academic Periods, Subjects and Teachers; list/detail/create/edit/delete, optional institution associations, date-only period inputs, nullable subject code/color and explicit delete confirmations. Controlled backend dependency errors remain visible; no cascade deletion is promised. Teacher names may repeat.
- Nested Subtasks in the existing task editor: create/edit, complete/reopen, delete and keyboard-operated move-up/down. Reordering sends the full non-deleted ID permutation, including completed children. Progress is read from the backend and refreshed after each mutation; null means no active children and shows no percentage bar. Parent/child lifecycle states remain independent.
- Registration normalizes the verified browser alias `Europe/Kiev` to `Europe/Kyiv` and lets the student correct their timezone if backend validation rejects a browser identifier.
- Profile: name, email and IANA timezone updates, server field validation and success/error feedback. Subsequent pages use the updated timezone.
- Light/dark semantic tokens, locally bundled Manrope including Cyrillic, no shadows. Only the theme preference is stored in localStorage.
- Read loading/error/empty states, explicit read retries, field-level validation, disabled mutation submits, stale-read cancellation, unsaved task/profile navigation confirmation, accessible native modal focus containment, Escape and focus restoration.

## Routes

| Route                                                                                     | Purpose                                                                    |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `/`, `/schedule`, `/tasks`, `/tasks/new`, `/tasks/:id`, `/profile`                        | Preserved F1 screens; existing task details now include Subtasks/progress. |
| `/academic`                                                                               | Redirects to `/academic/institutions`.                                     |
| `/academic/institutions`, `/academic/periods`, `/academic/subjects`, `/academic/teachers` | Four sections of the protected Academic Workspace.                         |
| `/ai`, `/ai/conversations/:id`                                                            | AI conversation browsing, persisted history, action reviews and receipts.  |
| `/login`, `/register`                                                                     | Preserved public authentication screens.                                   |

## AI Assistant — Stage F3

Open **AI-помічник** in authenticated desktop/mobile navigation. `/ai` lists paginated conversations; `/ai/conversations/:id` is a reloadable direct link. Conversations have date/ID presentation labels; the backend has no rename/archive/delete API. The interface uses the existing light/dark tokens, Manrope and shared cards/buttons. No UI or Markdown dependency was added; all message/review text is escaped Vue text.

The Assistant supports all **14 registered proposals**: Task create/update/complete/reopen; Subtask create/update/complete/reopen; Reminder create/update/cancel; study-plan creation; adaptive replanning; manual session rescheduling. AI reviews remain distinct from the direct Study Planning Workspace; standalone Reminder management is deferred.

- Conversations and messages use standard Resource pagination. Initial history loads the newest page within the first page's captured `through_id`; older messages follow the server's previous links. IDs determine chronology. Explicit refresh starts a new snapshot, with older pages available again. Pagination links are restricted to the configured API origin and exact resource path.
- Each new message intent gets one `crypto.randomUUID()` key and exact, untrimmed content (maximum 4000 Unicode characters). Ctrl/⌘+Enter sends; Enter inserts a newline. Laravel returns a completed HTTP response; there is no invented streaming or turn-status polling endpoint.
- While a send is unresolved, exact content/key are retained in memory and **sessionStorage for this tab, scoped by owner and conversation**. Reload never resends. A deliberate retry reuses both values; explicit edit-as-new creates a new key on the next send. Storage contains neither authentication credentials nor complete transcripts. Successful sends, explicit discard and confirmed logout clear the copy. Session expiration preserves it for reauthentication by the same owner. Closing the tab normally ends its storage lifetime. Do not automatically discard an uncertain key based on elapsed time.
- Only the persisted transcript is rendered after completion, so optimistic/server bubbles cannot duplicate. Tool activity shows public call IDs/names and safe outcomes; arguments, raw outputs, provider reasoning and model configuration are not available. Truncation flags and historical failed-attempt events are shown explicitly.
- A proposal is not execution. The UI retrieves current action details on opening/reopening, after send replay and before deciding. Task/Subtask/Reminder reviews display before/changes/context and effects; planning reviews display **all** sessions, work results, exclusions, warnings, classifications, release sets, shortfalls and summary without collapsing material consequences. Manual rescheduling is explicitly preliminary, not guaranteed feasible.
- Confirm/Reject are separate authenticated actions. A chat message saying “yes” never confirms anything. All consent controls start unchecked. Study plans send only deliberately checked `accept_partial`; adaptive replanning can additionally require independent `accept_unplaced_cancellation`. Ordinary actions/manual rescheduling and rejection send `{}`. No arguments, protected planning tokens, replacement intervals or owner IDs are sent at confirmation.
- Executed actions show immutable receipts, not a claim about the latest entity state. Receipt IDs provide links to existing Tasks; planning receipts also link to the Study Sessions workspace and receipt-provided session IDs. Related Task/Subtask/progress/Reminder/StudySession/schedule reads refresh as applicable. Existing destination views load fresh data on navigation; no second domain cache/store was introduced. A failed follow-up read does not undo or relabel execution.
- Lost confirmation responses trigger only a safe GET reconciliation. An unresolved result disables decisions until it can be read. Any retry is deliberate and uses the same action identity. Replayed confirmations display the same receipt without a second client success event. Stale/conflicting/invalid reviews require a new proposal. Four persistent statuses remain `pending`, `executed`, `rejected`, `expired`; a historical `failed` attempt is not a fifth status.

`api/ai.ts` owns typed REST calls and runtime public-response narrowing; `types/ai.ts` owns the contracts and discriminated outcome events; `useAiConversation` owns local asynchronous state, cancellation, intents and decisions. `components/ai/` contains presentational timeline/composer/review/receipt components. Safe error codes and `Retry-After` extend the existing HTTP client. No Tool dispatcher, provider SDK, browser API key or frontend planning calculation exists.

Integrated AI endpoints (all under existing Sanctum authentication):

| Method   | Route                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| GET/POST | `/api/ai/conversations`                                                       |
| GET      | `/api/ai/conversations/{conversation}`                                        |
| GET/POST | `/api/ai/conversations/{conversation}/messages` (POST uses `Idempotency-Key`) |
| GET      | `/api/ai/conversations/{conversation}/actions`                                |
| GET      | `/api/ai/conversations/{conversation}/actions/{action}`                       |
| POST     | `/api/ai/conversations/{conversation}/actions/{action}/confirm`               |
| POST     | `/api/ai/conversations/{conversation}/actions/{action}/reject`                |

### AI verification and optional paid smoke

`npm test` and `npm run test:e2e` run deterministic HTTP mocks matching the inspected Laravel contracts. They need neither a backend nor OpenAI credentials and do **not** prove paid-provider execution. The existing F1/F2 live report is preserved; F3 did not rerun its account-creating suite or add real test accounts.

The optional `npm run test:live:ai` uses real Laravel/provider requests at localhost:8000, an **existing** session and an **owned existing** conversation. It is excluded from ordinary tests/CI and refuses to launch without all opt-in values. Only use a confirmed disposable local development environment and accept possible provider charges. Configure provider credentials privately in the backend following its documentation; no provider secret belongs in a frontend variable.

1. Start the frontend at localhost:5173 and the correctly configured local backend. Log in with an existing development account and select an owned conversation.
2. If an authentication state file is needed, run `mkdir -p .auth` then `npx playwright codegen --save-storage=.auth/local.json http://localhost:5173/login`. Log in manually with that existing account and close the codegen browser to save its state. `.auth/` is ignored and contains credentials; never commit or share the file.
3. Run explicitly (replace `12` with that owned conversation ID):

```bash
AI_LIVE_ALLOW_PAID=1 AI_LIVE_STORAGE_STATE=.auth/local.json AI_LIVE_CONVERSATION_ID=12 npm run test:live:ai
```

This smoke sends one read-only question, checks the real completed response and reload persistence, and never confirms/rejects actions or creates users. It appends real conversation history and may incur inference charges. A model could still propose an action; the test does not authorize it. Tracing is disabled for this paid smoke; local failure contexts may contain academic data. Remove the state file after use. **This paid-provider path was not executed for F3; only its fail-closed no-opt-in configuration was checked.**

Detailed evidence, exact commands and limits: [F3 verification](docs/f3-verification.md).

## Architecture

Vue 3 + strict TypeScript + Vite, Composition API and `<script setup>`. Vue Router handles navigation; Pinia holds auth/theme state. Native fetch is the HTTP transport. `@js-temporal/polyfill` provides IANA/calendar and UTC conversions; it is required because the profile timezone can differ from the browser timezone. No UI framework or Tailwind is introduced.

```text
src/
  api/                 Central HTTP client and typed endpoint functions
  types/               Resource envelopes, pagination and domain contracts
  stores/              Authentication/session and theme preferences
  router/              Lazy routes, session guard and safe redirects
  layouts/             Public/authenticated responsive shells
  components/ui/       Buttons, cards, fields, states, confirmation dialog
  components/layout/   Shared navigation
  components/domain/   Academic, lesson, task and subtask components
  components/ai/       Escaped transcript, composer, type-specific reviews and receipts
  views/               Route-level API orchestration and forms
  composables/         Cancellable reads and local conversation/subtask workflows
  utils/               Timezone/calendar, AI presentation and unresolved intents
  styles/              Semantic light/dark design tokens and responsive CSS
```

Academic endpoint functions live in `api/academic.ts`; the original `subjectsApi` export delegates to that same module so Task selectors use one contract and refresh naturally on navigation. `api/subtasks.ts` owns exact-parent nested URLs. The Academic page owns local list/editor state; `useSubtasks` owns the task workspace’s local asynchronous state and serialized writes. `AppModal` shares native focus containment/Escape behavior across Academic and Subtask forms; each asynchronously mounted form explicitly focuses its first input. No new shared store or generic CRUD framework was introduced.

The API client keeps Resource envelopes and pagination `data`, `links` and `meta`; 204 is handled without parsing JSON. It provides typed status/field/retry errors for 401/403/404/409/410/419/422/429/5xx and network failure, sanitizes general errors and retains `Retry-After`. It never renders raw exception messages. No arbitrary server-sorting parameters are sent.

Task inputs use `pending`/`completed` only as returned status. Writes never submit status; dedicated action endpoints own transitions. Deadlines are sent as exact `YYYY-MM-DDTHH:mm:ssZ`, without milliseconds. Empty nullable inputs send null when cleared. Existing untouched deadlines retain their exact instant. Nonexistent or repeated local times at DST transitions are rejected with an explanation rather than silently shifted. Date queries use local calendar labels and calendar-day arithmetic, never fixed 24-hour additions.

## Integrated endpoints

| Area                | Endpoints                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session             | GET `/sanctum/csrf-cookie`; POST `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`                                                                         |
| Profile             | GET/PATCH `/api/profile`                                                                                                                                             |
| Dashboard/schedule  | GET `/api/schedule/today`, `/api/schedule/date/{date}`, `/api/schedule/week/{date}`                                                                                  |
| Tasks               | GET/POST `/api/tasks`; GET/PATCH/DELETE `/api/tasks/{id}`; POST `/api/tasks/{id}/complete`, `/api/tasks/{id}/reopen`                                                 |
| Academic Context    | GET/POST `/api/education-institutions`, `/api/academic-periods`, `/api/subjects`, `/api/teachers`; GET/PATCH/DELETE each `/{id}`; all collections unpaginated.       |
| Subtasks / progress | GET/POST `/api/tasks/{task}/subtasks`; GET/PATCH/DELETE `/{subtask}`; POST `/{subtask}/complete`, `/{subtask}/reopen`, `/reorder`; GET `/api/tasks/{task}/progress`. |
| Statistics          | GET `/api/statistics/progress?start_date=...&end_date=...`                                                                                                           |

Contracts were checked against the local backend's routes, Requests, Resources and the documented frontend contract/readiness, auth/profile, schedule, tasks, progress statistics and architecture. The backend repository was not modified.

## Study Planning Workspace (F4)

Protected routes:

| Route                                          | Purpose                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `/planning`                                    | Overview and workflow navigation.                                         |
| `/planning/preferences`                        | Five nullable integer study limits/break/session preferences.             |
| `/planning/availability`                       | ISO-weekday recurring local availability CRUD, including `24:00:00` ends. |
| `/planning/free-time`                          | Bounded calendar-range free-slot queries and optional minimum duration.   |
| `/planning/preview`                            | Scoped deterministic plan review and explicit confirmation.               |
| `/planning/sessions`, `/planning/sessions/:id` | Range/history, session details and lifecycle controls.                    |
| `/planning/replanning`                         | Adaptive review, independent consents and actual applied results.         |

`api/planning.ts` owns preferences, availability, free slots and direct planning calls. `api/studySessions.ts` owns bounded reads/details and complete/miss/cancel/reschedule; the existing AI activity module delegates session reads to it. Shared contracts extend the existing `StudySession` type in `types/planning.ts`. Route-level state stays local; `usePlanningScope` reuses abortable resources for paginated Tasks and nested Subtasks. Presentational planning components reuse existing cards, buttons, dialogs and the structured AI field renderer. No additional dependency/store or client allocation/conflict algorithm was added.

- Preferences GET may return five nulls without a stored row. PUT always sends all five keys as integers or null, never numeric strings. Empty inputs explicitly clear values; session bounds and daily/weekly bounds have local validation and Laravel remains authoritative.
- Availability is recurring **local wall time**, never UTC. Multiple windows per ISO weekday are supported, with owned list/create/edit/delete, explicit deletion confirmation, field-level errors and collection refresh. End-of-day `24:00:00` is allowed. Overnight intervals must be entered as two separate records; no atomic bulk operation is implied. Laravel decides overlaps.
- Free slots and session lists use exact local `YYYY-MM-DD` labels, at most 31 inclusive calendar dates. Free slots are server-derived and do not guarantee full planning feasibility. Exact elapsed seconds come from the server. All-null settings introduce no frontend defaults.
- Previews send only dates and optional genuine integer Task/Subtask IDs. A child always retains its explicit parent. The complete public review shows sessions, attribution, work results, exclusions, warnings, all summary totals, partial/unallocated work and expiration. Adaptive reviews include every original/replacement/classification/reason, released source ID and exact shortfall; no material cancellation is collapsed.
- Direct preview tokens are opaque, transient in-memory values. They are excluded from review rendering and never saved in browser storage, URLs or logs. A preview is not a saved plan. Empty/non-actionable previews cannot be confirmed. Discarding or changing scope clears the token/consents. Leaving the view aborts an unfinished preview and destroys its token.
- Partial plans require a deliberately checked `accept_partial`. Adaptive partial/unplaced results require this permission and, separately, `accept_unplaced_cancellation` when originals have no replacement. Both controls start unchecked on each review. Requests contain real booleans and only supported fields. Confirm buttons serialize requests.
- Successful direct plan confirmation returns 201 and displays persisted sessions. Adaptive confirmation returns 200 and displays actual original statuses, replacements and summary. Sessions/free slots/Task scope data are re-read; all destination views fetch fresh data on navigation. An auxiliary read failure never relabels a committed result as failed.
- **Direct confirmation is not durable AI action replay.** After network/5xx uncertainty or conflict the old token is disabled, current domain reads are attempted and the student must inspect history and obtain a new review. No confirmation is automatically retried. A replay conflict does not prove that the original request failed. Consent-only 422 errors keep the review available for an explicit corrected decision. AI pending actions retain their separate persisted identity, decision and immutable receipt behavior.
- Session details retain planned/completed/missed/rescheduled/cancelled history. Only planned sessions expose lifecycle controls. Completion accepts an omitted actual duration or a positive integer; miss is explicit, cancellation requires confirmation. Laravel enforces eligibility/current-time rules. These actions do not complete Tasks/Subtasks.
- Manual rescheduling is an immediate operation after a local consequence review, with no invented server preview endpoint. Profile-zone local input converts through Temporal to canonical UTC whole seconds; DST gaps/repeated local times are rejected. The review explains requested versus original duration, unfinished work, source retirement and cancellation of scheduled dependent reminders without cloning. The actual transfer/shortfall is shown from the response, with links to the replacement session.
- Dashboard shows backend session records for the next seven local dates. Schedule links to planning and keeps academic Lessons separate from self-study sessions. AI planning receipts link into the same workspace without changing AI confirmation semantics.

Endpoints added:

| Area                | Existing Laravel endpoints                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Preferences         | GET/PUT `/api/planning-preferences`                                                                                          |
| Availability        | GET/POST `/api/study-availability-windows`; PATCH/DELETE `/{id}` (no unsupported detail GET)                                 |
| Free slots          | GET `/api/planning/free-slots?start_date=...&end_date=...[&min_slot_minutes=...]`                                            |
| Study plans         | POST `/api/planning/study-plans/preview`, `/confirm`                                                                         |
| Adaptive replanning | POST `/api/planning/replanning/preview`, `/confirm`                                                                          |
| Sessions            | GET `/api/study-sessions?start_date=...&end_date=...`; GET `/{id}`; POST `/{id}/complete`, `/miss`, `/cancel`, `/reschedule` |

F4 tests cover preferences/null clearing, local availability/validation, bounded ranges/DST, complete reviews, explicit/independent consents, invalid/stale tokens, lost responses without replay, busy guards, preview cancellation, session history/lifecycle and canonical UTC. Mocked Chromium journeys exercise the full workflow on desktop/mobile, themes, widths 320/390/768/1024/1440, and committed-but-lost confirmation recovery. These tests do not establish real Laravel/MySQL planning transactions. Ordinary CI remains independent of Laravel/MySQL/OpenAI. See the focused verification report for exact evidence and limits.

## Design reference and verification limits

Reference: [Figma MockUps](https://www.figma.com/design/tzAlMLBLIb5a5pgQkYSV76/MockUps). The Figma MCP integration was unavailable during implementation, so exact frames/assets/spacing could not be inspected or compared. The implementation uses the supplied verified Academic Minimalism palette, Manrope type scale, 224px sidebar, 32px desktop / 20px mobile padding, 84px mobile navigation, thin borders and shadow-free surfaces. It is **not claimed to be pixel-perfect**. Generated browser screenshots can be reviewed under `test-results/` after the smoke tests.

## Verification commands

```bash
npm run type-check
npm test
npm run test:watch
npm run build
npm run preview
npx playwright install chromium
npm run test:e2e
# Optional, requires a correctly configured real Laravel API:
npm run test:live
```

`npm run build` includes TypeScript checking; `build-only` runs Vite alone. `npm run format` formats maintained sources. The production build is emitted into `dist/`. Configure static hosting to rewrite SPA routes (such as `/tasks/1`) to `index.html`. Serve built assets over HTTP/HTTPS, not `file://`.

Vitest + Vue Test Utils + jsdom run deterministic HTTP-mocked client/store/component/router tests. They cover cookies/CSRF, validation/errors, no unsafe retries, pagination preservation, auth guards/restoration/logout, timezone/DST, stale reads, dashboard states, schedule navigation, task CRUD and profile/theme updates. F2 adds Academic CRUD/associations/date/code/color/deletion refusals, refreshed Task selectors, nested Subtask CRUD/reordering, authoritative/null progress, duplicate-submit guards and stale-read tests. Tests and E2E TypeScript are included in type checking through a separate test TypeScript configuration, including the Node APIs used by browser test fixtures.

The E2E command builds the production bundle and serves it through Vite preview on `http://localhost:4173`, avoiding development optimizer/cache races. Playwright runs Chromium desktop (1440×900) and mobile viewport (390×844) journeys with deterministic intercepted HTTP responses. It covers registration, login, refresh/session restore, schedule, dashboard, task create/edit/complete/reopen/delete, Academic CRUD and deletion refusals, Subtask CRUD/progress/reordering, dialog focus/Escape, profile/timezone, theme, logout, JavaScript errors and horizontal overflow. F2 layouts are also checked at 320, 768 and 1024px. These are **mocked frontend browser tests**, not evidence of a real Laravel/MySQL integration or a physical mobile device/browser matrix. No OpenAI account is needed.

GitHub Actions performs `npm ci`, type checking, tests, production build and Playwright smoke tests on Node 24.12.0. CI installs Chromium/system dependencies and uploads failure artifacts. This workflow is configured in the repository; a hosted Actions run must still execute after pushing.

Current frontend milestone: [F4 verification](docs/f4-verification.md). Historical AI milestone: [F3 verification](docs/f3-verification.md). Real core integration: [F1–F2 Laravel verification](docs/f1-f2-live-verification.md). The [historical F1 report](docs/f1-verification.md) and [F2 implementation report](docs/f2-verification.md) retain the failures observed at those earlier points.

## Remaining verification and next work

**F1/F2 live integration: PASSED on the local Laravel/MySQL development backend, 2026-10-29.** After the developer applied the existing backend migrations, read-only checks confirmed all migrations had run and `users.timezone` existed. Real browser registration returned 201 with `Europe/Kyiv`; the complete expanded F1/F2 journey passed, including session restoration, populated/empty Dashboard and Schedule, all four Academic CRUD flows, Task/Subtask mutations, authoritative progress, profile persistence, logout and subsequent login with an updated email. The final run recorded 204 real HTTP responses, with only deliberately asserted authentication/validation failures and no 5xx or unhandled browser errors. The earlier CORS, timezone-alias and database failures remain documented in the historical reports. No backend source/configuration/migrations were changed by this verification. F3 paid-provider verification remains a separate, unexecuted opt-in path described above.

The opt-in live test serves the built frontend files at origin `http://localhost:5173` using Playwright routing so an existing development server does not need to be stopped. It never intercepts/mocks port 8000, never disables CORS/CSRF, and grants Chromium's localhost network permission for that routed document. Before launching a browser, the live configuration rejects non-local API origins. The browser timezone is UTC, intentionally different from the profile timezone. The test also asserts real 401/419/422/404 responses, dependency restrictions and exact UTC deadlines.

Every live run creates a real isolated `f1-…@example.test` account (its email is later updated). Cleanup checks that account's identity, deletes its removable fixtures through the API, and logs out. **The account remains because no account-deletion endpoint exists. A separate schedule-fixture Subject and soft-deleted Lesson/Task/Subtask history also remain according to backend retention rules.** The period is detached before deleting the fixture lesson; a Subject with lesson history cannot be deleted. Use only a confirmed disposable development/test backend. No database reset, purge or unrelated-record cleanup is performed. Real API request audits (method/path/status only), retained fixture IDs and schedule screenshots are written under `test-results/live/`; failure traces are retained. Traces may include temporary test credentials, so review them before sharing. This test is separate from default mocked tests and CI.

Figma comparison remains pending access to its integration. Only Chromium desktop/mobile viewport testing is configured initially; Safari/Firefox and physical-device checks can follow.

F4 provides direct study planning and StudySession lifecycle management. Full Excel import, lesson management, Reminder management/delivery/inbox and complex reports remain future frontend modules. The next coherent milestone is a **Reminders and Notification Inbox Workspace**, using the existing backend contracts. No planning algorithms belong in the frontend. F4 direct planning has deterministic mocked verification; no new live planning mutations or paid AI inference were run without an explicitly configured disposable environment.
