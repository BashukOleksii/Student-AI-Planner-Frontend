# Student AI Planner — Frontend

Core MVP, Academic Workspace, confirmed AI Assistant, Study Planning, Schedule Management, XLSX Import, Reminders, Notification Inbox and Progress Reports (Stages F1–F6) for **AI Agent for a Student's Personal Learning Activity Planning Service**. This independent Vue application communicates only with the existing Laravel REST API. It contains no database access, AI orchestration or planning algorithms.

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
| `/reminders`, `/reminders/new`, `/reminders/:id`, `/reminders/:id/edit`                   | Reminder list, creation, detail/history and scheduled-only editing.        |
| `/inbox`                                                                                  | Persisted notifications, all/unread filtering and explicit mark-as-read.   |
| `/statistics`, `/statistics/trends`, `/statistics/comparison`                             | Authoritative progress, daily trends and equal-period comparison reports.  |
| `/login`, `/register`                                                                     | Preserved public authentication screens.                                   |

## AI Assistant — Stage F3

Open **AI-помічник** in authenticated desktop/mobile navigation. `/ai` lists paginated conversations; `/ai/conversations/:id` is a reloadable direct link. Conversations have date/ID presentation labels; the backend has no rename/archive/delete API. The interface uses the existing light/dark tokens, Manrope and shared cards/buttons. No UI or Markdown dependency was added; all message/review text is escaped Vue text.

The Assistant supports all **14 registered proposals**: Task create/update/complete/reopen; Subtask create/update/complete/reopen; Reminder create/update/cancel; study-plan creation; adaptive replanning; manual session rescheduling. AI reviews remain distinct from the direct Study Planning Workspace; standalone Reminder management is available through the F6 workspace.

- Conversations and messages use standard Resource pagination. Initial history loads the newest page within the first page's captured `through_id`; older messages follow the server's previous links. IDs determine chronology. Explicit refresh starts a new snapshot, with older pages available again. Pagination links are restricted to the configured API origin and exact resource path.
- Each new message intent gets one `crypto.randomUUID()` key and exact, untrimmed content (maximum 4000 Unicode characters). Ctrl/⌘+Enter sends; Enter inserts a newline. Laravel returns a completed HTTP response; there is no invented streaming or turn-status polling endpoint.
- While a send is unresolved, exact content/key are retained in memory and **sessionStorage for this tab, scoped by owner and conversation**. Reload never resends. A deliberate retry reuses both values; explicit edit-as-new creates a new key on the next send. Storage contains neither authentication credentials nor complete transcripts. Successful sends, explicit discard and confirmed logout clear the copy. Session expiration preserves it for reauthentication by the same owner. Closing the tab normally ends its storage lifetime. Do not automatically discard an uncertain key based on elapsed time.
- Only the persisted transcript is rendered after completion, so optimistic/server bubbles cannot duplicate. Tool activity shows public call IDs/names and safe outcomes; arguments, raw outputs, provider reasoning and model configuration are not available. Truncation flags and historical failed-attempt events are shown explicitly.
- A proposal is not execution. The UI retrieves current action details on opening/reopening, after send replay and before deciding. Task/Subtask/Reminder reviews display before/changes/context and effects; planning reviews display **all** sessions, work results, exclusions, warnings, classifications, release sets, shortfalls and summary without collapsing material consequences. Manual rescheduling is explicitly preliminary, not guaranteed feasible.
- Confirm/Reject are separate authenticated actions. A chat message saying “yes” never confirms anything. All consent controls start unchecked. Study plans send only deliberately checked `accept_partial`; adaptive replanning can additionally require independent `accept_unplaced_cancellation`. Ordinary actions/manual rescheduling and rejection send `{}`. No arguments, protected planning tokens, replacement intervals or owner IDs are sent at confirmation.
- Executed actions show immutable receipts, not a claim about the latest entity state. Receipt IDs provide links to existing Tasks and Reminder details; planning receipts also link to the Study Sessions workspace and receipt-provided session IDs. Related Task/Subtask/progress/Reminder/StudySession/schedule reads refresh as applicable. Existing destination views load fresh data on navigation; no second domain cache/store was introduced. A failed follow-up read does not undo or relabel execution.
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

