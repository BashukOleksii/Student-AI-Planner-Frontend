# Stage 16B — невиконані завдання та відновлення роботи

Дата перевірки: 2026-11-08. Репозиторій: Student-AI-Planner-Frontend, гілка `main`.
Початковий коміт: `b664ed1f05aca7c802ffc8f25cdd765dd9d5e5fc`.
Контракт Backend Stage 16A наданий замовником для коміту `e9a510d40aa83aaaea59cd5c0786dece177e4bde`; Backend і GitHub не переглядалися.

## Реалізація

- Завдання має окремий тип `TaskStatus`: `pending`, `missed`, `completed`. Тип `SubtaskStatus` залишається двостановим; поля статистики підзавдань не розширювалися.
- Картки, сторінка завдання та вибір завдання для нагадування правильно показують «Очікує виконання», «Не виконано», «Виконано». Точний фільтр `pending` не включає `missed`. Прострочення зберігається для невиконаного завдання з минулим дедлайном, але не для завершеного.
- Картка дозволяє позначити очікуване завдання невиконаним; невиконане — завершити або повернути до виконання. Завершене завдання не має прямої дії `miss` і ніколи не відкривається автоматично.
- Поки запит виконується, повторні lifecycle-запити для цього завдання блокуються. Після успіху повідомлення використовує фактичний статус відповіді, список читається повторно. Локальні стани підзавдань, сесій і нагадувань не змінюються.
- Після `409` виконується незалежний `GET` завдання. За невідомого результату, втраченої відповіді або серверної помилки немає автоматичного повтору чи повідомлення про успіх: доступна окрема кнопка звірки поточного запису. Якщо читання після конфлікту не вдалося, звірку можна повторити вручну. Обробка `401`, `419`, `404` використовує наявні механізми сеансу та загальні повідомлення без розкриття чужих записів.
- «Відновити роботу» відкриває `/planning/recovery?task_id=…`. Query приймає лише один канонічний додатний безпечний цілий ID. Окремий захищений `GET` завантажує вибране завдання навіть поза першою сторінкою списку. Некоректний або недоступний scope не перетворюється мовчки на всю роботу; студент має явно змінити вибір.
- Повторно використано `PlanPreviewView`, `usePlanningScope`, діагностику recovery та наявне підтвердження. Перехід не запускає preview. Частковий план потребує згоди, збереження — окремого підтвердження. Зміна дат або scope скидає огляд. Token залишається лише в тимчасовому стані компонента, без URL, HTML чи persistent storage. Конфліктні, прострочені й невизначені підтвердження автоматично не повторюються.
- Поточна статистика завдань показує `missed` та `overdue_missed` окремо від точних pending-лічильників. Підказка пояснює обидві групи незавершеної роботи без обчислення нового авторитетного підсумку в браузері. Відсоток надходить із Backend: підтримано `null`, справжній нуль і дробові значення. Написи dashboard уточнюють, що його pending-вибірка не охоплює missed.

## REST-сумісність і межі

| Операція              | Запит                                               | Використання відповіді                                                   |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| Позначити невиконаним | `POST /api/tasks/{id}/miss`, без тіла               | `200`, `Resource<Task>`, потім повторне читання списку                   |
| Завершити / повернути | Наявні `POST …/complete`, `POST …/reopen`           | Той самий контракт `Resource<Task>`                                      |
| Точний фільтр         | `GET /api/tasks?status=missed` або `status=pending` | Серверний список із пагінацією                                           |
| Звірити запис / scope | `GET /api/tasks/{id}`                               | Актуальний доступний користувачеві Task                                  |
| Запросити recovery    | Наявний `POST /api/planning/recovery/preview`       | Серверні diagnostics і StudyPlan; жодного запису сесій у Frontend        |
| Підтвердити recovery  | Наявний `POST /api/planning/study-plans/confirm`    | `preview_token`, явний `accept_partial`; збережений результат із сервера |
| Поточні показники     | `GET /api/statistics/progress`                      | Додаткові поля лише в `data.tasks.current`                               |

