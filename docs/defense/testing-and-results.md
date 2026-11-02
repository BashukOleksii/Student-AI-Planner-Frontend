# Тестування, докази та результати

[Зміст](README.md) · [Матриця відповідності](requirements-traceability.md) · [Первинний звіт Stage 8](../f8-live-acceptance.md#stage-8--final-live-system-acceptance)

## Метод оцінювання

Розділено чотири види доказів: статичне читання коду, детерміновані тести з підмінними залежностями, реальні транзакції Laravel/MySQL та операційні перевірки зовнішніх сервісів. Успіх одного виду не переноситься на інший. Stage 9 є документаційним: застосунок не змінювався, нових тестів чи інтеграційних мутацій для цього звіту не запускали.

## Перевірені GitHub Actions

На 02.11.2026 через GitHub API перевірено head_sha, completed/success, job steps і підсумкові рядки журналів для двох точних комітів:

| Репозиторій і коміт                                 | Завершений запуск                                                                                                                                                                                                                      | Перевірений зміст                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend `f15a3cad48f9fb8824e1389fd60b78c2f7b9b226` | [Frontend CI 41492097969](https://github.com/BashukOleksii/Student-AI-Planner-Frontend/actions/runs/41492097969), [job](https://github.com/BashukOleksii/Student-AI-Planner-Frontend/actions/runs/41492097969/job/125437453520)        | npm ci, форматування, типи, **382 тести / 14 файлів**, build, **54 Chromium**; кроки successful                                                |
| Backend `f618bba290f919dc3561b0462c59b3b86ade82d8`  | [Backend verification 39241681396](https://github.com/BashukOleksii/Student-AI-Planner-Backend/actions/runs/39241681396), [job](https://github.com/BashukOleksii/Student-AI-Planner-Backend/actions/runs/39241681396/job/118023755635) | Locked Composer install, реальний MySQL 8.4, migrations/rollback/migrate у disposable CI DB, Pint і **5396 тестів / 50695 assertions**, exit 0 |

Backend PHPUnit вивів «OK, but there were issues»: **1 deprecation і 153 notices**. Це не приховано й не названо «нуль попереджень»; hosted job завершився success. У Stage 9 backend-тести локально не повторювалися. Назва `student_planner_testing` у hosted workflow стосується нового CI service container, а не дозволу використовувати наявну локальну PHPUnit-БД.

Стислий знімок метаданих без сирих журналів: [ci-evidence.json](ci-evidence.json). Жоден із цих запусків не є CI для майбутнього коміту нової документації. Новий SHA після push потребуватиме свого завершеного run.

## Історичні F1–F8

| Звіт                                                     | Що він підтверджує у своєму часовому контексті                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [F1](../f1-verification.md), [F2](../f2-verification.md) | Початкові auth/академічні/Task/Subtask інтерфейси та автоматизовані перевірки                                                                |
| [F1–F2 live](../f1-f2-live-verification.md)              | Реальне cookie/Laravel/MySQL проходження після історичного виправлення середовища; не змішувати зі старим початковим блокером users.timezone |
| [F3](../f3-verification.md)                              | AI UI, структуровані Tool/action results і відновлення за детермінованими контрактами                                                        |
| [F4](../f4-verification.md)                              | Preferences, availability, preview/consent, Sessions/replanning у клієнтських тестах; його тодішня live-межа закрита лише пізнішим Stage 8   |
| [F5](../f5-verification.md)                              | Manual Lessons та імпортний UI, multipart/409/відновлення; реальний XLSX parser/commit доведено пізніше                                      |
| [F6](../f6-verification.md)                              | Reminders/Inbox/Statistics UI й контрактні перевірки                                                                                         |
| [F7](../f7-verification.md)                              | Стабілізація, фокус діалогів, redirect, браузерні перевірки й safety guards                                                                  |
| [F8](../f8-final-acceptance.md)                          | Загальні регресії, screenshot/accessibility scope, історичні зовнішні блокери                                                                |
| [Фінальний Stage 8](../f8-live-acceptance.md)            | Уперше завершений повний поточний real-system сценарій в окремій acceptance БД                                                               |

Числа різних етапів не сумуються як «загальна кількість унікальних тестів»: набори еволюціонували й перетинаються. Статус у старому звіті описує той запуск, а не скасовує новий підтверджений результат.

## Детерміновані перевірки

Frontend використовує Vitest/Vue Test Utils для UI, API-контрактів, помилок, часових перетворень і відновлення. Playwright запускає зібрану SPA; основні E2E перехоплюють API-відповіді для відтворюваних позитивних і негативних сценаріїв. Реальний FormData у mocked браузерному тесті сам по собі не доводить виконання PhpSpreadsheet чи commit MySQL.

Backend PHPUnit перевіряє доменні Services, HTTP, Policies, FK/CHECK/міграції та конкурентні процеси на MySQL. CI спеціально перевіряє REPEATABLE READ і lock instrumentation. AI-провайдер у звичайних тестах підмінний: можна перевірити оркестрацію, call validation, lease/ідемпотентність та atomic receipt без paid-запиту. Це не оцінка якості реальної мовної моделі.

## Реальний Stage 8

Середовище: окрема MySQL-БД `studentplanneracceptance`, schema-scoped runtime `planner_acceptance_app`, окремий migrator, 25 міграцій; ізольований loopback namespace зі звичайними localhost:5173/8000. Перед мутаціями перевірено root/process identity, SQL `SELECT DATABASE()`/`CURRENT_USER()`, реальну HTTP-issued session persistence і операторський F7 grant. Live safety не послаблювався.

Один дозволений користувач пройшов реєстрацію 201, login/profile 200, refresh, logout 204 та post-logout 401. Детальний read-suite до і після бізнес-сценарію повернув **2 passed, zero skipped**. Анонімні 401 залишаються окремою перевіркою меж доступу; саме authenticated branch перевірив десять успішних Resource-відповідей.

| Реальна перевірка                         | Збережений результат                                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Academic Context і ownership associations | Institution/Period по одному, Subjects/Teachers по вісім; незалежні detail GET і SQL                                                                                          |
| XLSX                                      | Два committed Batches, 30 occurrence rows, 15 imported Lessons; missing references → revalidate → commit; stale 409 → reviewed duplicate/noop без додаткових imported Lessons |
| Manual Lesson / effective schedule        | 16-й Lesson створив реальний blocker; усі 16 збігаються з detail GET і schedule                                                                                               |
| Task/Subtask                              | Task 1 priority 3 завершено; child 1 pending; дедлайни збережено й зміщено; progress 0/1                                                                                      |
| Planning                                  | 45/90 хвилинні ліміти, 7 вікон, серверні слоти; 4 підтверджені сесії з 5400 секундами allocations                                                                             |
| Replanning / lifecycle                    | Збережений ланцюг 1 → 5 → 6: оригінали 1 і 5 rescheduled, 6 cancelled, 2–4 planned                                                                                            |
| Reminders                                 | Чотири modes/targets; trigger synchronization і lifecycle cancellation, усі cancelled/sent_at=null                                                                            |
| Statistics                                | Один реальний on-time Task, незалежна дитина, шість нульових дат у семиденному range, signed delta +1; точні future status/second totals                                      |
| Незалежність доказів                      | 66 додаткових authenticated GET плюс окреме read-only SQL-зіставлення; shared/application і PHPUnit schemas не змінились                                                      |

`npm run test:live:system`: **1 passed, перший і єдиний запуск**, без retries. Фінальна регресія: type-check/build/format/diff PASS, **382 unit/component**, **54 Chromium**. Сценарій не replay-нувся на вже заповненому аккаунті, дані не скидалися, додаткових користувачів не створювали. Критичного дефекту не знайдено; виправлено лише хибне очікування приватного read-only діагностичного скрипту про скасування Sessions після Task completion.

Статус future Sessions не доводить elapsed completion/miss. Відомі/невідомі actual minutes для завершених Sessions і live late-completion не були підготовлені. Успішний commit і stale-preview 409 не є fault-injected доказом кожної rollback/concurrency гілки.

## Доступність і браузери

Поточні 54 Chromium-тести включають наявні axe/keyboard/dialog перевірки. У F8 зафіксовано **81 Firefox/WebKit виконання**: 27 Firefox, 27 desktop WebKit і 27 mobile-sized WebKit. Вони історичні, не повторені у Stage 9. Автоматичний audit охоплював 27 маршрутів у світлій/темній темі; окремі 16 audit-виконань перетинаються з повним набором, тому їх не додають до числа 54.

WebKit-емуляція не є фізичним Safari. Ручна робота зі screen reader, фізичні пристрої та справжній browser UI zoom не перевірені. [Accessibility audit](../accessibility-audit.md) містить межі перевірок; screenshot-огляд інтерфейсу не доводить точний Figma-паритет.

## Незакриті окремі категорії

| Категорія                                              | Статус            | Чого бракує                                                                                                   |
| ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Платний OpenAI provider                                | BLOCKED           | Окремий дозвіл, credentials і обмежений live-сценарій                                                         |
| Reminder dispatcher/Notification delivery/read receipt | BLOCKED           | Дозвіл на диспетчер для disposable isolated DB і відповідні grant/opt-in; створення Reminder цього не замінює |
| Залишкові історичні крайові випадки статистики         | BLOCKED           | Законні elapsed fixtures для child/late/completed/missed/known-null actual durations                          |
| Figma parity                                           | BLOCKED           | Доступ до першоджерела або затверджені exports; rate-limited інтеграцію не повторювали                        |
| Реальне HTTPS staging/production                       | BLOCKED / NOT RUN | Інфраструктура й операторський release; build не є deployed acceptance                                        |

Рішення **CONDITIONALLY ACCEPTED** стосується підтвердженого ядра Stage 8 із цими окремими межами. Немає підстав заявляти про повну production readiness, покриття коду у відсотках, прискорення навчання, підвищення оцінок чи виміряне зниження витрат: таких вимірювань не проводили.