## Schedule Management and XLSX Import (F5)

| Route                               | Purpose                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/schedule`                         | Existing effective today/day/week views, with Add Lesson and Import actions.                    |
| `/schedule/lessons/new`             | Manual creation using owned Subject, optional Teacher/Period, type, room and local date/time.   |
| `/schedule/lessons/:id`             | Detail, lifecycle state, original/replacement links and confirmation controls.                  |
| `/schedule/lessons/:id/edit`        | Changed fields only; nullable clearing and field-level backend validation.                      |
| `/schedule/lessons/:id/replacement` | Dedicated original-Lesson replacement workflow.                                                 |
| `/schedule/import`                  | Format guidance, owned period, XLSX selection and credentialed multipart upload.                |
| `/schedule/imports/:id`             | Reloadable persisted preview, reference correction, revalidation, explicit commit and recovery. |

Lesson discovery continues to use effective Schedule endpoints. There is **no general Lesson index** or invented historical collection. The Schedule Resource has nested Subject/Teacher presentation and timezone-offset timestamps; detail/mutations have association IDs, canonical UTC timestamps and lifecycle/link fields. Separate `types/lessons.ts` contracts preserve this distinction. Schedule cards and Dashboard cards open actual details. Return links may carry a local calendar `date` to `/schedule`.

Manual Lesson behavior:

- Required owned Subject and one of seven existing types; Teacher/Academic Period/room remain optional. Reuse existing Academic APIs/selectors, with independent loading/failure/retry states.
- Profile-zone input converts through existing Temporal utilities to UTC whole seconds. DST gaps/folds are rejected for changed input. Unchanged timestamps retain their exact original UTC instant, including an ambiguous displayed local hour. PATCH sends only changed editable fields; never status/replacement links.
- Cancellation uses its dedicated endpoint and confirmation. Replacement creates an active linked Lesson while the original becomes replaced; chains are unsupported. Deletion is soft deletion, not cancellation. Deleting a replacement may restore its original only if Laravel accepts current conflicts. An original with a current replacement cannot be directly deleted.
- All overlap/association/lifecycle decisions stay in Laravel. Safe 422 `schedule`, `status`, `replacement` and field errors are visible. Effective-day reads refresh after accepted operations, and Dashboard/Planning fetch current data on subsequent navigation. Uncertain saves are not automatically replayed.

The upload workflow is **Upload → Persisted Preview → Academic correction → Revalidate → Explicit Commit → Effective Schedule**. Only the backend's established XLSX dialect is supported: `Група` header; contiguous Monday–Friday blocks with four four-row pair slots each; subject/teacher, time and numerator/denominator structure. The ISO week containing period start is numerator, followed by alternation. Formulas are not evaluated. This is not arbitrary workbook ingestion.

[Download the supported example](public/examples/schedule-example.xlsx), copied byte-for-byte from backend `tests/Fixtures/ScheduleImports/Приклад розкладу.xlsx` (16,290 bytes). The UI serves it at `/examples/schedule-example.xlsx`. It is the existing regression fixture, not an invented universal template. Students must create the matching owned references; the backend expands its weekly rules within the chosen period and persisted timezone.

`api/scheduleImports.ts` constructs `FormData` with exactly `academic_period_id` (canonical integer text) and the actual `schedule_file` File. The central client preserves cookies, Accept and decoded XSRF headers and lets the browser set multipart Content-Type/boundary. Local checks cover `.xlsx`, nonempty file and maximum 5120 KiB; server MIME/extension/ownership validation remains authoritative. Files are not stored in browser storage.

A 201 only means a batch was persisted: `uploaded` has validation problems, `validated` is reviewable, `failed` can have safe processing text and zero rows/counters. `committed` is stored history; `cancelled` is recognized but no cancel endpoint is invented. Counters and all rows come from the server. Nested `rows` are a plain array inside `data`, not a second Resource envelope. Runtime narrowing retains only public Batch/Row fields, including nullable provenance, names/IDs, local/UTC timestamps, validation errors and matched Lesson IDs.

Row status and operation are separate: valid/invalid/duplicate versus create/update/restore/preserve/noop. Duplicate/noop does not create a Lesson; preserve retains cancelled/replaced state. Updates/restores retain corrected Lesson types; new creations use technical `other`. The complete preview uses responsive cards and shows material changes, provenance and errors without silently truncating rows. Invalid stored timestamp text stays visible and cannot crash local-time rendering.

References use exact normalized imported names, not fuzzy matching. Missing or ambiguous names link into the existing Academic Workspace using a validated numeric `import_batch` query. Section navigation retains the return link; catalogs are edited through existing CRUD. No arbitrary row-to-ID binding or automatic entity creation is offered. Existing owned mappings may survive renaming. A correction only affects preview state after explicit revalidation.

Revalidation refreshes the persisted occurrence snapshot, counters and operations. It creates no Lessons, never automatically commits and does not reread/re-expand the workbook. A different period/date range/timezone requires a new upload. Only uploaded/validated states offer revalidation.

Commit requires validated state and an explicit review dialog with an initially unchecked acknowledgment. It sends **no business fields**. Laravel revalidates under locks and applies the unchanged snapshot atomically. The committed result retains actual operations and timestamp; a repeated committed request returns stored history without another Lesson mutation. Imports do not remove Lessons absent from the workbook or replace the entire semester.

A changed-preview **409** includes refreshed `data`. `ApiError.conflictData` retains this as unknown, never generically rendered; the import API validates/narrows the same Batch ID before applying it. The UI closes the old decision, replaces rows/counters, clears consent and requires a new review. Malformed/missing conflict data uses safe current GET recovery. Network/5xx uncertainty also uses GET; committed history is shown if present, otherwise further action remains deliberate. Failed recovery blocks decisions until a successful read. No commit is automatically retried.

There is no batch list, rename/cancel/delete, manual row mapping or global history endpoint. A known batch URL is directly reloadable. If the upload response is lost before its new ID is known, automatic rediscovery is unavailable; the UI warns that another upload creates a separate preview. It cannot silently commit anything. No full preview/last-ID cache is persisted.

Integrated endpoints:

| Area    | Existing Laravel API                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| Lessons | POST `/api/lessons`; GET/PATCH/DELETE `/api/lessons/{id}`; POST `/{id}/cancel`, `/{id}/replacement`.               |
| Import  | POST `/api/schedule-imports` multipart; GET `/api/schedule-imports/{id}`; POST `/{id}/revalidate`, `/{id}/commit`. |

New modules stay under `api/`, `types/`, `components/schedule/` and focused route views. `useLessonCatalog` shares owned catalog reads. Pinia remains for existing shared auth/theme state. No dependency, spreadsheet parser, fingerprint generation, recurrence/overlap engine, reconciliation algorithm or AI Tool was added. Backend source/schema is unchanged.

F5 coverage includes API/multipart/CSRF, all Lesson operations, UTC/DST and unchanged instants, resource narrowing, all import statuses/operations, safe errors/provenance, reference-return navigation, revalidation transitions, explicit/duplicate-protected commit, 409 re-review, stored replay history and uncertain-response GET recovery. Chromium journeys use deterministic HTTP fixtures and a real local XLSX File; they **do not demonstrate real server-side Excel parsing or MySQL transactions**. See [F5 verification](docs/f5-verification.md) for executed commands, counts and boundaries.

## Reminders, Inbox and Progress Reports (F6)

Open **Нагадування**, **Вхідні** or **Статистика** in authenticated navigation. Dashboard shortcuts link to all three without additional simultaneous API requests. Task/Subtask and StudySession pages offer contextual Reminder creation; supplied IDs are validated through owned API reads before use. AI receipt-provided Reminder IDs link to current detail; AI execution remains distinct from direct CRUD and from server delivery.

Reminder lists preserve Laravel pagination and support status plus paired local-date/time bounds, converted to exact UTC whole seconds (maximum 366 elapsed days). Absolute creation sends `trigger_at`, optional one target and nullable targeted message, omitting relative fields. A general Reminder needs meaningful text. Relative creation sends exactly one target, its compatible anchor and a genuine signed integer offset `-32768..32767`, **omitting trigger_at**. Laravel computes the effective trigger from persisted data. A missing Subtask deadline never falls back to its parent's deadline; a selected Session is never silently replaced by a successor.

Only scheduled reminders can change. Absolute PATCH sends only changed `message`/`trigger_at`; relative PATCH only changed `message`/`offset_minutes`. Target, mode, anchor and lifecycle are immutable through editing. Unchanged timestamps retain exact UTC instants. Local inputs use the saved profile IANA zone, reject DST gaps/folds and serialize without milliseconds. Cancellation requires a focus-managed confirmation and uses the dedicated endpoint. Sent/cancelled history stays readable; there is no Delete, Reopen or Send control. Cancelled reminders do not resurrect when work is reopened. Laravel owns all dependent synchronization.

The Inbox lists persisted records, with **all** and **unread** filters (`unread_only=false` means all; the API has no read-only filter). Visibility does not mark anything read. An explicit action uses the returned server `read_at`, then refreshes the current page/unread query. Repeated reads retain the server timestamp. `created_at` is the delivered-in-app timestamp. Unknown public types render safely. Reminder/Notification history survives an unavailable target. Task and Session IDs have direct links; a standalone Subtask ID has no parent lookup endpoint in this Resource, so its link opens the existing Tasks workspace with the child ID explained, rather than inventing a parent or scanning every Task.

**Delivery boundary:** `scheduled` is a pending Reminder; `sent` is server-recorded delivery; an Inbox notification is the committed in-app record; `read_at` means explicit read acknowledgment. Laravel's scheduler and `reminders:dispatch-due` command perform delivery. The frontend never runs that command, dispatches due reminders, creates notifications, marks reminders sent or substitutes browser timers. An empty Inbox may mean no delivery occurred or the backend scheduler is not running. No push/email/SMS/WebSocket/SSE integration exists.

Statistics use exact local calendar labels and at most 31 inclusive dates, without timezone overrides. Progress separates lifetime **current** Task/Subtask populations from period completion events and never sums parents and children into one population. All five persisted Session statuses retain counts and scheduled durations. Known actual minutes and completed-without-actual-duration counts are separate: unknown is not zero, and scheduled duration is never substituted.

Daily Trends preserve every server bucket in order, including zero-activity days. Task and Subtask charts are separate; Session activity/known minutes have accessible numeric tables and full daily details. Sessions belong to the original local `starts_at` date, even across midnight; predecessors/successors remain separate. No interpolation, historical pending balance or client aggregation replaces the server totals.

Comparison requires two ordered, nonoverlapping, equal nominal calendar-length ranges of up to 31 dates each, baseline first. It displays complete baseline/current totals, **server-provided signed delta** and factual increased/decreased/unchanged labels. More activity is not labeled improvement. Unknown actual-duration flags warn that known-minute differences are incomplete. Reports reflect currently persisted activity, not immutable historical state: reopened/deleted Tasks can change older results. No productivity score, forecast, AI assessment, report persistence or backend export endpoint was added.

All F6 endpoints reuse the central cookie/CSRF client and `useResource` cancellation. A lost create response blocks blind resubmission and directs the student to inspect the list. Known Reminder cancellation uncertainty performs safe GET recovery, never a repeat cancellation. Errors retain safe field feedback, 401/419 recovery and no automatic mutation retries. No new dependencies or shared domain caches were introduced.

| Area      | Existing Laravel API                                                                            |
| --------- | ----------------------------------------------------------------------------------------------- |
| Reminders | GET/POST `/api/reminders`; GET/PATCH `/api/reminders/{id}`; POST `/api/reminders/{id}/cancel`.  |
| Inbox     | GET `/api/notifications`; POST `/api/notifications/{uuid}/read`.                                |
| Reports   | GET `/api/statistics/progress`, `/api/statistics/trends`, `/api/statistics/reports/comparison`. |

See [F6 verification](docs/f6-verification.md) for exact test results and live boundaries. Ordinary CI remains independent of Laravel/MySQL/cron/OpenAI.

## Design reference and verification limits

Reference: [Figma MockUps](https://www.figma.com/design/tzAlMLBLIb5a5pgQkYSV76/MockUps). The Figma MCP integration was unavailable during implementation, so exact frames/assets/spacing could not be inspected or compared. The implementation uses the supplied verified Academic Minimalism palette, Manrope type scale, 224px sidebar, 32px desktop / 20px mobile padding, two-row mobile navigation for ten implemented destinations, thin borders and shadow-free surfaces. It is **not claimed to be pixel-perfect**. Generated browser screenshots can be reviewed under `test-results/` after the smoke tests.

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

Current acceptance evidence: [F8 final acceptance](docs/f8-final-acceptance.md). Functional milestones: [F6](docs/f6-verification.md), [F5 Schedule/Import](docs/f5-verification.md), [F4 planning](docs/f4-verification.md), [F3 AI](docs/f3-verification.md). Real core integration: [F1–F2 Laravel verification](docs/f1-f2-live-verification.md). The [historical F1 report](docs/f1-verification.md) and [F2 implementation report](docs/f2-verification.md) retain the failures observed at those earlier points.

## Remaining verification and next work

**F1/F2 live integration: PASSED on the local Laravel/MySQL development backend, 2026-10-29.** After the developer applied the existing backend migrations, read-only checks confirmed all migrations had run and `users.timezone` existed. Real browser registration returned 201 with `Europe/Kyiv`; the complete expanded F1/F2 journey passed, including session restoration, populated/empty Dashboard and Schedule, all four Academic CRUD flows, Task/Subtask mutations, authoritative progress, profile persistence, logout and subsequent login with an updated email. The final run recorded 204 real HTTP responses, with only deliberately asserted authentication/validation failures and no 5xx or unhandled browser errors. The earlier CORS, timezone-alias and database failures remain documented in the historical reports. No backend source/configuration/migrations were changed by this verification. F3 paid-provider verification remains a separate, unexecuted opt-in path described above.

The opt-in live test serves the built frontend files at origin `http://localhost:5173` using Playwright routing so an existing development server does not need to be stopped. It never intercepts/mocks port 8000, never disables CORS/CSRF, and grants Chromium's localhost network permission for that routed document. Before launching a browser, the live configuration rejects non-local API origins and requires the F7 operator grant described below. The browser timezone is UTC, intentionally different from the profile timezone. The test also asserts real 401/419/422/404 responses, dependency restrictions and exact UTC deadlines.

