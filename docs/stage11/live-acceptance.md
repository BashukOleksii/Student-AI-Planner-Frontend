# Stage 11 — guarded real-system acceptance preparation

Prepared 2026-11-03. **Execution: BLOCKED / NOT RUN.** No new operator grant,
disposable environment or browser-accessible deterministic provider has been supplied.
This is a test procedure and opt-in suite, not evidence of a real integration pass.
No database has been bootstrapped, migrated, reset or mutated during preparation.

## Existing infrastructure and missing provider seam

The suite reuses `e2e/support/liveSafety.ts` identity/grant validation and
`liveBrowser.ts` (built Vue assets only; Laravel requests are never fulfilled).
The retained Stage 8 suite/database/grant are not reused. The new SQL observer only
selects owned Lesson/StudySession rows after checking the effective MySQL database,
Laravel `testing` and provider class. It never seeds pending actions.

At Backend `eab1f252fd409e712921aa46e77577813188d679`,
`AppServiceProvider` binds `LlmProvider` to `OpenAiResponsesProvider`.
The latter posts to the fixed `https://api.openai.com/v1/responses` URL. There is
no configurable local provider URL or deterministic browser HTTP mode.
`AiLessonActionsTest` uses Laravel `Http::fakeSequence` inside PHPUnit; those
bindings do not affect a separately running Laravel HTTP process. The old paid
provider smoke config is unsuitable and must not be used for this milestone.

Minimum safe seam, **not implemented or activated by this Frontend change**:

- In a separately provisioned disposable Laravel testing instance only, bind the
  existing `LlmProvider` interface to
  `Stage11Acceptance\ScriptedLlmProvider`. Keep this adapter outside production
  routes and deployment artifacts. Its binding must be visible both to the CLI
  identity observer and the actual HTTP worker; attest that they use the same
  backend root, environment and database. A CLI-only binding is insufficient.
- The adapter must never contact an external provider. Block all outbound HTTP in
  the isolated process (including stray Laravel HTTP calls); no real OpenAI key.
- On the newest user message `STAGE11_ACCEPTANCE_V1 ` followed by JSON
  `{ "tool": "propose_lesson_…", "arguments": { … } }`, return exactly one
  allowlisted Lesson tool call through `respond()`'s normal
  `{text, calls: [{id, name, arguments}], state}` contract. Return `text=null`,
  one unique call ID, decoded arguments unchanged and `state=[]` for that round.
  In the next round, after that call's tool result, return a plain final answer,
  `calls=[]`, `state=[]`. Distinguish the latest turn from older history: after a
  new user message, old tool results must not suppress its new proposal. Reject
  unknown markers/tools and extra mutation attempts; never silently fall back to
  OpenAI. Normal agent round/call limits and server-controlled wording remain.
- The normal authenticated message route, `AgentOrchestrator`, registry,
  preparation, pending-action finalization, confirmation service and
  `LessonService` must run unchanged. The adapter must have no DB/model writer,
  direct invocation endpoint, fake pending rows or confirmation bypass.
- Review the seam and record its source/version and network-denial evidence
  before issuing a grant. Provisioning/activating it requires separate operator
  control; this repository supplies neither a production-accessible adapter nor
  an automatic provisioner.

This strategy can demonstrate real application persistence with deterministic
provider orchestration. It does **not** establish natural-language model quality
or real OpenAI availability.

## Operator prerequisites and authorization

Do not generate or renew authorization automatically. Do not reuse `.auth` from
Stage 8. An operator must first provide a new private grant and independently
provision the approved environment, schema, demo catalog and authenticated states.
No command below creates an account or modifies schema.

The grant uses all existing `LiveGrant` fields and these additional restrictions:

| Field / condition                                                                           | Required value                                                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `scope`                                                                                     | `stage11-ai-lessons`                                                                                           |
| `backend_origin`, effective `app_url`                                                       | `http://localhost:8000`                                                                                        |
| `environment`, effective environment                                                        | `testing`                                                                                                      |
| `database` / actual `SELECT DATABASE()`                                                     | Exact same `student_planner_isolated_stage11_[a-z0-9_]{1,24}` name                                             |
| `connection`, driver                                                                        | Exact effective connection; MySQL                                                                              |
| `database_disposable`, `isolated_account`, `authorized_nonvaluable_data`, `allow_mutations` | `true`                                                                                                         |
| `running_server_matches_backend_root`                                                       | Operator verifies the HTTP process matches inspected root/environment/database/provider                        |
| `allow_registration`, `allow_dispatch`                                                      | `false`                                                                                                        |
| `provider_class`                                                                            | `Stage11Acceptance\ScriptedLlmProvider` (also checked in Laravel container)                                    |
| `provider_no_external_requests`                                                             | `true`, operator verifies outbound denial                                                                      |
| `subject_id`                                                                                | Existing owned, disposable demo Subject; positive integer                                                      |
| `user_id`, `storage_state`                                                                  | Matching disposable student and private browser state under ignored `.auth/`                                   |
| `approved_at`, `expires_at`                                                                 | Fresh explicit approval, still valid, at most 24-hour lifetime                                                 |
| Optional `second_user_id`, `second_storage_state`                                           | Both supplied together; distinct disposable student in the same authorized environment; private `.auth/` state |

