# Stage F3 — AI Assistant and confirmed actions

Verified locally on **2026-10-29**. Frontend implementation and required offline checks: **PASS**. Actual paid-provider inference/AI execution: **not run**, requires explicit operator opt-in.

## Repository audit and scope

Started on clean `main`, HEAD `e21f4a43432016d80866e4a24eb839dcf0090c2c` (`Add next part`). F1/F2, including their latest real Laravel/MySQL verification, were already committed. Read AGENTS.md, README, historical verification reports, API client/modules/types, auth, router, layout/theme/components, tests, Playwright configuration and CI before implementation.

Read the backend frontend API/readiness, AI chat, Task action, Subtask/Reminder action, study-planning action and architecture documents. Checked actual AI routes, Requests, Resources, all three registries, proposal/presentation/confirmation/consent Services, public history/turn persistence, planning Resources and relevant session/read contracts. Actual implementation takes precedence over historical stage descriptions.

Figma design-to-code skill instructions were read. Figma MCP tools were unavailable in this session, so original frames were not inspected. Existing Academic Minimalism tokens, typography, components and layout were preserved; no frame parity is claimed.

The existing Vue/Vite application, dependencies, public routes and F1/F2 functionality remain in place. No backend source/configuration/migrations/schema changes, database resets, real account creation, cleanup or paid inference were performed. Historical F1/F2 reports are unchanged. Ending branch/HEAD remain the same, with this milestone left uncommitted; no commit/push was requested.

## Implemented routes and architecture

- `/ai`: authenticated conversation list, creation and pagination.
- `/ai/conversations/:id`: reloadable owned conversation, transcript, composer, current action reviews and receipts.
- Existing sidebar/mobile navigation includes AI, with active nested-route indication. All prior destinations remain available.

Responsibilities:

| Files                                                     | Responsibility                                                                                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/ai.ts`                                           | Conversation/message/action endpoints, runtime public-response narrowing, scoped server pagination links.                                                                        |
| `src/types/ai.ts`                                         | Public AI contracts and discriminated executed/rejected/expired/failed-attempt events. Persistent action statuses remain four.                                                   |
| `src/api/client.ts`                                       | Existing credentialed native fetch, extended only with Idempotency-Key and safe stable error codes.                                                                              |
| `src/composables/useAiConversation.ts`                    | Local conversation reads, snapshot history, intent lifecycle, current action selection, serialized decisions, GET recovery and domain refresh.                                   |
| `src/views/AiView.vue`                                    | Route-level conversation browsing/creation and page orchestration.                                                                                                               |
| `src/components/ai/`                                      | Composer, safe timeline, typed error notice, structured fields, Work/Reminder/Planning reviews, consent/receipt controls. No requests inside presentational components.          |
| `src/utils/aiIntent.ts`, `aiInput.ts`, `ai.ts`            | Tab-scoped unresolved intents, meaningful Unicode input validation and public presentation helpers. Input/storage code is independent of the heavy timezone presentation module. |
| `src/api/activity.ts`, `aiRefresh.ts`, `src/types/api.ts` | Existing Reminder/StudySession read contracts and receipt-directed domain refresh; no new standalone management module.                                                          |
| `src/styles/ai.css`                                       | Responsive token-based AI layout; existing light/dark tokens and Manrope remain authoritative.                                                                                   |

Pinia remains responsible for genuinely shared auth/theme state. Chat/transient form state stays local to the route/composable. There is no second HTTP client/auth store, generic CRUD/workflow engine, Tool dispatcher, UI framework, Markdown renderer, provider SDK or new dependency. AI views remain lazy-loaded. The shared auth intent-cleanup import does not pull Temporal into the initial application bundle.

## Exact integrated endpoints

All AI endpoints retain existing Sanctum cookies, JSON, credentials and CSRF handling.

| Method   | Endpoint                                                | Consumed contract                                                                           |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET/POST | `/api/ai/conversations`                                 | Standard paginated metadata; empty-object creation. No invented title/rename/delete fields. |
| GET      | `/api/ai/conversations/{conversation}`                  | Owned metadata before displaying the workspace.                                             |
| GET      | `/api/ai/conversations/{conversation}/messages`         | `page`, `per_page`, `through_id`; public chronological messages.                            |
| POST     | Same message URL                                        | Only `{content}` plus UUID v4 `Idempotency-Key`; completed Resource turn response.          |
| GET      | `/api/ai/conversations/{conversation}/actions`          | Standard newest-first action pagination.                                                    |
| GET      | `/api/ai/conversations/{conversation}/actions/{action}` | Current action, complete preview, status/expiry and immutable receipt.                      |
| POST     | Same action URL + `/confirm`                            | Empty object or action-supported explicit boolean consent only.                             |
| POST     | Same action URL + `/reject`                             | Empty object.                                                                               |

Receipt-directed refresh reads reuse GET `/api/tasks`, `/api/tasks/{id}`, nested Subtask list/progress, `/api/statistics/progress`, `/api/reminders/{id}`, bounded `/api/study-sessions?start_date=...&end_date=...` and `/api/schedule/today` as applicable. Session ranges come from reviewed calendar dates or the replacement's local date; statistics use one inclusive local date. These reads never perform domain transformations. Existing destination views load fresh data on navigation. A failed refresh is shown separately while the executed receipt remains intact.

## Conversation and idempotency behavior

Conversation labels use ID and local date, with no claim of editable persisted titles. Route URLs retain selection across refresh/back navigation. Lists keep backend ordering and pagination. Actions have independent list/detail error recovery and older-page navigation.

Message pages ascend by ID. Initial history obtains page one to capture the high-water boundary, follows its last-page link to the newest page, then prepends older pages using previous links from that same snapshot. Explicit refresh omits `through_id` and starts a new snapshot. Message IDs deduplicate and order entries; timestamps are not treated as unique. Server links are restricted to the configured API origin, exact resource path and supported query keys before any credentialed request.

Composer input remains exact, untrimmed text with meaningful UTF-8/Unicode validation and a 4000-character code-point limit. Enter inserts a newline; Ctrl/Command+Enter sends. There is no fake streaming, model-status endpoint or automatic polling. A pending request reports that the server is still processing and remains navigable.

Every new intent generates one UUID v4 and saves exact content/key together before POST. Unresolved intents survive accidental reload in sessionStorage, scoped by user and conversation. They are never auto-sent on restore, discarded on a timer or replaced merely because a response is lost. Deliberate retry uses the same values. Explicit edit-as-new warns about a possibly committed earlier request, then obtains a new key on the next send. Success, explicit discard and confirmed logout clear the copy. Session expiration preserves it for the same owner's reauthentication. Storage failure is visible. No auth credentials or complete history are stored there; localStorage continues to hold only theme preference.

After a completed turn, persisted history is reloaded rather than mixing optimistic bubbles with server messages. A replayed original proposal uses only its action ID to fetch current state, including already executed/rejected/expired state. Tool rows display public names/call IDs and success/error code, never empty bubbles, raw arguments, output data or reasoning. Truncation flags and historical action-attempt failures are represented explicitly.

## Actions, consent and receipts

All fourteen registered categories are supported:

- `propose_task_create`, `propose_task_update`, `propose_task_complete`, `propose_task_reopen`.
- `propose_subtask_create`, `propose_subtask_update`, `propose_subtask_complete`, `propose_subtask_reopen`.
- `propose_reminder_create`, `propose_reminder_update`, `propose_reminder_cancel`.
- `propose_study_plan_create`, `propose_adaptive_replanning`, `propose_session_reschedule`.

Work reviews show complete before/changes, parent context, priority/deadline values and server-described effects. Reminder reviews include target fields, mode, effective server trigger, offset/anchor and lifecycle effects. Planning reviews display every public session, work result, exclusion, warning, classification, reason code, release/cancellation set, exact duration/shortfall and summary. Manual rescheduling prominently states that feasibility is preliminary and can fail authoritative validation. Known public fields have Ukrainian labels and date formatting; unknown valid public fields remain readable structured text. No material content is truncated, hidden in collapsed details or dumped as raw JSON.

Opening a review fetches current detail; each decision checks detail again before POST. Changed preview/state resets the review boundary rather than executing silently. Confirm/Reject are explicit separate controls. Chat text, including “yes”, never grants execution permission. All controls serialize operations and stay disabled while busy or session recovery is required.

Required consent is derived from actual type and `required_consent`. Controls start independently unchecked. Plan confirmation sends only deliberate `accept_partial: true`; adaptive replanning may additionally send independent `accept_unplaced_cancellation: true`. Ordinary Task/Subtask/Reminder/manual confirmations and all rejections send `{}`. Unknown types, incomplete reviews or unsupported consent requirements remain readable/rejectable but cannot be confirmed. No protected token, arbitrary argument, replacement interval, owner ID or status is sent.

Executed actions show their immutable server receipt, receipt-derived existing Task navigation and available schedule navigation. A replay shows the same committed result without another local success event or domain mutation. Rejection is not undo. Local time formatting uses the persisted IANA timezone; whole-second UTC values and server-provided durations remain intact. Backend progress, trigger, feasibility, allocation and lifecycle calculations are never recreated.

## Recovery and security evidence

- Existing 401 handling removes protected views; 419 exposes the shared explicit session recovery and never replays a send/decision.
- Stable `conversation_busy`, `turn_expired`, `idempotency_conflict`, stale/conflict/executed/expired action errors, validation/consent errors, limits, throttling/Retry-After, provider/unavailable/persistence failures and network interruptions are preserved and explained without comparing natural-language messages.
- Lost confirmation responses automatically trigger only safe GET reconciliation. Executed state shows the durable receipt; pending state permits a deliberate retry with the same action identity. If GET fails, decisions remain disabled until an explicit state check succeeds.
- Known stale/conflict/token/domain failures do not invent a terminal action state; they require a new proposal. Persisted planning failed-attempt metadata restores that warning when reopening history. Missing-consent validation retains the current review and allows corrected explicit consent.
- Superseded history/action reads abort; late responses and unmounted create/mutation responses cannot overwrite newer state or force navigation back.
- Public parsers discard extra/private arguments/tokens/provider state and exclude system-role messages. Action identity/conversation association and status/receipt coherence are checked. Vue interpolation renders user/AI text safely; no `v-html` or executable Markdown is used.
- Mutations after a proposal go exclusively through the AI decision API. Follow-up domain communication is read-only. Tests assert no direct Task mutation dispatch, bearer Authorization or unsupported consent flags. No browser provider secret/configuration exists.

A new regression exposed a shared `AppButton` issue: a fallthrough `disabled=false` could override its internal busy disabled attribute. `disabled` is now an explicit prop combined with `busy`, so busy always disables the button. The duplicate-confirmation test verifies this and the composable's request serialization. No tests/TypeScript rules were disabled to obtain a pass.

## Executed checks

Local runtime: Node **22.23.1**, npm **11.20.0**. No dependency installation/change was needed; package.json adds only the optional paid smoke script, and package-lock.json is unchanged.

| Exact command                                                                                                                                    | Final observed result                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run type-check`                                                                                                                             | PASS; application, configuration, unit/component and E2E TypeScript.                                                                  |
| `npm test`                                                                                                                                       | **164 tests passed in 10 files**, 5.29 seconds. Existing 81 tests plus 83 AI checks.                                                  |
| `npm run build`                                                                                                                                  | PASS; type check and Vite production build, 896 ms for Vite. AI view is a lazy chunk; initial entry is about 60 kB before gzip.       |
| `npm run test:e2e`                                                                                                                               | **22 mocked Chromium tests passed**, 21.0 seconds: existing 10 F1/F2 journeys plus 12 AI journeys.                                    |
| `npx prettier --check src tests e2e playwright*.ts package.json README.md docs/f3-verification.md`                                               | PASS.                                                                                                                                 |
| `git diff --check`                                                                                                                               | PASS.                                                                                                                                 |
| `env -u AI_LIVE_ALLOW_PAID -u AI_LIVE_STORAGE_STATE -u AI_LIVE_CONVERSATION_ID npx playwright test --config playwright.ai-live.config.ts --list` | Expected exit 1: explicit configuration refusal before browser launch/provider requests. This is a guard check, not a paid test pass. |