Every live run creates a real isolated `f1-…@example.test` account (its email is later updated). Cleanup checks that account's identity, deletes its removable fixtures through the API, and logs out. **The account remains because no account-deletion endpoint exists. A separate schedule-fixture Subject and soft-deleted Lesson/Task/Subtask history also remain according to backend retention rules.** The period is detached before deleting the fixture lesson; a Subject with lesson history cannot be deleted. Use only a confirmed disposable development/test backend. No database reset, purge or unrelated-record cleanup is performed. Real API request audits (method/path/status only), retained fixture IDs and schedule screenshots are written under `test-results/live/`; live traces are disabled to avoid retaining credentials. Treat all live artifacts as private. This test is separate from default mocked tests and CI.

Figma comparison remains pending source-frame access. Chromium, Firefox and Playwright WebKit regression coverage is available; native Safari and physical-device verification remain separate checks.

F6 adds Reminder management, persisted Notification Inbox and read-only Progress/Trends/Comparison reports. The next milestone is an **isolated staging integration and delivery verification pass**: direct planning, supported XLSX commit, reminder synchronization and actual scheduler-to-Inbox delivery, followed by HTTPS staging verification and original Figma comparison. F7 adds cross-browser and automated accessibility coverage; see its separate evidence report. F4 planning and F5 Schedule/Import retain their unverified real Laravel mutation boundaries. F6 is deterministically verified; live Reminder mutations, scheduler delivery and live report aggregation are separate unexecuted boundaries. No isolated authenticated F6 account/environment was supplied; no extra real accounts, database resets, dispatcher execution or paid AI inference were used.

