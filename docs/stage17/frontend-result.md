# Stage 17B — аналіз навантаження та рекомендації

Дата: 2026-11-08. Репозиторій: Student-AI-Planner-Frontend. Гілка: `main`.

База Stage 17B та HEAD під час попереднього відновлення (історичний запис): `9a23dc79cf88d5bdaf7ad992fc5972cd45396770`.
Контракт Backend Stage 17A надано для коміту `2aef224118ad4bad371e0d36da96450970a5683f`. Backend, GitHub, MySQL і Backend `.env` не переглядалися та не змінювалися.

## Попереднє відновлення роботи — збережений запис

Перед продовженням повторно прочитано `AGENTS.md`, перевірено гілку, `git status --short`, `git diff --stat`, повний tracked diff, нові файли, останні п’ять комітів і збережені журнали Stage 17B. Жодного коміту Stage 17B ще не було; збереглися зміни в дев’яти tracked-файлах і чотири нові файли. Звіт `docs/stage17/frontend-result.md` був відсутній. Активних процесів попередніх перевірок не залишилося.

| Вимога                                           | Стан при відновленні | Підсумок                                                                                       |
| ------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------- |
| Маршрут, навігація, API і типи                   | COMPLETED            | Збережено та повторно перевірено                                                               |
| Серверний підсумок, progress та нульовий залишок | COMPLETED            | Без обчислення нових підсумків або ділення на нуль                                             |
| Allocation / selection / persisted workload      | COMPLETED            | Джерела та значення не об’єднуються                                                            |
| Денні й ISO-тижневі перевищення                  | COMPLETED            | Періоди збережено як серверні позначення                                                       |
| Порядок, локалізація й рекомендації              | COMPLETED            | Без повторного сортування та автоматичних дій                                                  |
| Виключення, невідомі зусилля, warnings           | COMPLETED            | Окремі секції, null не перетворюється на нуль                                                  |
| Завантаження, помилки, retry, cancellation       | COMPLETED            | Повторно перевірено цільовими тестами                                                          |
| Vitest та браузерний сценарій                    | COMPLETED            | Логи підтвердили 551 Vitest, 8 planning E2E та окремий mobile-аудит; повторено affected-набори |
| Docsify                                          | COMPLETED            | Збережено новий розділ довідки та попередній успішний smoke-check                              |
| Фінальна перевірка після interruption            | PARTIALLY COMPLETED  | Завершено повторними командами нижче                                                           |
| Підсумковий звіт і коміт                         | NOT STARTED          | Звіт створено після відновлення; зміни комітяться прямо в `main`                               |
| Live API / Backend CI                            | NOT RUN              | Не є локальним блокером Frontend; потрібне окреме live-приймання                               |

Після відновлення реалізацію не переписували й не застосовували патчі повторно. Нових підтверджених дефектів коду не виявлено. Завершено аудит наявних змін, повторні перевірки, цей звіт і фінальне оформлення Git. Початкові збої тестів уже були виправлені до interruption; виправлення збережено.

## API та архітектура

Додано захищений маршрут `/planning/workload` з `WorkloadAdviceView.vue`. Він використовує чинні session guards, layout, `PlanningNav`, `RangeFields`, `AppCard`, `AppButton`, `LoadingState`, `FormNotice`, `EmptyState`, `validateRange` та `useResource`.

`planningApi.workloadAdvice(range, signal)` виконує лише:

```http
GET /api/planning/workload-advice?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Accept: application/json
```

Відповідь має тип `Resource<WorkloadAdvice>`. Тип містить усі дев’ять полів контракту: `as_of_utc`, `timezone`, `period`, `summary`, `alerts`, `work_advice`, `excluded_items`, `warnings`, `persisted_workload_violations`. Для priority повторно використано спільний тип; shape підсумку збігається з чинним StudyPlan summary. Token, sessions, expires_at і receipt до цього типу не додавалися.

API-метод явно вибирає лише дві дати, тому зайві властивості об’єкта не потрапляють до query. Немає `user_id`, Task/Subtask scope, timezone, тіла GET чи нового HTTP-клієнта. Збережено `credentials: include`, Accept і AbortSignal чинного клієнта.

