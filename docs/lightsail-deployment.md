# Automatic frontend deployment to Lightsail — Stage 20B.16A

This change prepares deployment; it does **not** configure credentials, contact the server, publish a build, or certify a production deployment. Leave `LIGHTSAIL_DEPLOY_ENABLED` unset until the setup and SSH credentials below have been reviewed. Do not run the deployment scripts from a development machine.

The destination is the independent frontend checkout at `/srv/student-ai-planner/frontend`, owned by `ubuntu`, on Ubuntu 24.04 at `63.184.35.171`. Nginx already serves its `dist` at <https://student-ai-planner.duckdns.org>. These scripts do not change Nginx, Laravel, PHP-FPM, MySQL, backend files, or the database. No service reload or sudo is needed for a release.

## Workflow and safety guarantees

`.github/workflows/ci.yml` keeps the existing verification job for pushes and pull requests. The `deploy` job requires that **all** formatting, TypeScript, unit, build, and mocked Playwright checks succeed. It additionally requires a `push` event, `refs/heads/main`, and the repository variable `LIGHTSAIL_DEPLOY_ENABLED=true`. There is no manual deployment trigger and no `pull_request_target` workflow. PR code cannot enter the deployment job or receive its production environment secrets.

The job checks out the exact tested `github.sha`, with checkout credentials persistence disabled. `scripts/deploy/ssh.sh` creates temporary private SSH files, checks the configured host key with strict verification, and sends `lightsail.sh` over SSH. It does not discover or accept new host keys on the network. Host, port, user, path, origin, and SHA are validated before use; no SSH agent is forwarded.

The server script:

1. Requires a clean frontend `main` checkout, an ignored `.deploy/` directory, existing readable untracked `.env.production`, Node **24.12+ in the 24.x line**, and a prepared `dist` symlink. Untracked files also block deployment unless intentionally ignored. It does not print the dirty file list or environment contents.
2. Takes a server `flock`, fetches `origin/main`, and rejects a superseded CI SHA or divergent/ahead server checkout. A queued older run fails safely if a newer push is already present; it never substitutes that newer commit. It updates `main` only using `git merge --ff-only` to the tested SHA. It never resets, cleans, stashes, or force-checks out files.
3. Exports that commit to temporary build storage, links the server's `.env.production` without copying it or changing permissions, and runs `npm ci --include=dev --no-audit --no-fund`, `npm run type-check`, and `npm run build-only -- --mode production`. It does not use developer `.env`, `.env.local`, or `.env.production.local` overrides; consolidate the intended production configuration in `.env.production` before enabling deployment. Vite loads it as production build configuration; do not shell-source dotenv files.
4. Builds away from the served `dist`, writes `deployed-sha.txt`, then retains the complete build at `.deploy/releases/<sha>-<timestamp>-<unique-id>/`. `umask 022` applies to code/build artifacts. The temporary build parent remains private; SSH credentials use `umask 077`. No recursive chmod touches the checkout or environment.
5. Atomically renames a new symlink over `dist`. It checks HTTPS with normal CA/hostname verification and requires HTTP 200, the exact commit marker, byte-identical SPA HTML at `/`, `/tasks`, `/planning`, `/ai`, and byte-identical JS/CSS entry assets. Requests have timeouts and limited transport retries, with no-cache headers and a commit query. Redirects are not followed. Any smoke failure or caught termination restores the previous `dist` symlink and fails the job. A process kill/power loss after activation may require operator rollback.
6. Records the preceding working build in `.deploy/previous` only after success. Logs `DEPLOYED_COMMIT` and `DEPLOYMENT_RESULT`; GitHub's job summary reports the requested SHA, result, and verified deployed SHA on success. GitHub job concurrency does not cancel an active deployment; the server lock also coordinates manual operations. GitHub can replace an older pending job with a newer one.

The server checkout can advance even when installation/build/smoke fails; the served release remains the previous build. `deployed-sha.txt` and `readlink dist` identify the live build, **not** `git rev-parse HEAD`. A later successful main push can deploy without resetting the checkout. A failed candidate release is retained for inspection, without its environment file or node_modules. Temporary source/dependencies are removed on normal completion or caught failure.

No release pruning runs automatically. Keep both the active and previous release. Monitor disk usage and remove older unreferenced releases/build leftovers manually under the same lock. Old tabs with lazily loaded assets from a prior release may need a refresh after a release switch; retained releases provide rollback but are not merged into the active asset directory.

## Required GitHub configuration

Create the GitHub environment **`production`** before enabling deployments. Restrict its deployment branches to `main`. During initial setup, configure a required reviewer if supported by the repository plan; do not approve the first deployment until the key, host fingerprint, target checkout, environment, and bootstrap have been reviewed. Keep review protection for each deployment if desired; otherwise remove it only after the initial review to permit unattended deployments after CI.

Set these **repository Actions variables** (the enable flag must be repository-scoped because it is evaluated before the environment is entered):