## F7 stabilization and deployment readiness

F7 adds keyboard focus containment in both shared dialogs, internal-redirect validation hardening, Firefox action-ID wrapping, WebKit optional deadline clearing, automated WCAG checks, Firefox/WebKit configurations, and guarded live integration tooling. Existing API/domain architecture remains unchanged. See [F7 evidence](docs/f7-verification.md), [accessibility audit](docs/accessibility-audit.md), [deployment guide](docs/deployment-readiness.md), and [defense demonstration](docs/demo-scenario.md).

Final F7 local checks: **382 unit/component tests and 125 browser executions passed** (50 Chromium, 25 Firefox, 25 desktop WebKit, 25 mobile-sized WebKit), with no browser retries. Type checking, build, formatting and dependency audit passed. The real anonymous Laravel smoke passed; authenticated F4–F6 mutations remain blocked pending an explicitly authorized isolated account. These results do not certify native Safari, physical devices, a real provider or production deployment.

Additional commands:

```sh
npm run format:check
npm run test:a11y
npm run test:cross-browser
npm run test:live:read
```

Cross-browser runs require installed browser binaries and compatible system dependencies. All ordinary browser tests use the built application and deterministic API fixtures. They do not prove live database transactions or scheduler/provider execution.

`npm run test:live` now requires explicit registration permission and a disposable database grant; it still creates a retained real account. `npm run test:live:system` reuses an authorized isolated empty account and retains its fixture history. Both require `F7_LIVE_ALLOW_MUTATIONS=1`, `F7_LIVE_GRANT` under ignored `.auth/`, and `F7_BACKEND_ROOT`. The grant is checked against read-only effective Laravel/MySQL metadata and expires within 24 hours. Follow the complete operator procedure in the F7 report. No mutations, dispatcher execution, registration or paid inference are authorized merely by setting a localhost URL.