Стан звіту локальний. Зміна дат негайно приховує старий звіт, скидає вибраний запит і через `useResource` скасовує попереднє читання. Новий аналіз після редагування дат потребує submit. Старі або пізні відповіді не замінюють новий результат. Ручне оновлення та retry повторюють тільки читання, без polling. На помилці старий звіт не відображається. `401` використовує наявну обробку завершеного сеансу, `422` показує повідомлення полів.

Один невеликий компонент `WorkloadRecommendations.vue` повторно використано для порад у придатній і виключеній роботі. Він лише показує текст і RouterLink. `src/utils/workload.ts` містить переклади, переходи та форматування тривалостей; бізнес-розрахунків, ranking service або альтернативного алгоритму немає. Нових dependencies, stores, AI Tools і background services немає.

## Поведінка сторінки

- Підсумок показує серверні requested / allocated / unscheduled seconds і fully_allocated. Requested — придатні залишкові зусилля після виконаного й чинних резервувань, а не сума початкових оцінок усіх завдань. Progress використовує native value/max без нового підсумку. При нульовому requested показано пояснення замість progress.
- Повне розміщення явно не означає завершення всіх завдань, відсутність виключень чи прострочених дедлайнів або перевірку всіх можливих планів.
- Alerts згруповано за source. Однаковий daily/weekly code в allocation описує обмеження поточної спроби, а в persisted_workload — виміряне перевищення збереженими сесіями. Доведення математичної неможливості інтерфейс не заявляє.
- Для кожного persisted violation показано period, scheduled, limit та excess. `day` позначено «День», `iso_week` — «ISO-тиждень» з незміненим серверним рядком та поясненням року ISO-тижня. Денні й тижневі excess не додаються як незалежний борг.
- Work advice відображається в порядку масиву Backend з його rank. Показано Task ID, необов’язковий Subtask ID, три тривалості, причини та рекомендації. Назви Task/Subject не вигадуються, окремих запитів за кожним рядком немає.
- Відомі дев’ять recommendation codes локалізовано. Невідомий код має пояснення та не отримує вигаданої дії. Переходи ведуть до Task, preferences, availability, plan preview або recovery з Task ID; сам перехід нічого не підтверджує й не надсилає preview.
- Виключені записи відокремлені від придатного залишку: показано identity, оригінальні reason codes разом із поясненням, deadline, priority/position та доступні effort fields. Null effort і невідомі тривалості позначено «Невідомо». Завершена/зарезервована робота та батьківські Task з визначальними Subtasks не подаються як обов’язковий новий обсяг.
- Warnings мають власну секцію. Надлишкове резервування не ототожнюється з виміряним перевищенням лімітів. Alert durations, щоденні/тижневі excess та кілька причин однієї роботи не агрегуються.
- Період і snapshot форматуються за `timezone` та `as_of_utc` відповіді Backend. Сторінка пояснює, що це знімок, а не прогноз із безперервним оновленням.
- Попередження мають текстову severity. Посилання в рядках підкреслено, довгі коди й пояснення переносяться; перевірено keyboard, light/dark та ширини 320/768/1440 px.

## Змінені файли

