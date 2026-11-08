# Stage 15B — Жива інтеграція Frontend та перевірка поштової готовності

**Рішення: CONDITIONAL.** Дозволені анонімні HTTP/browser перевірки пройшли;
Backend, Frontend і Mailpit доступні. Повне приймання функціональних сценаріїв
та password recovery не завершене: немає переданої дозволеної read-сесії,
дозволу на ізольовані мутації/reset і підтвердженого queue worker. Успішне
TCP-з'єднання з SMTP не зараховано як доставлений Laravel-лист.

## A. Середовище та фактична доступність

- Дата: **2026-11-08**; контрольний HTTP-знімок **11:31 UTC**, фінальна
  повторна перевірка доступності **11:42:06 UTC**.
- Frontend base commit: `23b28e0610e36464959ed783c2e3dcf2359ee892`;
  `main`, початкове дерево чисте. Цей milestone комітиться поверх нього.
- ОС/kernel: Linux `7.2.8-200.fc44.x86_64`, x86_64; Bash **5.3.9**.
  Node **22.23.1**, npm **11.20.0**, Playwright **1.64.1**;
  фактичний Vite build **8.3.5**. Node відповідає package.json engines.
- Перевірені origins: `http://localhost:5173`, `http://localhost:8000`;
  додатково Mailpit `http://localhost:8025` і SMTP `127.0.0.1:1025`.
- Усі три HTTP-сервіси повернули **200**. Анонімний `/api/profile` — **401**;
  CORS preflight — **204**. Проблеми недоступного localhost у цьому запуску немає.
- Docker доступний: контейнер `student-planner-mailpit`, image `axllent/mailpit`,
  статус `healthy`; опубліковані порти **1025** та **8025**. Environment,
  credentials, container logs і вміст поштових повідомлень не читалися.
- У доступному `/proc` серед довготривалих PHP ролей спостерігався лише
  `serve` (PID 70739). `queue:work`, `queue:listen`, `schedule:work` і
  `schedule:run` не спостерігалися. Це не виключає cron, контейнер або інший
  namespace/вузол; належність процесів до Backend source не досліджувалася.
- `F7_READ_STORAGE_STATE`, `F7_READ_USER_ID`, mutation grant/opt-in змінні та
  paid opt-in змінні не передані. Перевірена тільки їхня наявність; `.auth/`
  не переглядався, старі сесії/акаунти з історичних звітів не використовувалися.
- MySQL `student_planner`, database sessions/queue, Gemini `gemini-3.5-flash-lite`
  та запущений Scheduler — **операторські вхідні відомості**. Поточну Backend
  конфігурацію, release commit, SQL/schema, cache або процес доставки цей запуск
  незалежно не перевіряє: Backend source і прямий доступ до БД заборонені.

Прочитано Frontend `AGENTS.md`, наявні live safety/browser helpers, live configs,
read-spec, API layer, auth/router, Reminder/Inbox/password/AI представлення та
локальні deployment/acceptance звіти. GitHub і Backend файли не відкривалися.
Усі команди запускались через Bash з Frontend root. `.env`, migrations і
бізнес-дані Backend не редагувалися; SQL, реєстрація, login, mail/reset POST,
підтвердження планів, mark-read, dispatch, worker і paid AI не запускалися.
Звичайна дозволена ініціалізація Laravel CSRF/session може створити службові
сесійні дані — це не підготовка disposable business fixtures або reset token.

## B. Матриця перевірок

`PASS` стосується лише описаного обсягу. `BLOCKED` означає відсутню передумову,
`NOT RUN` — свідомо не виконану дію поза дозволом. **401 підтверджує захищеність
межі, але не працездатність читання/запису даних після входу.**