All migration files must already be applied, including the existing forward-only
Lesson action CHECK migration. This suite never applies it. The target student
must initially have **zero Lessons**, including soft-deleted rows. Existing owned
StudySessions are observed for unchanged state; all accounts/data must nevertheless
be disposable. Use a new namespace for reruns: the suite retains records and never
cleans/reset/deletes a failed run. Do not rerun into its now-populated account.

`student_planner`, `student_planner_testing`, `studentplanneracceptance` and every
nonmatching namespace are refused even if a document attempts to authorize them.
Registration, dispatch, paid provider calls and external notifications are excluded.
Supply both second-user fields to satisfy the complete ownership scenario;
otherwise it is explicitly annotated NOT RUN, preventing a claim of full coverage.

## Authorized execution only

After the operator supplies and verifies all prerequisites, set
`STAGE11_LIVE_ALLOW_MUTATIONS=1`, `STAGE11_LIVE_GRANT` to the private grant path,
and `F7_BACKEND_ROOT` to the inspected isolated Laravel root in the local shell.
The production Vite build must target `http://localhost:8000` (no alternative
origin/path), matching the existing live infrastructure.

Then the prepared command is:

```bash
npm run test:live:lessons
```

`playwright.ai-lessons-live.config.ts` runs one Chromium worker, zero retries,
with trace/video/screenshots disabled. The preflight precedes browser launch and
refuses absent/expired grants, identity mismatches, unapplied schema or the normal
OpenAI binding. The suite checks grant expiry again before each intentional write.
Only the frontend origin is intercepted for local static assets. No Laravel HTTP
responses, provider responses, receipts or MySQL results are mocked by Playwright.
Do not enable the general system-live or paid-provider suites alongside it.

## Prepared scenario and pass evidence

| Scenario                      | Required observation in the prepared suite                                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticate isolated student | Real `/api/profile` matches granted user; owned Subject exists; SQL owner Lessons empty                                                                                                                                                |
| Propose create                | Send via Vue composer with normal idempotency UUID; GET real returned action UUID; valid complete preview; full SQL snapshot unchanged before confirm                                                                                  |
| Confirm create                | Keyboard activation; exact `{}` to existing confirm route; executed receipt; real Lesson GET and raw SQL ID/time/status match                                                                                                          |
| Replay confirmation           | Second deliberate `{}` to same action; `replayed=true`, identical receipt, unchanged SQL row count/IDs/state                                                                                                                           |
| Propose/update                | Complete before equals prior receipt; move date and change room; proposal writes nothing; confirm persists both                                                                                                                        |
| Replace                       | Complete before/after; replacement crosses local midnight; original becomes replaced; actual API relationship and raw SQL state; original and replacement links                                                                        |
| Effective schedule            | Real API + Vue schedule after move/replacement; original absent, active replacement present on affected local dates; detail link opens persisted Lesson                                                                                |
| Cancel replacement            | Active replacement → cancelled; raw/API state; original stays replaced; replacement disappears from effective schedule                                                                                                                 |
| Reject independent create     | Exact `{}` rejection; rejected UI state; complete Lesson/StudySession SQL snapshot unchanged                                                                                                                                           |
| Stale action                  | Prepare update of retained original; one explicit normal REST room edit to that owned disposable Lesson; confirmation returns `409 action_stale`; action remains pending, controls block reconfirm; no additional SQL write; reject it |
| Ownership                     | Optional second granted browser state: real profile matches, foreign action GET/confirm and Lesson GET return 404, SQL unchanged                                                                                                       |
| StudySessions                 | Existing session ID/status/instants remain unchanged throughout; no automatic replanning claim                                                                                                                                         |

The stale test deliberately edits one owned Lesson through the normal REST API.
This is test setup within the fresh grant, not an AI review write path or a bypass.
Expiry remains covered deterministically offline; no MySQL clock changes, pending
row edits or artificial expiry endpoint are introduced.

IDs/status/timestamps and database/environment identity are retained immediately
in a mode-0600 ignored `.auth/stage11-lessons-*.jsonl` ledger. Full previews,
cookies, emails, provider arguments and credentials are not written to that ledger.
A failed run retains its created records. Preserve the private ledger for operator
review; do not publish storage states or raw browser artifacts.

After execution, record actual Frontend/Backend/seam revisions, UTC start/end,
exact connected database/environment, scenario results (including optional
ownership), private ledger reference and the real command exit status in the final
acceptance report. A blocked config, `--list`, static typing or passing mock tests
is never a real-system acceptance result.
