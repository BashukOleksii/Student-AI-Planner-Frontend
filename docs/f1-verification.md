# F1 verification — 2026-10-29

## Repository and contracts

The initial frontend was an unchanged Vue 3 / TypeScript / Vite starter, without Router, Pinia or tests. Node 22.23.1 and npm 11.20.0 were used locally; CI is configured for Node 24.12.0. The original application/build configuration was preserved and extended. Backend routes, relevant Requests/Resources, task input rules and all seven requested backend documents were inspected. The backend working tree remained clean.

Figma tools were not available. The supplied verified palette, typography, spacing and layout references were used. Browser screenshots were inspected, including desktop dashboard and mobile light dashboard/dark settings; this was not a comparison against Figma frames.

## Executed checks

| Command              | Result                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`             | Passed, 264 packages installed from lockfile.                                                                                  |
| `npm run type-check` | Passed, including application, tool configuration and test TypeScript.                                                         |
| `npm test`           | Passed: 50 tests across 5 files.                                                                                               |
| `npm run build`      | Passed, production assets generated.                                                                                           |
| `npm run test:e2e`   | Passed: 6 Chromium browser tests with deterministic HTTP mocks.                                                                |
| `npm audit fix`      | Applied compatible dependency fixes; npm reported 0 known vulnerabilities.                                                     |
| `git diff --check`   | Passed.                                                                                                                        |
| `npm run test:live`  | Failed before registration: real backend did not return an `Access-Control-Allow-Origin` header for the configured SPA origin. |

The mocked browser suite covers registration, login, refresh/session restore, dashboard, day/week schedule, create/edit/complete/reopen/delete task, modal focus/Escape, profile/timezone/theme and logout. It checks layout overflow at 320, 390, 768, 1024 and 1440px widths. It serves a fresh production build through preview at localhost:4173, separately from any existing development server.

Initial compiler/template errors and a development optimizer cache issue were resolved. All required offline checks above passed after fixes. GitHub Actions is configured; no hosted Actions run is claimed.

## Real backend attempt

An unsandboxed HTTP request reached `http://localhost:8000/api/profile`, returning **401 Unauthorized** with `Vary: Origin`, but without `Access-Control-Allow-Origin` for `Origin: http://localhost:5173`. Chromium confirmed that CORS blocked session initialization. No live account was registered and no backend repository/configuration was changed.

The separate live browser test serves local production files at the configured SPA origin and makes genuine browser fetches to Laravel. Backend responses are not intercepted; CORS and CSRF are not disabled. Configure the backend environment listed in README, clear stale backend configuration as appropriate, and rerun `npm run test:live`. A successful run creates an isolated development account, removes its tasks and logs out; no account-deletion endpoint exists.

Live Sanctum/database integration therefore remains **unverified beyond the real unauthenticated 401/CORS probe**. Tests using HTTP mocks do not establish live backend correctness.