| Variable                   | Value                                               |
| -------------------------- | --------------------------------------------------- |
| `LIGHTSAIL_DEPLOY_ENABLED` | Leave unset/`false` during setup; later use `true`. |
| `FRONTEND_DIR`             | `/srv/student-ai-planner/frontend`                  |
| `FRONTEND_URL`             | `https://student-ai-planner.duckdns.org`            |

Set these **`production` environment Actions secrets** via GitHub Settings; never paste their values into issues, PRs, commands recorded in history, or workflow logs:

| Secret                      | Contents                                                      |
| --------------------------- | ------------------------------------------------------------- |
| `LIGHTSAIL_SSH_HOST`        | `63.184.35.171`                                               |
| `LIGHTSAIL_SSH_PORT`        | `22` (required even for the default port)                     |
| `LIGHTSAIL_SSH_USER`        | `ubuntu`                                                      |
| `LIGHTSAIL_SSH_PRIVATE_KEY` | Dedicated unencrypted OpenSSH deployment private key          |
| `LIGHTSAIL_SSH_KNOWN_HOSTS` | Independently verified known_hosts line(s) for the exact host |

Use a new dedicated Ed25519 automation key, not a personal key or the Lightsail account's shared key. Keep its private half only in approved private storage/GitHub's secret. Install the public half in `ubuntu`'s `~/.ssh/authorized_keys` with `restrict` (no forwarding/PTY), retaining existing keys and file permissions. Do not print private keys in Actions. On rotation, update the server public key and environment secret, review, then revoke the old key.

From the trusted Lightsail browser console or an independently authenticated operator session, obtain the server's host **public** key and fingerprint:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
cat /etc/ssh/ssh_host_ed25519_key.pub
```

Construct the known_hosts value as `63.184.35.171 ssh-ed25519 <verified-public-key-base64>` using that console output. For a nondefault port, use `[63.184.35.171]:<port>`. If using `ssh-keyscan` on an operator machine to collect a candidate, independently compare its fingerprint with the trusted console **before** saving it as the secret. Never accept an unverified scan or change `StrictHostKeyChecking=yes` to work around failure. A changed host key must fail until reviewed.

The server also needs **independent read-only GitHub authentication** for `git fetch origin` if the repository is private. Keep that repository deploy key on the server, configure its GitHub host key from a trusted source, and verify access as `ubuntu` without agent forwarding or prompts. The runner's inbound Lightsail key and server's outbound GitHub key are different credentials. The script does not upload a GitHub token or run `sudo git`/`sudo npm`.

## One-time server preparation (operator only, after review)

Perform these checks in an existing trusted operator session; they are not commands for Codex to execute. Use `ubuntu`, not root:

```bash
cd /srv/student-ai-planner/frontend
git branch --show-current
git status --short
git remote get-url origin
node --version
npm --version
test -r .env.production
command -v curl flock tar
```

Require `main`, a clean checkout, the correct frontend origin, Node 24.12+ available to **noninteractive** SSH commands, and sufficient disk space for `npm ci` plus multiple builds. If Node is provided by nvm, explicitly configure a noninteractive PATH or a system installation; the workflow does not source an interactive shell profile. Review `.env.production` privately: it must contain the current public HTTPS `VITE_API_BASE_URL`, not a localhost fallback or backend secrets. Preserve its current ownership/mode. Confirm that GitHub runner traffic can reach the configured SSH port using the existing network policy.

Set up release storage while preserving an existing real `dist` directory. The first conversion uses two renames and has a brief maintenance window; subsequent automated switches are atomic. Run it only once, with no other deploy/build active, in a Bash operator session. Do not rebuild in the served checkout afterward.

```bash
set -euo pipefail
umask 022
cd /srv/student-ai-planner/frontend
# Before the new .gitignore reaches the server, add a local exclusion.
git check-ignore -q .deploy/probe || printf '\n/.deploy/\n' >> "$(git rev-parse --git-path info/exclude)"
mkdir -p .deploy/releases
exec 9>.deploy/deploy.lock
flock -n 9
test -z "$(git status --porcelain --untracked-files=all)"
test ! -L dist
test -f dist/index.html
bootstrap="$PWD/.deploy/releases/bootstrap-$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$bootstrap"
test ! -e .deploy/bootstrap-link
ln -s "$bootstrap" .deploy/bootstrap-link
mv -- dist "$bootstrap"
if ! mv -Tf -- .deploy/bootstrap-link dist; then
  mv -- "$bootstrap" dist
  rm -f -- .deploy/bootstrap-link
  exit 1
