# Stage 15B — поточний аудит інтеграції з дозволом лише на читання

**Повторний аудит: 2026-11-08, після коміту `ba07f81a7e338b6f6665fbc9b303fb795f4d06d6`. Висновок: CONDITIONAL.**
Frontend, Laravel, CORS/CSRF та авторизоване читання працюють. Повне приймання мутацій,
preview-відповідей, фактичної доставки пошти/нагадувань і Gemini у цьому запуску не виконано.
Це обмеження доказів, а не підтверджений дефект застосунку.

Поточний запит дозволяє лише безпечну перевірку без доступу до Backend repository,
SQL/міграцій, нових акаунтів, бізнес-мутацій та платних AI-запитів. Старий звіт нижче збережено
як архів окремого запуску з ширшими дозволами. Його PASS, зміни runtime та SMTP-виправлення
**не є діями чи незалежними результатами цього аудиту**.

## 1. Репозиторій і runtime

| Параметр                    | Поточне спостереження                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Перевірений Frontend commit | `ba07f81a7e338b6f6665fbc9b303fb795f4d06d6`; початкове дерево чисте                                                                           |
| Гілка                       | `main` протягом усього запуску; branches/worktrees/PR не створювалися                                                                        |
| Середовище                  | Linux `7.2.8-200.fc44.x86_64`, hostname `fedora`, маркер Docker container для цього shell відсутній                                          |
| Node / npm                  | `v22.23.1` / `11.20.0`; Node відповідає `^22.18.0                                                                                            |     | >=24.12.0` з package.json |
| Залежності                  | `node_modules` наявний, `npm ls --depth=0` exit 0; `npm ci` не потрібен, lockfile не змінено                                                 |
| Frontend                    | `http://localhost:5173`, справжній чинний Vite; PID **60595**, Frontend CWD перевірено                                                       |
| Backend origin              | `http://localhost:8000`; `localhost` резолвиться в `::1` і `127.0.0.1`; PHP listener PID **93010** на `::1:8000`                             |
| Frontend environment        | `.env` був відсутній. За вимогою створено з `.env.example` лише `VITE_API_BASE_URL=http://localhost:8000`; файл ігнорується Git              |
| Секрети                     | `.env` містить тільки публічний API origin; credentials, runtime.env, cookies, токени та поштові повідомлення не друкувалися й не комітяться |

Успішний HTTP 200 підтвердив здоровий Frontend; додатковий `npm run dev` не запускався.
Чинний Vite не зупинявся й не замінювався. Backend root, application source, `.env`, SQL,
міграції, fixtures, grants та timestamps не змінювалися й не досліджувалися через Backend.
GitHub не відкривався.

Для читання повторно використано наявну операторську `.auth/stage15/state.json` (0600).
Публічні metadata чинного `.auth/stage15/grant.json` підтвердили origin, testing,
ізольований акаунт, дозволені нецінні дані, owner ID 1 та строк до `2026-11-08T15:57:06Z`.
Grant і state були наявні до аудиту; новий grant не створювався. Справжній `GET /api/profile`
підтвердив очікуваного owner. Використано лише read-параметри; `runtime.env` не завантажувався,
credentials не читалися, `F7_BACKEND_ROOT` та mutation flags не встановлювалися.

## 2. Доступність сервісів

| ID             | Перевірка                                                              | Фактичний результат                                                                                       | Статус                     |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------- |
| ENV-FE         | `curl -I --max-time 5 http://localhost:5173`                           | HTTP 200, exit 0; Vite і реальні history routes доступні                                                  | PASS                       |
| ENV-BE         | `curl -i --max-time 5 http://localhost:8000/up`                        | HTTP 200, exit 0                                                                                          | PASS                       |
| HTTP-ANON      | Anonymous profile з Accept JSON та Origin Frontend                     | HTTP 401, exit 0                                                                                          | PASS                       |
| HTTP-CORS      | OPTIONS login, method POST, headers content-type,x-xsrf-token          | HTTP 204; точний Allow-Origin, Allow-Credentials=true, method POST, обидва headers                        | PASS                       |
| DB-API         | Авторизовані profile, планування, ресурси та reports                   | HTTP 200 з очікуваними envelopes; listener 3306 наявний. Це непрямий доказ доступу до даних, не SQL-аудит | PASS у межах API           |
| DB-IDENTITY    | Довести чинне schema `student_planner` / точну ізоляцію HTTP runtime   | Не перевірялося: SQL та Backend inspection заборонені. Архів описує окреме testing schema                 | BLOCKED                    |
| SMTP-CONTAINER | `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'` | `student-planner-mailpit`, `axllent/mailpit`, healthy; ports 1025/8025 опубліковані; exit 0               | PASS                       |
| SMTP-TCP       | `nc -zv -w 3 127.0.0.1 1025`                                           | Connected, 0 bytes sent/received, exit 0                                                                  | PASS                       |
| SMTP-WEB       | `curl -I --max-time 5 http://localhost:8025`                           | HTTP 200, exit 0; вміст листів і reset tokens не запитувалися                                             | PASS                       |
| QUEUE-PROCESS  | Лише ідентифікація argv поточного користувача без виведення аргументів | Один PHP `queue:work`; жодного worker не запускали                                                        | PASS для наявності процесу |
| SCHED-PROCESS  | Та сама безпечна перевірка процесів                                    | Один PHP `schedule:work`; жодного scheduler/dispatch не запускали                                         | PASS для наявності процесу |

Значення Set-Cookie й HTTP bodies не включалися до curl-діагностики. Повторні HEAD для
Frontend, `/up` і Mailpit знову повернули 200, exit 0. Ознак окремого недоступного localhost
або підтвердженої CORS/CSRF-помилки в цьому запуску немає.

## 3. Матриця функціональної перевірки