Additional targeted development runs included `npm test -- tests/ai-api.test.ts tests/ai-ui.test.ts`, `npm run build-only` and `npx playwright test e2e/ai.spec.ts`; the final full commands above supersede their checkpoints. Initial new-test helper typing and the busy-button failure were corrected; all final checks passed without skipped tests.

AI API tests cover envelopes, conversation/message pagination and snapshot boundaries, exact idempotent content/header/replay/conflict, action list/detail/decisions/replay, every registered review category, safe runtime narrowing and all required error families. UI/state tests cover restored/edited intents, failed Tools, truncation/events, XSS-safe text, unavailable resources, no conversational confirmation, explicit reject, all ordinary empty-body confirmations, planning consent, GET recovery, concurrency, domain refresh failures and stale request cancellation/unmounting.

Six new browser journeys run in both desktop (1440×900) and mobile (390×844) Chromium configurations:

1. Conversation creation, read-only question, keyboard composition, persisted reload, themes/navigation.
2. Task proposal, conversational “yes” without execution, explicit confirm, receipt and actual Task destination.
3. Reopened pending Reminder proposal and rejection without business mutation.
4. Interrupted confirmation, safe GET, deliberate retry and replay without duplicate execution.
5. Complete adaptive review and two independent consent flags, receipt, light/dark and no overflow at 320/390/768/1024/1440 widths.
6. Provider failure, reload without auto-send and exact original intent retry.

