# Stage F5 — Schedule Management and Excel Import

Verification date: **2026-10-30**. Frontend behavior is verified with deterministic HTTP contracts. Real Laravel XLSX parsing/commit is a separate, unexecuted boundary in this milestone.

## Audit and repository state

Started with a clean working tree on `main`, HEAD **b9f47a4e69590230397da44c0993ee6fa937c1d8** (`Add next step`). F1–F4 were committed. Read AGENTS.md and inspected Schedule rendering/API/types, Academic CRUD/selectors, auth/client, router, date utilities, layout/theme/UI components, tests/helpers, Playwright/live configuration, CI and verification history. Preserved the existing Vue/Vite/Pinia/router architecture and dependencies.

Inspected backend `docs/schedule.md`, academic-context, auth-profile, planning-settings/foundation, study-plan-persistence, frontend-api-contract and architecture references. Checked actual routes, LessonController, SaveLessonRequest, LessonResource/ScheduleLessonResource, LessonService/Policy, ScheduleImportController, StoreScheduleImportRequest, Batch/Row Resources/Policy, PreviewService, PreviewRevalidator, CommitService and existing preview/revalidation/commit tests. In particular, backend tests confirm `data.rows` is a plain nested array, not `{data: [...]}`.

Figma inspection tools were unavailable. Existing verified Academic Minimalism tokens, Manrope, thin borders, shadow-free surfaces, sidebar/mobile navigation and light/dark themes were reused. Browser screenshots were inspected; no original-frame comparison or pixel-perfect parity is claimed.

Ending branch/HEAD remain unchanged, with the implementation left unstaged and uncommitted. No push/commit was requested. Backend working tree remained clean. No backend source, config, migration or schema change, database reset, account creation, unrelated-data mutation or paid AI inference was performed. Historical F1–F4 documents are unchanged.

## Routes and functionality