| ID             | Сценарій                                                       | Результат поточного запуску                                                                                                 | Статус                   |
| -------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| LIVE-READ      | Існуючий `npm run test:live:read` з операторською сесією       | 2 passed, 0 failed, 0 skipped; exit 0, 1.9 s                                                                                | PASS                     |
| AUTH-PUBLIC    | Login, registration, forgot-password                           | Справжній Vite HTTP 200, відповідні заголовки й форми; форми не надсилалися                                                 | PASS для UI              |
| AUTH-RESET     | Reset-password без посилання                                   | HTTP 200 та зрозумілий invalid-link alert; токенів не читали                                                                | PASS для безпечного UI   |
| AUTH-GUARD     | 12 захищених маршрутів анонімно                                | Redirect на login з точним intended path                                                                                    | PASS                     |
| AUTH-CSRF      | Browser GET Sanctum CSRF                                       | HTTP 204, наявні XSRF cookie та HttpOnly session cookie; значення не виводилися                                             | PASS                     |
| AUTH-RESTORE   | Наявна авторизована сесія й reload                             | Profile 200, owner відповідає операторському state, reload зберігає доступ                                                  | PASS                     |
| AUTH-WRITES    | Новий login, registration та logout                            | Не створювали й не завершували реальні сесії/акаунти                                                                        | NOT RUN                  |
| READ-PAGES     | 21 захищена сторінка через справжній Vite                      | Schedule, 4 Academic, Tasks, Planning та його підрозділи, Reminders, Inbox, 3 Statistics, AI, Profile — без resource errors | PASS                     |
| TASK-READ      | Наявне Task і його Subtasks                                    | Сторінка завантажилася, обидва REST reads 200                                                                               | PASS                     |
| ERROR-404      | Відсутнє Task та явне повторне читання                         | API 404, український alert; повторний GET знову очікуваний 404                                                              | PASS для error UX        |
| VALIDATION-422 | GET free-slots із зворотним порядком дат                       | Справжній 422 з `errors.end_date`; не зараховується як перевірка POST-form validation                                       | PASS для API             |
| EMPTY-SCHEDULE | Розклад на 2000-01-01                                          | Реальний API 200 і порожній масив, видимий EmptyState; першу помилку селектора виправлено в діагностиці                     | PASS після повтору       |
| NETWORK-UX     | Втрата мережі лише у browser context                           | Sessions GET показав «Немає зв’язку із сервером»; після повернення online явний GET успішний                                | PASS                     |
| PLAN-READ      | Preferences, availability, free slots                          | Справжні GET 200 у live suite; відповідні UI без помилок                                                                    | PASS                     |
| PLAN-FORMS     | Новий план, recovery, adaptive replanning                      | Форми scope/range доступні; до огляду кнопки підтвердження немає                                                            | PASS для UI до preview   |
| PLAN-POST      | Серверні preview-відповіді трьох режимів                       | POST preview не виконувався; діагностику/partial/expiry/recovery history цього разу наживо не отримували                    | NOT RUN                  |
| PLAN-CONFIRM   | Збереження, конфлікт, partial consent                          | Підтвердження планів не дозволене поточним read-only завданням                                                              | NOT RUN                  |
| REM-READ       | Reminders та status filters                                    | GET scheduled/sent 200; sent records є, scheduled filter порожній; UI працює                                                | PASS для наявних даних   |
| INBOX-READ     | Inbox/read status                                              | GET 200, наявні read records; opening/refresh не надсилає read mutation                                                     | PASS для наявних даних   |
| REM-EDGE       | Scheduled rows та unread rows                                  | Таких записів у доступному наборі немає; не створювали й не міняли існуючих                                                 | SKIP                     |
| REM-MUTATE     | Mark read, CRUD, dispatch                                      | POST/PATCH/DELETE і dispatch не виконувалися                                                                                | NOT RUN                  |
| STAT-13        | Completion percentage та subject workload                      | Тип number, межі 0–100, одне десяткове місце; групи, unassigned та серверний порядок збігаються з UI                        | PASS для наявних даних   |
| STAT-REPORTS   | Trends/comparison                                              | Справжні ресурси 200; live suite перевірив dates/totals/deltas; усі три UI відкриваються                                    | PASS                     |
| STAT-EDGE      | null, fractional percentage, unknown actual effort             | У поточних даних цих випадків не спостерігали; fixtures не створювали                                                       | SKIP для live edge cases |
| AI-READ        | AI route та conversations collection                           | Справжній GET 200, список порожній; нову розмову не створювали                                                              | PASS для empty UI        |
| AI-HISTORY     | Existing conversation/messages/actions, confirm/reject runtime | Розмов немає, тому ці конкретні стани цього разу не перевірені                                                              | SKIP                     |
| AI-PAID        | Gemini message/tool execution                                  | Нових provider запитів немає                                                                                                | NOT RUN                  |
| MAIL-FLOW      | Forgot → Queue → Mailpit → reset → login                       | Поточний дозвіл не охоплює надсилання листа, читання reset token або зміну пароля                                           | NOT RUN                  |
| QUEUE-FLOW     | Обробка job і доставка                                         | Процес є, функціонального доказу нової доставки немає                                                                       | NOT RUN                  |
| SCHED-FLOW     | Tick → sent → Inbox                                            | Процес є, тестові reminders/dispatch не запускалися                                                                         | NOT RUN                  |
| DOMAIN-WRITES  | Academic/Task/Subtask/Lesson CRUD, Excel import                | Реальні зміни та upload не виконувалися                                                                                     | NOT RUN                  |
| RESPONSIVE     | Statistics, recovery form, AI empty UI                         | Світла/темна теми, 320/390/768/1440 px, horizontal overflow відсутній                                                       | PASS                     |

## 4. Реальні докази та локальні перевірки

1. `F7_READ_STORAGE_STATE=.auth/stage15/state.json F7_READ_USER_ID=1 npm run test:live:read`
   виконав штатні два сценарії проти Laravel. `serveLiveFrontend` у цьому наборі роздає
   лише **Frontend dist assets** через Playwright routing на origin 5173. Origin 8000 не
   перехоплюється: CORS, cookies, session і REST responses справжні.
2. Додатковий поточний browser-аудит працював із **чинним Vite**, без routing/mocks взагалі.
   50 контрольних перевірок: 49 початкових PASS, один FAIL через неправильний діагностичний
   CSS-селектор; сфокусований повтор із правильним селектором пройшов. Це не 50 нових
   committed tests і не доказ сценаріїв, позначених вище SKIP/NOT RUN.
3. Основний browser-аудит зафіксував **108 реальних API GET**, **0 mutation requests**,
   **0 unhandled page errors**. Повтор EmptyState та уточнення варіантів даних виконали
   додаткові GET з нульовими write requests. Повні тіла відповідей, імена, emails, cookies,
   screenshots і traces не публікуються.
4. Для network UX тимчасово вимикалася мережа тільки browser context через `setOffline`;
   Backend не зупинявся, відповіді не підмінялися. Очікуваний network error і наступний
   справжній успішний GET перевірено окремо.
5. Повторне читання статистики використовувало період 2026-11-01–2026-11-30, щоби перевірити
   наявні групи. Процент береться з Backend і лише форматується; назви/порядок груп зіставлено
   в пам’яті, приватні значення у звіт не включені. Поточне значення integer-valued number,
   unknown actual records відсутні; null/fractional/unknown cases не оголошуються live PASS.

Application source, типи, клієнт, router, safety helpers і наявні тести не змінювалися:
**підтвердженого Frontend дефекту не знайдено**. Неправильний селектор стосувався лише
тимчасового діагностичного скрипта. Створено ignored публічний `.env`, оновлено тільки цей
звіт; історичний запис збережено. `npm test` та offline `npm run test:e2e` **NOT RUN**:
без application/test changes їхній запуск не потрібен і не замінює live acceptance.

| Обов’язкова фінальна команда | Результат                                        |
| ---------------------------- | ------------------------------------------------ |
| `npm run format:check`       | PASS, exit 0                                     |
| `npm run type-check`         | PASS, exit 0                                     |
| `npm run build`              | PASS, exit 0; TypeScript і production Vite build |

## 5. Детальна діагностика незавершених і повторених перевірок

### D15-R01 — EMPTY-SCHEDULE: діагностичний FAIL, усунуто

- **Функція / очікування:** показати порожній розклад для 2000-01-01.
- **Факт:** початковий скрипт шукав `.empty-state`, якого немає в чинному `EmptyState.vue`.
  HTTP 200 і відсутність lessons уже були підтверджені; завершення всього скрипта — exit 1.
- **Відтворення / доказ:** авторизовано відкрити `/schedule?date=2000-01-01`; неправильний
  `expect(locator('.empty-state')).toBeVisible()` завершується помилкою. Реальний клас — `.state.empty`.
