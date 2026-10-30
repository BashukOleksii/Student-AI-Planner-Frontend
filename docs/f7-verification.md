# F7 — final stabilization and verification

## Baseline and scope

Audit date: 2026-10-30. Started on clean `main`, commit `ab0f3469e810f1a72e1fe03a3c6b4bc72e9adec8`. F1–F6 source and historical verification reports were inspected alongside frontend instructions, routes, API transport, authentication, date utilities, components, tests and backend contracts. The backend working tree remains unchanged. F7 changes are uncommitted for review; no deployment or push was performed.

The architecture remains Vue route orchestration, typed endpoint modules, Pinia authentication/theme state, local resource/composable state and native credentialed fetch. Laravel remains authoritative for planning, conflict handling, ownership, imports, synchronization, delivery and statistics. Direct preview tokens and durable AI action confirmation remain separate workflows. Route components are lazy loaded; Temporal remains the existing timezone dependency. No production dependency or new business algorithm was added.

## Corrections and tooling

- Shared dialogs now explicitly retain keyboard focus, including when busy controls are disabled. The browser audit exposed a focus-cycle defect; unit/browser regressions cover its correction.
- Internal redirects reject control characters, whitespace and backslashes, preventing URL-normalization ambiguity. Existing redirect assertions remain and malicious control-character cases were added.
- Legacy registration live testing previously checked localhost but could still mutate a shared local database. It now requires an expiring operator grant and verified effective database identity. The AI configuration uses the shared base independently and preserves its separate paid-provider opt-in.
- WebKit rejected submission after clearing an optional Subtask datetime while static min/max bounds remained. Bounds are now conditional on a nonempty value; required date parsing, DST rejection and Laravel validation remain intact. Existing unit assertions were extended and the original browser lifecycle assertions retained.
- Added 27-route light/dark axe accessibility audits, keyboard/history/reduced-motion smoke, 600-row import rendering measurement, and Firefox/WebKit configurations. Only the development-only axe integration was added.
- Added read-only real-browser checks and an opt-in F4–F6 system scenario. The latter uses real API calls, independent reads, existing supported XLSX fixture, reference correction, changed-preview conflict, planning/adaptive confirmation, reminder synchronization and optional dispatcher verification. It has not been executed against an authorized account and must not be cited as passing live evidence.
- Added formatting verification to ordinary CI. Ordinary CI remains independent of Laravel/MySQL/cron/OpenAI. Documentation and deployment/demo instructions are included.

## Verification categories

| Category                | Evidence / boundary                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Source/API audit        | Existing routes, Requests, Resources and lifecycle contracts inspected; no backend modifications            |
| Unit/component          | 382 tests, 14 files passed after corrections                                                                |
| Mocked Chromium         | See final command results below; real production bundle with mocked HTTP                                    |
| Real browser-to-Laravel | Anonymous CORS/CSRF/protected-route checks passed; authenticated read test skipped without operator session |
| Real MySQL              | Read-only effective identity/schema diagnostics succeeded; F7 business transactions not run                 |
| Scheduler               | Not executed; explicit disposable-database and dispatcher permission absent                                 |
| OpenAI                  | Not executed; no paid opt-in                                                                                |
| Figma                   | Original frames unavailable; token consistency and browser audit only, no pixel-perfect claim               |
| Cross-browser           | See actual results below; WebKit is not native Safari/physical-device evidence                              |
| Deployment              | Guide prepared; no actual deployment                                                                        |

Historical F1–F2 live success remains unchanged. F4–F6 live mutation boundaries remain open. Mocked XLSX fixtures do not demonstrate real parser execution; mocked inbox/statistics responses do not demonstrate delivery or database aggregation.

## Live read evidence

Read-only Laravel boot/SQL diagnostics found environment `local`, APP_URL `http://localhost:8000`, connection/driver `mysql`, effective database `student_planner`, 25 applied migrations, no pending migrations and users.timezone present. Session configuration uses database cookies, local Secure=false, SameSite=lax; configured CORS/stateful hosts match localhost ports. This confirms schema readiness, not disposability or authorization. No migrations, backend tests, resets, dispatcher or domain mutations were run.

`npm run test:live:read` exited 0: **1 passed, 1 skipped**. Real browser GET /sanctum/csrf-cookie returned 204 with XSRF/session cookies. Protected reads returned 401 at:

- /api/profile
- /api/planning-preferences
- /api/study-availability-windows
- /api/planning/free-slots (2026-10-01 through 2026-10-07)
- /api/study-sessions (same range)
- /api/reminders
- /api/notifications?unread_only=true
- /api/statistics/progress and /api/statistics/trends (same range)
- /api/statistics/reports/comparison (October 1–7 versus October 8–14)

These 401 responses prove access boundaries, not authenticated Resource contents. For authorized reads, supply `F7_READ_STORAGE_STATE` under ignored .auth/ and `F7_READ_USER_ID`; then rerun. No account was created during F7.

