# Операційна перевірка та межі доказів

[Зміст](README.md) · [Фінальна оцінка](final-assessment.md)

## Ідентичність та безпечний обсяг

Дата запуску — 02.11.2026. Стартові checkout HEAD: Frontend `469d7e96abb0d90a80cdba377f83f8e6bb4a8081`, Backend `f618bba290f919dc3561b0462c59b3b86ade82d8`. Обидва збігаються з операторськими SHA. Backend початково чистий. Frontend мав лише операторський untracked `Stage10_Requirements_Source_Bundle.md`; його не переміщували та не редагували.

Файл скопійовано byte-for-byte в `docs/requirements/Stage10_Requirements_Source_Bundle.md`. SHA256 оригіналу і копії: `e9c88afdca31a8e6b73f140f516f0432eea4236d8df9916ab8bb6415cbbca24f`. `.prettierignore` виключає тільки цю дослівну копію: це зберігає вихідний текст і line references, не вимикає форматування application/tests/іншої документації.

Нова перевірка використовує локальний checkout, mock browser transport і DB-free PHPUnit Unit. `php artisan route:list --path=api --json` лише інвентаризує routes; не запускає dispatcher. Не запускали Feature suite з RefreshDatabase/DatabaseTruncation на наявній локальній БД; назва `student_planner_testing` сама по собі не є дозволом її очищати. Без дозволу не змінювали backend routes/Services/migrations/configuration, live safety, grants або credentials.

## Поточні локальні виконання

Підсумкові exit codes і counts зафіксовано в [verification-results.json](evidence/verification-results.json).

| Команда                                                                                                         | Результат                                                                       | Тип доказу / журнал                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `php artisan route:list --path=api --json`                                                                      | exit 0; 90 application routes                                                   | Runtime route enumeration, [snapshot](evidence/api-routes.json)                                            |
| `vendor/bin/phpunit --testsuite Unit --do-not-cache-result` у backend                                           | exit 0; 2084 passed, 6273 assertions                                            | Pure/mocked deterministic Services/protocol; `/tmp/stage10-backend-unit.log`; не DB/persistence acceptance |
| `npm test -- tests/ui.test.ts` до fix                                                                           | exit 1; 6 нових regressions failed, 15 existing passed                          | `/tmp/stage10-targeted-before.log`; підтвердження G1–G3                                                    |
| Та сама targeted команда після fix                                                                              | exit 0; 21 passed                                                               | `/tmp/stage10-targeted-after.log`                                                                          |
| `npx playwright test e2e/tasks-coverage.spec.ts --workers=2 --retries=0 --output=test-results/stage10-targeted` | exit 0; 4 passed                                                                | Desktop/mobile Chromium; `/tmp/stage10-e2e-targeted.log`                                                   |
| `npm run type-check`                                                                                            | exit 0                                                                          | `/tmp/stage10-types.log`                                                                                   |
| `npm test`                                                                                                      | exit 0; **388 passed / 14 files**                                               | `/tmp/stage10-unit.log`                                                                                    |
| `npm run build`                                                                                                 | exit 0                                                                          | Type checking + production Vite bundle; `/tmp/stage10-build.log`                                           |
| `npm run test:e2e -- --workers=4 --retries=0 --output=test-results/stage10-chromium-final`                      | exit 0; **58 passed**, no retries                                               | Повна Chromium desktop/mobile регресія включно з axe/keyboard; `/tmp/stage10-chromium.log`                 |
| `npm run test:cross-browser -- --retries=0 --output=test-results/stage10-cross-browser`                         | exit 1; **29 Firefox passed**, 58 WebKit launch failures (BLOCKED dependencies) | Firefox/WebKit/WebKit mobile, не native Safari; `/tmp/stage10-cross-browser.log`                           |
| `npm run format:check`                                                                                          | exit 0                                                                          | Після остаточної документації; `/tmp/stage10-format.log`                                                   |
| `git diff --check`                                                                                              | exit 0                                                                          | Перевірка whitespace                                                                                       |

Перший повний Chromium run повернув exit 1 (57 passed / 1 overflow failure) у `core pages fit compact and intermediate widths`. Після виправлення CSS targeted responsive прогін — exit 0, 6 passed; фінальний full прогін — exit 0, 58 passed. Первинний лог збережено окремо як `/tmp/stage10-chromium-initial.log`; фінальний — `/tmp/stage10-chromium.log`. Build повторено після CSS-зміни, він завершився exit 0.

Build/TypeScript перевіряють також API/test contracts. Команди не повторюються після успішного результату без нової зміни чи конкретної причини. Самостійний `test:a11y` не дублюється: full browser suite вже містить `e2e/audit.spec.ts` у light/dark; manual screen reader/native devices/реальний UI zoom не проводилися. Нові tests перевіряють змістовні наслідки: доступність решти списку, UTC filter contract, збереження draft і відсутність дубля mutation при lost response.