| ID  | Перевірка                                     | Очікування                                                          | Фактичний результат / доказ                                                                          | Статус          | Далі                                                  |
| --- | --------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------- |
| P01 | Backend health                                | GET `/up` → 200                                                     | HTTP 200, curl exit 0; фінально повторено                                                            | PASS            | Немає                                                 |
| P02 | Реальний Frontend origin                      | HEAD localhost:5173 → 200                                           | HTTP 200, curl exit 0; фінально повторено                                                            | PASS            | Не підміняти цим повний dev-browser сценарій          |
| P03 | Anonymous profile                             | 401 JSON із дозволеним Origin                                       | 401, Content-Type application/json, ACAO=localhost:5173, credentials=true, exit 0                    | PASS            | Authenticated profile — A02                           |
| P04 | CORS preflight                                | OPTIONS login → 204 і коректні headers                              | 204; ACAO exact origin; credentials=true; method POST; content-type,x-xsrf-token; exit 0             | PASS            | Немає                                                 |
| P05 | Docker SMTP service                           | Контейнер запущений                                                 | Mailpit healthy, 1025/8025 published; docker exit 0                                                  | PASS            | Не є mail delivery                                    |
| P06 | SMTP TCP                                      | З'єднання з 127.0.0.1:1025                                          | Ncat exit 0; 0 bytes sent/received; повторено                                                        | PASS            | D04–D09                                               |
| P07 | Mailpit UI                                    | HEAD localhost:8025 → 200                                           | HTTP 200, exit 0; повторено                                                                          | PASS            | Повідомлення не читались                              |
| A01 | Anonymous browser CORS/CSRF/protection        | CSRF 204; cookies присутні; protected reads 401                     | Наявний Playwright read-live тест PASS на реальному API                                              | PASS            | Межі test helper описані у F                          |
| A02 | Дозволений profile/read session               | Profile 200 для очікуваного користувача, без зайвого login redirect | Другий read-live тест SKIP: немає F7_READ_STORAGE_STATE / F7_READ_USER_ID                            | BLOCKED         | E15B-01                                               |
| A03 | Login/logout/session restoration              | Реальний дозволений акаунт                                          | Не входили, credentials не вигадували                                                                | NOT RUN         | E15B-01/02                                            |
| F01 | Academic context                              | Читання Institutions/Periods/Subjects/Teachers після входу          | Чотири анонімні GET → 401, exit 0; дані після входу не читались                                      | BLOCKED         | E15B-01                                               |
| F02 | Schedule/Lessons                              | Коректне читання розкладу після входу                               | Anonymous GET `/api/schedule/today` → 401, exit 0                                                    | BLOCKED         | E15B-01                                               |
| F03 | Tasks/Subtasks                                | Читання дозволених завдань і children                               | Anonymous `/api/tasks` → 401; приватні IDs для subtasks не підбирались                               | BLOCKED         | E15B-01                                               |
| F04 | Study preferences/availability                | 200 після входу                                                     | Anonymous boundary 401 перевірено browser тестом                                                     | BLOCKED         | E15B-01                                               |
| F05 | Free time/sessions                            | Реальні intervals, timezone і reservations                          | Anonymous range GET → 401 у browser тесті; intervals не читались                                     | BLOCKED         | E15B-01                                               |
| F06 | Study-plan/recovery previews                  | Авторизовані read-only proposals                                    | POST preview не надсилався без дозволеної сесії; HEAD `/planning/recovery` → 200 є лише SPA fallback | NOT RUN         | E15B-01                                               |
| F07 | Створення/зміна роботи, plan confirmation     | Ізольований акаунт і явна згода                                     | Mutation grants відсутні; не виконувалось                                                            | NOT RUN         | E15B-02                                               |
| N01 | Reminders list/status                         | Читання persisted status після входу                                | Anonymous `/api/reminders` → 401 у browser тесті; UI/API source переглянуто                          | BLOCKED         | E15B-01/05                                            |
| N02 | Inbox та unread filtering                     | GET усіх/непрочитаних records                                       | unread_only=true → 401 у browser тесті; unread_only=false → 401 через curl                           | BLOCKED         | E15B-01                                               |
| N03 | Persisted delivery/read presentation          | Побачити дозволене доставлене сповіщення                            | Реальне сповіщення не відкривали; sent/read_at представлення перевірено тільки у source              | NOT RUN         | E15B-01/05                                            |
| N04 | Mark-read/dispatch/new reminder               | Окремий дозвіл на зміну                                             | POST read, dispatch і створення не виконувались                                                      | NOT RUN         | E15B-02/05                                            |
| R01 | Progress/trends/comparison                    | Авторизовані реальні metrics                                        | Усі три anonymous GET → 401 у browser тесті; authenticated branch SKIP                               | BLOCKED         | E15B-01                                               |
| R02 | Nullable/fractional percentage у live harness | Не вважати completion_percent integer count                         | Виправлено test-only дефект; два regression cases пройшли                                            | PASS            | E15B-07; реальні metrics після входу ще не перевірені |
| D01 | Queue/mail/schema identity                    | Ефективна конфігурація оператора                                    | Backend не інспектувався; актуального очищеного підтвердження не надано                              | BLOCKED         | E15B-04                                               |
| D02 | Queue worker                                  | Поточний доказ worker для потрібної БД/черги                        | Локальний worker не спостерігається; зовнішній не виключено                                          | BLOCKED         | E15B-03; QUEUE_WORKER_BLOCKED                         |
| D03 | Reminder Scheduler                            | Реєстрація, поточний запуск та окремий delivery proof               | Запуск повідомлено оператором; видимого PHP Scheduler зараз немає                                    | BLOCKED         | E15B-05                                               |
| D04 | Password reset accepted                       | Дозволений forgot-password POST → 202                               | Не надсилався: немає reset/mutation дозволу                                                          | NOT RUN         | E15B-02/03/04                                         |
| D05 | Reset email received                          | Лист від цього Laravel запиту в Mailpit                             | Inbox Mailpit не читався, test mail не надсилався                                                    | NOT RUN         | E15B-02/03/04                                         |
| D06 | Reset link → Frontend                         | Реальний дозволений link правильно відкриває форму                  | HEAD `/reset-password` → 200 без query; реального link не було                                       | NOT RUN         | E15B-02                                               |
| D07 | Reset + новий login                           | Змінити пароль ізольованого акаунта й увійти                        | Не виконувалось                                                                                      | NOT RUN         | E15B-02                                               |
| G01 | AI UI/API/error handling                      | Коректні endpoints, credentials, errors без нового inference        | Source review PASS; anonymous conversations GET → 401; provider errors live не викликались           | PASS, обмежений | E15B-06                                               |
| G02 | Gemini model/live interaction/27 Tools        | Окремий реальний evidence у погодженому обсязі                      | Успіх gemini-3.5-flash-lite повідомлений оператором; нового paid виклику немає                       | NOT RUN         | E15B-06; не означає 27 Tools PASS                     |
| V01 | Local build / type-check / focused regression | Коректна локальна збірка і вузькі tests                             | Build PASS; vue-tsc exit 0; activity 84 PASS; formatting PASS                                        | PASS, offline   | Не зараховувати як live acceptance                    |