- **Причина / категорія:** підтверджена помилка мого селектора, **TEST_ENVIRONMENT**, не Frontend code.
- **Виправлення / повтор:** лише діагностичний селектор; повтор підтвердив видимий `.state.empty`,
  API 200 з порожнім масивом, 0 writes, exit 0. Application code і чинні тести не потребують змін.

### D15-R02 — DB-IDENTITY: BLOCKED

- **Функція / очікування:** незалежно довести MySQL schema та прив’язку чинного HTTP runtime.
- **Факт / код:** порт 3306 відкритий, authenticated API reads 200; прямого SQL/Backend probe
  немає, process exit/SQL status — N/A. Метадані попереднього grant не є новим доказом schema.
- **Кроки:** `ss -ltnp '( sport = :3306 )'`, profile/resources через авторизовану read suite.
- **Причина / категорія:** поточна заборона Backend access і SQL, **MYSQL_OR_SCHEMA**; помилка БД
  не підтверджена. Архів повідомляє testing schema, тому не слід називати його `student_planner` навмання.
- **Дія / повтор:** оператор окремо підтверджує runtime/schema без зміни даних і надає sanitized
  висновок. Повтор API успішний; точну schema повтором не встановлено. Frontend змін не потребує.

### D15-R03 — AUTH-WRITES: NOT RUN

- **Очікування:** реальний login/registration/logout і POST validation.
- **Факт / кроки / код:** форми відкриті, сесію відновлено; submit/logout не натискалися,
  HTTP/process status для мутацій N/A. Registration створила б запис, logout змінив би надану сесію.
- **Категорія / причина:** **TEST_ENVIRONMENT**, поточний дозвіл на існуючу read-only сесію.
- **Дія / повтор:** окремо погодити disposable account та відповідні auth-дії; потім штатні
  guarded сценарії виконує оператор у дозволеному runtime. Auth read/reload повторено успішно;
  auth mutations не повторювалися. Frontend змін не потребує.

### D15-R04 — PLAN-POST / PLAN-CONFIRM / DOMAIN-WRITES / REM-MUTATE: NOT RUN

- **Очікування:** серверні previews, recovery history, partial/expiry/conflict, збереження плану,
  CRUD/import, notification read та інші реальні зміни.
- **Факт / кроки / код:** сторінки й GET 200, до preview confirmation відсутня. POST preview,
  confirm, uploads, PATCH/DELETE і dispatch не запускалися; HTTP/process status N/A.
- **Причина / категорія:** **TEST_ENVIRONMENT** — нинішній scope лише на читання. Навіть preview
  є POST та може створити тимчасовий server token; право на такі виклики окремо не припускалося.
- **Дія:** окремий конкретний дозвіл і підтверджений disposable runtime. Не запускати system config
  у цьому аудиті: його `authorizeLive` звернувся б до забороненого Backend root. Guards не ослаблювалися.
- **Повтор / зміни:** форми/reads повторно відкриваються; business operations не повторювалися.
  Це не API_CONTRACT FAIL; підстав змінювати Frontend немає.

### D15-R05 — STAT-EDGE та REM-EDGE: SKIP

- **Очікування:** наживо показати null/дробовий completion, невідомий actual time, scheduled reminder
  і unread notification.
- **Факт / код:** progress/reminder/notification GET 200; булеві уточнення підтвердили integer-valued
  completion, відсутність unknown actual, scheduled та unread. Sent/read і subject/unassigned groups наявні.
- **Кроки:** GET progress за 2026-11-01–2026-11-30; reminders з status=scheduled/sent;
  notifications з unread_only=false. Дані вивчаються лише в пам’яті, без виведення приватних рядків.
- **Категорія / причина:** **TEST_ENVIRONMENT**, відсутні потрібні варіанти даних, не Frontend дефект.
- **Дія / повтор:** оператор надає вже погоджений dataset або окремо дозволяє synthetic fixtures
  в ізоляції. Уточнювальний GET exit 0 повторно підтвердив відсутність варіантів. Fixtures не створювали;
  підстав змінювати Frontend немає. Історичні fixture тести не видаються за поточний live PASS.

### D15-R06 — AI-HISTORY: SKIP

- **Очікування:** existing conversation/messages/actions та захищені confirm/reject runtime стани.
- **Факт / код / кроки:** `/ai` і GET `/api/ai/conversations?per_page=20` — 200, порожня колекція.
  Нову розмову не створювали; HTTP для messages/actions — N/A.
- **Причина / категорія:** **TEST_ENVIRONMENT**, відсутній наявний conversation dataset.
- **Дія / повтор:** оператор надає дозволену розмову в існуючій read-сесії; повторити GET UI без
  messages POST/decisions. Нова розмова чи оплачуваний запит не є способом обходу. У цьому запуску
  dynamic action guards не зараховано як live PASS; source guards збережено. Frontend змін не потребує.

### D15-R07 — MAIL-FLOW: NOT RUN

- **Очікування:** новий recovery email, реальний reset link і зміна пароля disposable account.
- **Факт / кроки / код:** Mailpit healthy, SMTP connect exit 0, web 200; forgot form і reset invalid-link
  UI працюють. POST forgot/reset, mailbox contents та reset tokens не запитувалися, статус N/A.
- **Причина / категорія:** **TEST_ENVIRONMENT** — немає поточного конкретного дозволу на mail/reset,
  наявність старого mutation grant не розширює нинішні інструкції. SMTP несправність не встановлена.
- **Дія / повтор:** див. операторські кроки нижче; лише погоджений disposable recipient, Queue job,
  лист, reset і login дають функціональний доказ. Повтор HEAD Mailpit 200; доставка не повторювалася.
  Frontend змін не потребує.

### D15-R08 — QUEUE-FLOW і SCHED-FLOW: NOT RUN

- **Очікування:** поточний job оброблено worker; scheduler справді переводить reminder у sent і Inbox.
- **Факт / код:** спостерігаються по одному PHP queue:work та schedule:work. Це підтверджує процеси,
  а не правильну schema, jobs або доставку; коди нових job/tick тестів N/A.
- **Кроки:** безпечна ідентифікація імен PHP argv без виведення environment/аргументів.
- **Категорії / причини:** **QUEUE_WORKER**, **SCHEDULER** — бракує дозволеного функціонального доказу;
  збій або неправильна конфігурація не підтверджені.
- **Дія / повтор:** оператор перевіряє прив’язку чинних процесів і після окремого дозволу виконує
  delivery workflow. Не запускати duplicate worker/scheduler. Функціонального повтору не було;
  Frontend не потребує змін.

### D15-R09 — AI-PAID: NOT RUN

- **Очікування:** незалежний виклик поточного Gemini provider/model та persisted answer.
- **Факт / кроки / код:** developer повідомив успішну Gemini взаємодію та модель
  `gemini-3.5-flash-lite`. Цей аудит виконав лише GET conversations; provider HTTP/status N/A.
  Налаштування Backend/Gemini та API keys не читалися.
- **Категорія / причина:** **GEMINI_PROVIDER**, явна заборона нових платних запитів; збій provider не встановлений.
- **Дія / повтор:** окреме погодження платного тесту, поточного model і потрібного test conversation.
  Без нього не запускати `test:live:ai`/AI mutation suites. Повтор не виконувався; підстав для
  Frontend змін немає.

## 6. SMTP, Queue та пошта

