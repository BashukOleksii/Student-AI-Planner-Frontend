# Local full-stack setup

The Vue and Laravel repositories stay independent. Vue uses only Laravel's REST API. Laravel owns MySQL, planning, recovery and statistics. Run commands in the repository named above each block. Use `localhost` consistently for browser/API URLs; mixing `127.0.0.1` and `localhost` breaks host cookies.

## First-time prerequisites

Install PHP compatible with `composer.lock` (currently PHP 8.4.1+; verified here on 8.5.11), Composer 2, MySQL 8.x with InnoDB/performance_schema, Node `^22.18.0 || >=24.12.0`, npm and Playwright's Chromium dependencies. Required PHP extensions include `pdo_mysql`, mbstring, XML/DOM, fileinfo, GD and ZIP. MariaDB/SQLite are not substitutes for MySQL verification.

Backend:

```sh
composer install --no-interaction --prefer-dist
composer check-platform-reqs
```

Frontend:

```sh
npm ci
npx playwright install chromium
# On a supported Debian/Ubuntu host if browser libraries are absent:
npx playwright install-deps chromium
```

## Fresh disposable verification (recommended first run)

No database credentials or existing writable database are needed. The backend runner starts a new MySQL process and empty database, proves isolation, migrates, starts Laravel HTTP and Vite, executes the real-browser suite, and removes only its own private services/data afterward. Do not run as root. Ensure ports 13381, 18000 and 15173 are free. Supply the absolute path to the independent frontend repository:

```sh
# Backend repository:
scripts/testing/fullstack-disposable-mysql.sh /absolute/path/to/Student-AI-Planner-Frontend
```

The frontend path must point to this version containing `playwright.fullstack.config.ts`. This run can take up to five additional minutes because it observes an actual five-minute recovery scheduler boundary. It uses real MySQL, Laravel HTTP/cookies/CSRF, a real Vite server and Chromium. Only `LlmProvider` is replaced, at the backend test entry, with deterministic Tool selections. No paid model calls or external email occur. Mail capture lives only in the private temporary storage and is deleted on exit. The backend regression runner uses another private server:

```sh
# Backend repository, sequentially; never share a database between resetting suites:
scripts/testing/phpunit-disposable-mysql.sh --log-junit /tmp/planner-backend-tests.xml
vendor/bin/phpunit tests/Unit/SystemHarnessEntrypointTest.php
vendor/bin/pint --test
```

Frontend verification:

```sh
npm run type-check
npm run build
npm test
npm run test:e2e -- --workers=4 --retries=0
# Included in the previous suite; separate invocation is optional:
npm run test:a11y -- --retries=0
npm run format:check
```

Inspect ignored `fullstack-results/results.json`, `checks.json`, `isolation.json`, `processes.json`, migration/server/Vite logs and scheduler logs. The runner fails if its HTTP ports are occupied, initialization fails, identity differs or migrations/tests fail. Direct `npx playwright test --config playwright.fullstack.config.ts` without provisioning is deliberately blocked. Existing grant-based live suites still use their original safety rules; do not fabricate an old grant to point them at your personal database.

## First-time persistent local demonstration setup

This section creates a **new** retained local demonstration database. It does not authorize resetting an existing database. Use a unique new database/user name if the names below already exist; a CREATE failure is a reason to choose a new name, not to drop the existing one.

Start the locally installed MySQL service (Linux/systemd example):

```sh
sudo systemctl start mysqld
mysql --version
mysql --user=root --password
```

In that interactive administrative MySQL session, create the fresh schema and dedicated local account. `IDENTIFIED BY RANDOM PASSWORD` generates a credential locally; store it only in your ignored backend environment file, never in documentation or Git:

```sql
CREATE DATABASE student_planner_local_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'planner_local_demo'@'localhost' IDENTIFIED BY RANDOM PASSWORD;
GRANT ALL PRIVILEGES ON student_planner_local_demo.* TO 'planner_local_demo'@'localhost';
SELECT VERSION(), @@server_uuid, @@datadir;
SELECT COUNT(*) AS initial_tables FROM information_schema.tables WHERE table_schema = 'student_planner_local_demo';
```

Record that you created it and observed `initial_tables=0` before the first migration. No existing application schema is made disposable by its name. Check access using a password prompt:

```sh
mysql --host=127.0.0.1 --user=planner_local_demo --password student_planner_local_demo
```

Backend, once for this new demo environment:

```sh
cp .env.example .env.local-demo
${EDITOR:-vi} .env.local-demo
```

Set these non-secret settings; enter the generated database password privately into that ignored file. Configure a separate local APP_KEY once. Do not print or copy a real provider credential into frontend configuration.

```dotenv
APP_ENV=local
APP_DEBUG=false
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=student_planner_local_demo
DB_USERNAME=planner_local_demo
SESSION_DRIVER=database
SESSION_COOKIE=planner_local_demo_session
SESSION_DOMAIN=null
SESSION_SECURE_COOKIE=false
SESSION_SAME_SITE=lax
SANCTUM_STATEFUL_DOMAINS=localhost:5173,localhost:8000
CORS_ALLOWED_ORIGINS=http://localhost:5173
CACHE_STORE=database
QUEUE_CONNECTION=database
MAIL_MAILER=log
MAIL_LOG_CHANNEL=single
LOG_CHANNEL=single
LOG_LEVEL=debug
AI_PROVIDER=gemini
```

