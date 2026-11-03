# Stage 11 — AI Lesson Frontend integration

Дата: 2026-11-03. Це поточне доповнення до історичних Stage 9/10 матеріалів, а не зміна результатів попереднього приймання.

## Версії та результат

- Starting Frontend: `5fa6d1422071024892fc105b81f5a11ddf817aa4`.
- Starting Backend / контракт: `eab1f252fd409e712921aa46e77577813188d679`.
- Ending HEAD обох репозиторіїв лишається тим самим: Frontend-зміни підготовлено в робочому дереві; commit/push/deployment не виконувалися. Backend робоче дерево незмінене.

Реалізовано всі чотири підтримані Lesson actions в існуючому AI workflow. Є повний матеріальний огляд, явні confirm/reject, recovery, квитанції, посилання на збережені Lessons і оновлення розкладу. Немає нових REST routes, міграцій, AI orchestration architecture або клієнтського conflict algorithm. Server `LessonService` лишається єдиним бізнес-писачем цих AI-змін.

| Action                       | Огляд / результат                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `propose_lesson_create`      | `before=null`, повний активний кандидат, новий ID тільки з квитанції                                                                                 |
| `propose_lesson_update`      | Повні до/після, позначені зміни, збережений контекст необов’язкових полів; inactive Lesson update не блокується довільною клієнтською вимогою active |
| `propose_lesson_cancel`      | Active → cancelled, незмінна поява/зв’язки, збереження історії, без відновлення оригіналу                                                            |
| `propose_lesson_replacement` | Active original і complete replacement, original → replaced, новий або повторно використаний історичний ID, два окремі Lesson links                  |

R21/A2 із Stage 10 тепер реалізована в межах чотирьох індивідуальних AI Lesson операцій. Загальна allowlist: **9 reads + 18 mutation proposals = 27 Tools**. Чотири нові назви додано до попередніх 14; попередні Task/Subtask/Reminder/planning flows збережено. Це не означає Lesson delete/bulk/import через AI, AI academic catalog discovery, автономного перепланування, password recovery або нових статистичних метрик.

## Контракт і перевірка джерел

Безпосередньо прочитано Backend `docs/stage11/frontend-rest-contract.md`, `docs/ai-lesson-actions.md`, ADR-005, `LessonActionRegistry`, `LessonActionService`, `LessonActionPresenter`, `AiPendingActionResource`, `LessonService`, routes та релевантні Feature tests.

- Lesson preview використовує `type`, immutable `confirmation_required=true`, `before`, `after` та **об’єкт** `effects`; не Task-поля `action/changes` і не масив effect strings.
- Типізовано `LessonActionType`, `LessonSnapshot`, `LessonPreview`, `LessonReceipt`, `NamedAcademicReference`. Для API збережено generic public parser, видалення приватних keys та safe unknown-type display/rejection.
- Dedicated branch `reviewSupported` перевіряє discriminator, flags, повні поля, numeric identities, named-reference consistency/nullability, status/link invariants, точні календарно валідні whole-second UTC instants і всі чотири material effects. Новий невідомий effect блокує підтвердження. Порядок object keys не впливає на матеріальне порівняння; порядок масивів лишається значущим.
- Before/after — серверні snapshots; UI не заповнює пропуски, не резолвить асоціації, не перевіряє overlap і не перетворює preview на executable arguments. Дати показано в збереженому поясі профілю з роком/секундами/offset та незмінним UTC-джерелом. Vue text escaping збережено.
- Лише existing `POST /api/ai/conversations/{conversation}/actions/{uuid}/confirm` виконує зміну. Confirm/reject для Lesson надсилають **`{}`**. Відкриття огляду й чатове «так» не виконують writer. Planning consent flags до Lesson не додаються.
- Generic client утримує structured action data в 409/410, а AI API звіряє conversation/action identity та terminal rejected/expired status. Code errors зберігають чинний authoritative GET recovery. Invalid/foreign envelopes не перетворюються на успіх.
- `action_stale` / `action_validation_failed` блокують повторне підтвердження цього огляду й дозволяють reject/нову пропозицію; розклад перечитується. Busy, expiry, invalid 422, 401/419/404, persistence failure та lost response не запускають автоматичний повтор write.
- Після execution читаються `receipt.lesson.id`, а для replacement — також `receipt.original.id`. Оновлюються today та унікальні local start/end boundary dates із before/after, receipt і поточних Lesson details. End рівно опівночі належить попередньому дню для діапазону `[start,end)`.
- Не запускається необмежений N+1 по кожній даті довгого Lesson. ScheduleView не має shared cache: відкриття будь-якого дня/тижня після AI повторно читає весь його актуальний діапазон із сервера. Це охоплює проміжні дні довгих подій без вигаданого cache invalidation framework.
- Lesson `receipt.original` ніколи не стає StudySession link/refresh. Немає Task fallback для Lesson. Помилка додаткового читання показується окремо від уже підтвердженої операції; квитанція зберігається, refresh retry виконує лише GET.

