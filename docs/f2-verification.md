# Stage F2 verification — 2026-10-29

## Repository audit and ending state

Started on branch `main`, HEAD `0d061fb070552967d5327ae329d45938ed59f80c`, with a clean working tree. The supplied starting SHA matched the actual repository. Inspected AGENTS.md, README, the historical F1 report, the existing API/types/auth/router/layout/forms/composables/tests, and the backend contracts and implementation before making changes.

Ended on the same branch and HEAD, with the F2 implementation left as uncommitted working-tree changes for review; no commit or push was requested. No dependency, lockfile, backend, database, Laravel configuration or migration changes were made. The backend working tree remained clean. The historical `docs/f1-verification.md` is unchanged.

## File inventory

New files:

- `docs/f2-verification.md`
- `e2e/academic-subtasks.spec.ts`
- `src/api/academic.ts`
- `src/api/subtasks.ts`
- `src/components/domain/AcademicForm.vue`
- `src/components/domain/SubtaskForm.vue`
- `src/components/domain/TaskSubtasks.vue`
- `src/components/ui/AppModal.vue`
- `src/composables/useSubtasks.ts`
- `src/views/AcademicView.vue`
- `tests/academic.test.ts`
- `tests/helpers/f2Backend.ts`
- `tests/helpers/renderApp.ts`
- `tests/subtasks.test.ts`

Modified files:

- `README.md`
- `e2e/core.spec.ts`
- `e2e/live.spec.ts`
- `playwright.live.config.ts`
- `src/api/endpoints.ts`
- `src/components/layout/AppNavigation.vue`
- `src/components/ui/ConfirmDialog.vue`
- `src/router/index.ts`
- `src/styles/main.css`
- `src/types/api.ts`
- `src/utils/dates.ts`
- `src/views/RegisterView.vue`
- `src/views/TaskEditorView.vue`
- `tests/dates.test.ts`
- `tests/setup.ts`
- `tests/ui.test.ts`

## Implemented functionality and routes

- `/academic` redirects to `/academic/institutions`. Four protected sections at `/academic/institutions`, `/academic/periods`, `/academic/subjects`, `/academic/teachers` provide list, fresh detail reads, create/edit and explicitly confirmed deletion, with loading/empty/error/success states.
- Academic forms support optional owned institution associations and explicit null clearing, real calendar-date period validation, equal start/end dates, nullable Subject code/color, preserved empty-versus-null code and mixed-case `#RRGGBB` color. They do not impose client-side name uniqueness; duplicate Teacher names are allowed. Backend validation and deletion guards remain authoritative.
- Existing Task Subject selectors use the same Subjects endpoint implementation; newly created Subjects appear after normal navigation/refresh. Institution deletion refreshes collections/selectors without promising cascade deletion.
- Existing `/tasks/:id` now includes ordered Subtask list/detail/create/edit/complete/reopen/delete, native confirmation dialogs and keyboard-accessible move-up/down. Displayed positions come from the server. Reorder submits the complete non-deleted ID permutation, including completed children, with no optimistic reordering and no position PATCH.
- Task progress displays `total_subtasks`, `completed_subtasks`, `progress_percent` from the dedicated server response. Null displays an explanatory label with no numeric progress bar. Every successful Subtask mutation refreshes list and progress. Parent and child lifecycle states remain independent.
- F1 login/registration/dashboard/schedule/task/profile routes and cookie authentication are preserved. Navigation now marks Academic sections and nested Task pages active, including `aria-current`.
- A live-discovered registration defect was fixed: browsers reporting `Europe/Kiev` now initialize the form with `Europe/Kyiv`. Registration timezone is editable and shows its backend validation errors so other rejected identifiers can be corrected.

## Architecture and consistency

The existing fetch client, Sanctum/XSRF behavior, Resource envelopes, Pinia auth/theme stores and `useResource` were retained. No new framework or dependencies were added.

