# Academic demonstration scenario

Use the actual Vue application and Laravel API. Prepare a dedicated, explicitly authorized demo account and nonvaluable data. Keep credentials outside Git. Never reset a shared database. Record the frontend/backend commits and timezone before the demonstration.

## Preparation

Start Laravel/MySQL with existing migrations applied by the operator and the frontend on localhost:5173. Verify localhost:8000, Sanctum/CORS, and the saved Europe/Kyiv timezone. Use the supported XLSX example only; arbitrary spreadsheets are not accepted. Prepare a past eligible study session if demonstrating completion/actual minutes, and future pending work for planning. The guarded live harness in f7-verification.md is optional and retains its fixture history.

## Walkthrough

1. Log in, reload and explain session restoration. Show profile/timezone and the two themes.
2. Create an institution, academic period, subject and teacher. Explain owner-scoped API validation.
3. Create a lesson, open details and show effective day/week schedule. Demonstrate replacement/cancellation only on designated demo records.
4. Upload the supported workbook. Show persisted errors, correct exact academic names, return and revalidate. Review operations before explicitly committing. Explain that duplicate/noop is different from creation and that import does not replace the whole semester.
5. Create a task and subtasks, reorder them and show server-derived progress. Completing a child does not complete its parent.
6. Save nullable planning preferences, add local weekly availability, and query free slots. Preview a plan; inspect warnings and partial allocation. Deliberately choose required consent and confirm. Open the actual persisted sessions.
7. Show manual rescheduling and adaptive preview on designated sessions. Explain cancellation consequences and independent consents. Direct tokens have different recovery semantics from durable AI action receipts.
8. Create absolute and relative reminders. Change an eligible deadline and refresh the reminder to show the server-resolved trigger. Explain that delivery requires the Laravel scheduler. Show a previously dispatched inbox item, mark it read, and open its target.
9. Show Progress, daily zero-activity buckets and equal-length comparison periods. Distinguish current lifetime work counts from period completions; unknown actual minutes are not zero. Increased activity is not automatically improved performance.
10. With separate paid-provider authorization, ask a read-only AI question. Show persisted history and safe Tool summaries. Request a proposal, inspect its current action review, then explicitly confirm or reject. Chat text alone never authorizes execution. Without provider access, show the real unavailable state and existing persisted history; identify mocked test evidence separately.
11. Log out and demonstrate protected-route rejection.

## Architecture explanation

Vue owns interaction, safe transport, accessible review and presentation. Laravel Policies own authorization; Services own deterministic planning, conflict checks, lifecycle synchronization, delivery and statistics. The AI orchestrator selects registered backend Tools; it cannot bypass explicit action confirmation. Persistent receipts establish what was committed even if the network response was lost.

## Failure plan

Keep the verification report available. If Laravel is unavailable, show the retry/error state and explain the external dependency rather than fabricating success. If a commit response is interrupted, inspect current persisted state before further action. If the scheduler is unavailable, show scheduled reminders and explain why no delivered notification exists. If the provider is unavailable, demonstrate the independently functioning academic/planning modules. Never run database resets, dispatch commands or paid calls as an unapproved recovery shortcut.