Повна cross-browser команда фактично виконана, exit **1**: **29 Firefox passed**, **58 WebKit/WebKit-mobile launch failures** до завантаження сторінок. Playwright повідомив відсутні host dependencies `libicu74`, `libjpeg-turbo8`, `gstreamer1.0-libav` на Fedora 44. Це **BLOCKED WebKit runtime**, не пройдені assertions і не підтверджений product regression. Dependency validation не вимикали, несумісні library symlinks не створювали, system packages не змінювали. Історичний Stage 8 WebKit PASS не приписано новому коду. Потрібен підтримуваний Playwright runtime/CI image з бібліотеками для повтору лише заблокованих WebKit projects; Firefox повторювати без причини не потрібно.

## Повторно використані докази реального Laravel/MySQL

Джерело — [Stage 8 final live acceptance](../f8-live-acceptance.md), останній фінальний запис перед історичними appendices. Це **історичний PASS незміненого backend**, а не нові Stage 10 операції.

| Сценарій                                         | Доказ Stage 8                                                                   | Чого цей доказ не підтверджує                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Auth/register/login/profile/refresh/logout, CSRF | Dedicated user 1; genuine Laravel session; logout 204/profile 401               | Change/recovery password відсутні                                  |
| Academic/Lessons/effective schedule              | Institution 1, Period 1, Subjects/Teachers 1–8, Lessons 1–16; API/SQL reconcile | Manual cancel/replacement live не виконувалися                     |
| XLSX persistence/duplicates/stale preview        | Batches 1/2, 30 rows, 15 imported Lessons; 409 then noop commit                 | Не довільний Excel і не purge semester                             |
| Task/Subtask/progress                            | Task 1/child 1, independent child pending, deadline/priority                    | Не всі lifecycle/reorder/cross-owner edges live                    |
| Availability/preferences/free slots              | Windows 1–7, daily/weekly/break limits                                          | Не кожен overlap/update/delete випадок live                        |
| Plan/adaptive/manual Session                     | Sessions 1–4; 5400s partial plan; lineage 1→5→6, cancellation 6                 | Elapsed complete/miss та autonomous relocation не перевірені live  |
| Reminder modes/sync                              | Reminders 1–4, trigger shifts, session/task dependent cancellation              | Усі final cancelled, sent_at=null; жодної доставки                 |
| Statistics/trends/comparison                     | on_time Task completion, шість zero dates, delta +1                             | Late/child/elapsed actual known/null історичні cases live відсутні |
| Незалежна persistence verification               | 66 authenticated GETs і окремий read-only SQL reconcile                         | Не provider/dispatch/production readiness                          |

У Stage 10 **нових real persistent fixtures немає**, IDs не створювались. Retained S8 namespace/account/DB не replay-илися, не скидалися, не backdate-илися. Документований попередній system test має empty-account precondition, тому його не можна повторювати на заповненому user 1.

## Reminder delivery — BLOCKED

Статично перевірено `routes/console.php`: `reminders:dispatch-due --limit=100` кожної хвилини; `DispatchDueReminders` перевіряє decimal limit 1–1000 і повертає failure при failed candidates. `ReminderDeliveryService` вимагає outermost transaction, відбирає scheduled due rows, бере owner/target/reminder locks, повторно перевіряє due/eligibility/relative anchor, створює DatabaseNotification та status=sent/sent_at атомарно. Existing receipt для scheduled row є integrity failure; повторний processing sent row skipped. Migration забезпечує unique reminder receipt. `NotificationInboxService` фільтрує за власником, paginate/unread, установлює read_at лише вперше під lock.

DB-free `ReminderDeliveryRulesTest` пройшов у поточній Unit suite: exact due boundaries/precision/DST, safe payload, target identity, malformed data. Історичні backend CI `ReminderDeliveryTest`, `ReminderDeliveryConcurrencyTest`, `NotificationInboxApiTest` перевіряють реальні транзакції/одну Notification/repeated reads; це не нова live доставка.

Доступний операторський `.auth/f7-grant.json` прочитано тільки для flags/expiry: **database_disposable=false**, **allow_dispatch=false**, expiry **2026-11-02T20:49:10.210985+00:00**. Попередній grant не авторизує dispatch навіть до expiry; retained acceptance DB не стає disposable автоматично. Прапорці не змінювалися, `F7_LIVE_ALLOW_DISPATCH=1` не встановлювався, scheduler/dispatcher не запускався.