Mailpit container, TCP 1025 і web UI 8025 **PASS** незалежно один від одного. `nc` лише відкрив
з’єднання й не передавав SMTP DATA. `queue:work` наявний, але Backend effective mail/queue config,
прив’язка до schema, новий job і лист у цьому запуску **не перевірені**. Mailpit connectivity
не доводить парольну доставку. Worker з Frontend не запускався. Попередній mail PASS в архіві
залишається історичним; приватні листи, reset URLs і tokens не відкривалися.

## 7. Gemini

Успіх та модель повідомлені розробником, не незалежно перевірені цим запуском. GET conversations
працює, але список порожній. Оплачені messages, нові conversations і confirm/reject requests не
виконувалися. Тому нинішній висновок не сертифікує provider/model або виконання AI Tools.

## 8. Конкретні подальші дії оператора

Для безпечного повтору поточних дозволених перевірок із Frontend root:

```bash
git branch --show-current
git status --short
node --version
npm --version
curl -I --max-time 5 http://localhost:5173
curl -i --max-time 5 http://localhost:8000/up
curl -i --max-time 5 -H 'Accept: application/json' -H 'Origin: http://localhost:5173' http://localhost:8000/api/profile
curl -i --max-time 5 -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,x-xsrf-token' http://localhost:8000/api/auth/login
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
curl -I --max-time 5 http://localhost:8025
nc -zv -w 3 127.0.0.1 1025
F7_READ_STORAGE_STATE=.auth/stage15/state.json F7_READ_USER_ID=1 npm run test:live:read
```

Не публікуйте raw curl headers із Set-Cookie. Наведений read state придатний лише доки оператор
підтверджує його чинність, owner і дозвіл; після завершення сесії не підставляйте fake state/grant.
Якщо немає дозволеної сесії, `npm run test:live:read` без F7_READ змінних виконає anonymous частину
й явно пропустить authenticated сценарій. Не source-ити старий `runtime.env` лише заради read tests.

Якщо перевірка Frontend дасть connection refused і listener 5173 відсутній, у Frontend root:

```bash
# Лише за відсутності здорового чинного Vite, в окремому керованому terminal:
npm run dev -- --host localhost --port 5173
```

Для решти acceptance потрібні окремі конкретні дозволи й операторські докази:

1. Підтвердити actual HTTP runtime/schema і призначення поточних worker/scheduler поза цим
   Frontend-only аудитом. Не переносити старі grants автоматично на інший server/schema.
2. Надати вже дозволені дані для null/fractional completion, unknown actual, scheduled/unread
   і conversation history або окремо погодити їх створення в disposable середовищі.
3. Окремо погодити preview POST трьох режимів; потім, якщо потрібне повне приймання, підтвердження
   планів, auth writes, CRUD/import, mark-read та reminder delivery. Чинні guarded suites не
   запускати до такого дозволу й не обходити `authorizeLive`.
4. Для email погодити конкретний disposable recipient. У вже перевіреному ізольованому Backend
   runtime оператор перевіряє чинний worker, надсилає recovery з Frontend, спостерігає job і новий
   лист **лише цього recipient**, відкриває link приватно, виконує reset та login. Не запускати
   другого worker; не читати чужих листів і не комітити tokens. Якщо worker зник, рішення про його
   запуск виконує оператор зі свого Backend terminal після перевірки runtime, не з Frontend.
5. Нову Gemini перевірку виконувати лише за окремим дозволом платного виклику; read-only API
   та повідомлення про колишній успіх не замінюють provider acceptance.

## 9. Поточний висновок приймання

**CONDITIONAL.** Поточні Frontend runtime, реальні Laravel reads, CORS/CSRF, authorized session,
основні UI, Stage 13 для наявних даних, мережеве відновлення та Mailpit connectivity працюють.
Підтвердженого application defect немає. Повне Stage 15 acceptance не заявляється: лишаються
неперевірені mutation/preview/mail/delivery/provider workflows, точна schema і відсутні live
варіанти даних. Усі безпечні доступні перевірки виконано без розширення дозволів.

---

<details>
<summary>Архів попереднього запуску з іншим, ширшим дозволом — не результати поточного read-only аудиту</summary>

# Stage 15B — автономна локальна інтеграційна перевірка

Дата виконання: **2026-11-08**, приблизно **11:52–12:11 UTC**. Рішення: **PASS для погодженого локального Stage 15 acceptance**. Реальні сценарії Vue → Laravel → MySQL, recovery, доставка нагадування та скидання пароля через Mailpit виконані. Початкову помилку поштової конфігурації ізольованого runtime усунуто й перевірено повторно. Новий платний виклик Gemini навмисно **NOT RUN**.

Цей запис замінює попередній обмежений аудит з рішенням CONDITIONAL: новий запит користувача явно дозволив створення окремої БД, синтетичних облікових записів, fixtures, локальну доставку пошти та запуск worker/scheduler у цьому середовищі. Попередні результати не зараховано як поточні live PASS.

## 1. Ідентичність середовища та доступність

| Параметр                 | Незалежно встановлений результат                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend repository      | `student-planner-frontend`, гілка `main`, початковий HEAD `9fb692c9b3c197064ff84cc00291805c1d776919`; початкове дерево чисте                           |
| Backend operational root | `../student-planner-backend`; використано лише bootstrap/config/schema diagnostics, існуючі Artisan-команди та створення дозволених synthetic fixtures |
| ОС                       | Fedora Linux 44 Workstation, Linux `7.2.8-200.fc44.x86_64`, x86_64                                                                                     |
| Runtime                  | PHP 8.5.11, Composer 2.10.3, Node 22.23.1, npm 11.20.0, Laravel 13.33.0                                                                                |
| Frontend origin          | `http://localhost:5173`, HTTP 200; повторно використано чинний Vite                                                                                    |
| Backend origin           | `http://localhost:8000`, `/up` HTTP 200; чинний developer server замінено ізольованим runtime після підтвердження власника, каталогу й призначення     |
| Mailpit                  | `student-planner-mailpit`, `axllent/mailpit`, healthy; HTTP UI `http://localhost:8025`, SMTP `127.0.0.1:1025`                                          |
| MySQL                    | Реальне з'єднання `mysql`; захищена наявна БД `student_planner`; окрема нова БД `student_planner_stage15_20261108_115338_447f7e`                       |
| Доступність localhost    | Ці процеси фактично доступні з поточного середовища Codex. Висновок не ґрунтується лише на повідомленні розробника                                     |

Bash preflight: `pwd`, `uname -a`, `php -v`, `node --version`, `docker ps`, `ss -ltnp`, `curl --noproxy '*' --max-time 5 ...`, `nc -zv -w 3 127.0.0.1 1025`. Перевірки доступності завершилися exit 0. HTTP headers фільтрувалися: значення Set-Cookie не виводилися.

GitHub, Backend application source та міграції як текст не переглядалися. Backend application code, оригінальний `.env`, історія Git і чинні схеми не змінювалися. Нових dependencies або application Services немає.

## 2. Запущені й повторно використані сервіси

PID нижче — фактичний стан останньої перевірки, не гарантія безстрокової роботи процесів.