## C. Детальні діагностичні картки

### E15B-01 — AUTH_SESSION, HIGH: немає дозволеної authenticated read-сесії

- **Очікування:** оператор передає чинний read-only storage state та очікувану
  identity; protected GET повертають 200 для дозволених ресурсів.
- **Факт:** F7_READ_STORAGE_STATE і F7_READ_USER_ID unset; наявний
  `authorized existing session reads F4–F6 resources without domain mutations`
  тест пропущений на початковому guard. Загальний live exit **0** означає
  **1 PASS + 1 SKIP**, а не повне приймання.
- **Відтворення:** `npm run test:live:read` без цих змінних. Додаткові curl GET
  академічних collections, schedule/today, tasks та Inbox повернули **401**,
  curl exit **0**. Це очікуваний захист, не помилка Backend.
- **Підтверджено:** немає переданої сесії; поточні приватні дані не читались.
  Існування старих `.auth` файлів або історичного тестового акаунта не є новим
  дозволом; їх не шукали й не підбирали.
- **Можливі причини майбутнього 401 після передачі state:** expiry, неправильний
  hostname, інший акаунт/середовище. Зараз їх не діагностовано.
- **Виправлення:** оператор надає свіжий, явно дозволений state під ignored
  `.auth/` та очікуваний user ID через локальне середовище; значення не включати
  у звіт. Повторити команду G2. Safety path check залишити незмінним.
- **Потрібні зміни:** доступ/авторизація, не application code.
- **Recheck:** повторний live запуск після test-only виправлення — той самий
  чесний результат **1 PASS / 1 SKIP**; акаунт не вигадувався.

### E15B-02 — AUTH_SESSION, HIGH: не дозволені ізольовані мутації та reset

- **Очікування:** явний дозвіл на конкретний ізольований акаунт/адресу та точні
  дії, включно зі створенням reset token і зміною пароля.
- **Факт:** такого дозволу немає; mutation opt-in/grant змінні unset. CRUD,
  confirmations, reminder creation/read mutation, forgot/reset/login не
  запускалися. Exit/HTTP для цих дій — **N/A**, не 202/201/200.