Для наступної live перевірки потрібні одночасно: справді ізольована явно disposable БД; перевірені runtime/root/database/current-user identity; чинний operator-authored grant з `database_disposable=true`, `allow_dispatch=true`; явний opt-in `F7_LIVE_ALLOW_DISPATCH=1`; дозволений controlled future→due Reminder. Тоді перевірити due → dispatch → sent/sent_at → рівно 1 Notification → Inbox pagination → read_at persistence → повторний read без зміни часу. Наразі всі ці нові live результати **BLOCKED**, не PASS; обхід не виконувався.

## Paid provider — BLOCKED

Немає окремого bounded paid approval та private credentials у попередньому acceptance runtime. Backend live harness — `tests/Live/OpenAiLiveSmokeTest.php`; frontend — `playwright.ai-live.config.ts`, `e2e/ai-provider.live.spec.ts`. Їх не запускали. OpenAiResponsesProvider досліджено як application code; жодного реального `/v1/responses` запиту не робили, frontend ключів немає. Детерміновані orchestration/provider HTTP-fake докази відокремлено від real-provider acceptance.

## Додаткові high-value cases

| Випадок                                                 | Поточний безпечний доказ                                                                                | Live status                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Lesson cancel/replacement/delete restore                | schedule.test.ts + schedule-import.spec.ts; історично LessonLifecycleTest/LessonSecurityTest            | NOT RUN заново                                                                  |
| Availability update/delete/overlap                      | planning.test.ts + planning.spec.ts; StudyAvailabilityApiTest історично                                 | NOT RUN заново                                                                  |
| Session complete/miss/actual-null                       | planning.test.ts, StudySessionLifecycleRulesTest зараз; lifecycle Feature історично                     | Elapsed live BLOCKED                                                            |
| Task/Subtask independent complete/reopen/progress/order | ui/subtasks tests + academic-subtasks.spec; Lifecycle/Security tests історично; S8 independent state    | Ширші нові mutations NOT RUN                                                    |
| Cross-owner 403/404                                     | AiToolFoundationTest без БД; FE safe error states; backend Security/FrontendApiContract tests історично | Новий двокористувацький persistent test NOT RUN                                 |
| Import stale/uncertain mutation recovery                | schedule.test.ts + schedule-import.spec; S8 real 409/noop                                               | PASS історично; не replay                                                       |
| Genuine historical statistics                           | Pure reducers зараз; activity tests + activity.spec; S8 реальна on_time/zero/delta                      | Late/elapsed/known-null fixtures BLOCKED без authorization                      |
| G1–G3 regressions                                       | Targeted failing→passing component tests; нові desktop/mobile mock E2E                                  | Real API contract перевірено за Request/Service; persistent replay не потрібний |

## Figma — BLOCKED; візуальна якість

[Оригінальний Figma](https://www.figma.com/design/tzAlMLBLIb5a5pgQkYSV76/MockUps) надано як джерело, але в поточному каталозі доступних tools **немає Figma connector**, exports від оператора не надано. Не викликали повторно blocked tools і не заявляли parity. Academic Minimalism, існуючі layout/components/light-dark themes збережено; нове поле використовує responsive filter styles із виправленим wrapping на проміжних ширинах. Chromium/cross-browser audit перевіряє overflow і accessibility, включно з Tasks, але це не Figma comparison. Login/Register, Dashboard, Schedule, Tasks, Planning/AI confirmations, Reminders, Statistics, Profile/settings variants залишаються непорівняними із source frames.

## GitHub Actions, commits та артефакти

Історичний hosted CI повторно не створювався: [Stage 9 testing-and-results](../defense/testing-and-results.md) містить successful frontend run для `f15a3cad48f9fb8824e1389fd60b78c2f7b9b226` (382/54) та backend run для `f618bba290f919dc3561b0462c59b3b86ade82d8` (5396 tests/50695 assertions). Ці результати не приписуються новим frontend змінам. Backend CI містив deprecation/notices, це збережено у Stage 9.

Нові Stage 10 зміни залишені для review в робочому дереві: **commit/push/deploy не виконувалися**, ending HEAD обох репозиторіїв дорівнює starting HEAD. Поточні перевірки стосуються working tree, не нового hosted SHA. Після push потрібен CI exact final commit; зараз це **NOT RUN**, а не success. [source-sha256.json](evidence/source-sha256.json) ідентифікує перевірені application/test файли незалежно від незмінного HEAD.

Raw локальні логи — `/tmp/stage10-*.log`; browser traces/screenshots — ignored `test-results/stage10-*`. Комітовані компактні evidence містять лише routes, hashes та результати, без cookies/grants/passwords/provider payload. Приватні Stage 8 artifacts `.auth/` не включено до Git.