Authenticated read-only smoke additionally accepts `F7_READ_STORAGE_STATE=.auth/read.json` and `F7_READ_USER_ID`; absent these, that test is explicitly skipped. Keep session states and grants private. Production deployment has not been performed. F4–F6 live mutation evidence and original Figma frame comparison remain separate verification boundaries.

## F8 acceptance and defense preparation

F8 verified **382 unit/component tests, 54 Chromium tests and 81 Firefox/WebKit tests**, plus a separate 16-test accessibility audit. It adds principal-screen light/dark screenshots, large Task/AI history pagination checks, richer read-only environment diagnostics and stronger authorized-only Reminder/Inbox assertions. No production application or backend logic was changed.

The [F7 hosted run](https://github.com/BashukOleksii/Student-AI-Planner-Frontend/actions/runs/41015012218) completed successfully for `afe9a1d`; F8 working-tree changes have no hosted run. Real anonymous Laravel CORS/CSRF/protected reads passed; authenticated reads and F4–F6 mutations remain blocked without the operator's private session/grant. Scheduler delivery, historical statistics, paid AI, Figma comparison (HTTP 403) and actual HTTPS staging remain unverified. See the [acceptance matrix and setup checklist](docs/f8-final-acceptance.md), [twelve-step defense runbook](docs/demo-scenario.md) and [HTTPS acceptance record](docs/deployment-readiness.md#https-staging-acceptance-record). Local build readiness does not establish deployment or full live-system acceptance.