Browser page errors are checked; deliberately mocked HTTP/network failures are expected recovery scenarios. Chat light and adaptive review dark screenshots were generated under `test-results/`; desktop chat and mobile planning screenshots were visually inspected. This is not a Figma-frame comparison or real mobile keyboard/device test.

`.github/workflows/ci.yml` was reviewed and remains compatible: Node 24.12.0, npm ci, type check, unit tests, production build and mocked Chromium suite. Ordinary CI requires no Laravel/MySQL/OpenAI account. No hosted Actions run was triggered or claimed.

## Real integration boundary and opt-in path

**No real AI/provider requests were run.** Source-verified contracts and deterministic HTTP mocks prove frontend behavior, not model quality, billing/entitlement, provider continuation or real confirmation transactions. The previously passing F1/F2 live report is preserved. Its account-creating test was deliberately not rerun during F3; no additional real accounts or retained domain history were created or purged.

`playwright.ai-live.config.ts`, `e2e/ai-provider.live.spec.ts` and `npm run test:live:ai` provide an opt-in local paid smoke. Configuration requires all of `AI_LIVE_ALLOW_PAID=1`, an ignored operator-supplied `AI_LIVE_STORAGE_STATE` and an owned `AI_LIVE_CONVERSATION_ID`, while retaining the existing localhost-only API guard. It reuses a real authenticated session/conversation, sends one read-only question, checks completed response/reload and never creates users or confirms/rejects proposals. It appends real chat history and may incur charges. Trace capture is disabled; auth-state files under ignored `.auth/` must not be shared. README documents the exact operator procedure. Its no-opt-in refusal was verified; an actual opt-in run remains unverified.

## Changed files and remaining limits

New files: `src/api/{ai,activity,aiRefresh}.ts`, `src/types/ai.ts`, `src/utils/{ai,aiInput,aiIntent}.ts`, `src/composables/useAiConversation.ts`, `src/views/AiView.vue`, eight `src/components/ai/*.vue` components, `src/styles/ai.css`, three `tests/ai-*.test.ts` files, `tests/helpers/aiBackend.ts`, `e2e/{ai.spec,ai-provider.live.spec}.ts`, `playwright.ai-live.config.ts` and this report.

Modified: shared API client/types, auth logout cleanup, router/navigation/icon/style entry, AppButton busy handling, reusable test HTTP-header plumbing/sessionStorage isolation, package script, paid-test exclusion/auth-state ignore rules and README. No backend or historical verification files changed.

Remaining verification limits: actual paid-provider/real AI transaction execution, exact Figma frame comparison, Safari/Firefox, physical devices and deployed HTTPS/session-domain behavior. Long responses intentionally use a completed HTTP request; streaming/cancel-at-provider APIs are unavailable. Unknown future action schemas fail closed for confirmation. No conversation rename/delete/archive endpoint or full standalone Reminder/StudySession management UI is invented.

Next recommended functional milestone: a **Study Planning Workspace** for availability/preferences and StudySession viewing/lifecycle, based on the existing backend. The Assistant already reviews/executes its supported planning proposals; dedicated management views can make those resulting sessions directly manageable.