| Файли                                                                                          | Зміна                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/views/WorkloadAdviceView.vue` (новий)                                                     | Сторінка аналізу й orchestration читання                        |
| `src/components/planning/WorkloadRecommendations.vue` (новий)                                  | Повторно використані advisory-посилання                         |
| `src/utils/workload.ts` (новий)                                                                | Локалізація, navigation mapping, форматування null/seconds      |
| `src/types/planning.ts`, `src/api/planning.ts`                                                 | Exact contract та метод читання                                 |
| `src/router/index.ts`, `src/components/planning/PlanningNav.vue`, `src/views/PlanningView.vue` | Захищений маршрут і два входи до нього                          |
| `src/styles/planning.css`                                                                      | Перенесення тексту, progress, ranked list та доступні посилання |
| `tests/helpers/planningBackend.ts`                                                             | Типізований workload fixture і read-only handler                |
| `tests/workload.test.ts` (новий)                                                               | 15 focused перевірок без нового тестового framework             |
| `e2e/planning.spec.ts`                                                                         | Один новий representative flow в чинному planning suite         |
| `public/help/guide/planning.md`                                                                | Український розділ про аналіз і його межі                       |
| `docs/stage17/frontend-result.md` (новий після відновлення)                                    | Цей звіт                                                        |

Історичні звіти, screenshots, Backend, `.env` та залежності не змінено.

## Перевірки

Середовище: Node.js `v22.23.1`, npm `11.20.0`. Нижче наведено результати попереднього запуску та повторення після відновлення. Усі прикладні HTTP-відповіді Vitest/Playwright надають локальні fixtures. Це не доказ live-інтеграції Laravel.

| Команда                                                                                     | Результат до interruption                                                               | Після відновлення                                          |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `npm test -- tests/workload.test.ts tests/planning.test.ts`                                 | PASS: 81 / exit 0 після виправлень                                                      | PASS: 81 / exit 0                                          |
| `npm test`                                                                                  | PASS: 20 файлів, 551 тест / exit 0                                                      | Не дублювався: код збережено, affected-набори повторено    |
| `npm run type-check`                                                                        | PASS / exit 0 після виправлення типів тесту                                             | PASS / exit 0                                              |
| `npm run build`                                                                             | PASS / exit 0                                                                           | PASS / exit 0                                              |
| `npm run format:check`                                                                      | PASS / exit 0                                                                           | PASS / exit 0                                              |
| `npx playwright test e2e/planning.spec.ts --workers=2`                                      | PASS: 8 / exit 0 після виправлення доступності                                          | PASS: 8 / exit 0, включно з розширеним аудитом 320/1440 px |
| `npx playwright test e2e/planning.spec.ts --grep 'read-only workload analysis' --workers=2` | PASS: 2 / exit 0; розширений аудит 320 і 1440 px в обох темах завершився до відновлення | Входить до повторного planning-набору                      |
| `npm run help:smoke`                                                                        | PASS / exit 0: звичайний base та `/planner/`, deep links, media і mobile width          | Не дублювався: довідка після відновлення не змінювалася    |
| `git diff --check`                                                                          | PASS / exit 0                                                                           | PASS / exit 0                                              |

Тести покривають exact query-only GET і Resource typing; відсутність preview fields; нульовий і частковий залишок; fully allocated з виключеннями; кілька причин без подвійного підсумку; однаковий code у різних source; daily та ISO week-year; null effort; порядок Backend; Task/Subtask; усі відомі рекомендації й fallback; відсутність mutations/confirm; date validation і 31 включну дату; HTTP 401/422/500; мережеву помилку, retry, slow read та stale cancellation. Browser flow додає keyboard, доступність і overflow, ручний refresh та перехід до recovery без автоматичного preview/confirm.

Повний Vitest до interruption був виправданий розширенням shared planning fixture, API/type layer і навігації. Повторно запускати весь unrelated набір після відновлення без змін коду не потрібно. Повний Playwright, live/destructive suites і Gemini не запускалися.

## Діагностика виправлених проблем

### F17-01 — тест перевіряв redirect до завершення навігації

- Severity: low. Категорія: TEST_FIXTURE / timing, не Backend і не підтверджений дефект authentication.
- Команда: `npm test -- tests/workload.test.ts tests/planning.test.ts`, exit `1`: 80 PASS, 1 FAIL.
- Check: `retains the authentication boundary for a 401 analysis response`.
- Очікування: маршрут `/login` після API `401`. Спостереження: assertion отримав `/planning/workload`, поки асинхронний lazy-route ще переходив.
- Санітизований evidence: `expected '/planning/workload' to be '/login'`, `tests/workload.test.ts:270` початкової версії.
- Підтверджена причина: перевірка читала router state завчасно. Виправлення: `vi.waitFor` для завершення переходу, додаткові assertions `auth.user === null` та відсутності захищеного вмісту. Timeout/guard не послаблювалися.
- Повтор: 81 PASS, потім 551 PASS у повному Vitest; після відновлення цільові 81 PASS / exit `0`.

### F17-02 — невідповідний метод DOMWrapper у новому тесті

- Severity: medium для gate type-check. Категорія: TEST_FIXTURE / TypeScript, не API.
- Команда: `npm run type-check`, exit `2`.
- Очікування: типізовані assertions на посилання. Спостереження: дві помилки `TS2339: Property 'exists' does not exist on type 'Omit<DOMWrapper<Element>, "exists">'`, початкові рядки 78 і 153 тесту workload.
- Підтверджена причина: Vue Test Utils `get()` уже гарантує знаходження елемента й типізовано не надає `exists()`.
- Точне виправлення: для обох presence assertions використано `find(...).exists()`. Перевірки наявності залишилися.
- Повтор: type-check і production build пройшли / exit `0`; повний Vitest — 551 PASS. Повторний type-check після відновлення входить до фінального gate.

### F17-03 — inline-посилання відрізнялися лише кольором

- Severity: serious за axe / medium як виправлений дефект Frontend. Категорія: FRONTEND_CODE / accessibility.
- Команда: `npx playwright test e2e/planning.spec.ts --workers=2`, exit `1`: 6 PASS, 2 FAIL (новий сценарій desktop/mobile).
- Очікування: порожній список WCAG violations. Спостереження: `link-in-text-block`, контраст кольору посилання до сусіднього тексту `1.81:1` за порогом `3:1`, без іншої ознаки посилання. Це не контраст тексту до фону.
- Evidence: посилання `/tasks/42` у заголовках advice та excluded Subtask, локальні fixtures без приватних даних.
- Підтверджена причина: нова сторінка успадкувала оформлення link без underline всередині змішаного тексту заголовка.
- Точне виправлення: scoped правило `.workload-analysis .session-card a` додає underline та offset, не змінюючи загальні theme tokens.
- Повтор: ті самі 8 planning-перевірок PASS / exit `0`. Додатковий аудит нового сценарію на 320 і 1440 px у світлій та темній темах: 2 PASS / exit `0`. Assertions, tags та safety guards не послаблювалися.

Під час відновлення нових помилок застосунку, API-контракту або конфігурації не підтверджено. Усі повторні перевірки завершилися успішно; результати наведено в таблиці.

## Обмеження та acceptance

Frontend не перевіряв доступність розгорнутого Stage 17A, його CI або реальну авторизовану відповідь Laravel. Статус live API — **NOT RUN**, а не FAIL чи доведена недоступність Backend. Локальні Playwright fixtures явно відрізняються від live-приймання. Backend із зазначеним контрактом і чинна авторизована сесія є передумовами наступної read-only live-перевірки.

Не перевірялася ручна робота зі screen reader на всіх платформах; автоматичний axe та keyboard не замінюють таку перевірку. Task/Subject titles не завантажуються, оскільки контракт їх не надає; показуються безпечні ID. Невідомі майбутні codes показуються з fallback, без вигадування дії.

Висновок: **PASS — Stage 17B відповідає локальним Frontend acceptance criteria та готовий до окремого live acceptance.** Фінальний локальний gate після відновлення пройдено. Реальне live-приймання не заявляється завершеним. Блокерів функціональної реалізації не залишилося. Tokens, cookies, credentials, `.env`, traces, `test-results`, build output і приватні artifacts не додаються до Git.

## Повторне відновлення з уже закоміченого Stage 17B — 2026-11-08

### Фактичний початковий стан

Початковий HEAD цієї сесії: `3c8fbe52976b8d432c7d8f481532d8876ca12aa3` (`feat(stage17): add read-only workload analysis and priority advice`). Гілка — `main`. Повторно прочитано `AGENTS.md`, виконано `git branch --show-current`, `git status --short`, `git diff --stat`, `git diff`, `git log -5 --oneline` та переглянуто `git show --stat HEAD`. Робоче дерево було чистим: незакомічених або нових файлів Stage 17B не було. Попередня реалізація разом із тестами, довідкою та цим звітом уже входила до початкового коміту. Опис незакомічених змін і початкових збоїв вище стосується попереднього відновлення, а не початку цієї сесії.

### Відновлений стан вимог

| Вимога                                                         | На початку цієї сесії | Результат повторного аудиту                                                        |
| -------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| Захищений `/planning/workload`, API-клієнт, response types     | COMPLETED             | Збережено; GET містить лише start_date/end_date та AbortSignal                     |
| Workload view, reusable recommendations, summary/progress      | COMPLETED             | Збережено; підсумки беруться із сервера, нульовий залишок має окремий стан         |
| Allocation alerts і persisted workload violations              | COMPLETED             | Збережено розділення джерел; денні й ISO-тижневі перевищення не додаються          |
| Priority recommendations і переходи до planning workflows      | COMPLETED             | Серверний порядок і rank збережено; переходи не запускають preview або confirm     |
| Excluded work, nullable effort і warnings                      | COMPLETED             | Окремі секції; невідома тривалість не підміняється нулем                           |
| Loading/error/empty states, retry, stale response cancellation | COMPLETED             | Повторно перевірено цільовими тестами; 403 використовує спільний API error handler |
| Vitest, Playwright, українська довідка та звіт                 | COMPLETED             | Збережено наявні перевірки й assertions                                            |
| Перевірка та актуалізація звіту в цій сесії                    | NOT STARTED           | Завершено повторним локальним gate й цим доповненням                               |
| Live acceptance Laravel / Backend CI                           | NOT RUN               | Окрема перевірка поза цією сесією; функціональних Frontend-блокерів немає          |

Частково реалізованих функціональних вимог або підтверджених дефектів, які потребували б змін застосунку, не виявлено. Не відтворювали реалізацію з нуля, не переписували компоненти й не змінювали API-контракт. Backend, GitHub, MySQL, live/destructive suites і Gemini не використовувалися.

### Що завершено тепер і які файли змінено

Завершено аудит поточного коду та повторну перевірку Stage 17B. Єдиний змінений файл цієї сесії — `docs/stage17/frontend-result.md`: уточнено історичний початковий SHA, відокремлено попереднє відновлення та додано фактичні результати поточної сесії. Нових файлів немає. Усі 14 файлів початкового Stage 17B-коміту, перелічені вище, збережено без змін коду й тестів. Повторний коміт реалізації не потрібен; окремий документаційний коміт фіксує цей аудит у `main`.

### Повторні команди та результати

Середовище: Node.js `v22.23.1`, npm `11.20.0`. Vitest і Playwright використовують локальні HTTP fixtures, без звернення до реального Backend.

| Команда                                                     | Результат цієї сесії                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- tests/workload.test.ts tests/planning.test.ts` | PASS, exit 0: 2 файли, 81 тест                                                                                                   |
| `npm run type-check`                                        | PASS, exit 0                                                                                                                     |
| `npm run build`                                             | PASS, exit 0; production build і вбудований type-check                                                                           |
| `npm run format:check`                                      | PASS, exit 0 до доповнення звіту; фінальна перевірка документації наведена нижче                                                 |
| `npx playwright test e2e/planning.spec.ts --workers=2`      | PASS, exit 0: 8 тестів, desktop/mobile; workload flow включає keyboard, axe у двох темах і перевірку overflow на 320/768/1440 px |
| `git diff --check`                                          | PASS, exit 0                                                                                                                     |