`src/api/academic.ts` has explicit typed functions for the four existing resources, using the central client. The original F1 `subjectsApi` export delegates to its Subjects list function. `src/api/subtasks.ts` builds exact-parent nested URLs; no payload can move a child or edit positions/status. Domain inputs extend the shared `src/types/api.ts` contracts.

`AcademicView` owns its local collection/editor orchestration. `useSubtasks` owns scoped asynchronous reads, mutation state and refresh; the workspace/form components render it. Existing read cancellation suppresses late responses after navigation; mutation controllers and duplicate-submit guards prevent late UI writes and concurrent reorder/mutation intents. Mutations are not automatically retried after 401/419/409/422/network failures. Unauthenticated navigation still clears protected content through F1 auth handling.

`AppModal` provides shared native focus containment, Escape handling and focus restoration. Academic/Subtask forms explicitly focus their first input after asynchronous mounting; this corrects a failure found by the browser tests. Unsaved modal/navigation flows ask before discarding edits. Controlled delete errors now show safe Laravel field messages through the existing confirmation dialog.

Task/Subtask deadlines use the existing Temporal conversion in the persisted profile timezone, exact whole-second UTC wire values, unchanged-instant preservation, null clearing and explicit DST ambiguity/nonexistence rejection. Parent deadlines are displayed as hints; the backend validates authoritative bounds. Periods remain date-only strings, never UTC timestamps.

## Exact backend contracts consumed

Inspected `docs/academic-context.md`, `docs/auth-profile.md`, `docs/tasks.md` S1/S2/S3, `routes/api.php`, the four Academic Form Requests/Resources, Subtask Requests/Resource/controller/service/input rules, and TaskProgressResource.

| Domain                      | Consumed contract                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Institutions                | GET/POST `/api/education-institutions`, GET/PATCH/DELETE `/{id}`. `{id,name}`.                                                                                                                                                                                                  |
| Periods                     | Equivalent `/api/academic-periods` endpoints. `{id,education_institution_id,name,starts_on,ends_on}`; exact calendar dates, inclusive ordered range.                                                                                                                            |
| Subjects                    | Equivalent `/api/subjects` endpoints. Existing `{id,education_institution_id,name,code,color}` type. Codes nullable or up to 50 characters, including empty string; colors null or exact mixed-case-preserving `#RRGGBB`.                                                       |
| Teachers                    | Equivalent `/api/teachers` endpoints. `{id,education_institution_id,name}`; names may repeat.                                                                                                                                                                                   |
| Academic collections/errors | Unpaginated `{data:[]}`, backend ordering, owner-scoped detail 404, Laravel validation/dependency 422, allowed DELETE 204. No search/sort/pagination parameters added.                                                                                                          |
| Subtasks                    | GET/POST `/api/tasks/{task}/subtasks`; GET/PATCH/DELETE `/{subtask}`; POST `/{subtask}/complete` and `/{subtask}/reopen`. Writes allow only title, description, estimated_minutes, deadline_at. Read-only id/task_id/position/status/completed_at are never submitted by forms. |
| Reorder                     | POST `/api/tasks/{task}/subtasks/reorder`, `{subtask_ids: integer[]}` containing the complete active set; response is ordered `{data:Subtask[]}`.                                                                                                                               |
| Progress                    | GET `/api/tasks/{task}/progress`: `{data:{task_id,total_subtasks,completed_subtasks,progress_percent:number                                                                                                                                                                     | null}}`. No frontend progress calculation. |

Institution/Subject uniqueness, Period `(user_id,name,starts_on)` uniqueness and all ownership/deletion/dependency rules remain backend-controlled. No frontend cascade or StudySession/Reminder synchronization was implemented.

## Executed verification