Generic Task PATCH не містить `status`. HTTP-клієнт, Sanctum cookies, CSRF, endpoint підтвердження та протокол token не замінювалися. Endpoint adaptive confirmation для recovery не використовується.

`Task.status = missed` не створює історію пропущених StudySessions. Планувальник Laravel визначає залишок, кредит виконаних зусиль, резервування, дедлайни та виключення; Frontend не дублює цих розрахунків. Позначення невиконаним не змінює нагадування або історію сесій.

Нових AI Tools, типів pending-action чи викликів Gemini немає. Загальні Task-відповіді підтримують новий статус; наявний generic AI-renderer уже обробляє значення `missed`. Окремої природномовної команди позначення Task невиконаним цей етап не додає.

## Змінені файли

| Область              | Файли                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API та типи          | `src/api/endpoints.ts`, `src/types/api.ts`                                                                                                                    |
| Стани й прострочення | `src/utils/tasks.ts` (новий), `src/utils/dates.ts`                                                                                                            |
| Завдання             | `src/components/domain/TaskCard.vue`, `src/views/TasksView.vue`, `src/views/TaskEditorView.vue`                                                               |
| Scope та recovery    | `src/composables/usePlanningScope.ts`, `src/views/PlanPreviewView.vue`                                                                                        |
| Сумісні написи       | `src/views/DashboardView.vue`, `src/views/ReminderEditorView.vue`, `src/views/StatisticsView.vue`                                                             |
| Fixtures та Vitest   | `tests/fixtures.ts`, `tests/helpers/f2Backend.ts`, `tests/helpers/activityBackend.ts`, `tests/ui.test.ts`, `tests/planning.test.ts`, `tests/activity.test.ts` |
| Playwright           | `e2e/planning.spec.ts` (один новий сценарій), `e2e/core.spec.ts`, `e2e/live.spec.ts` (лише актуальні назви кнопки повернення)                                 |
| Docsify та результат | `public/help/guide/tasks.md`, `public/help/guide/planning.md`, `public/help/guide/statistics.md`, цей звіт                                                    |

Історичні звіти Stage 10/15 та наявні зображення не змінено. Нових залежностей немає.

## Перевірки

Середовище: Node.js `v22.23.1`, npm `11.20.0`. Усі запити прикладних тестів обробляли локальні fixtures; це не live-приймання Laravel. MySQL, реальні lifecycle/confirmation mutations і платні AI-виклики не використовувалися.

| Команда                                                                                             | Результат                                                                                                            | Exit |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| `npm test -- tests/ui.test.ts tests/planning.test.ts tests/activity.test.ts tests/subtasks.test.ts` | PASS: 4 файли, 196 тестів після виправлень                                                                           | 0    |
| `npm test`                                                                                          | PASS: 19 файлів, 536 тестів; включно з наявними AI, authentication, reminders та statistics тестами                  | 0    |
| `npm test -- tests/activity.test.ts`                                                                | PASS: 85 тестів після уточнення назви overdue-missed лічильника                                                      | 0    |
| `npx playwright test e2e/planning.spec.ts e2e/core.spec.ts e2e/tasks-coverage.spec.ts --workers=2`  | PASS: 16 перевірок desktop/mobile, включно з новим сценарієм та наявним WCAG-аудитом recovery у світлій/темній темах | 0    |
| `npm run type-check`                                                                                | PASS                                                                                                                 | 0    |
| `npm run build`                                                                                     | PASS: production bundle і перевірка типів                                                                            | 0    |
| `npm run format:check`                                                                              | PASS: усі перевірені файли відповідають Prettier                                                                     | 0    |
| `npm run help:smoke`                                                                                | PASS: звичайний base та `/planner/`, deep link довідки, наявні медіа, повернення до застосунку й mobile width        | 0    |
| `git diff --check`                                                                                  | PASS                                                                                                                 | 0    |