- **Відтворення:** перевірити тільки наявність змінних; не запускати mutation
  suite заради доказу відмови. Наявний liveSafety вимагає grant, identity,
  schema, expiry, isolated nonvaluable scope і додаткові registration/dispatch
  дозволи. Системні mutation suites також викликають Backend identity probe,
  тому вони несумісні з поточною забороною Backend inspection без окремого
  уточнення scope. Guard не вимикався і Backend root не передавався.
- **Підтверджено:** reset token/лист цим milestone не створено; Mailpit inbox
  сторонніх акаунтів не читався. Неможливо безпечно завершити mail/reset
  acceptance тільки анонімними запитами.
- **Виправлення:** оператор окремо визначає дозволений акаунт/адресу й погоджує
  кроки 6–9 mail verification; credentials і link/token залишаються приватними.
  Не використовувати retained дані як disposable fixtures. Не вмикати system,
  registration чи dispatch flags лише для завершення звіту.
- **Потрібні зміни:** дозвіл/контрольований acceptance, не код.
- **Recheck:** дозвіл не надійшов; мутації залишаються **NOT RUN**.

### E15B-03 — QUEUE_WORKER, HIGH: QUEUE_WORKER_BLOCKED, не SMTP_FAILURE

- **Очікування:** чинний worker потрібної Laravel connection/queue, або
  надійний очищений доказ оператора про зовнішній worker.
- **Факт:** Bash process scan exit **0**, у двох snapshots тільки PHP `serve`;
  queue:work/queue:listen не знайдені. Порт SMTP у цей самий час доступний:
  `Ncat: Connected to 127.0.0.1:1025`, exit **0**, без SMTP payload.
- **Підтверджено:** немає видимого local worker у доступному `/proc`.
  Відсутність worker в іншому namespace/контейнері не доведена. Тому delivery
  має стан **BLOCKED / QUEUE_WORKER_BLOCKED**, а не встановлену SMTP-помилку.
- **Можливі причини:** worker не запущено, інший execution context або немає
  доступу до його process evidence. Причину абсолютної відсутності не встановлено.
- **Виправлення:** оператор підтверджує існуючий worker, його queue/connection
  та цільову БД. Запуск нового worker може обробити наявні jobs, тому потребує
  усвідомленого дозволу оператора; тут не запускався, навіть з `--once`.
- **Потрібні зміни:** операційне середовище/доказ, не Frontend.
- **Recheck:** **11:37:06 UTC** — SMTP доступний, локальний worker знову не
  спостерігається. Нічого автоматично не оброблялося.

### E15B-04 — ENV_CONFIGURATION, MEDIUM: Backend runtime/schema не інспектувався

- **Очікування:** актуальне очищене підтвердження database, queue, mailer,
  session і provider configuration, за потреби migration status.
- **Факт:** source/config/SQL probes не запускалися через правила milestone;
  exit **N/A**. `/up` **200** і Docker Mailpit healthy не доводять, що Laravel
  використовує саме цей SMTP або базу student_planner.
- **Підтверджено:** типові origins узгоджені через реальні HTTP/CORS/CSRF
  відповіді; ефективні DB name/schema та mail transport не встановлені тут.
- **Можливі причини майбутньої mail проблеми:** log mailer, інший host/port,
  застарілий config cache, неправильна queue. Це гіпотези, не підтверджені збої.
- **Виправлення:** оператор у своєму Backend-терміналі надає очищену конфігурацію
  за G3, без credentials. Якщо MAIL_MAILER=log, потік не вправляє SMTP й не
  підтверджує реального email delivery; лог може містити reset link, його не
  копіювати. Змінювати Backend `.env` агент не уповноважений.
- **Потрібні зміни:** операторська перевірка; потреби змінювати код не доведено.
- **Recheck:** не виконувався без відповідного доступу; **BLOCKED**.

### E15B-05 — SCHEDULER, MEDIUM: запуск і доставка сповіщень не підтверджені

- **Очікування:** поточний scheduler evidence і окреме спостереження дозволеної
  persisted notification; sent/read не можна виводити лише з часу або процесу.
- **Факт:** оператор повідомляє про запущений Scheduler. Bash scan exit **0**
  не бачить schedule:work/schedule:run; короткий cron invocation міг не потрапити
  у snapshot. Backend schedule:list не виконувався. У live API Inbox повертав
  лише **401**, без доступу до notification records.
- **Підтверджено:** анонімний доступ захищено; Frontend source розділяє reminder
  status, Inbox receipt і read_at. Факт доставки/прочитання не встановлено.