| Route                               | Behavior                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/schedule`                         | Preserved effective today/date/week viewing/navigation; new Add Lesson/Import links and detail links. Accepts a validated local-calendar `date` return query. |
| `/schedule/lessons/new`             | Create using owned required Subject, optional Teacher/Period, supported type, room and local times.                                                           |
| `/schedule/lessons/:id`             | Detail/lifecycle/original/replacement display, cancellation and deletion confirmations.                                                                       |
| `/schedule/lessons/:id/edit`        | Partial PATCH with explicit nullable clearing and exact UTC preservation.                                                                                     |
| `/schedule/lessons/:id/replacement` | Dedicated original-Lesson replacement operation, distinct from ordinary creation.                                                                             |
| `/schedule/import`                  | Supported format explanation, real example download, owned period/File selection and upload.                                                                  |
| `/schedule/imports/:id`             | Reloadable persisted snapshot, all counters/rows/errors/provenance, reference correction, explicit revalidation, confirmation and recovery.                   |

All routes inherit existing cookie-session bootstrap/guards. No Lesson index, import-batch list/cancel/delete, arbitrary row mapping, semester replacement or hidden import-history cache was invented.

### Manual Lesson lifecycle

- Detail and effective Schedule Resources have separate contracts. `types/lessons.ts` reuses the existing LessonType union without duplicating Schedule presentation fields.
- Required Subject and seven types match Laravel. Teacher/Period/room remain nullable. Owned catalog lists use existing Academic APIs through `useLessonCatalog`; failures/retries are independent, optional associations remain optional and masked/null references never expose foreign data.
- Local inputs use persisted profile timezone and existing Temporal conversion. Changed gap/fold times are rejected. Unchanged UTC instants retain exact seconds even in a repeated local hour. Only changed fields enter PATCH; status and replacement links never enter editable payloads.
- Cancellation requires confirmation and uses `/cancel`. Replacement uses `/replacement`, explains original retirement and rejects unsupported chains through server validation. An original with a current replacement has no direct-delete control.
- Deletion is soft deletion. The replacement-delete dialog explains possible original restoration and transactional conflict refusal. Returned 204 is handled without JSON parsing. Known original/detail links and refreshed effective Schedule reads show the server result.
- Backend 422 association/schedule/status/replacement errors are visible. No overlap or restoration/conflict calculation exists in production TypeScript. Uncertain editor saves are blocked from blind resubmission; uncertain lifecycle operations refresh detail and direct the user to inspect current Schedule/history.

### XLSX preview and reference correction

- Upload sends exactly FormData `academic_period_id` and actual File `schedule_file`; no owner/timezone/options. Local extension/nonempty/5120-KiB checks improve feedback; server MIME/extension/owned-period validation stays authoritative.
- A persisted HTTP 201 can mean uploaded, validated or failed. Failed processing text and zero counters/rows remain a failed result, with no commit or revalidation control. Cancelled/committed states are recognized as read-only history here.
- The full preview displays server counters and every occurrence, including valid/invalid/duplicate status separately from create/update/restore/preserve/noop operation. It includes group/date/weekday/pair/parity, imported names/IDs, room/technical type, original local labels, preserved UTC strings, current-profile-zone display, workbook/occurrence worksheet/ranges/rows, errors and matched Lesson links.
- Invalid stored UTC text remains visible with a safe invalid-time label; no Date formatting crash or silent normalization. Public runtime narrowing excludes internal fingerprints/hashes/owner/storage paths.
- Exact-name missing/ambiguous references link into existing Academic sections. A strictly positive numeric `import_batch` query carries only the contextual return ID across sections. No preview/file/credential is stored. Changes to catalogs do not silently edit the preview.
- Revalidation explicitly replaces the returned snapshot/counters/operations and never creates Lessons or commits automatically. Existing concrete dates are not rematerialized after period/timezone edits; another expansion requires another upload. Existing owned mappings may survive renaming, according to the backend contract.

### Commit, conflict and uncertain delivery

- Only validated/no-invalid-row state offers the confirmation dialog. It shows identity, file, period, counters and material-operation consequences, and requires an initially unchecked review acknowledgment. All public rows remain visible in the full review before this decision.
- Commit has no business body. Laravel revalidates and atomically applies its protected current snapshot; no rows/fingerprints/override arguments are reconstructed by the browser.
- Successful response replaces preview state with committed history and actual timestamp/counters/operations. Duplicate/noop does not imply creation; preserve does not imply update. The API's committed replay returns history without another mutation, and reopening a committed view performs reads only.
- Changed-preview 409 data is retained as unknown in the central ApiError, then narrowed by the import API with an expected Batch ID. Typed `ImportPreviewChanged` replaces all stale counters/rows, closes the old dialog, resets consent, explains the changed outcome and requires a new explicit decision. Malformed/missing/foreign-ID conflict data cannot be rendered; safe current GET reconciliation is used instead.
- Lost/network/5xx commit responses do not imply rollback. One safe GET inspects the same Batch identity. Committed state displays stored history; uploaded/validated state requires another deliberate review. Failed GET leaves decisions disabled until successful explicit recovery. No mutation retries run automatically.
- A lost upload response before receiving the new ID cannot be automatically rediscovered: there is no batch index endpoint. The UI blocks blind repeat, explains that a new upload creates another preview, and preserves known-ID direct navigation. This is an API limitation rather than a fake recovery feature.

## Exact endpoints and integration

| Method    | Existing endpoint                                     | Result                                                               |
| --------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| POST      | `/api/lessons`                                        | 201 Lesson detail Resource                                           |
| GET/PATCH | `/api/lessons/{id}`                                   | 200 Lesson detail Resource                                           |
| DELETE    | `/api/lessons/{id}`                                   | 204                                                                  |
| POST      | `/api/lessons/{id}/cancel`                            | 200 detail                                                           |
| POST      | `/api/lessons/{id}/replacement`                       | 201 detail of replacement                                            |
| GET       | `/api/schedule/today`, `/date/{date}`, `/week/{date}` | Effective Schedule with timezone/range meta                          |
| POST      | `/api/schedule-imports`                               | Multipart; 201 persisted Batch, including possible failed processing |
| GET       | `/api/schedule-imports/{id}`                          | 200 persisted Batch/ordered Row array                                |
| POST      | `/api/schedule-imports/{id}/revalidate`               | 200 refreshed snapshot, no business body                             |
| POST      | `/api/schedule-imports/{id}/commit`                   | 200 committed/history or 409 refreshed review, no business body      |

Existing Academic APIs provide selectors and correction CRUD. Accepted Lesson/import operations trigger current effective-day reads; Schedule, Dashboard, Planning/free-time and AI destination views retain route-level current reads, with no duplicated cross-page schedule engine/store. AI Tool/confirmation logic is unchanged.

## Architecture and changed files

- `src/api/client.ts`: minimal FormData transport branch; no manual Content-Type/boundary; unknown structured 409 data retained without rendering raw messages/bodies. Cookies, decoded CSRF, JSON behavior, cancellation, 204 and no automatic retries remain intact.
- `src/api/lessons.ts`, `src/types/lessons.ts`: supported editable/detail contracts and dedicated mutation endpoints.
- `src/api/scheduleImports.ts`, `src/types/scheduleImport.ts`: strict public Resource narrowing, multipart construction, scoped reads and typed changed-preview error.
- `src/components/schedule/`: LessonForm, supported-format guidance, Batch summary and responsive complete Row cards. Presentational components contain no requests.
- `src/composables/useLessonCatalog.ts`: existing abortable owned Subject/Teacher/Period reads.
- `src/views/LessonEditorView.vue`, `LessonDetailView.vue`, `ScheduleImportView.vue`, `ScheduleImportDetailView.vue`: focused local orchestration, serial mutations, safe recovery and unmount guards.
- `src/utils/lessons.ts`, `scheduleImport.ts`: labels, file/context validation and safe display only, with existing timezone conversion reused.
- Existing router/Schedule/LessonCard/AcademicView/main styles integration. Academic return IDs are validated and no arbitrary redirect path is accepted.
- `tests/helpers/renderApp.ts`: accepts FormData in deterministic HTTP mocks while retaining previous JSON behavior.
- `tests/helpers/scheduleBackend.ts`, `tests/schedule.test.ts`, `e2e/schedule-import.spec.ts`: contract fixtures and new coverage.
- `public/examples/schedule-example.xlsx`: unmodified existing backend fixture, plus README and this report.

The example is 16,290 bytes; both source and frontend copy have SHA-256 `278fcd21f10da37f9eededdccf638e041236fb1c61e0c7a37a329aee59a4ddc9`. This verifies asset-copy integrity only, not import identity. No browser hashing/fingerprint implementation exists. The backend fixture documents 16 weekly rules; frontend never parses them.

No dependencies, second transport/auth client, generic CRUD framework, spreadsheet library, parser, recurrence expansion, fuzzy matcher, identity/fingerprint generator, reconciliation algorithm or new global store was added.

## Test evidence

Final commands ran sequentially as `npm run type-check && npm test && npm run build && npm run test:e2e` and exited 0. Intermediate issues were fixed without removing existing assertions or weakening TypeScript. Changed text files were formatted and checked with Prettier; the binary XLSX was excluded. No unrelated starter configuration formatting was changed.

| Command                           | Final result                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run type-check`              | **PASS**, exit 0.                                                      |
| `npm test`                        | **PASS**, 283 tests in 12 files, 6.95 s; 70 new F5 tests.              |
| `npm run build`                   | **PASS**, type checking and Vite production build, exit 0.             |
| `npm run test:e2e`                | **PASS**, 32/32 Chromium tests (16 journeys × desktop/mobile), 27.3 s. |
| Changed-file Prettier write/check | **PASS**, all changed text files; XLSX excluded as binary.             |
| `git diff --check`                | **PASS**, exit 0.                                                      |