| Command              | Actual result                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`             | PASS; installed 264 packages from the unchanged lockfile, npm reported 0 vulnerabilities.                                       |
| `npm run type-check` | PASS, including app, tooling and tests.                                                                                         |
| `npm test`           | PASS: **81 tests in 7 files** (50 preserved F1 tests plus 31 F2/regression cases).                                              |
| `npm run build`      | PASS; production bundle generated.                                                                                              |
| `npm run test:e2e`   | PASS: **10 Chromium tests**, five scenarios each in desktop and mobile configurations.                                          |
| `git diff --check`   | PASS.                                                                                                                           |
| `npm run test:live`  | **BLOCKED by backend infrastructure**, with a real failing registration response described below. Not counted as a passed test. |

Mocked tests cover all four Academic CRUD flows, owned selectors/null associations, dates, code/color, duplicate-name errors, permitted duplicate Teachers, dependency refusal, updated Task selectors, Subtask CRUD/lifecycle/permutation/cancellation/validation/busy states, exact nested endpoints and server-derived null/partial/full progress. F1 cookie/XSRF/error/no-retry tests continue to pass. Browser tests cover actual focus, Escape, keyboard reordering, light/dark themes, no unhandled page errors and overflow at 320/390/768/1024/1440px.

An initial browser run found two failures in asynchronous modal autofocus. Explicit input focus fixed them, and the full suite subsequently passed. CI remains configured for `npm ci`, type checking, Vitest, production build and the full mocked Playwright suite on Node 24.12.0. No hosted Actions run is claimed.

## Real Laravel integration closure: BLOCKED

Only the confirmed local development API at `http://localhost:8000` was contacted. No Laravel responses were mocked in the live suite. It serves only local built frontend assets at `http://localhost:5173`; browser CORS, stateful sessions, cookies and CSRF remain enabled. The live configuration rejects a non-local API origin before opening a browser.

The actual diagnostic sequence was:

1. GET `/api/profile` returned **401**, `Access-Control-Allow-Origin: http://localhost:5173`, and `Access-Control-Allow-Credentials: true`. The previous F1 CORS probe blocker is resolved for this origin.
2. The original live browser flow obtained CSRF cookies and reached POST `/api/auth/register`; it returned **422** under `timezone` because Chromium reported `Europe/Kiev`. This was a verified frontend defect and was fixed with the tested alias handling and editable field.
3. The subsequent real POST `/api/auth/register` returned **500**, `Illuminate\Database\QueryException`, **SQLSTATE[42S22] / Unknown column 'timezone' in 'field list'**. The local users schema lacks the backend contract's `timezone` column. The final opt-in test reports this as BLOCKED backend infrastructure and stops before authenticated F1/F2 actions.

This is a database/migration-state problem, not evidence of failed cookie/CSRF implementation or remaining CORS rejection on this request. Apply the backend's existing migrations using its own documented development setup, outside the frontend task, then rerun `npm run test:live`. Backend files, migration definitions, configuration, database schema and security contracts were not changed here.

Full browser registration, session restoration, authenticated reads/writes, logout/login and F2 live operations therefore remain **unverified**. The live suite is extended to cover these flows, but coverage in a test file is not a passing execution. No account was created by the failed registrations. On a successful future run, it creates a unique development test account, deletes its domain fixtures and logs out; the account itself remains because no account-deletion API exists. Never run it against production or reuse an existing user's account.

## Visual limits, deliberate deferrals and next milestone

Figma tools were unavailable. The established F1 Academic Minimalism tokens, Manrope, shadow-free borders, desktop sidebar and mobile bottom navigation were retained. Desktop/mobile Academic light and Subtask dark browser screenshots were inspected. No frame comparison or pixel-perfect claim is made. Chromium mobile emulation is not physical-device or Safari/Firefox verification.

No AI chat/orchestration, proposal confirmations, Excel import, lesson CRUD, automatic planning, reminders/delivery or complex reports were added. The next coherent milestone after fixing the local migration state is an AI assistant interface for backend read tools and explicit, reviewed action confirmation.