| Сервіс       | Дія / поточний PID                                                   | Порт / runtime                     | Доказ                                                                                                       |
| ------------ | -------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Vue/Vite     | Повторно використано PID **60595**                                   | localhost:5173                     | HTTP 200; справжня сторінка `/ai` від dev server завантажилася з авторизованою сесією                       |
| Laravel      | Керована командна сесія; Artisan PID **93007**, HTTP child **93010** | localhost:8000; тільки Stage 15 БД | `/up` 200, CSRF 204, зв'язок HTTP session → нова БД, authenticated profile                                  |
| Mailpit      | Повторно використано healthy Docker container                        | SMTP 1025, UI/API 8025             | TCP exit 0; UI/API 200; реально отримано reset email                                                        |
| Queue Worker | Керована сесія, PID **92851**                                        | database queue нової БД            | `queue:work --tries=1 --sleep=1 --timeout=60`; реальний job RUNNING/DONE і незалежний доказ отримання листа |
| Scheduler    | Рівно один `schedule:work`, PID **92869**                            | Нова БД                            | `schedule:list` і реальні хвилинні ticks; delivery перевірено окремим тестом                                |
| MySQL        | Повторно використано чинний сервер                                   | 3306                               | SQL identity, schema metadata, migrations і фінальні aggregate counts                                       |

Початковий Laravel PID 70739/70741 належав поточному користувачу, запускав `artisan serve --host=localhost --port=8000`, CWD відповідав наданому Backend root/public. Його зупинено лише після цієї ідентифікації для переходу на дозволену ізоляцію. Оригінальну `.env` не редаговано; зараз порт 8000 обслуговує **тестову БД**, а не `student_planner`.

Початкові Stage 15 процеси перезапущено після виправлення `MAIL_URL`; їхні старі PID не є поточними. Наявні Docker containers/volumes не видалялися. Worker і scheduler проти збереженої БД не запускалися.

## 3. Докази ізоляції MySQL та runtime

1. Ім'я нової БД з часовою міткою й випадковим суфіксом перевірено через `information_schema.SCHEMATA`. Перед створенням такого schema не було. Наявне schema не перезаписувалося.
2. Виконано тільки `CREATE DATABASE` для нового імені. Жодних копій student data, `migrate:fresh`, seed, truncate, drop або reset не було.
3. Перед міграціями SQL `SELECT DATABASE()` повернув нове ім'я; `information_schema.tables WHERE table_schema = DATABASE()` повернув **0** таблиць.
4. Лише після цієї перевірки застосовано **існуючі 26 міграцій**: `php .../artisan migrate --force --no-interaction`, exit **0**. Metadata probe показав **0 pending migrations**, необхідні columns присутні.
5. Приватна конфігурація зберігається у проігнорованій `.auth/stage15/runtime.env`, mode 0600. Змінні процесу перекривають значення оригінальної `.env`; config cache винесено на окремий відсутній шлях, storage/logs — у `.auth/stage15/storage/`.
6. HTTP-процес, worker і scheduler перевірено через `/proc`: CWD відповідає Backend, `APP_ENV=testing`, `DB_DATABASE` — нове ім'я, queue database, mail host/port локальні. Повні argv/environment не друкувалися.
7. **Незалежний HTTP доказ:** GET `/sanctum/csrf-cookie` повернув 204. Виданий саме HTTP-процесом session cookie розшифровано лише в пам'яті відповідним runtime key; його session ID знайдено у `sessions` саме нової БД. Значення cookie, ключа й session ID не виводилися. Доказ повторено після фінального перезапуску.
8. Лише далі створено synthetic account ID **1**, випадкові приватні credentials, виконано реальний Login UI та збережено справжній browser state. Registration suite окремо створив synthetic account ID **2**.
9. Grant створено на підставі цих фактичних перевірок та явного дозволу користувача: origin localhost:8000, environment testing, connection mysql, точне нове database name, user 1, disposable/registration/dispatch true, approval/expiry у межах 4 годин. Чинні `authorizeLive`/`validateLiveGrant` не змінювалися.
10. HTTP profile, записи fixtures й фінальні SQL counts перевірено повторно. БД залишена на місці, автоматичного видалення немає.

Це не лише CLI-перевірка `.env`. HTTP session persistence та реальна авторизація пов'язують browser/server із потрібною БД. Повного checksum порівняння retained БД до/після не виконували; твердження про її захист спирається на адресацію операцій, перевірки runtime та відсутність спрямованих на неї мутаційних команд.

### Ефективна конфігурація без секретів

| Налаштування                  | Ізольований runtime                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| APP_ENV / APP_DEBUG / APP_URL | testing / false / `http://localhost:8000`                                                    |
| Frontend URL                  | `http://localhost:5173`                                                                      |
| Session                       | database; окреме ім'я cookie, host-only, HttpOnly, Secure=false для local HTTP, SameSite=lax |
| Sanctum stateful              | `localhost:5173`, `localhost:8000`                                                           |
| CORS                          | `http://localhost:5173`; supports_credentials=true                                           |
| Cache / Queue                 | database / database; тільки нова БД                                                          |
| Mail                          | smtp, `127.0.0.1:1025`, без SMTP username/password, ефективний URL null                      |
| Storage/config                | Приватний Stage 15 storage; original config cache не очищався й не перезаписувався           |
| Gemini                        | provider gemini, model `gemini-3.5-flash-lite`; ключ у тестовому runtime навмисно відсутній  |

Наявність tables `users`, `sessions`, `jobs`, `failed_jobs`, `cache`, `cache_locks`, `reminders`, `notifications`, `password_reset_tokens` підтверджена. Фінальні aggregate counts: users **2**, tasks **4**, subtasks **3**, study_sessions **12**, reminders **6**, notifications **2**, jobs **0**, failed_jobs **0**, password_reset_tokens **0**. Reminders: **4 cancelled**, **2 sent**; максимум notifications на reminder — **1**. Це лише synthetic дані нового schema.

## 4. Матриця перевірок

