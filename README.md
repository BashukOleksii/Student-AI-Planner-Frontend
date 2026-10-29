# Student AI Planner — Frontend

Functional Core MVP (Stage F1) for **AI Agent for a Student's Personal Learning Activity Planning Service**. This independent Vue application communicates only with the existing Laravel REST API. It contains no database access, AI orchestration or planning algorithms.

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
- Profile: name, email and IANA timezone updates, server field validation and success/error feedback. Subsequent pages use the updated timezone.
- Light/dark semantic tokens, locally bundled Manrope including Cyrillic, no shadows. Only the theme preference is stored in localStorage.
- Read loading/error/empty states, explicit read retries, field-level validation, disabled mutation submits, stale-read cancellation, unsaved task/profile navigation confirmation, accessible native modal focus containment, Escape and focus restoration.

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
  components/domain/   Lesson/task cards and presentational task form
  views/               Route-level API orchestration and forms
  composables/         Cancellable asynchronous reads
  utils/               Timezone/calendar presentation and conversion
  styles/              Semantic light/dark design tokens and responsive CSS
```

The API client keeps Resource envelopes and pagination `data`, `links` and `meta`; 204 is handled without parsing JSON. It provides typed status/field/retry errors for 401/403/404/409/410/419/422/429/5xx and network failure, sanitizes general errors and retains `Retry-After`. It never renders raw exception messages. No arbitrary server-sorting parameters are sent.

Task inputs use `pending`/`completed` only as returned status. Writes never submit status; dedicated action endpoints own transitions. Deadlines are sent as exact `YYYY-MM-DDTHH:mm:ssZ`, without milliseconds. Empty nullable inputs send null when cleared. Existing untouched deadlines retain their exact instant. Nonexistent or repeated local times at DST transitions are rejected with an explanation rather than silently shifted. Date queries use local calendar labels and calendar-day arithmetic, never fixed 24-hour additions.

## Integrated endpoints

| Area               | Endpoints                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Session            | GET `/sanctum/csrf-cookie`; POST `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`                         |
| Profile            | GET/PATCH `/api/profile`                                                                                             |
| Dashboard/schedule | GET `/api/schedule/today`, `/api/schedule/date/{date}`, `/api/schedule/week/{date}`                                  |
| Tasks              | GET/POST `/api/tasks`; GET/PATCH/DELETE `/api/tasks/{id}`; POST `/api/tasks/{id}/complete`, `/api/tasks/{id}/reopen` |
| Subjects           | GET `/api/subjects` (unpaginated optional selector/filter)                                                           |
| Statistics         | GET `/api/statistics/progress?start_date=...&end_date=...`                                                           |

Contracts were checked against the local backend's routes, Requests, Resources and the documented frontend contract/readiness, auth/profile, schedule, tasks, progress statistics and architecture. The backend repository was not modified.

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

Vitest + Vue Test Utils + jsdom run deterministic HTTP-mocked client/store/component/router tests. They cover cookies/CSRF, validation/errors, no unsafe retries, pagination preservation, auth guards/restoration/logout, timezone/DST, stale reads, dashboard states, schedule navigation, task CRUD and profile/theme updates. Tests and E2E TypeScript are included in type checking through a separate test TypeScript configuration, including the Node APIs used by browser test fixtures.

The E2E command builds the production bundle and serves it through Vite preview on `http://localhost:4173`, avoiding development optimizer/cache races. Playwright runs Chromium desktop (1440×900) and mobile viewport (390×844) journeys with deterministic intercepted HTTP responses. It covers registration, login, refresh/session restore, schedule, dashboard, task create/edit/complete/reopen/delete, dialog focus/Escape, profile/timezone, theme, logout, JavaScript errors and horizontal overflow. These are **mocked frontend browser tests**, not evidence of a real Laravel/MySQL integration or a physical mobile device/browser matrix. No OpenAI account is needed.

GitHub Actions performs `npm ci`, type checking, tests, production build and Playwright smoke tests on Node 24.12.0. CI installs Chromium/system dependencies and uploads failure artifacts. This workflow is configured in the repository; a hosted Actions run must still execute after pushing.

Detailed execution results: [F1 verification record](docs/f1-verification.md).

## Remaining verification and next work

The Laravel server was reachable at `localhost:8000` (unauthenticated profile returned 401), but the live browser test failed before registration: its response to origin `http://localhost:5173` omitted `Access-Control-Allow-Origin`. Chromium therefore blocked profile/session initialization. **Live end-to-end integration has not passed.** Correct the backend's CORS/stateful configuration as documented above, clear its cached configuration if necessary, then run `npm run test:live`. No backend files/configuration were changed, and no live test account was created by the blocked runs.

The opt-in live test serves the built frontend files at origin `http://localhost:5173` using Playwright routing so an existing development server does not need to be stopped. It never intercepts/mocks port 8000, never disables CORS/CSRF, and grants Chromium's localhost network permission for that routed document. A successful run creates an isolated `f1-…@example.test` account, exercises real Sanctum/task/profile/schedule flows, deletes its tasks and logs out. The account remains because the backend has no account-deletion API. Use a development/test backend only. This test is separate from default mocked tests and CI.

Figma comparison remains pending access to its integration. Only Chromium desktop/mobile viewport testing is configured initially; Safari/Firefox and physical-device checks can follow.

AI chat, action confirmations, Excel import, lesson CRUD, automatic/adaptive planning, free-time calculations, reminders/notifications and complex reports are outside F1 and have no fake application pages. The next coherent milestone is **task subtasks and per-task backend progress**, followed by the AI assistant's read and explicitly confirmed action interface.