Повторно пройдено сценарій F17-01 (401 redirect), type-check для F17-02 та браузерні перевірки посилань F17-03. Нових виправлень для них не потрібно. Assertions не послаблювалися. Повний unrelated Vitest, усі E2E та help smoke повторно не запускалися: код, shared fixtures і довідка залишилися незмінними, affected planning suites пройдено.

Після доповнення звіту виконано `npx prettier --write docs/stage17/frontend-result.md`, повторний `npm run format:check` та `git diff --check`; фінальні перевірки форматування пройдено, exit 0.

### Помилки, конфігурація та обмеження

Нових application/type/template/import/API-помилок або заблокованих перевірок немає. Playwright вивів неблокувальне повідомлення Node.js: `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` Воно стосується кольору логів, усі тести завершилися з exit 0; конфігурацію не змінювали. Vite також вивів інформаційну діагностику `PLUGIN_TIMINGS`; production build успішний.

Історичні підтверджені помилки й точні виправлення F17-01/F17-02/F17-03 залишено у відповідному розділі. У цій сесії виправлено лише неоднозначність звіту: старий базовий SHA та опис незакомічених файлів тепер явно позначено як історичний запис попередньої сесії.

Live API / Backend CI залишаються **NOT RUN**, а не FAIL. Фактичну авторизовану відповідь Laravel і реальний вкладений payload у цій сесії не перевіряли; типи перевірено за наявним Frontend-контрактом і fixtures, дев'ять верхньорівневих полів відповідають наданому завданню. Обмеження live acceptance та ручного screen-reader тестування, зазначені вище, залишаються чинними. Жодних нових функціональних блокерів немає.

Підсумковий статус Stage 17B: **PASS за локальними Frontend acceptance criteria**. Реалізацію початкового коміту повністю збережено, цільові тести та всі обов'язкові локальні gates повторно пройдено. У документаційний коміт додається лише цей звіт; `.env`, credentials, build output і тестові artifacts не додаються.