## Operator procedure for remaining live scenarios

1. Provision an explicitly authorized nonproduction environment and isolated account with no valuable data. Verify the running server process uses the same backend root/configuration/database as the CLI probe. A local hostname or database name alone is insufficient.
2. Inspect metadata with `php e2e/support/inspect-backend.php /path/to/backend`. This performs read-only diagnostics. Do not run migrations automatically.
3. Manually authenticate the designated account and store browser storage state privately under `.auth/`. Never commit or share cookies.
4. Create a private `.auth/f7-grant.json` matching the following schema, replacing identity, user, storage path and timestamps with actual verified values. True permissions are deliberate operator assertions, not defaults:

```json
{
  "backend_origin": "http://localhost:8000",
  "environment": "local",
  "connection": "mysql",
  "database": "REPLACE_WITH_VERIFIED_DATABASE",
  "running_server_matches_backend_root": true,
  "isolated_account": true,
  "authorized_nonvaluable_data": true,
  "allow_mutations": true,
  "database_disposable": false,
  "allow_registration": false,
  "allow_dispatch": false,
  "user_id": 1,
  "storage_state": ".auth/authorized.json",
  "approved_at": "REPLACE_WITH_CURRENT_ISO_TIME",
  "expires_at": "REPLACE_WITH_ISO_TIME_WITHIN_24_HOURS"
}
```

5. Set `F7_LIVE_ALLOW_MUTATIONS=1`, `F7_LIVE_GRANT=.auth/f7-grant.json`, `F7_BACKEND_ROOT=/path/to/backend`, then run `npm run test:live:system`. The harness additionally requires an empty account before its first domain mutation. It retains fixture history and attaches identifiers; it never resets or purges data. A failed run requires inspection rather than a blind rerun on the now-populated account.
6. Registration smoke (`npm run test:live`) additionally requires `database_disposable=true` and `allow_registration=true`; it creates a retained account. Do not run it unnecessarily.
7. The dispatcher additionally requires `database_disposable=true`, `allow_dispatch=true`, and `F7_LIVE_ALLOW_DISPATCH=1`. It can process due records beyond the fixture, hence whole-database isolation is mandatory. Without these, dispatcher evidence remains blocked.
8. Independently inspect retained sessions, effective lessons, reminders, notifications and reports. Prepared historical completed/missed sessions and known/unknown actual minutes need a separate authorized fixture exercise; the future-session smoke does not prove every historical metric population. Token expiration/feasibility scenarios remain deterministic fixture coverage until safely prepared live.

Guard-negative probes for system, registration and paid-AI configurations exited 1 before launching a browser, as expected. These refusals are safety checks, not passing integration tests. Live traces are disabled to avoid retaining credentials. Ordinary mocked failure artifacts remain enabled.

## Security, visual and performance review

Sanctum credentials/XSRF, JSON/multipart handling, validation envelopes and explicit mutation controls remain centralized. No bearer auth, provider secret, untrusted HTML injection or browser delivery was introduced. Theme preference alone uses localStorage; unresolved AI intent content/key uses the existing owner-scoped sessionStorage recovery mechanism, not authentication or protected planning tokens. Auth files remain ignored. Dependency audit found no advisories. Production bundle remains route-chunked. A 600-row preview measurement exercises all rows without changing server data; no speculative cache or reconciliation logic was added.

See accessibility-audit.md for audit limits. Desktop/mobile browser screenshots and existing tokens support consistency checks; original Figma comparison and actual screen-reader/physical-device testing remain unverified.

## Hosted CI

