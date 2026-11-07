# Stage 12 — Frontend password management

## Contract and scope

Implemented against the verified contract supplied in the task for Backend commit
`00847fc910eae194c8c56f25cbde9eb74def5f64`. Backend source and GitHub were not inspected
during this implementation. All work and the implementation commit stay on `main`.
The main-only Git convention was added to `AGENTS.md` without removing existing instructions.

| Workflow        | API                                         | Frontend behavior                                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Change password | `PATCH /api/profile/password`, JSON, 200    | Separate profile form; current/new/confirmation fields; Laravel errors; confirmation check; duplicate-submit protection; clears credentials on success; preserves the current authenticated user. Session rotation and invalidation of other sessions belong to Backend. |
| Recovery        | `POST /api/auth/forgot-password`, JSON, 202 | Public email form and login link; fresh Sanctum CSRF initialization; identical Ukrainian acknowledgement for known and unknown addresses. Acceptance does not claim email delivery.                                                                                      |
| Reset           | `POST /api/auth/reset-password`, JSON, 200  | Email-link support; fresh CSRF initialization; password/confirmation fields; invalid/expired/used-token handling; success message and login navigation; clears credentials and the temporary token on success or unmount.                                                |

Password values are sent unchanged, including spaces. HTML required/minimum-length hints
and a local confirmation check improve feedback; Backend remains authoritative for password
rules, including the 72-byte UTF-8 limit. No browser hashing or security-policy duplication.
Existing field errors, loading states, HTTP error messages and `Retry-After` presentation are reused.
Network/server failures explain uncertain outcomes. No password mutation is retried automatically.

## URL and session handling

- A one-use module-memory handoff captures `token` and `email` before creating browser history
  or initializing authentication. The original query and fragment are removed with `replaceState`.
  Missing, empty or duplicate values are rejected. In-app reset navigation also strips the query
  before auth guards and supports replacing a reset link while its view is already open.
- The view consumes the handoff into local memory. Secrets never enter Pinia, localStorage,
  sessionStorage, route props, redirects or application logs. The token is only sent in the reset
  endpoint's JSON body. Leaving the page clears the handoff and local password state.
- The document declares `no-referrer` before subresources. API fetches explicitly use a sanitized
  frontend-origin referrer with `referrerPolicy: 'origin'`. This preserves Sanctum stateful-origin
  recognition for same-origin GETs while never sending the page path or query.
- Reset and recovery pages allow existing authenticated users. Ordinary login/register guards
  remain intact, and auth redirects cannot target password recovery/reset links.
- After a successful reset, the current auth store is cleared only when its user's email matches
  the reset email (case-insensitive comparison). An unrelated account remains signed in. The
  reset account is not automatically authenticated. A successful profile password change does
  not clear or log out the authenticated user.
- Existing 401 invalidation and 419 session-recovery behavior remain in use. Recovery/reset
  initialize CSRF on each explicit attempt; profile CSRF recovery never replays the mutation.

## Changed files

- `AGENTS.md`: main-only development convention.
- `index.html`: document referrer protection.
- `src/App.vue`: reset-link version used to remount the public view for a new link.
- `src/api/client.ts`: origin-only API referrer compatible with Sanctum.
- `src/api/endpoints.ts`: the three typed account API methods.
- `src/types/api.ts`: password request and JSON response types.
- `src/router/index.ts`: public routes, authenticated reset/recovery access, early query cleanup and safe redirects.
- `src/utils/passwordResetLink.ts`: temporary URL-to-view handoff and initial browser-history cleanup.
- `src/components/ui/NewPasswordFields.vue`: shared accessible password and confirmation fields.
- `src/views/LoginView.vue`: recovery navigation.
- `src/views/ProfileView.vue`: separate password-change form and mutation state.
- `src/views/ForgotPasswordView.vue`: email recovery form and generic acknowledgement.
- `src/views/ResetPasswordView.vue`: reset-link validation, reset form and session reconciliation.
- `tests/helpers/passwordBackend.ts`: shared deterministic HTTP contract fixture.
- `tests/passwords.test.ts`: eight focused integration/component tests.
- `e2e/passwords.spec.ts`: one recovery-to-login journey, run on desktop and mobile by existing projects.
- `public/help/guide/authentication.md`: recovery and reset-link instructions.
- `public/help/guide/profile.md`: password-change instructions and session policy.
- `public/help/guide/troubleshooting.md`: mail delivery, invalid links, CSRF, throttling and uncertain results.
- `public/help/guide/faq.md`: recovery availability, delivery and session questions.
- `docs/stage12/frontend-result.md`: this report.

## Verification

Targeted password tests and the representative Playwright journey were run during implementation.

| Required command       | Final result                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run format:check` | PASS                                                                                                        |
| `npm run type-check`   | PASS                                                                                                        |
| `npm test`             | PASS — 19 files, 500 tests (including 8 new password tests)                                                 |
| `npm run build`        | PASS — type checking and production Vite build                                                              |
| `npm run test:e2e`     | PASS — 80 tests, desktop and mobile, including both runs of the new recovery journey                        |
| `npm run help:smoke`   | PASS — development `/help/` and production `/planner/help/`, deep link, media, return link and mobile width |

All local Frontend CI checks passed. No local check is blocked. GitHub Actions status is unverified
because this task prohibits GitHub inspection; only a local commit was requested, so no push was made.

## Limitations and live verification

Automated tests use deterministic HTTP fixtures. No real Laravel/MySQL/SMTP integration,
outgoing email, database mutation or paid AI request was executed. Live validation of session
rotation/invalidation, real queue/mail delivery, Laravel password validation and configured
deployment origins remains pending.

The token is intentionally not recoverable after refreshing the cleaned URL: reopen the original
email link. URL cleanup cannot remove a token from the initial navigation request already
received by the hosting server; deployment access logging must handle reset URLs appropriately.
No analytics integration was added. No Backend, AI, planning, schedule, reminder or statistics
implementation was changed.

Remote GitHub Actions was not queried or triggered; local verification uses the existing Frontend
CI commands, plus the requested Docsify smoke check. No feature branch, PR or worktree was created.