| ID        | Компонент / очікування                         | Фактичний результат і доказ                                                                               | Статус                 | Наступна дія                             |
| --------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------- |
| ENV-01    | Runtime/localhost доступні                     | PHP, Node, Docker, MySQL, три HTTP origins доступні                                                       | PASS                   | Немає                                    |
| ENV-02    | Мутації тільки в disposable schema             | Empty-before-migration SQL, 26 migrations, process identity, HTTP session binding                         | PASS                   | Зберігати ізоляцію для наступних мутацій |
| HTTP-01   | Backend health / Frontend                      | `/up` 200, Frontend 200                                                                                   | PASS                   | Немає                                    |
| AUTH-01   | Anonymous protected API                        | Profile та всі 10 read endpoints повертають 401                                                           | PASS                   | Немає                                    |
| AUTH-02   | CORS/CSRF                                      | Точний Allow-Origin, Allow-Credentials=true, CSRF 204, cookie flags; PATCH без CSRF → 419                 | PASS                   | Немає                                    |
| AUTH-03   | Registration/Login/Profile                     | Реальна registration 201, login 200, profile 200 правильного synthetic owner                              | PASS                   | Немає                                    |
| AUTH-04   | Reload/Logout/Session restoration              | Reload зберігає owner; logout 204; profile після logout 401; новий login відновлює сесію                  | PASS                   | Немає                                    |
| REST-01   | Authenticated reads                            | 2/2 read tests до й після мутацій; додатково 9 реальних REST reads після reset → 200                      | PASS                   | Немає                                    |
| ACAD-01   | Subjects/Teachers/Institutions/Periods/Lessons | Existing registration/academic та system suites успішні; schedule GET підтверджує persisted lessons       | PASS                   | Немає                                    |
| IMPORT-01 | XLSX validation/commit/duplicates              | Реальний upload, revalidate, commit; concurrent commit 409; повторний commit без дублювання lessons       | PASS                   | Немає                                    |
| TASK-01   | Tasks/Subtasks/status/progress                 | Реальні CRUD та lifecycle assertions existing suites; незалежні GET                                       | PASS                   | Немає                                    |
| PLAN-01   | Availability/Free time/Preview/Confirm         | Preferences та 7 windows persisted, free slots, preview 200, confirm 201 і GET sessions                   | PASS                   | Немає                                    |
| PLAN-02   | Adaptive replanning/manual reschedule          | Blocker lesson, replanning confirm, predecessor rescheduled, replacement persisted                        | PASS                   | Немає                                    |
| REC-01    | Unfinished recovery без зміни history          | Missed + completed credit + stale planned + future reservation; 45 хв нової роботи, history незмінна      | PASS                   | Немає                                    |
| REC-02    | Secure confirmation/replay                     | Recovery confirm 201, повторне підтвердження того ж token 409                                             | PASS                   | Немає                                    |
| STAT-01   | Progress/trends/comparison/UI                  | Реальні Resources і current counts, daily totals та comparison assertions; statistics view завантажується | PASS                   | Немає                                    |
| REM-01    | Scheduled → sent                               | Окремий тест дочекався справжнього scheduler tick; reminder став sent                                     | PASS                   | Немає                                    |
| REM-02    | Inbox/read/no duplicates                       | Рівно 1 matching notification; read_at persisted; наступний tick не створив дубль                         | PASS                   | Немає                                    |
| SMTP-01   | Container/TCP/UI                               | Healthy, TCP 1025 exit 0, UI/API 8025 HTTP 200; relay/forward options не знайдені                         | PASS                   | Немає                                    |
| MAIL-01   | Forgot password/job/реальний email             | 202, database job RUNNING/DONE, новий лист лише synthetic recipient у Mailpit                             | PASS після виправлення | Див. E15B-03                             |
| MAIL-02   | Reset link/reset/login                         | Справжнє посилання відкрило Frontend, URL очищено від query; reset 200; старий пароль 422, новий 200      | PASS                   | Немає                                    |
| QUEUE-01  | Worker isolated/доставка                       | PID/runtime identity, нова БД; jobs=0, failed_jobs=0; delivery підтверджена Mailpit                       | PASS                   | Підтримувати worker для подальших тестів |
| SCHED-01  | Registration/process/delivery                  | Every-minute `reminders:dispatch-due --limit=100`, один scheduler; delivery перевірено окремо             | PASS                   | Не запускати дубль scheduler             |
| AI-01     | Frontend AI interface                          | Реальна `/ai` зі збереженою сесією і GET conversations 200; AI POST requests=0                            | PASS у read-only scope | Немає                                    |
| AI-02     | Gemini config                                  | Оригінальний operational probe: gemini, expected model, key present=true, позитивні limits                | PASS для config        | Це не provider acceptance                |
| AI-03     | Новий paid provider call / усі 27 Tools        | Не запускалися за прямою вимогою; попередній успіх повідомив розробник                                    | NOT RUN                | Лише окремий дозвіл за потреби           |
| REG-01    | Offline regression                             | Type-check, build, targeted safety tests, formatting успішні                                              | PASS                   | Не трактувати як live evidence           |

На завершення обов'язкових погоджених перевірок **FAIL/BLOCKED/SKIP немає**. Початкові невдалі спроби збережено нижче; вони не приховані фінальними PASS. Новий Gemini call є явним виключенням, а не прихованим live PASS.

## 5. Реальні browser-тести та точні результати

Середовище для guarded commands завантажувалося з приватного runtime; `F7_BACKEND_ROOT`, grant і browser state вказували на перевірені шляхи. У commands нижче credentials не передаються як аргументи.

| Команда / запуск                                                                   | Exit | PASS | FAIL | SKIP | Значення результату                                                                             |
| ---------------------------------------------------------------------------------- | ---- | ---- | ---- | ---- | ----------------------------------------------------------------------------------------------- |
| `npm run test:live:read`, перед мутаціями                                          | 0    | 2    | 0    | 0    | Anonymous та authenticated reads                                                                |
| `npm run test:live:system`, початковий existing scenario                           | 0    | 1    | 0    | 0    | XLSX → planning → sessions → reminders/Inbox → reports → logout; dispatch branch явно дозволена |
| `npm run test:live`                                                                | 0    | 1    | 0    | 0    | Registration, academic/task/subtask та authentication workflows                                 |
| `npm run test:live:system -- --grep 'Stage 15'`, перший запуск                     | 1    | 2    | 1    | 0    | Recovery та Scheduler PASS; Mailpit timeout через помилковий MAIL_URL                           |
| `npm run test:live:system -- --grep 'Mailpit password recovery'`, після correction | 0    | 1    | 0    | 0    | Повний password reset workflow PASS, 4.4 с                                                      |
| `npm run test:live:read`, після password reset                                     | 0    | 2    | 0    | 0    | Свіжий genuine browser state, populated current-state reads                                     |
| `npm test -- tests/f7-safety.test.ts`                                              | 0    | 23   | 0    | 0    | Існуючі safety unit tests; не доказ live integration                                            |
| `npm run type-check`                                                               | 0    | —    | —    | —    | TypeScript перевірка                                                                            |
| `npm run build-only` через live scripts                                            | 0    | —    | —    | —    | Production assets збираються                                                                    |
| Prettier для змінених files / `git diff --check`                                   | 0    | —    | —    | —    | Formatting/whitespace                                                                           |

Сукупно перевірено **7 різних real-browser сценаріїв**: 2 read, existing system, registration, recovery, scheduler delivery, password recovery. Два read-сценарії повторено після reset; невдалий mail-сценарій повторено лише після встановленої й виправленої причини. Already-populated account не використовували для повторного запуску whole system fixture suite.

Existing `serveLiveFrontend` обслуговує **лише Frontend assets з dist** на origin localhost:5173. Laravel responses не перехоплюються й не mock-яться. Реальні credentialed browser fetch проходять CORS, CSRF, Laravel і MySQL. Додаткова operational перевірка `/ai` використовувала саме чинний Vite dev server без asset routing, підтвердивши і його доступність.

Новий `e2e/stage15.live.spec.ts` містить лише відсутні recovery/delivery перевірки й повторно використовує чинні helpers. Його 3 тести opt-in: потрібен `STAGE15_LIVE_ACCEPTANCE=1`, disposable grant та приватні paths; reminder delivery додатково вимагає `F7_LIVE_ALLOW_DISPATCH=1` і grant.allow_dispatch. Без opt-in вони SKIP; у зафіксованому Stage 15 запуску всі три виконувалися. Existing system config лише доповнено testMatch. Product `src/` і safety mechanism не змінені.

## 6. SMTP, Queue та відновлення пароля

Окремі докази, які не слід підмінювати один одним:

1. Docker container healthy, ports присутні; `nc` підключився до 1025 без надсилання даних.
2. Mailpit UI і API відповідають 200. Relay/forward environment options і command options відсутні; зовнішня пересилка для тесту не налаштовувалась.
3. Ефективний Laravel mailer — smtp, parsed transport **smtp**, host `127.0.0.1`, port 1025, credentials відсутні. `MAIL_MAILER=log` тут не використовується.
4. Database worker має той самий isolated DB runtime. Оброблено два `App\Jobs\SendPasswordResetLink` jobs: обидва RUNNING/DONE, але **перший не доставив лист** через mail configuration. Тому DONE сам по собі не зараховувався як delivery.
5. Forgot-password форма реального Frontend повернула 202. Тест шукав тільки унікального synthetic recipient; чужі Mailpit messages не перераховувалися/не читалися. Після correction знайдено рівно **1 новий** лист відносно recipient baseline.
6. Reset URL взято з HTML цього листа тільки в пам'яті, перевірено origin/path. Відкрито справжню адресу Frontend; router прибрав token/query з видимого URL.
7. Новий випадковий тестовий пароль передано через Reset UI: Backend 200 і success notice. Старий пароль на Login UI → **422**; новий → **200**; profile підтвердив owner 1.
8. Genuine browser state оновлено у `.auth/`; authenticated read suite після цього знову 2/2 PASS. У БД jobs=0, failed_jobs=0, reset_tokens=0.

Reset links, tokens, passwords, cookies, APP_KEY, API keys і mail content не включено в report/Git. У тесті немає traces/screenshots/HAR; sensitive URL navigation має sanitized failure, а значення token не використовуються в assertions, які могли б його надрукувати.

## 7. Scheduler, Reminder та Inbox

`schedule:list` exit 0 містить `* * * * * php artisan reminders:dispatch-due --limit=100`. Процес `schedule:work` окремо ідентифіковано за PID/runtime. Existing suite перевірив synchronization/cancellation relative reminders і явно дозволений dispatcher.

Додатковий Stage 15 тест **не запускає другий dispatcher**. Створено scheduled reminder на кілька секунд у майбутнє. Polling дочекався справжнього хвилинного Scheduler: reminder став sent, Inbox містив рівно один matching item із read_at=null. Mark-read повернув 200; після **наступного справжнього хвилинного tick** кількість залишилася 1, read_at не змінився. Фінальна SQL агрегація також показала максимум 1 notification на reminder.

Таким чином scheduled, sent, persisted Inbox та read перевірені як різні стани. Наявність schedule registration/process сама по собі не використовувалася як доказ доставки.

## 8. Recovery та planning

Synthetic fixture ledger містить окремий pending Task з estimate 90 хв, completed session з actual 15 хв, missed session, stale past planned session і чинне майбутнє reservation 30 хв. Усі fixtures належать user 1 у новій БД.

Через реальний `/planning/recovery` сервер повернув missed_session_count=1, past_planned_session_count=1, requires_lifecycle_decision=true та новий план **2700 секунд / 45 хв / 2 sessions**. Це узгоджується з 90 − 15 − 30 хв, без кредитування missed/stale time. Усі нові intervals у майбутньому. Preview не змінив statuses вихідних sessions; вони залишилися незмінними й після confirmation. Confirm пройшов через existing `/api/planning/study-plans/confirm` (201), повтор того ж proposal отримав 409. Backend planning алгоритм не дублювався у Frontend.

Ця перевірка не є доказом усіх можливих planning edge cases; повний offline Backend suite тут не запускали й не підміняли ним live acceptance.

## 9. Gemini та межі перевірки

Operational probe оригінальної конфігурації підтвердив `ai.provider=gemini`, `ai.gemini_model=gemini-3.5-flash-lite`, `ai.gemini_key present=true`. Значення ключа не читалося в output і не hash-увалося. Limits: timeout 30 s, tool rounds 5, tool calls 8, history 20, context 131072 bytes, tool result 65536 bytes, output 2048 tokens, turn 180 s — позитивні.

У disposable runtime provider/model збережено, а ключ навмисно порожній. Paid flags не вмикалися. Frontend `/ai` і read-only conversations GET реально працюють; за operational browser observation **0 AI POST requests**. Нового provider call та live-перевірки всіх 27 Tools немає. Повідомлення розробника про попередній успішний Gemini request залишається **operator-reported**, без підміни незалежною верифікацією.

## 10. Детальні діагностичні записи

### E15B-01 — нетривалий перший background server

- **Компонент / severity / classification:** managed development process; MEDIUM; TEST_ENVIRONMENT.
- **Очікування:** Laravel продовжує слухати 8000 після operational shell command.
- **Факт / reproduction:** перший `nohup bash ... artisan serve ... &` спочатку дав `/up` 200 і CSRF 204; у наступній перевірці `ss -ltnp '( sport = :8000 )'` listener відсутній. Перший bootstrap browser login завершився exit **1**, без виведення private payload.
- **Підтверджено:** listener зник; це не доказ дефекту Laravel authentication. Причина lifecycle фонового процесу у командному середовищі — обґрунтована гіпотеза, не встановлений application root cause.
- **Виправлення:** окрема керована довготривала command session з `exec php artisan serve --host=localhost --port=8000 --no-reload`, приватним runtime і tracked PID.
- **Reverification:** listener присутній; Login UI 200, profile owner збігається; наступні real suites PASS.
- **Application code change:** не потрібна.

### E15B-02 — guard emptiness перевіряв надто широку metadata вибірку

- **Компонент / severity / classification:** isolated provisioning diagnostic; LOW; TEST_ENVIRONMENT.
- **Очікування:** нова БД має 0 tables до міграцій.
- **Факт / reproduction:** operational guard із `count(Schema::getTables())` отримав **84**, тоді як `SELECT DATABASE()` уже повертав нову БД. Guard завершився exit **1**, міграції не запускалися.
- **Підтверджено:** scoped SQL `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()` повернув **0**. Початкова metadata вибірка не була надійною перевіркою порожнечі саме вибраного schema; наявність 84 таблиць у новій БД не підтвердилася.
- **Виправлення:** звузити diagnostic до поточного `DATABASE()` і порівняти його ім'я з дозволеним Stage 15 schema перед будь-якими migrations.
- **Reverification:** isolation/empty guard PASS; існуючі migrations exit **0**, applied=26, pending=0.
- **Application code change:** не потрібна; змінено лише приватний operational diagnostic.

### E15B-03 — порожній MAIL_URL перекрив SMTP transport

- **Компонент / severity / classification:** поштовий isolated runtime; HIGH; ENV_CONFIGURATION (SMTP).
- **Очікування:** forgot password 202 → database job → новий Mailpit email.
- **Факт / reproduction:** `npm run test:live:system -- --grep 'Stage 15'` завершився exit **1**, 2 PASS/1 FAIL. Mail polling через 30 s: expected new messages=1, received=0. Job мав RUNNING/DONE; sanitized Laravel category — `password.delivery_failed`.
- **Безпечний diagnostic:** Laravel MailManager runtime probe показав `raw_url_is_empty_string=true`, `parsed_transport=null`, `InvalidArgumentException`, **`Unsupported mail transport []`**. Окрема synthetic SMTP diagnostic спроба завершилася exit **1** до доставки. Не копіювали exception payload, addresses, reset URL або token.
- **Підтверджена причина:** у **створеному агентом приватному Stage 15 runtime** `MAIL_URL=''` перекрив SMTP config при URL parsing. Це не помилка Mailpit, Queue Worker або Backend application code; оригінальна developer `.env` не була джерелом цієї correction.
- **Точне виправлення:** тільки в ignored `.auth/stage15/runtime.env` встановлено `export MAIL_URL='null'` — Laravel нормалізує це в null. Перезапущено власні isolated processes; після bootstrap `url_is_null=true`, `parsed_transport=smtp`.
- **Reverification:** HTTP→DB binding повторено; тільки mail-сценарій повторено. Exit **0**, **1 PASS**, forgot 202, новий Mailpit email, reset 200, old login 422, new login/profile 200. Фінально jobs=0 і failed_jobs=0.
- **Application code change:** не потрібна. Додано лише відсутній focused live test.