fi
readlink -f dist
curl --fail --silent --show-error --proto '=https' https://student-ai-planner.duckdns.org/ > /dev/null
flock -u 9
exec 9>&-
```

If interrupted between the two renames, restore the saved `bootstrap-*` directory as `dist` or complete the symlink rename from the same operator session before enabling CI. If `dist` is already a symlink, inspect its target instead; the workflow requires a readable `index.html` inside this checkout's `.deploy/releases/`. Do not rerun the conversion blindly. The bootstrap release has no commit marker unless previously recorded.

Nginx must be able to traverse the frontend, `.deploy`, and `.deploy/releases` directories and read public artifacts. Create new release storage with `umask 022`; do not change environment/key permissions. Verify that the existing Nginx configuration permits symlinks owned by `ubuntu`; incompatible `disable_symlinks`, `open_file_cache`, routing, or HTML transformation rules will cause smoke failure and rollback. This stage does not rewrite Nginx to resolve such a failure.

Only after review: populate the secrets, set the repository variables, enable `LIGHTSAIL_DEPLOY_ENABLED=true`, and allow the next **push to main** to run CI. Merely enabling the variable does not deploy anything. Do not trigger a local SSH deployment or rerun an old CI revision that lacks the reviewed workflow.

## Verification procedure

Before enabling production, locally run:

```bash
npm ci
npm run format:check
npm run type-check
npm test
npm run build
npm run test:e2e
bash -n scripts/deploy/lightsail.sh scripts/deploy/ssh.sh
```

`tests/deployment.test.ts` uses temporary **local** Git repositories and mocks npm/build/HTTP. It exercises real fast-forward operations, archives, locking, file permissions, symlink activation, dirty/divergent/superseded checkout refusal, failed dependency/type/build steps, and HTTPS/content failure rollback. It does not use SSH credentials, contact production, or replace the hosted acceptance run.

For hosted acceptance after credential/setup review:

1. Open a PR: verify the full CI runs and deployment is skipped. In a disposable PR, make a check fail and confirm deployment remains skipped. Review the workflow's `needs: verify` gate; a failed main verification also prevents entry to deployment.
2. After an approved main push, verify the `verify` job succeeds, followed by `deploy`. Check its job summary, `DEPLOYMENT_RESULT=success`, and exact `DEPLOYED_COMMIT` against that push's SHA.
3. Read `https://student-ai-planner.duckdns.org/deployed-sha.txt?deployment=<full-sha>` and verify the exact SHA. The automated job also checks the rendered HTML and entry assets; an HTTP 200 alone is insufficient because SPA fallback can hide missing files.
4. Open the HTTPS app and refresh `/tasks`, `/planning`, `/ai`, and `/help/`. Verify updated UI, static help/assets, and no unexpected browser errors. Normal app authentication may be needed; this smoke does not execute AI actions or mutate application data.
5. Review server release ownership and the unchanged `.env.production`/Nginx configuration privately. Record the Actions run URL and deployed SHA in the stage acceptance record. Do not publish credentials, environment contents, or private response bodies.

Do not intentionally break production to demonstrate failure. The local fixture suite covers failed installs/builds/smoke checks without replacing a working site. Use a separately authorized staging setup for real fault injection. Until the first hosted run passes, the deployment outcome remains **unverified**.

## Rollback procedure (operator only)

Build/type failures leave the existing release active. Smoke failures restore it automatically and fail Actions. If SSH is lost after activation, inspect the public marker and server symlink before assuming the job's outcome describes the active site. If rollback itself fails, the log says `MANUAL_RECOVERY_REQUIRED`.

To roll back a completed release, first set `LIGHTSAIL_DEPLOY_ENABLED=false` and wait for any **running** deployment to finish. Cancel queued deployment jobs if needed. From a trusted operator session, lock and inspect the active/previous paths:

```bash
set -euo pipefail
umask 022
cd /srv/student-ai-planner/frontend
exec 9>.deploy/deploy.lock
flock -n 9
readlink -f dist
readlink -f .deploy/previous
rollback_target=$(readlink -f .deploy/previous)
[[ "$rollback_target" == "$PWD/.deploy/releases/"* ]]
test -f "$rollback_target/index.html"
test ! -e .deploy/manual-rollback-link
ln -s "$rollback_target" .deploy/manual-rollback-link
mv -Tf -- .deploy/manual-rollback-link dist
rollback_check=$(mktemp)
curl --fail --silent --show-error --proto '=https' \
  -H 'Cache-Control: no-cache' https://student-ai-planner.duckdns.org/ > "$rollback_check"
cmp -- "$rollback_target/index.html" "$rollback_check"
rm -f -- "$rollback_check"
flock -u 9
exec 9>&-
```

Review the chosen target **before** switching. If `.deploy/previous` is missing (for example, before the first successful automatic deployment), select the retained `bootstrap-*` or another known working directory explicitly and apply the same checks. Confirm the marker when available, SPA routes and assets, then record the restored release/SHA. Do not remove the active or previous releases. This procedure does not reset Git, rebuild, modify environment files, reload Nginx, or touch backend/database state.

The next successful main push would deploy the new commit again. For a lasting code rollback, review a normal Git revert on `main` through the existing process, pass CI, then re-enable deployment once authorized. Do not reset the production checkout or force-push main.

Implementation references: [GitHub deployment environments and concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments), [workflow conditions and dependencies](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [Vite production environment files](https://vite.dev/guide/env-and-mode.html).
