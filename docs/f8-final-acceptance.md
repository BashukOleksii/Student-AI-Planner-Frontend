# F8 — Final integration acceptance and defense release

Verification date: **2026-10-30**. Decision: **local frontend release checks PASS; full live-system acceptance BLOCKED**. All safely available checks were completed. Missing operator authorization and external access are verification boundaries, not demonstrated product failures.

## Repository identity and scope

| Repository | Starting HEAD                              | Final HEAD / state                                                                          |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Frontend   | `afe9a1d95a9b5fdc330cb141eb4cd6246691ac0a` | Same HEAD; F8 changes remain uncommitted for review. No push or deployment.                 |
| Backend    | `f618bba290f919dc3561b0462c59b3b86ade82d8` | Same HEAD and clean working tree. No application, migration, schema or configuration edits. |

Both working trees were clean initially. Frontend `AGENTS.md`, historical F1–F7 reports including F1–F2 live evidence, deployment/demo/accessibility guides, routes, API modules, domain types, stores/composables, shared dialogs, browser fixtures and live safety/configuration files were reviewed. Backend instructions, frontend REST contract, routes, Requests, Resources and relevant planning/import/reminder/delivery/statistics/AI implementation were inspected. Historical reports remain unchanged; statements about uncommitted work in those reports describe their original execution time.