Фокус нових перевірок: розділення типів Task/Subtask, три написи й точні фільтри, `pending → missed → pending` та `missed → completed`, прострочення, CSRF і lifecycle POST без PATCH, подвійне натискання, `409` з незалежним GET без reopen, невідома відповідь без повтору, `401/419/404`, scope із завданням за межами першої сторінки та відхилення некоректного/недоступного ID, явні preview/confirmation, Task-only statistics і серверні дробові відсотки. Наявні тести також перевіряють `null`/`0`, порожні recovery-пропозиції, часткову згоду, конфлікт/прострочення/втрату відповіді підтвердження, незмінність історії та відсутність token у HTML/storage.

Новий браузерний сценарій перевіряє позначення Task невиконаним, точний missed-фільтр, перехід з ID, нуль пропущених сесій при missed Task, окремий preview, часткову згоду, один confirm, збережений результат, відсутність статусного PATCH/token у HTML та відсутність горизонтального переповнення recovery при ширині 320 px. Реєстрація та інші mutations наявного core-сценарію теж виконувалися виключно на fixtures.

## Діагностика збоїв під час реалізації

### F16-01 — шаблон scope та попередня назва кнопки

- Команда: `npm test -- tests/ui.test.ts tests/planning.test.ts tests/activity.test.ts tests/subtasks.test.ts`, exit `1`.
- Очікування: компіляція PlanPreviewView і проходження наявних lifecycle-перевірок. Спостереження: 29 невдалих і 160 успішних перевірок; 28 planning-збоїв спричинив один синтаксично некоректний inline-обробник очищення scope після форматування, ще один UI-тест шукав стару назву «Відновити».
- Категорія: FRONTEND_CODE та TEST_FIXTURE. Причини підтверджені локально; Backend/міграція/CORS не залучалися.
- Виправлення: винесено очищення до `selectAllWork()`, селектори оновлено на «Повернути до виконання». Assertions не прибиралися.
- Повтор тієї самої цільової команди: спочатку 189 PASS, після додавання scope/statistics перевірок — 196 PASS, exit `0`. Повний Vitest: 536 PASS.

### F16-02 — призупинене завантаження локального JS у браузері

- Команда: `npx playwright test e2e/planning.spec.ts e2e/core.spec.ts e2e/tasks-coverage.spec.ts`, exit `1`: 15 PASS, 1 FAIL.
- Перевірка: mobile `complete planning journey: preferences, availability, plan, sessions, recovery and adaptive consent`, початковий перехід до `/planning/preferences`.
- Очікування: заголовок «Вподобання навчання». Спостереження: `expect(locator).toBeVisible()` → `Timeout: 5000ms`, сторінка залишалася в loading. Новий Stage 16B сценарій уже пройшов в обох профілях.
- Санітизований trace: `net::ERR_NETWORK_IO_SUSPENDED` для локальних `http://localhost:4173/assets/…js`, потім `TypeError: Failed to fetch dynamically imported module` для PlanningSettingsView. Це не відповідь Laravel і не помилка missed API.
- Категорія: TEST_ENVIRONMENT. Підтверджено призупинення ресурсів браузером; точну причину призупинення не встановлено. Паралельне навантаження є можливим поясненням, а не доведеним дефектом Frontend.
- Безпечна дія: повтор того самого набору з `--workers=2`, без автоматичних retries, зміни assertions, timeout або конфігурації застосунку.
- Результат повтору: 16 PASS за 31,0 с, exit `0`. Зміни коду для цього збою не знадобилися.

## Обмеження та готовність

Frontend Stage 16B реалізовано за наданим контрактом. Реальний Backend Stage 16A та застосування його forward migration в цьому етапі не перевірялися: це передумова deployment/live-приймання, а не встановлений дефект Frontend. Перед реальною експлуатацією оператор має підтвердити розгортання Stage 16A й міграції дозволеним Backend-процесом, після чого перевірити workflow в окремо авторизованому ізольованому середовищі.

Live/destructive suites, MySQL, email, reminders dispatch і Gemini не запускалися. Загальний повний Playwright-набір залишається звичайною перевіркою CI; локально виконано релевантні 16 сценаріїв. Локальні traces, cookies, test-results, build artifacts та `.env` не входять до коміту. Блокерів реалізації Frontend після повторних перевірок не залишилося.