Remove duplicate assignments and ensure `DB_URL` is unset/empty. Enter `DB_PASSWORD` separately in the ignored file. In each backend terminal, avoid any shared cached configuration:

```sh
export APP_CONFIG_CACHE=/tmp/planner-local-demo-config.php
php artisan key:generate --env=local-demo
php artisan migrate:status --env=local-demo
# Only after verifying this is your newly created, authorized demo schema:
php artisan migrate --env=local-demo
```

`migrate:status` may report the absent migrations table before the first migration; that is expected. Never run `migrate:fresh`, resets or PHPUnit against this retained demonstration database. Subsequent normal migrations require the usual schema/data review. Do not regenerate its APP_KEY during routine startup.

Frontend, once:

```sh
cp .env.example .env.local
${EDITOR:-vi} .env.local
```

Set `VITE_API_BASE_URL=http://localhost:8000`. Check it matches the backend origin without an `/api` suffix. Vite environment changes require a server restart; production builds bake the URL into assets.

## Routine startup

Keep each backend command in its own terminal with the same environment selection and `APP_CONFIG_CACHE` override. Check port 8000/5173 is free first; do not stop unrelated services.

Backend HTTP:

```sh
export APP_CONFIG_CACHE=/tmp/planner-local-demo-config.php
php artisan serve --env=local-demo --host=localhost --port=8000
```

Backend Scheduler:

```sh
export APP_CONFIG_CACHE=/tmp/planner-local-demo-config.php
php artisan schedule:list --env=local-demo
php artisan schedule:work --env=local-demo
```

Backend Queue Worker:

```sh
export APP_CONFIG_CACHE=/tmp/planner-local-demo-config.php
php artisan queue:work database --env=local-demo --tries=1 --timeout=60
```

Frontend Vite:

```sh
npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173` and register a synthetic student. Recovery scans are due every five minutes and reminders every minute. Detection only creates reviews. Open Planning → Needs attention and explicitly confirm to change sessions. Reminder delivery creates in-app Inbox notifications synchronously; password reset uses the database queue. A scheduler without a worker does not process password mail.

For an explicitly authorized demo account, manual operator checks are:

```sh
php artisan learning:detect-recovery --env=local-demo --limit=10 --days=7 --user=YOUR_SYNTHETIC_USER_ID
php artisan reminders:dispatch-due --env=local-demo --limit=100
```

The reminder command scans all due candidates in its selected database. Use it only on this dedicated demo database, not a shared environment. Do not run a manual dispatcher at the same time as another scheduler during diagnosis.

## AI and safe mail

The ordinary application supports `gemini` and `openai`; there is no production `fake` provider. For deterministic integration, use the disposable runner above, which binds the controlled provider only in its private HTTP entry. Its messages use `SYSTEM_TOOL` scripts for repeatability; this proves actual server Tool orchestration, not natural-language selection by a live model.

For an independently authorized real model demonstration, privately set the appropriate key/model in `.env.local-demo` (`GEMINI_API_KEY`/`GEMINI_MODEL`, or `OPENAI_API_KEY`/`OPENAI_MODEL` and `AI_PROVIDER=openai`). Keep the configured budgets and do not enable paid smoke flags as part of routine startup. Real provider billing, entitlement and model availability were not verified in this task. Without credentials the ordinary AI UI should report safe unavailability; other planner functions remain usable.

`MAIL_MAILER=log` sends no network mail. Password reset URLs are sensitive: view only your synthetic recipient's link in local `storage/logs/laravel.log`, do not paste it into test artifacts, screenshots, reports or chat, and do not use log mail in production. A log channel above DEBUG suppresses Laravel log-mail bodies; keep DEBUG only for this private local capture. Restart Queue workers after changing mail/provider/environment settings.

## Troubleshooting

- 419: verify CSRF initialization at `/sanctum/csrf-cookie`, matching `localhost` hosts, stateful frontend port and credentials on requests. Reload/bootstrap CSRF and let the student explicitly resubmit; do not retry an uncertain mutation automatically.
- 401 after refresh: verify database session migrations, cookie domain/path, APP_KEY and selected environment. After a password reset, session revocation is expected.
- Browser CORS failure: verify exact frontend origin and `supports_credentials=true`; a wildcard credentialed origin is invalid. Requests from a disallowed origin must not receive that origin in `Access-Control-Allow-Origin`.
- Database error: check the selected server UUID, schema and account, not merely `.env` naming. The runner never falls back to port 3306. A missing MySQL binary/permission/port is a blocker; do not substitute SQLite.
- Recovery does not appear immediately: inspect Scheduler registration/cache and wait for its five-minute tick, or run the scoped manual detector on authorized data. Unknown elapsed session outcomes require a student lifecycle decision before allocation.
- No Inbox reminder: inspect due trigger/target eligibility, scheduler process and `sent` state. The recovery review feed is separate from reminder notifications.
- Password mail missing: inspect queue processing, `failed_jobs`, log transport and DEBUG level. No email delivery to an external recipient is expected here.
- 409/410: obtain a fresh review. A plan preview is time/data sensitive. For a lost confirmation response, GET the durable action/recovery receipt before considering another deliberate confirmation.

Stop your own foreground services with Ctrl+C. The disposable runner automatically removes its own database/storage; retained demo data remains for your next login.