The latest hosted frontend run returned by GitHub was [41015012218](https://github.com/BashukOleksii/Student-AI-Planner-Frontend/actions/runs/41015012218): push event for the starting HEAD, completed successfully. The connected GitHub job inspection confirmed successful installation, formatting, type checking, unit tests, build and Chromium steps. GitHub's run metadata independently matched the SHA. This is F7 hosted evidence; **F8 working-tree changes have no hosted execution**. No new commit was pushed.

## Source audit and changes

Vue still owns presentation and route orchestration, typed API modules own credentialed HTTP, Pinia owns authentication/theme, and local composables own request cancellation and page state. Laravel Services remain authoritative for allocation, conflicts, import operations, lifecycle synchronization, delivery and reports. No product feature, production dependency, frontend business algorithm or backend modification was introduced. No confirmed production frontend defect was found during F8.

Source checks retained these contracts:

- Profile and nullable preferences use Resource objects; availability is an unpaginated array. Free slots and Sessions have local date/timezone metadata and whole-second UTC intervals.
- Planning previews carry transient opaque tokens; confirmation is explicit. Partial and unplaced-cancellation consents remain separate. Direct uncertain confirmation uses independent reads and never silently replays a mutation.
- Import upload is multipart `academic_period_id` plus `schedule_file`; Batch detail has a plain nested `rows` array. Revalidation, changed-preview 409 and commit are separate operations. Source transactions do not establish live atomicity.
- Reminders expose absolute/relative anchors, signed offsets, nullable targets, trigger and lifecycle fields. Inbox is paginated, read acknowledgment is explicit and server timestamps are authoritative.
- Statistics preserve independent Task/child populations, all five Session statuses, start-date attribution, known/unknown actual minutes, zero-filled daily buckets and signed comparison deltas. `as_of_utc` can include microseconds. These source-compatible shapes are not authenticated runtime evidence.
- Laravel's AI provider adapter uses `/v1/responses`; conversation persistence, registered Tools and confirmation Services remain behind Laravel. Provider configuration/billing were not exercised or exposed.

F8 changes are limited to:

| File                              | Change and verification scope                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/support/inspect-backend.php` | Extends the existing CLI read-only probe with framework/timezone, applied migration count, required-column presence in 12 tables and selected nonsecret CORS/Sanctum/session configuration. Syntax and actual MySQL execution passed. Existing identity fields and authorization checks are preserved.                                              |
| `e2e/system.live.spec.ts`         | Adds Subtask-relative deadline synchronization/cancellation checks. Optional authorized delivery now checks sent_at, exactly one Notification across all pages, repeated read timestamp and an independent persisted Inbox read. Type checked; **live execution BLOCKED**, so these new assertions are prepared tooling, not passing live evidence. |
| `e2e/audit.spec.ts`               | Captures 11 principal routes in both themes, adds large Task collection and AI history pagination scenarios. Existing assertions remain. These additions passed Chromium, Firefox and WebKit.                                                                                                                                                       |
| `docs/demo-scenario.md`           | Twelve-step operator walkthrough with preconditions, API operations, observable evidence, architectural explanation, historical preparation and failure recovery.                                                                                                                                                                                   |
| `docs/deployment-readiness.md`    | Adds actual scheduler/proxy source findings and a concrete HTTPS acceptance record; preserves the local live-origin guard.                                                                                                                                                                                                                          |
| `README.md`                       | Links current F8 evidence and corrects outdated milestone/browser verification wording.                                                                                                                                                                                                                                                             |
| `docs/f8-final-acceptance.md`     | This evidence, limitations, operator checklist and decision.                                                                                                                                                                                                                                                                                        |

## Actual environment preflight

Used the existing command, then reran its extended metadata version:

```sh
php e2e/support/inspect-backend.php ../student-planner-backend
```

The backend root is the sibling `../student-planner-backend` checkout relative to this frontend. The probe boots its effective Laravel configuration without clearing caches, querying user records, migrating, dispatching or preparing data.

| Property                  | Observed value / limit                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP origin               | `http://localhost:8000` responds to real browser requests; no port-8000 response interception.                                                                                                                                |
| CLI framework/environment | Laravel `13.33.0`, `APP_ENV=local`, `APP_URL=http://localhost:8000`, application timezone `UTC`.                                                                                                                              |
| Effective database        | Connection/driver `mysql`, SQL `SELECT DATABASE()` returns `student_planner`; MySQL is reachable. Disposability is **not established**.                                                                                       |
| Schema                    | 25 applied migrations, no pending migrations; users.timezone and every column listed in the probe's 12-table acceptance manifest present. This does not certify all constraints/indexes or every possible schema property.    |
| Sanctum                   | Stateful hosts `localhost:5173`, `localhost:8000`; bootstrap enables stateful API middleware.                                                                                                                                 |
| CORS                      | Exact allowed origin `http://localhost:5173`, supports_credentials=true, API and CSRF-cookie paths.                                                                                                                           |
| Session                   | Database driver, path `/`, domain=null, Secure=false, HttpOnly=true, SameSite=lax. These are local settings, not HTTPS deployment settings.                                                                                   |
| Frontend origins          | Mocked production preview `http://localhost:4173`; real API smoke serves built assets at `http://localhost:5173` using the existing asset-only harness. No persistent frontend service was deployed.                          |
| Browser identity          | Anonymous only. `.auth/` absent; no operator read state/user ID, mutation grant/backend-root opt-in, dispatch opt-in or paid-AI opt-in supplied. No account selected or created.                                              |
| HTTP/CLI identity binding | Root/configuration/database agreement is not independently attested for the running HTTP process. Matching APP_URL and successful anonymous responses alone cannot authorize mutation. Operator attestation remains required. |

Sandboxed database/browser-server access initially failed; the read-only probe and browser suites succeeded when run with the required host permissions. Host execution permission did not provide application mutation authorization.

## Real Laravel reads and live boundaries

`npm run test:live:read` exited **0: one passed, one skipped**. The passing test verifies real browser CORS, GET `/sanctum/csrf-cookie` → **204**, XSRF/session cookie presence and protected-route rejection. The following GETs returned **401** in the actual browser, as asserted:

| Endpoint                             | Actual query                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/api/profile`                       | None                                                                                                                    |
| `/api/planning-preferences`          | None                                                                                                                    |
| `/api/study-availability-windows`    | None                                                                                                                    |
| `/api/planning/free-slots`           | `start_date=2026-10-01&end_date=2026-10-07`                                                                             |
| `/api/study-sessions`                | Same October 1–7 range                                                                                                  |
| `/api/reminders`                     | None                                                                                                                    |
| `/api/notifications`                 | `unread_only=true`                                                                                                      |
| `/api/statistics/progress`           | October 1–7 range                                                                                                       |
| `/api/statistics/trends`             | October 1–7 range                                                                                                       |
| `/api/statistics/reports/comparison` | `baseline_start_date=2026-10-01&baseline_end_date=2026-10-07&current_start_date=2026-10-08&current_end_date=2026-10-14` |

These responses establish anonymous access boundaries. They do not establish authenticated Resource fields, ownership isolation between accounts, timezone correctness of returned user data, pagination/empty states under real authentication, or restored authenticated sessions. The existing authorized-read test skipped because its operator session/identity was absent; it is **BLOCKED**, not passed. Source/fixture compatibility is recorded separately.

`npm run test:live:system` was **not executed**: its required `F7_LIVE_ALLOW_MUTATIONS`, `F7_LIVE_GRANT`, `F7_BACKEND_ROOT`, authorized isolated empty account, valid private storage state and unexpired grant were unavailable. No grant was generated or guard weakened. F4 real planning confirmation/lifecycle/adaptive effects, F5 actual parser/commit and F6 Reminder synchronization remain BLOCKED. The supported frontend workbook's SHA-256 matches the backend fixture exactly: `278fcd21f10da37f9eededdccf638e041236fb1c61e0c7a37a329aee59a4ddc9`. File equality does not prove parser execution.

The dispatcher was **not invoked**. No due Reminder, sent transition, persisted Notification or read acknowledgment was created. The source schedule is `reminders:dispatch-due --limit=100` every minute; it has no explicit scheduler overlap/single-server declaration. Delivery needs the additional disposable-database grant and dispatcher opt-in. The prepared assertions now count all Inbox pages rather than accepting the first matching item.

Historical reports were **not verified live**. The system harness's future planning fixture cannot establish historical Session completion/miss or known/unknown actual-minute aggregation. Use the separately authorized, elapsed-activity ledger in [the demo runbook](demo-scenario.md#preparation). No backdating, database fixtures, time travel or zero-report success claim occurred.

Paid AI was **not run**. No provider key/billing readiness was inferred from source. The existing configuration requires `AI_LIVE_ALLOW_PAID=1`, an authorized private storage state and owned `AI_LIVE_CONVERSATION_ID`; the smoke appends history and can incur charges. Its current scenario covers one read-oriented message/reload and absence of action decisions, but does not by itself establish all Tool reporting, provider error or idempotency replay cases. Those remain controlled follow-up checks; persistent AI actions need separate authorization.

## Browser, accessibility, visual and performance evidence

Final regression: **54 Chromium tests**, **81 cross-browser tests** (27 Firefox, 27 desktop WebKit, 27 mobile-sized WebKit), all passing with no retries. A separate `test:a11y` run passed **16 tests**. Its tests are also part of the full browser suites; do not add overlapping executions to claim additional unique coverage.

The axe audit inspects 27 routes in light/dark modes using WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags. No violations were reported in inspected states. Existing focus containment/restoration, keyboard navigation, dialog handling, reduced-motion, text-size, history, errors and responsive checks passed. Chart values remain in semantic tables. The text-size smoke is not actual browser UI zoom certification; reduced-motion emulation is not an exhaustive motion audit. Real screen-reader sessions, physical touch devices and native Safari were **NOT RUN**. WebKit engine testing does not certify physical Safari.

The expanded audit generated **44 principal screenshots per Chromium audit run**: 11 routes × two themes × desktop 1440×900/mobile 390×844 viewports. Full-page images can exceed viewport height. The final Chromium and cross-browser runs also generate their own copies. Artifacts are ignored under `test-results/f8-a11y`, `test-results/f8-chromium`, `test-results/f8-cross-browser`; rerunning a suite can replace that suite's artifacts.

Figma [MockUps](https://www.figma.com/design/tzAlMLBLIb5a5pgQkYSV76/MockUps) was inaccessible: the web tool failed to open the file, and the host HTTP retry returned **403**. No Figma inspection tool or approved exported source frames were available. **No source-frame IDs, dimensions, pixel measurements or parity claims are available.** Existing Manrope, warm neutral surfaces, green accents, flat cards and thin borders were preserved. Representative implementation screenshots were inspected: desktop light Dashboard/Login/Import, desktop dark Schedule, mobile dark Registration/AI action review/Statistics, and mobile light Tasks. This supports implementation consistency only; no Figma-grounded correction was justified.

| Inaccessible source group     | Captured implementation route                             | Still unverified against source                                                 |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Login, Registration           | `/login`, `/register`                                     | Exact type/field dimensions, public split layout and mobile spacing             |
| Dashboard                     | `/`                                                       | Card grid, sidebar alignment, spacing and colors                                |
| Schedule                      | `/schedule`                                               | Controls, lesson dimensions and responsive day/week structure                   |
| Tasks                         | `/tasks`                                                  | Filters, cards, action dimensions and mobile density                            |
| Study Planning                | `/planning/preview`                                       | Planning layout, review/consent spacing and component dimensions                |
| AI Assistant and confirmation | `/ai/conversations/1` with adaptive action review fixture | Transcript/composer/review alignment, confirmation typography and theme details |
| Reminders                     | `/reminders`                                              | Cards, status treatment and form/dialog design variants                         |
| Statistics                    | `/statistics`                                             | Charts/tables, labels, layout and theme fidelity                                |
| Excel Import                  | `/schedule/import`                                        | Upload controls and preview/confirmation design variants                        |
| Settings                      | `/profile`                                                | Form sections, theme controls and typography                                    |

All source groups remain BLOCKED for desktop/mobile and light/dark comparison. Exact frame names/IDs could not be discovered; the names above identify requested screen groups, not invented Figma metadata. Once access/approved exports exist, match actual source viewports and compare colors, type, spacing, navigation, forms, cards, modals and confirmation states without weakening accessibility.

Observable large-data checks passed on all configured engines:

- The existing 600-row persisted import preview rendered every row. Separate Chromium audit test durations were 2.4s desktop / 2.7s mobile; these are whole-test durations, not parser/server benchmarks.
- A mocked 5,000-task collection rendered only 15 rows per page. Moving to page two produced exactly `[1, 2]` Task-page requests, with no duplicate navigation request.
- A mocked 2,000-message conversation loaded newest history through page one plus the last snapshot page, explicitly loaded one older page, and reset on reload. Requests were `[1, 100, 99, 1, 100]`, rendering 20 → 40 → 20 messages with no writes/provider calls. Separate Chromium audit durations were 1.5s / 1.2s.

Existing stale-read abort/unmount and serialized/uncertain mutation tests passed. No observed issue justified speculative caching, virtualization, dependencies or architectural changes. These checks do not establish live server latency, sustained heap behavior, a heap-leak audit or an unlimited full-history performance guarantee.

## Commands and exit codes

| Command                                                                            | Exit / actual result                                                                   |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm ci`                                                                           | **0**, 266 packages installed from the existing lockfile; no lockfile/dependency edits |
| `npm run format:check`                                                             | **0**, final maintained files formatted                                                |
| `npm run type-check`                                                               | **0**, application and tests/E2E included                                              |
| `npm test`                                                                         | **0**, 382 tests in 14 files                                                           |
| `npm run build`                                                                    | **0**, production build and type checking; no deployment                               |
| `npm run test:e2e -- --workers=4 --output=test-results/f8-chromium`                | **0**, final 54 passed                                                                 |
| `npm run test:cross-browser -- --retries=0 --output=test-results/f8-cross-browser` | **0**, final 81 passed in official cached Playwright `v1.64.1-noble` container         |
| `npm run test:a11y -- --workers=4 --output=test-results/f8-a11y`                   | **0**, 16 passed                                                                       |
| `npm run test:live:read`                                                           | **0**, one anonymous test passed / one authenticated test skipped                      |
| `php -l e2e/support/inspect-backend.php`                                           | **0**, no syntax errors                                                                |
| `php e2e/support/inspect-backend.php ../student-planner-backend`                   | **0** with host permissions; read-only MySQL/schema/config evidence above              |
| `npm audit --json`                                                                 | **0** with host network access, zero reported advisories                               |
| `git diff --check`                                                                 | **0**                                                                                  |
| `git -C ../student-planner-backend diff --exit-code` and status                    | **0**, backend unchanged/clean                                                         |

The initial unprivileged MySQL probe exited 1; an initial sandboxed E2E attempt exited 1 before its preview server could start; dependency audit initially exited 1 with registry DNS failure. Host reruns passed; none of those failed attempts count as passing integration evidence. The first command-line Figma fetch timed out (exit 28); host retry exited 0 at transport level but HTTP **403**, so Figma acceptance stays BLOCKED. The local GitHub CLI was unavailable; connected GitHub tools and the public GitHub API supplied the hosted status instead.

Initial baseline reruns also passed 50 Chromium and 75 cross-browser tests before the two new F8 cases were added. Final counts above supersede those baseline counts. Browser runs were sequenced to avoid preview-port/artifact collisions. Unit/component regressions were rerun after harness changes. Full logs are local `/tmp/f8-*.log`; ordinary artifacts remain under ignored `test-results/`. No sensitive HTTP traces were enabled for live testing.

## Security, persistent effects and staging

No business account, Lesson, Batch, Task, Subtask, Session, Reminder, Notification, AI conversation/message or historical fixture was created, modified or deleted by F8. Historical F1/F2 records were not reused or cleaned up. Anonymous CSRF/session requests can create ordinary transient session metadata; these are not domain fixtures. No database preparation/reset, migration, scheduler, provider call or deployment ran.

Changed-source review found no credentials, session states, real environment files, dumps or sensitive traces introduced. `.auth/`, environment files, logs, browser output and dist remain ignored; only `.env.example` is tracked. The central client still uses credentialed fetch and decoded XSRF, never automatic mutation replay. No untrusted HTML renderer or browser dispatcher was introduced. Authentication stays out of web storage; theme uses localStorage and the existing owner-scoped unresolved AI intent uses sessionStorage. Zero npm advisories is a dated dependency result, not a penetration-test guarantee. Cross-owner live authorization remains unverified without separately authorized accounts.

No real HTTPS staging URL/access or deployment authorization was provided. The [deployment guide](deployment-readiness.md#https-staging-acceptance-record) now separates SPA/cache/build, exact CORS/stateful origins, cookies/CSRF, proxy HTTPS detection, single scheduler, secrets and rollback readiness from actual hosted validation. The local harness intentionally cannot target example HTTPS hosts. Build/configuration readiness passed; HTTPS browser login/session restoration/refresh and production deployment did not occur.

## Operator checklist to close external boundaries

1. Supply an explicitly authorized nonproduction checkout/server and isolated account. Attest the HTTP process uses the same effective root/configuration/database as the probe; review every required-column flag. Do not infer disposability from `localhost` or `student_planner`. Missing schema needs a separately approved operator action, never an automatic migration.
2. Manually authenticate the designated account and save its valid browser state privately under ignored `.auth/`. For read-only smoke set `F7_READ_STORAGE_STATE` and positive `F7_READ_USER_ID`, then run `npm run test:live:read`. Inspect actual JSON shapes, range/timezone metadata, populated/empty states, ownership and pagination. The current smoke's generic data-envelope assertions alone do not exhaust these acceptance checks.
3. For system mutations provide an **operator-authored** grant under `.auth/` using the exact [F7 schema/procedure](f7-verification.md#operator-procedure-for-remaining-live-scenarios). Bind origin/environment/connection/database/user/storage state, affirm server-root match and isolated nonvaluable data, and set approved/expires timestamps with at most 24-hour lifetime. Set `F7_LIVE_ALLOW_MUTATIONS=1`, `F7_LIVE_GRANT` and `F7_BACKEND_ROOT` only for that grant. This report does not grant any permission.
4. Review `e2e/system.live.spec.ts` before running `npm run test:live:system`. It requires empty work/context/settings and retains history. Capture IDs on interruption; inspect the Batch and Sessions before rerun. Its real XLSX/planning/Reminder assertions are not a substitute for all manual Lesson replacement/cancellation or historical completion scenarios.
5. Dispatch additionally requires the whole database to be isolated/disposable, `database_disposable=true`, `allow_dispatch=true` and `F7_LIVE_ALLOW_DISPATCH=1`. Verify one sent Reminder and one persisted receipt across pages plus repeated read behavior. Do not invoke the scheduler otherwise.
6. Separately authorize historical preparation using actual elapsed activity and a fixture ledger. Compare nonzero exact metrics with independent reads; do not treat a future planning fixture or zero report as proof.
7. Separately authorize bounded paid AI testing and any persistent AI actions. Start read-only; verify persisted assistant/Tool evidence, deliberate idempotent retry/error scenarios and independent domain reads for any separately authorized confirmation. Never automatically confirm an action.
8. Provide Figma read access or approved desktop/mobile light/dark exports with frame identities/dimensions. Use the existing screenshots as an implementation inventory, then perform source comparison and correct verified differences.
9. Provide actual HTTPS staging origins/access and explicit deployment permission if deployment is needed. Execute the guide's browser acceptance record. Native screen-reader/device checks remain separate manual work.
10. After a reviewed commit is pushed, wait for its own hosted CI run to complete and record that SHA/run. Do not transfer the successful F7 hosted result to F8 changes.

## Acceptance matrix

PASS applies only to the evidence scope in its row. BLOCKED means a required external dependency/authorization is absent; NOT RUN means no actual execution of that verification. No blocked or skipped live check is counted as PASS.

| Category                                 | Status      | Evidence                                                                                        | Next required action                                                                      |
| ---------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Source-code/API audit                    | **PASS**    | Existing Vue/Laravel contracts and safety architecture reviewed; no confirmed frontend mismatch | Reconcile any differences discovered in authenticated payloads                            |
| Unit/component verification              | **PASS**    | 382/382, 14 files                                                                               | Keep checks green for the reviewed release                                                |
| Mocked browser regression                | **PASS**    | Final 54 Chromium + 81 Firefox/WebKit                                                           | Retain deterministic coverage                                                             |
| Read-only MySQL preflight                | **PASS**    | Effective identity, 25 migrations, listed columns/configuration                                 | Operator must attest HTTP/CLI match and authorize any writes                              |
| Anonymous real Laravel reads             | **PASS**    | CSRF 204/cookies and ten protected GET 401 boundaries                                           | Do not equate with authenticated contents                                                 |
| Real authenticated API reads             | **BLOCKED** | Existing read test skipped; no authorized session/user ID                                       | Supply private session/identity, inspect actual Resources and restoration                 |
| Real MySQL business mutations            | **BLOCKED** | No live grant/isolated-account authorization; historical F1/F2 evidence preserved separately    | Valid operator grant and controlled system/manual scenarios                               |
| Real XLSX parsing/commit (F5)            | **BLOCKED** | Workbook matches supported fixture; no upload/commit executed                                   | Authorized upload/revalidate/commit/duplicate/409 scenario and independent GETs           |
| Real planning confirmation (F4)          | **BLOCKED** | Source and deterministic coverage; no real preview/confirm                                      | Authorized full/partial/adaptive scenarios producing genuine conditions                   |
| Real Reminder synchronization (F6)       | **BLOCKED** | Prepared Task/child/session assertions; no live execution                                       | Authorized Reminder/deadline/lifecycle changes and independent reads                      |
| Actual scheduler delivery                | **BLOCKED** | Dispatcher never invoked; separate disposable-database permissions absent                       | Dispatch grant, controlled due fixture, sent state and exactly one persisted Notification |
| Real historical statistics (F6)          | **BLOCKED** | No authorized past-activity fixture or authenticated report                                     | Prepare elapsed activity and match exact counts/minutes/unknowns/deltas                   |
| OpenAI provider integration              | **BLOCKED** | Source adapter/fixtures only; paid permission/session absent                                    | Separate bounded paid authorization and persisted-response evidence                       |
| Figma source comparison                  | **BLOCKED** | File inaccessible, host HTTP 403; implementation screenshots only                               | Source access/approved exports, actual frame/viewport comparison                          |
| Implementation screenshot inventory      | **PASS**    | 44 Chromium captures/run, representative visual inspection                                      | Compare against actual source when available                                              |
| Cross-browser engine testing             | **PASS**    | 27 Firefox + 27 desktop WebKit + 27 mobile WebKit, zero retries                                 | Native devices/Safari remain separate                                                     |
| Automated accessibility                  | **PASS**    | Axe on 27 routes/two themes and keyboard/dialog/text-size checks                                | Continue state-specific checks as UI evolves                                              |
| Manual screen reader/native device/zoom  | **NOT RUN** | No such session occurred                                                                        | Perform and record manual checks                                                          |
| Bounded large-data UX                    | **PASS**    | 600 preview rows, paginated 5,000 Tasks, snapshot-paged 2,000 messages                          | Live latency/heap profiling only if observations justify it                               |
| Build/deployment configuration readiness | **PASS**    | Clean-install type/build checks and reviewed operator guide                                     | Apply actual topology/configuration with authorization                                    |
| Actual HTTPS staging                     | **BLOCKED** | No real staging origin/access                                                                   | Authorized browser verification at deployed origins                                       |
| Production deployment                    | **NOT RUN** | No deployment access/authorization or deployment performed                                      | Explicit operator release and actual post-deployment acceptance                           |
| Hosted F7 baseline CI                    | **PASS**    | Completed successful run 41015012218 matches starting HEAD                                      | Preserve historical attribution                                                           |
| Hosted F8 changes CI                     | **NOT RUN** | F8 changes uncommitted/unpushed                                                                 | Push reviewed commit and await its completed run                                          |

## Final assessment

**Functionally implemented:** F1–F6 interfaces and Laravel integration contracts exist. **Automatically tested:** local type/build checks, 382 unit/component tests and 135 final browser regressions pass. **Live integration verified:** F8 verifies anonymous HTTP/session boundaries and read-only schema/configuration only; F1/F2 success is historical evidence. Authenticated F4–F6 effects remain blocked. **Visually validated:** representative implementation consistency reviewed; Figma parity blocked. **Deployment ready:** build and operator configuration guidance ready for an authorized attempt; actual infrastructure remains unvalidated. **Actually deployed:** no.

The academic defense runbook is ready, with truthful recovery paths. A complete live-system defense still requires the designated account, authorized persistent scenarios, historical activity and any intended scheduler/provider access. F8 closes the available local release work and makes the remaining acceptance gates explicit; it does not grant unconditional full-system or production acceptance.