- **Можливі причини:** cron/інший namespace; відсутність дозволеної сесії;
  відсутність готових тестових notification. Збої Scheduler не доведені.
- **Виправлення:** оператор підтверджує реєстрацію через G3 і поточний запуск
  своїм process/cron evidence; надає очищені counters вже виконаного циклу або
  дозволяє read-only перегляд раніше доставленого тестового notification.
  Новий dispatch, reminder чи другий Scheduler не запускати.
- **Потрібні зміни:** доступ/операторський evidence, не Frontend.
- **Recheck:** фінальний process snapshot без видимого Scheduler; реальна
  notification не спостерігалась. **BLOCKED/NOT RUN** залежно від кроку.

### E15B-06 — GEMINI_PROVIDER, MEDIUM: live поведінка лише повідомлена оператором

- **Очікування:** чесне розділення Frontend error-handling, operator evidence і
  нових paid calls; без твердження про повне живе тестування 27 Tools.
- **Факт:** розробник повідомив успішний gemini-3.5-flash-lite запит; нових paid
  викликів немає. Anonymous GET conversations повернув **401**, exit **0**.
  Це authentication boundary, не тест генерації чи виконання Tools.
- **Source evidence:** `src/api/ai.ts` використовує спільний HTTP client і
  структурні перевірки; `src/api/client.ts` передає credentials/CSRF, обробляє
  401/419/422/429/502/503 і Retry-After; `src/utils/ai.ts` має окремі повідомлення
  provider_error, invalid_provider_response, ai_unavailable та застереження про
  вартість повтору. Автоматичного повтору мутацій немає. Це статичний огляд,
  не новий live PASS усіх цих error paths.
- **Невідоме:** поточна server-side model/config і повний Tool matrix.
  Помилки провайдера під час цього milestone не спостерігалися.
- **Наступна дія:** отримати очищений операторський запис вже виконаного успіху
  (дата, модель, статус, назви Tools без приватних аргументів). Новий paid запит
  не потрібний лише для повторення цього факту; за окремої потреби він вимагає
  окремого явного дозволу. Не змінювати model/provider і не вмикати paid flags.
- **Потрібні зміни:** evidence/дозвіл за потреби, не application code.
- **Recheck:** paid requests **NOT RUN**; заяви про live PASS 27 Tools немає.

### E15B-07 — API_CONTRACT, MEDIUM: виправлена помилка read-live assertion

- **Очікування:** integer/nonnegative перевірки застосовуються до counts;
  Tasks completion_percent допускає null і дробове число за чинним контрактом.
- **Підтверджений source-дефект:** `src/types/api.ts` містить
  `completion_percent: number | null`, а read.live.spec перебирав усі
  `Object.values(work.current)` через `Number.isInteger`. Коректні null/33.3
  спричинили б хибну відмову тесту. На реальних authenticated даних відмову не
  спостерігали: ця гілка була SKIP, і це не дефект production UI.
- **Відтворення:** легальні nullable/fractional fixture випадки з наявного
  activity helper; старий integer predicate для обох значень false.
- **Мінімальне виправлення:** test-only `e2e/support/progressRead.ts` явно
  відбирає чотири current counts і period counts. Read-live окремо перевіряє
  non-null percentage як finite number у межах 0–100. Формулу Backend не дублює.
  `tests/activity.test.ts` доповнено двома regression cases.
- **Reverification:** вузький запуск — **2 PASS**; фінальний існуючий
  activity набір — **84 PASS**, exit **0**; TypeScript і formatter PASS.
  Повторний реальний read-live — **1 PASS / 1 SKIP**, exit **0**. Auth skip не
  прибрали та не називали успішним authenticated acceptance.
- **Потрібні зміни:** тільки Frontend test harness, **виправлено**; жодного
  application Service/component/API contract або Backend-коду не змінено.

## D. SMTP та Queue — окремі рівні доказу