The baseline HEAD run [40972360089](https://github.com/BashukOleksii/Student-AI-Planner-Frontend/actions/runs/40972360089) completed successfully. Installation, type checking, unit tests, production build and mocked Chromium steps were inspected. Failure-only artifact upload was correctly skipped. F7 changes are local and have no hosted run yet.

## Acceptance and next action

Accept frontend stabilization only with the explicit live boundaries above. Full end-to-end deployment acceptance requires the authorized F4–F6 scenario, historical statistics fixtures, actual scheduler delivery and HTTPS staging cookie verification. Paid AI and Figma source comparison remain separately opt-in/access-dependent. Use demo-scenario.md for defense preparation and deployment-readiness.md for the release checklist.

## Executed commands and exit codes

| Command                                                                                                                          | Actual outcome                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                                                                                         | Exit 0, executed again after the axe lockfile addition                                                       |
| `npm run type-check`                                                                                                             | Exit 0                                                                                                       |
| `npm test`                                                                                                                       | Exit 0; 382 tests / 14 files                                                                                 |
| `npm run build`                                                                                                                  | Exit 0; route chunks retained, main entry about 63 kB (24 kB gzip), Temporal chunk about 159 kB (46 kB gzip) |
| `npm run test:e2e`                                                                                                               | Exit 0; 50 desktop/mobile Chromium tests before the final Firefox CSS correction; final regression below     |
| `npm run format:check`                                                                                                           | Exit 0 after formatting the existing vite.config.ts                                                          |
| `git diff --check`                                                                                                               | Exit 0                                                                                                       |
| `npm audit --json`                                                                                                               | Exit 0; zero reported advisories                                                                             |
| `npm run test:live:read`                                                                                                         | Exit 0; one real anonymous test passed, authenticated test skipped                                           |
| `php e2e/support/inspect-backend.php ../student-planner-backend`                                                                 | Exit 0; read-only identity/schema diagnostics                                                                |
| `npx playwright test e2e/core.spec.ts --config playwright.cross-browser.config.ts --project=firefox --grep 'registration opens'` | Exit 0; initial Firefox launch smoke                                                                         |
| `npm run test:cross-browser -- --project=firefox`                                                                                | Initial exit 1: 24 passed, one confirmed AI UUID overflow at intermediate width                              |
| `npx playwright test e2e/ai.spec.ts --config playwright.cross-browser.config.ts --project=firefox --grep 'adaptive review'`      | Exit 0 after scoped UUID wrapping correction                                                                 |

Initial audit development runs exposed the dialog focus bug and two new harness selector errors (hidden marketing heading on mobile and duplicate heading names). Those were corrected without removing existing assertions. Native Fedora WebKit launch failed due to unavailable compatible system libraries; the official Playwright Ubuntu container was used for the final cross-browser run. An initial container run was interrupted because a simultaneous local run shared its artifact directory; final runs use separate output directories and no automatic retries. This was test orchestration, not application failure.

The Firefox overflow correction adds `min-width: 0` and `overflow-wrap: anywhere` to action UUID metadata. The regression now waits for layout and also identifies overflowing elements, while preserving the original document-width assertion.

### Final regression evidence

`npm run type-check`, `npm test`, and `npm run build` exited 0 after the WebKit correction. Unit/component result: **382 passed / 14 files**. `npm run test:e2e -- --output=test-results/f7-chromium` exited 0: **50 passed**, no retries (54.5 seconds). These Playwright tests run the production Vite preview, providing a local production-bundle smoke as well as mocked functional coverage.

The first complete container run returned 73 passed / 2 failed, isolating the WebKit optional-date defect. Targeted desktop/mobile WebKit retests both passed after the correction. No earlier failure is counted as a passing run. Native input validity and the original exact null PATCH assertion remain in the test.

## Important changed files

- `src/utils/dialog.ts`, `src/components/ui/AppModal.vue`, `src/components/ui/ConfirmDialog.vue`: keyboard containment.
- `src/router/index.ts`, `tests/auth.test.ts`: redirect validation regression.
- `src/styles/ai.css`, `e2e/ai.spec.ts`: complete UUID wrapping and overflow diagnostics.
- `src/components/domain/SubtaskForm.vue`, `tests/subtasks.test.ts`, `e2e/academic-subtasks.spec.ts`: optional date clearing with native validity/null payload assertions.
- `e2e/audit.spec.ts`, `tests/f7-safety.test.ts`: automated accessibility/browser and live-safety regressions.
- `e2e/read.live.spec.ts`, `e2e/system.live.spec.ts`, `e2e/support/liveBrowser.ts`, `e2e/support/liveSafety.ts`, `e2e/support/inspect-backend.php`: isolated real integration tooling and read-only preflight.
- `playwright.live-base.ts`, existing live/AI configs, new read/system/cross-browser configs, default Playwright exclusions: separate test boundaries.
- `package.json`, `package-lock.json`, `.github/workflows/ci.yml`: development-only axe, scripts and formatting verification. `vite.config.ts` formatting only.
- README and F7/deployment/demo/accessibility documents. F1–F6 historical reports are unchanged.

Final cross-browser command:

```sh
docker run --rm --init --ipc=host --user 1000:1000 \
  -e HOME=/tmp -e CI=1 \
  -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  npm run test:cross-browser -- --retries=0 --output=test-results/f7-container-final
```

**Exit 0: 75 passed (2.2 minutes)** — 25 Firefox desktop, 25 WebKit desktop and 25 WebKit mobile-sized tests. Together with the final 50 Chromium tests, all 125 browser executions passed without retries. Axe checks passed in their inspected light/dark states. No unhandled browser errors were reported by the existing journey assertions. This is browser-engine emulation, not native Safari or physical-device certification.

Final formatting and Git diff checks exited 0. Backend working tree stayed clean. The current frontend branch remains `main` at the baseline commit with F7 changes uncommitted. No hosted CI run exists for these local changes. Remaining acceptance work is precisely the authorized live/staging/provider/Figma/manual-accessibility work listed above.