### E15B-04 — HTTP child утримував порт після зупинки parent

- **Компонент / severity / classification:** isolated service restart; LOW; LOCAL_NETWORK.
- **Очікування:** після TERM власному Artisan parent порт 8000 звільняється.
- **Факт / reproduction:** спроба перезапуску `artisan serve ... --port=8000 --no-reload` завершилась exit **1**, `Address already in use`; `ss` показав старий isolated HTTP child PID 85633.
- **Підтверджена причина:** завершення parent не завершило HTTP child одразу. Перевірено CWD public та точний Stage 15 DB environment child; сторонній процес не припиняли.
- **Виправлення:** TERM тільки цьому підтвердженому власному isolated child; перевірка вільного порту; запуск рівно одного server.
- **Reverification:** HTTP child PID 93010 слухає очікуваний порт; CSRF 204, session binding і mail/read suites PASS.
- **Application code change:** не потрібна.

### E15B-05 — нова provider-перевірка не запускалася

- **Компонент / severity / classification:** Gemini; LOW, погоджена межа; GEMINI.
- **Очікування:** без окремого дозволу не створювати платних запитів.
- **Факт:** provider test та AI mutation suites **NOT RUN**, без exit code. Є лише sanitized effective configuration, read-only UI/API й повідомлення оператора про попередній успіх.
- **Причина:** пряме обмеження поточного завдання, не недоступність провайдера й не application defect.
- **Подальша дія:** жодна для погодженого локального acceptance; для окремого provider milestone потрібен дозвіл на конкретний платний request.
- **Application code change / reverification:** не потрібна / новий paid test не виконувався.

## 11. Артефакти й безпечне продовження

Committed files цього milestone:

- `docs/stage15/frontend-live-acceptance.md` — цей український звіт.
- `e2e/stage15.live.spec.ts` — три focused opt-in real integration checks.
- `playwright.system-live.config.ts` — додатковий testMatch із незміненим existing authorization.

Private ignored artifacts: `.auth/stage15/runtime.env`, account/state/grant, `identity.json`, `http-binding.json`, `recovery-fixtures.json`, `delivery-fixtures.json`, `evidence.jsonl`, `final-browser.json`, `final-persistence.json`, process PID files і sanitized/raw-local test logs. Existing system fixture ledger також збережено в `.auth/system-fixtures-*.jsonl`. Їх не включати в Git, report attachments або спільні архіви. Credentials/reset URL/mail content у committed files відсутні.

### Дії розробника

Критичних невирішених blockers для погодженого Stage 15 немає. **Повний погоджений локальний acceptance досягнуто**; production, зовнішній SMTP та paid Gemini acceptance цим не оголошуються.

1. Для наступної read-only перевірки у цьому самому workspace використати збережений ізольований runtime і актуальну сесію:

   ```bash
   cd /home/oleksiibashuk/CourseProject/student-planner-frontend
   source .auth/stage15/runtime.env
   export F7_READ_STORAGE_STATE=.auth/stage15/state.json
   export F7_READ_USER_ID=1
   npm run test:live:read
   ```

2. Перед продовженням перевірити фактичні listeners/processes. Grant має обмежений час дії; не змінювати timestamp механічно без повторного підтвердження runtime/DB/account facts:

   ```bash
   ss -ltnp '( sport = :8000 or sport = :5173 )'
   docker ps --filter name=student-planner-mailpit
   php e2e/support/inspect-backend.php ../student-planner-backend
   cat .auth/stage15/http.pid .auth/stage15/worker.pid .auth/stage15/scheduler.pid
   ```

3. Якщо керований процес завершився, запускати його **лише після `source .auth/stage15/runtime.env`**, з Backend CWD. Не створювати duplicate listeners/workers/scheduler:

   ```bash
   # Кожний потрібний процес — у своєму терміналі; запускати лише відсутній.
   source /home/oleksiibashuk/CourseProject/student-planner-frontend/.auth/stage15/runtime.env
   cd /home/oleksiibashuk/CourseProject/student-planner-backend
   php artisan serve --host=localhost --port=8000 --no-reload
   # В іншому підготовленому терміналі за потреби:
   php artisan queue:work --tries=1 --sleep=1 --timeout=60
   # Ще в одному підготовленому терміналі, якщо немає чинного scheduler:
   php artisan schedule:work
   ```

4. За потреби повторити **лише поштову перевірку**, перевіривши grant validity, synthetic account identity, Mailpit і worker; врахувати password broker throttling між запитами. Не запускати full system suite повторно на вже заповненому account:

   ```bash
   # Frontend root, ізольований runtime уже завантажений; чинний grant перевірений.
   export F7_BACKEND_ROOT="$(cd ../student-planner-backend && pwd)"
   export F7_LIVE_ALLOW_MUTATIONS=1 F7_LIVE_GRANT=.auth/stage15/grant.json
   export F7_LIVE_ALLOW_DISPATCH=1 STAGE15_LIVE_ACCEPTANCE=1
   export STAGE15_ACCOUNT_FILE=.auth/stage15/account.json
   export STAGE15_RECOVERY_FIXTURES=.auth/stage15/recovery-fixtures.json
   export STAGE15_EVIDENCE_FILE=.auth/stage15/evidence.jsonl
   npm run test:live:system -- --grep 'Mailpit password recovery'
   ```

5. Для нового повного fixture run потрібні нові порожні synthetic account/fixtures у disposable schema та новий grant, заснований на перевірених фактах. Чинна recovery fixture вже підтверджена; її не перетворювати на «порожню» й не скидати retained database заради повторного тесту. Автоматично не видаляти Stage 15 БД.

6. Якщо потрібно повернути developer server до `student_planner`, спочатку завершити **тільки** ідентифіковані Stage 15 processes, перевіривши актуальні PID/CWD/runtime та звільнення 8000. Потім у **новому терміналі без Stage 15 exported variables**:

   ```bash
   cd /home/oleksiibashuk/CourseProject/student-planner-backend
   php artisan serve --host=localhost --port=8000
   ```

   Не переносити Stage 15 grant на цей server і не запускати на ньому mutation suites/worker/другий scheduler за даним дозволом.

## 12. Підсумкове рішення

**PASS — погоджений Stage 15 локальний acceptance виконано.** Усі дозволені обов'язкові сценарії перевірено проти справжнього Laravel/MySQL; Mailpit delivery, reset/login, Scheduler delivery та Inbox підтверджені окремими фактичними доказами. Невирішених application defects або критичних environment blockers не виявлено. Новий paid Gemini request залишається NOT RUN відповідно до вимоги користувача.

</details>