| Крок                              | Стан                           | Що саме встановлено                                                  |
| --------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| 1. SMTP container running         | PASS                           | Docker Mailpit healthy, 1025/8025 published                          |
| 2. SMTP port reachable            | PASS                           | nc -zv, exit 0, 0 bytes sent/received                                |
| 3. Mailpit UI reachable           | PASS                           | HEAD 8025 → 200; повідомлення не відкривались                        |
| 4. Laravel mail configuration     | BLOCKED                        | Актуальне операторське підтвердження потрібне, E15B-04               |
| 5. Queue Worker running           | BLOCKED — QUEUE_WORKER_BLOCKED | Local process не спостерігається; зовнішній потребує доказу, E15B-03 |
| 6. Reset request accepted         | NOT RUN                        | Немає дозволу на token/job creation; 202 не отримували               |
| 7. Reset email received           | NOT RUN                        | Немає дозволеного запиту/адреси; чужий Inbox не читався              |
| 8. Real reset link opens Frontend | NOT RUN                        | HEAD SPA route 200 не є перевіркою отриманого link                   |
| 9. Reset password + login         | NOT RUN                        | Зміна акаунта не дозволена                                           |

Поточна SMTP_CONNECTIVITY **PASS** не знімає queue/config/authorization gates.
Немає доказу SMTP_FAILURE. Навіть майбутній 202 буде доказом прийняття запиту,
а не доставки. Reset links, tokens, cookies, mail addresses і private records не
включено до звіту або коміту. Mailpit message API не викликався.

Для notifications source review підтверджує окремі поняття:

- `scheduled`: Reminder має серверний запланований стан/trigger; браузер його
  не доставляє лише через настання часу.
- `sent`: сервер повернув відповідний статус Reminder; це не означає read.
- Inbox notification: окремий уже persisted серверний запис; оновлення Inbox
  робить GET і не запускає delivery.
- `read_at`: серверний стан прочитання. Фільтр `unread_only=true|false` працює
  через GET; кнопка mark-read робить явний POST. Автоматично її не натискали.

Живих прикладів цих станів без дозволеної сесії не було. Source labels/API wiring
не видаються за фактичну доставку або прочитання конкретного notification.

## E. Gemini — факти та операторські відомості

Frontend AI API/error handling переглянуто без виклику generation endpoint.
Модель обирає Backend, Frontend її не підміняє. Операторське твердження про
успішний gemini-3.5-flash-lite запит збережено як **operator-reported**.
Поточну model/key/limits конфігурацію тут не зчитували з Backend.

Не запускали `test:live:ai`, `test:live:lessons`, mutation AI workflows, не
створювали conversations/messages і не підтверджували AI actions. Не було нового
paid запиту або твердження, що всі 27 Tools пройшли live verification. Для
подальшого evidence достатньо погодженого очищеного запису вже виконаного запиту;
автоматичний повтор заради звіту не потрібен.

## F. Фактичний обсяг інтеграції й перевірок

### Реальні запити цього milestone

`npm run test:live:read` виконано перед виправленням і повторно після нього:
обидва рази exit **0**, **1 PASS / 1 SKIP**. Пройшли:

- Перехід із захищеного `/planning` до очікуваного login redirect.
- Реальний Laravel-origin `/sanctum/csrf-cookie` → **204** у browser context;
  перевірена наявність XSRF cookie і принаймні одного HttpOnly cookie, без
  копіювання їхніх значень або storage state.
- Реальні credentialed protected GET → **401** для profile, preferences,
  availability, free slots, study sessions, reminders, unread Inbox, progress,
  trends і comparison.
- Додаткові curl GET → **401** для Institutions, Periods, Subjects, Teachers,
  schedule/today, Tasks, all Inbox і AI conversations; приватні IDs не підбиралися.
- Прямі HEAD на Frontend `/login`, `/forgot-password`, `/reset-password` без
  query та `/planning/recovery` → **200**. Це доступність SPA history fallback,
  не виконання відповідних форм чи authenticated workflow.

**Важлива межа наявного helper:** `serveLiveFrontend` віддає локальний зібраний
`dist` через route.fulfill тільки для Frontend assets. Жодних Laravel/API
відповідей не підмінено. Отже browser результат стосується built Frontend ↔
реального Laravel origin; окремі прямі HTTP HEAD підтверджують доступність
справжнього dev-server, але не весь його browser runtime/HMR. Нового тестового
framework, API fixtures для live успіху або альтернативного live runner не додано.

Authenticated читання, академічні/навчальні workflow, generation/recovery preview,
реальні статистичні значення й Inbox дані **не прийняті live**. Прямого MySQL
читання/reconciliation не було: actual DB identity/schema залишається operator
confirmation, не наслідком HTTP health PASS.

### Локальні offline перевірки — не live evidence