## Файли

Нові production-файли: `src/utils/aiLesson.ts`, `src/components/ai/AiLessonReview.vue`.

Змінені production-файли: `src/types/ai.ts`, `src/utils/ai.ts`, `src/api/ai.ts`, `src/api/aiRefresh.ts`, `src/api/client.ts`, `src/components/ai/AiActionReview.vue`, `src/composables/useAiConversation.ts`, `src/styles/main.css`.

Нові перевірки/fixtures: `tests/ai-lesson.test.ts`, `tests/ai-lesson-state.test.ts`, `tests/helpers/aiLessonFixtures.ts`, `tests/helpers/aiLessonBackend.ts`, `e2e/ai-lessons.spec.ts`. `tests/helpers/aiBackend.ts` розширено для сумісності повної allowlist. Моделі fixtures відтворюють public Backend shapes; їхній in-memory результат змінюється лише після відповідного HTTP confirm і надалі повертається через GET.

Документація: цей звіт, dated pointers у Stage 10 README/capability/requirements, main README, Docsify `guide/ai-assistant.md`, `guide/faq.md`, `guide/troubleshooting.md`, search namespace у `config.js`, AI media capture і його справжній PNG. Sidebar, маршрути `/help/`, bundled assets, теми й навігація збережені. Історичні counts/результати Stage 9/10 не переписано.

## Локальні перевірки

Фінальна комплексна регресія виконана 2026-11-03 після завершення коду й оновлення довідника:

| Команда                | Результат                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check` | PASS, exit 0                                                                                                        |
| `npm run type-check`   | PASS, exit 0                                                                                                        |
| `npm test`             | PASS: 17 файлів, **468 тестів**, exit 0                                                                             |
| `npm run build`        | PASS, production assets разом із `dist/help/`, exit 0                                                               |
| `npm run test:e2e`     | PASS: **78 Chromium executions**, desktop/mobile, без retries, exit 0                                               |
| `npm run help:smoke`   | PASS: dev `/help/`, production preview `/planner/help/`, tasks deep link, media, повернення та mobile width, exit 0 |
| `git diff --check`     | PASS                                                                                                                |

74 нові Lesson unit/component/API/state cases містяться у двох нових test files; ще 4 cases з’явилися в наявній перевірці повної action allowlist. 16 із 78 Chromium executions — нові Lesson сценарії. Попередні Task/Subtask/Reminder/planning, SPA navigation, auth, schedule/import, accessibility та Docsify checks продовжують проходити. Docsify-тести перевіряють усі 18 sidebar destinations, PNG, пошук, теми, відсутність API-залежності й app/help navigation. Smoke не змінює основний `dist`, а перевіряє окрему prefix-збірку в ігнорованому каталозі.

`git diff --check`, read-only Backend status та перевірка змінених/нових текстів на поширені private-key/provider-token patterns не виявили проблем. Нових credentials, private session data чи fixture secrets не додано. Backend source/routes/migrations, frontend Router/ScheduleView/direct Lesson API та dependency lockfile лишилися незміненими.

Цільові перевірки до неї: 160 unit/component/API/state cases пройшли; нові 16 Chromium desktop/mobile сценаріїв пройшли. Вони перевіряють усі чотири дії, дві форми replacement identity, full snapshots/effects/nulls/UTC, XSS escaping, changed-field context, confirm/reject `{}`, pending guards, 409/410 envelopes, stale/invalid/expired, idempotent receipts, uncertain GET recovery, date refresh та read failure без втрати receipt. E2E включає keyboard Enter і axe WCAG у світлій/темній темах для кожного Lesson review.

Cross-browser command: `npx playwright test --config playwright.cross-browser.config.ts e2e/ai-lessons.spec.ts e2e/ai.spec.ts`. **14 Firefox executions passed** (8 нових Lesson + 6 наявних AI). **28 WebKit desktop/mobile executions не змогли запустити браузер**: host missing `libicu74`, `libjpeg-turbo8`, `gstreamer1.0-libav`. Команда завершилася exit 1 через ці launch failures; WebKit не заявлено як PASS, тестові правила не послаблено. Native Safari та фізичні пристрої не перевірялися.

Медіа: `npm run help:screenshots` пройшло; AI PNG показує справжній новий replacement review з перетином опівночі, демо-даними й явними кнопками. Усі зовнішні запити під час знімання перехоплюються/блокуються; немає платного provider, private account або live database. З інших знімків посібника збережено попередні версії.

## Backend compatibility та live gate

Це **source/contract compatibility + нові deterministic Frontend tests**, а не нове real persistent end-to-end acceptance. Зазначені нижче Backend докази повторно використано з попереднього milestone, не виконано заново:

- Backend `docs/stage11/evidence/results.json`: 244 targeted tests / 2337 assertions; 30 compatibility tests / 7694 assertions; 5531 full regression tests / 53706 assertions. Джерело також фіксує isolated MySQL 8.4.10, зупинений після перевірки, та fake HTTP/provider doubles без paid OpenAI.
- `AiLessonActionsTest` перевіряє всі чотири LessonService writers, відсутність writes під час proposal/GET, ідентичний replay receipt, reject/expiry, ownership, stale snapshots/associations, conflicts, transaction rollback, replacement historical ID reuse та immutable import metadata. Concurrency/migration tests присутні окремо.
- Existing forward-only migration `2026_11_02_000001_add_ai_lesson_actions.php` розширює action CHECK 14→18. Її не змінювали й не запускали в цьому Frontend milestone. Відповідність production/shared схеми залишається операційною передумовою.

**Real Laravel/MySQL + Frontend Lesson mutation validation: NOT RUN / authorization gate.** Знайдений попередній локальний grant закінчився `2026-11-02T20:49:10.210985+00:00`. Він не дає чинного дозволу для цього milestone. Не було надано нового matching disposable-environment grant і підтвердженого безпечного deterministic HTTP provider harness. Retained Stage 8 DB не використовувалася, її harness не replay-ився; жодного reset/migrate/registration/dispatch/paid AI не виконано. Реальні provider availability, natural-language tool selection і paid-provider acceptance не встановлені.

## GitHub Actions

GitHub API фактично перевірено в цій сесії:

- [Frontend CI, run 41642115494](https://github.com/BashukOleksii/Student-AI-Planner-Frontend/actions/runs/41642115494): `completed/success`, точний SHA `5fa6d1422071024892fc105b81f5a11ddf817aa4`.
- [Backend verification, run 41519271950](https://github.com/BashukOleksii/Student-AI-Planner-Backend/actions/runs/41519271950): `completed/success`, точний SHA `eab1f252fd409e712921aa46e77577813188d679`.

Ці hosted results підтверджують базові коміти. Нові Frontend зміни не pushed, тож нового hosted CI SHA/run немає. Успішний baseline run не приписується цим змінам.
