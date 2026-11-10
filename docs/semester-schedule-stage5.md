# Stage 5 — Semester schedule frontend

Frontend baseline `c4e8a6ba7df73a9c74f7cf1b352067f8eca4533b` and backend Stage 4 `295bf5c2ff570cb93c9c6c5128149cf25fbf78d8`. The frontend uses the existing cookie session and CSRF client. The backend supplies all calendar projections, timezone offsets, conflict decisions, import operations and revision tokens.

## Routes

| Browser route                                                      | Student workflow                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `/schedule`                                                        | Choose an owned semester and view its day or week            |
| `/schedule/semesters/new`                                          | Create a semester for an existing period with an institution |
| `/schedule/semesters/:id`                                          | Review weekly rules, dated changes and protected deletions   |
| `/schedule/semesters/:id/settings`                                 | Change the group and parity configuration                    |
| `/schedule/semesters/:id/rules/new`                                | Add a weekly lesson                                          |
| `/schedule/semesters/:id/rules/:rule`                              | Edit or delete a weekly rule                                 |
| `/schedule/semesters/:id/dates/:date`                              | Edit a replacement, cancellation or working Saturday         |
| `/schedule/semester-import`                                        | Upload an XLSX with an explicit parity anchor and parity     |
| `/schedule/semester-imports/:id`                                   | Review, correct, revalidate, confirm or recover an import    |
| `/schedule/legacy`                                                 | View old dated Lessons                                       |
| `/schedule/lessons/*`, `/schedule/import`, `/schedule/imports/:id` | Existing Lesson management and legacy Excel workflows        |

The timetable supports `semester`, `date` and `view=week` query parameters. A selection made in the timetable or Dashboard is shared in memory for the signed-in session. On a fresh visit, the timetable selects the sole period covering the requested day, or the sole owned semester when there is only one. Overlapping periods require explicit selection. The Dashboard uses the selected semester or the sole semester covering today. When there is no selection and no semester covers today, it shows the labeled legacy source. The timetable and Dashboard use separate read endpoints for each source and never combine the two.

## API integration

- `src/api/semesterSchedules.ts` and `src/api/semesterScheduleImports.ts` use the shared HTTP client. `src/api/semesterPayloads.ts` validates management identities and tokens, calendar responses, the full import review and durable receipt. Empty Laravel validation bags can be either arrays or objects.
- The timetable groups returned occurrences by `occurs_on` within the server's requested range. It keys cards by `occurrence_id` and links to rule IDs or exception dates. Weekly parity labels come from weekly definitions. An occurrence is formatted in the returned timezone. Editor time inputs send local whole-second strings.
- Existing semester writes use `meta.schedule_token`. Successful writes replace the local management state. Calendar screens fetch effective dates or weeks when opened. An open date editor also refreshes the effective date after a snapshot write. A stale or uncertain write requires an explicit read and reconciliation. Weekly and semester settings submit only the edited fields. A date snapshot submits the entire independent list and retains existing child IDs where possible. For a new date, the editor reads the backend's effective base rule IDs and sends only changed/cancelled rules and added pairs.
- Working Saturday creation sends the exact date and weekday. The UI shows the source date from the selected Saturday's calendar week. Laravel copies the effective source and returns the saved snapshot, which opens in the date editor. Suppressions require a separate confirmed release and another action to create a rule.
- Import approval binds the checkbox to the currently displayed `preview_token`. A validated 409 resource replaces the review and clears consent. A failed or malformed response requires GET recovery before further actions. A commit or replay opens the timetable with the saved receipt. Before/after values and deleted rules, protected rules, preserved dates and detached references appear in the main review. Preserved dates come from the persisted preview. Snapshot kinds, when available, come from a current management read.
- Schedule deletion uses strict JSON confirmation and Laravel's dependency checks. Import history blocks deletion even when the semester is otherwise empty.

Legacy Lessons continue to supply free time, planning and AI Lesson operations. The semester UI links back to the old timetable and old Excel workflow. A lost upload response without a batch ID cannot be discovered through the current API. Another upload creates a separate review that requires its own confirmation.

## Manual browser smoke test

Use Backend Stage 4 with all three semester migrations applied to a development database and configure Sanctum/CORS as described in the [frontend README](../README.md). Start the backend and run `npm ci` and `npm run dev` in the frontend. Sign in with a development account.

1. In **Навчання**, create an institution, two short academic periods with that institution and at least two subjects. Open **Розклад → Створити семестр**, choose the first period, and enter a group, a Monday anchor and its known parity.
2. In **Керування семестром**, add two rules on the same weekday with distinct pairs and times. Add numerator and denominator alternatives on another weekday at the same pair. Open **День** and **Тиждень** and navigate to the next week. Verify pair numbers, labels and alternating subjects, then check a date outside the period.
3. Open **Замінити пару тільки на цю дату**. Edit one pair and keep the other. Save, reopen, and verify that only the selected day changed. Cancel the whole date and use **Відновити щотижневий розклад** to restore the recurring pairs.
4. Create **Робоча субота** for a Saturday in the period using a source weekday with pairs. Change its room in the date editor and verify that the source weekday and other Saturdays retain their own schedules.
5. Delete a weekly rule and check **Захищені видалені слоти**. Cancel a release dialog, then confirm a release and verify that the pair is still absent. Open the same rule in two tabs and submit competing edits to verify reload and reconciliation with the unsaved draft.
6. Open **Імпорт семестру з Excel**, choose the second period and the supported workbook linked in the form. Enter the Monday anchor and parity. Correct missing exact catalog names through the review links and revalidate. Inspect rows and operations, then open the confirmation. Change a catalog entry in a second tab before confirming to exercise the stale preview. Review the refreshed preview and confirm again.
7. Verify the saved receipt and imported week. Upload the same workbook with the same options again and verify the no-op preview and stable rule IDs. Open **Старий розклад** and **Старий імпорт Excel**, then visit the Dashboard to confirm that it labels its schedule source.

## Verification

| Check                                                                                                 | Result                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run type-check`                                                                                  | Passed                                                                                                                                                                                       |
| `npm run build`                                                                                       | Passed                                                                                                                                                                                       |
| `npm test`                                                                                            | 680 passed in 24 files                                                                                                                                                                       |
| `npm run test:e2e -- --workers=3`                                                                     | 112 passed in desktop and mobile Chromium, including WCAG axe checks and legacy regression flows                                                                                             |
| `npm run test:cross-browser -- e2e/semester-schedule.spec.ts e2e/schedule-import.spec.ts --workers=3` | 10 passed in Firefox. The 20 WebKit desktop and mobile cases stopped at browser launch. Playwright reported missing `libicu74`, `libjpeg-turbo8` and `gstreamer1.0-libav` host dependencies. |
| `npm run format:check`                                                                                | Passed                                                                                                                                                                                       |

A real Chromium smoke used Backend Stage 4, a disposable MySQL 8.4.10 instance and Sanctum cookies. It checked manual semester and rule creation, Monday–Sunday reads, a date replacement, full-date cancellation and restoration, independent working Saturday editing and protected deletion. Laravel parsed the bundled XLSX into 16 rules, resolved missing catalog records after revalidation, returned a stale preview as 409, and applied the newly confirmed preview. Both weeks returned 15 occurrences. Same-token replay returned the same receipt and identical re-upload produced 16 no-ops with stable rule IDs. Deleting an imported rule blocked the next preview. Releasing the slot left the rule absent until a new revalidation and confirmation. The legacy week remained empty throughout the semester import workflow.