| Команда                                                                                               | Результат                                                              |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run test:live:read`                                                                              | Build-only PASS + 1 реальний anonymous PASS, 1 authorized SKIP; exit 0 |
| `./node_modules/.bin/vitest run tests/activity.test.ts -t 'Live read statistics count compatibility'` | 2 PASS, 82 виключені фільтром; exit 0                                  |
| `./node_modules/.bin/vitest run tests/activity.test.ts`                                               | 84 PASS; exit 0; HTTP fixtures, без реальних бізнес-операцій           |
| `npm run type-check`                                                                                  | PASS, exit 0                                                           |
| Prettier для змінених test/report файлів                                                              | PASS після форматування                                                |
| `git diff --check`                                                                                    | PASS                                                                   |

Локальний [звіт Stage 14B](../stage14/frontend-result.md) містить історичні
результати offline regression (517 unit tests, 80 desktop/mobile E2E), явно
позначені як fixture-based. Це repository-recorded evidence попереднього стану,
не перевірений поточний GitHub статус і не нове live приймання. GitHub CI не
відкривався, не запускався; повні offline suites повторно не виконувалися.

### Файли поточного milestone

- `e2e/read.live.spec.ts`: коректне розділення integer counts і percentage.
- `e2e/support/progressRead.ts`: невеликий test-only count projection helper.
- `tests/activity.test.ts`: два сфокусовані regression cases у наявному наборі.
- `docs/stage15/frontend-live-acceptance.md`: цей діагностичний звіт.

`liveSafety.ts`, `liveBrowser.ts`, live configs, application-код і залежності
незмінні. Зміни зроблено тільки в Frontend на `main`; старі дані не видалялися,
Backend source/config/міграції/БД не редагувалися. Нові службові CSRF/session
cookies існували лише в дозволеному browser context; у report/trace/commit їх
немає. `trace` залишається off.

## G. План дій розробника — Bash і межі дозволу

### G1. Повторити безпечні preflight перевірки з Frontend root

Не виводити сирі `curl -i` headers: вони можуть містити Set-Cookie. Нижче
виводяться лише статус і дозволені CORS headers, тіла відкидаються.

```bash
set -o pipefail
probe_http() {
  local url="$1"
  shift
  curl --noproxy '*' -sS --connect-timeout 3 --max-time 5 -D - -o /dev/null "$@" "$url" |
    awk 'BEGIN{IGNORECASE=1} /^HTTP\// || /^Access-Control-Allow-Origin:/ || /^Access-Control-Allow-Credentials:/ || /^Access-Control-Allow-Methods:/ || /^Access-Control-Allow-Headers:/ {gsub(/\r/, ""); print}'
  local result="${PIPESTATUS[0]}"
  printf 'curl_exit=%s\n' "$result"
}
probe_http http://localhost:8000/up
probe_http http://localhost:8000/api/profile -H 'Accept: application/json' -H 'Origin: http://localhost:5173'
probe_http http://localhost:8000/api/auth/login -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type,x-xsrf-token'
probe_http http://localhost:5173 --head
probe_http http://localhost:8025 --head
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
nc -zv -w 3 127.0.0.1 1025
```

Очікування: 200, 401, 204, 200, 200; curl/Docker/nc exit 0. Якщо Docker
недоступний, це TEST_ENVIRONMENT/BLOCKED для Docker evidence, не доказ зламаного
SMTP. Якщо localhost іншого середовища недоступний — перевіряти на машині
оператора; не виправляти Frontend source під інший namespace.

### G2. Передати дозволену read-сесію і повторити чинний read test

Оператор попередньо надає свіжий state під ignored `.auth/` та очікувану
identity через локальне середовище. Не друкувати файл або значення identity;
не брати файл іншого retained акаунта. Команди нижче самі не створюють login.

```bash
test -n "${F7_READ_STORAGE_STATE:-}" &&
test -n "${F7_READ_USER_ID:-}" &&
npm run test:live:read
```

Для закриття authenticated read gate очікується **2 PASS / 0 SKIP**; це ще не
покриття всіх академічних workflow чи password reset. Цей старий read сценарій
має фіксовані жовтневі reporting dates й не створює майбутній recovery plan.
Розширення живого сценарію поза ним потребує дозволеного акаунта та погодженого
переліку додаткових GET/previews; не виконувати plan confirmation/CRUD автоматично.

### G3. Оператор підтверджує Backend configuration/queue/schema у власному терміналі

Ці команди **агент у Stage 15B не виконував**: вони призначені оператору у його
Backend-терміналі. Вивід містить тільки явний безпечний список, не credentials.
Не використовувати config:show mail/ai або повний config/env dump.

```bash
php artisan tinker --execute='echo json_encode([
  "database" => \Illuminate\Support\Facades\DB::connection()->getDatabaseName(),
  "database_driver" => \Illuminate\Support\Facades\DB::connection()->getDriverName(),
  "session_driver" => config("session.driver"),
  "queue" => config("queue.default"),
  "queue_name" => config("queue.connections.database.queue"),
  "mail_transport" => config("mail.mailers.".config("mail.default").".transport"),
  "smtp_host" => config("mail.mailers.smtp.host"),
  "smtp_port" => config("mail.mailers.smtp.port"),
  "smtp_url_configured" => (bool) config("mail.mailers.smtp.url"),
  "ai_provider" => config("ai.provider"),
  "gemini_model" => config("ai.gemini_model"),
  "gemini_key_configured" => (bool) config("ai.gemini_key")
], JSON_PRETTY_PRINT), PHP_EOL;'
php artisan migrate:status --no-ansi --no-interaction
php artisan schedule:list --no-ansi --no-interaction
```

Очікувані операторські підтвердження: student_planner/MySQL, database sessions
і queue, mail transport smtp та endpoint, який досягає Mailpit. `migrate:status`
і schedule:list не запускають міграції/dispatch. Якщо transport=log, спершу
погодити корекцію з Backend-оператором; не тестувати email delivery через log.
Поточний worker/Scheduler підтверджувати своїм process/cron/supervisor evidence.
Починати обробку існуючих jobs або запускати другий Scheduler заради перевірки
не можна. У цьому milestone команди worker/dispatch не виконувалися.

### G4. Безпечно перевірити ролі PHP-процесів без argv/environment у виводі

```bash
for process in /proc/[0-9]*; do
  [[ -r "$process/comm" && -r "$process/cmdline" ]] || continue
  IFS= read -r comm < "$process/comm" || continue
  [[ "$comm" == php ]] || continue
  role=''
  while IFS= read -r -d '' argument; do
    case "$argument" in
      queue:work|queue:listen|schedule:work|schedule:run|serve) role="$argument" ;;
    esac
  done < "$process/cmdline"
  [[ -z "$role" ]] || printf 'pid=%s role=%s\n' "${process##*/}" "$role"
