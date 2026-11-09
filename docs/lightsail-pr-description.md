# Stage 20B.16A — Deploy the frontend to Lightsail after successful main CI

Successful pushes to `main` can deploy the exact tested commit to Lightsail after the existing verification job passes. Pull requests continue to run the full CI and never enter deployment. Deployment is disabled until the repository variable `LIGHTSAIL_DEPLOY_ENABLED=true` is explicitly configured after credential and server setup review.

The runner uses temporary SSH credentials with a pinned host key and strict verification. The server refuses dirty, divergent, or superseded checkouts, fast-forwards `main`, runs `npm ci`, TypeScript validation, and a production Vite build outside the live directory using the existing `.env.production`. It atomically switches `dist` to a retained release, checks the public HTTPS commit marker, SPA HTML, and entry assets, and restores the previous release on smoke failure. Actions reports the result and deployed SHA.

Required secrets, environment/variable setup, one-time conversion of the existing `dist` directory, hosted verification, and manual rollback are documented in the [operator guide](lightsail-deployment.md). Backend, database, environment contents/permissions, and Nginx configuration are not modified. No production deployment has been executed; hosted acceptance remains pending credential review and setup.

Validation completed locally on Node 22.23.1 (a supported development version; CI/server use Node 24.12+):

- `npm ci`, formatting check, TypeScript validation, and production build passed.
- `npm test`: 664 tests passed, including 24 deployment/SSH tests with local fixtures and mocked build/HTTP/SSH.
- `npm run test:e2e`: 98 desktop/mobile browser tests passed.
- Bash syntax validation and `git diff --check` passed.
- ShellCheck and actionlint passed for the deployment scripts and CI workflow.

Operational considerations: initial release conversion requires a brief operator maintenance window; later automatic switches are atomic. Retained releases require manual disk-space management. Old open tabs may need a refresh for lazy assets. Failures can leave the Git checkout ahead of the active release, so use the public commit marker and `dist` target to identify the deployed build.