F5 adds **70** unit/component/contract tests to the existing 213, covering paths/methods/Resources/204, FormData File/fields/headers/credentials, 401/419/422/5xx without retry, exact UTC, two IANA zones, DST gaps/folds and unchanged instants, nullable fields, seven types, create/edit/cancel/replace/delete/restoration, errors, every import operation/status, missing/ambiguous references, provenance/safe text, academic return navigation, revalidation transitions, explicit commit/review reset/duplicate clicks, refreshed 409, uncertain GET recovery, committed replay history, empty previews and missing/foreign batches.

F5 adds **three journeys × desktop/mobile**, taking Chromium coverage from 26 to **32 tests**. Journeys cover login/reload restoration; manual Lesson lifecycle and effective visibility; actual local File selection and multipart metadata; missing Subject/Teacher correction via Academic CRUD; return/revalidation/duplicates/explicit commit; updated Schedule; stale 409 re-review followed by lost-response recovery; keyboard Escape and Space, themes, widths 320/390/768/1024/1440, and unhandled browser errors/overflow. F5 browser timezone is explicitly UTC while the profile remains Europe/Kyiv.

Browser transport verification checks the real selected fixture bytes, ZIP magic and two FormData keys in a test-only wrapper which forwards to unchanged native fetch. Chromium's `Network.getRequestPostData` omits file bytes from multipart requests (verified in installed Playwright `protocol.d.ts`); route-level assertions separately check multipart Content-Type, period/File metadata and decoded CSRF. The HTTP response mocks do not parse XLSX or demonstrate real transactions.

Intermediate tests caught a new Lesson editor's leave guard blocking its own successful navigation; saved-state navigation now bypasses the busy guard. Review also added cross-date replacement restoration coverage: both effective days are refreshed, and return navigation follows the restored original date. Tests also needed to await lazy route imports. The first full E2E attempt had 30 passes and two file-byte inspection failures due to the Chromium interception limitation above; byte assertions were retained at the actual browser FormData boundary and the subsequent full run passed. No old tests were weakened.

CI was inspected: Node 24.12.0, npm ci, type check, unit tests, build and mocked Chromium with failure artifacts remain sufficient. No Laravel/MySQL/OpenAI dependency was added to ordinary CI. A hosted Actions run was not executed or claimed.

## Live boundary, limitations and next milestone

**F5 real Laravel import/lifecycle smoke: NOT RUN.** No confirmed isolated development/test account and database was explicitly configured for these persistent mutations. No workbook was uploaded/committed to a real API and no extra test account was created. This is a safety/configuration boundary, not a claim that Laravel was unavailable. Existing F1/F2 successful live history and F4's unverified live boundary remain unchanged. Paid AI inference was not run.

Deterministic frontend tests and actual backend source establish contract compatibility, not real PHP parsing, MySQL ownership/transactions/locks or browser-to-Laravel upload success. A prepared isolated account using the supplied supported workbook should be the next live smoke. Original Figma comparison, Safari/Firefox and physical-device checks remain unverified. Very large previews render all rows without virtualization; no rows are silently truncated.

Deliberate backend-limited omissions: general Lesson/import indexes, full historical collections, batch cancel/delete, row mappings, arbitrary-layout editing, fuzzy resolution and whole-semester replacement. They are not fake UI capabilities.

Recommended next major functional milestone: **Reminders and Notification Inbox Workspace**, using existing Task/Subtask/StudySession anchor and delivery/history contracts. Run isolated F4/F5 real integration verification when an operator supplies the safe environment.