done
```

Порожній результат не доводить відсутність cron/external worker; потрібен доказ
від оператора відповідного середовища. Для QUEUE_WORKER_BLOCKED отримати саме
підтвердження правильного queue/DB target, не робити пробний `queue:work --once`.

### G5. Окремо погодити решту acceptance

1. Назвати дозволений ізольований акаунт/адресу, scope читання/previews і окремо
   reset/token/password-change дозвіл. Не передавати cookies/passwords/token у
   звіт або коміт; не вмикати grants/mutation/paid flags без реальної згоди.
2. Після worker/config підтвердження погодити один forgot-password → отримання
   листа → відкриття link → reset → login сценарій. До згоди Bash POST-команд
   для цих дій тут навмисно немає. Лист/token не зберігати як test artifact.
3. Для notifications дозволити read-only спостереження раніше доставленого
   тестового receipt; не створювати reminder і не запускати dispatch.
4. Для Gemini надати очищений запис вже успішного запиту. Новий paid виклик
   лише за окремою потребою/авторизацією; не заявляти live PASS усіх 27 Tools.
5. Після кожного дозволеного виправлення повторити тільки залежні перевірки,
   записати exit/HTTP й оновити матрицю. Не замінювати missing live evidence
   повторним offline suite або HTTP mocks.

## H. Фінальне рішення

**CONDITIONAL — підтвердженої критичної помилки, що блокує сам зв'язок
Frontend↔Backend, немає.** Анонімний реальний browser/API gate і SMTP
connectivity пройшли. Виправлено один невеликий test-harness contract defect,
production Frontend не змінювався.

**Повне Stage 15 acceptance поки не закрите.** Його можна продовжити після
дозволеної read-сесії/ізольованого scope, поточного Backend configuration та
worker evidence й окремого дозволу на mail/reset. Наявність Mailpit або
operator-reported Gemini/Scheduler success не підміняє ці результати.
Milestone перевірки завершений чесним звітом про весь безпечно доступний обсяг;
неавторизовані сценарії залишено явними BLOCKED/NOT RUN.
