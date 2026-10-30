# Deployment readiness

F7 prepares deployment; no production deployment was performed. These are operator recommendations, not a verified hosted configuration.

## Topology and build

Use same-site HTTPS hosts, for example `https://app.example.edu` (static Vue application) and `https://api.example.edu` (Laravel public directory). Independent unrelated domains can encounter third-party cookie restrictions and are not the recommended Sanctum deployment.

Use Node matching package.json (`^22.18.0 || >=24.12.0`), `npm ci`, `npm run type-check`, `npm test`, and `npm run build`. Set `VITE_API_BASE_URL=https://api.example.edu` **before** building. Vite variables are public bundle configuration: never put credentials, APP_KEY, database passwords or provider keys in them. Publish only `dist/`.

Serve history routes through index.html. Example nginx location rules inside the HTTPS frontend server:

```nginx
root /srv/student-planner/dist;
location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
}
```

Missing assets must return 404 rather than HTML. Deploy immutable release directories and switch atomically. Keep the preceding bundle for rollback. API origin changes require a rebuild. Test direct navigation to /tasks, /ai and /planning after deployment.

## Laravel prerequisites

Provision the PHP/extensions and Composer versions required by the backend composer.lock, MySQL, writable Laravel storage/cache directories, and a private APP_KEY. Serve only Laravel public/, never its repository root. Database credentials and OpenAI configuration remain backend secrets. An operator must back up the database and review/run the existing migrations for the intended database; the frontend does not run migrations or reset data.

Illustrative backend configuration (replace all example domains):

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.edu
SANCTUM_STATEFUL_DOMAINS=app.example.edu,api.example.edu
CORS_ALLOWED_ORIGINS=https://app.example.edu
SESSION_DRIVER=database
SESSION_DOMAIN=.example.edu
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
```

Confirm the actual backend config reads these variables before applying them. Allow credentialed CORS only for the explicit frontend origin. Sanctum stateful entries are hosts/ports, without schemes; CORS entries include schemes. The shared cookie domain permits the frontend to read the XSRF cookie while the session cookie remains HttpOnly. Both hosts must use HTTPS. Configure trusted proxies narrowly so Laravel correctly detects HTTPS. Check effective cached configuration after release; never expose configuration diagnostics publicly.

Verify GET /sanctum/csrf-cookie, decoded X-XSRF-TOKEN on mutations, login, profile, refresh and logout in a real browser. Do not use wildcard credentialed CORS or bearer tokens as a workaround. Local development uses localhost consistently, secure cookies false, and ports 5173/8000; those settings are not a production recipe.

## Scheduler and external services

Run Laravel's existing scheduler using the backend's documented cron/service configuration (typically `php artisan schedule:run` every minute), with the correct release directory, service user and environment. Inspect routes/console.php for the registered reminder command and locking schedule. Do not run a second ad-hoc dispatcher against shared data. Monitor command failures and clock synchronization. A scheduled reminder, a sent reminder, a persisted inbox notification and a read notification are distinct states. The browser never delivers reminders.

AI requires backend provider credentials and billing availability. Keep paid smoke testing opt-in. The rest of the application and deterministic CI do not require OpenAI.

## Release verification and rollback

1. Run offline CI and review its artifacts.
2. Validate DNS, TLS, proxy headers, exact CORS/stateful hosts and cookies.
3. Use an explicitly authorized isolated account for live mutations; follow docs/f7-verification.md.
4. Verify SPA refresh, static assets, CSRF, session restoration, schedule, reports and scheduler behavior independently.
5. Retain database backups and both frontend/backend release identifiers. Roll back compatible application releases together; do not automatically reverse migrations or erase committed study history.

401 usually requires a valid login/stateful session; 419 requires inspection of CSRF/cookie/domain/HTTPS configuration without automatic mutation replay. A CORS failure requires the exact Origin/allowlist and credentials configuration. Empty inboxes can mean no dispatched reminders. AI provider failure is separate from authentication. Never publish cookies, storage-state artifacts, uploaded server paths or exception traces while diagnosing failures.
