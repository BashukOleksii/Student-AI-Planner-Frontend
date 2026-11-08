# Stage 18C — AI-пропозиції щотижневої навчальної доступності

Дата: 2026-11-08. Репозиторій: Student-AI-Planner-Frontend. Гілка: `main`.
Перевірений початковий коміт: `549a585b5837bb89ab452df6d5b3ba6c32600c0f`.
Перед редагуванням прочитано `AGENTS.md`, перевірено branch/status/diff та останні п’ять комітів. Робоче дерево було чистим. Гілок, worktrees і PR не створювали; попередню роботу не скидали.

## Контракт і межі перевірки Backend

Інтеграція використовує [контракт Stage 18B](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/1912ff45be03d5eed3dfeabe5fa6a1a2f13958a4/docs/stage18/availability-action-contract.md) та [звіт реалізації](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/1912ff45be03d5eed3dfeabe5fa6a1a2f13958a4/docs/stage18/backend-stage18b-result.md), прочитані за фіксованим SHA `1912ff45be03d5eed3dfeabe5fa6a1a2f13958a4` через Bash/curl. Локальний Backend, БД, збережені дані й `.env` не відкривали й не змінювали. Платних provider-запитів не було.

Початковий read-only GitHub API запит показав [Backend verification, run 42501369813](https://github.com/BashukOleksii/Student-AI-Planner-Backend/actions/runs/42501369813): `head_sha` збігається, `status: in_progress`, `conclusion: null`. Це не PASS. CLI `gh` відсутній: `/bin/bash: gh: command not found`, exit 127; для публічних документів і статусу використано `curl`, без встановлення залежностей або доступу до credentials. Фінальний знімок CI зазначено нижче.

Frontend не створює Tool definitions. До попередніх 18 proposal names додано рівно три availability names; разом 21. До попередніх дев’яти read labels додано `list_study_availability_windows` («Перегляд навчальної доступності»); разом 31 відомий label: 10 reads і 21 proposals. Порядок попередніх proposal names збережено.

## Архітектурний огляд і найменша зміна

Перед реалізацією переглянуто `types/ai.ts`, `api/ai.ts`, `api/aiRefresh.ts`, `api/planning.ts`, `utils/ai.ts`, `utils/aiLesson.ts`, `utils/planning.ts`, `AiActionReview`, `AiLessonReview`, `AiFields`, `AiTimeline`, `useAiConversation`, `AiView`, `AvailabilityView`, `PlanPreviewView`, router, AI Vitest fixtures/tests і Lesson Playwright suite.

Використано чинний потік: повідомлення → action list/detail → серверний огляд → preflight GET → семантичне порівняння → явний confirm/reject → durable receipt → domain refresh. Другого confirmation engine, діалогів, HTTP-клієнта, store, залежностей або алгоритму планування не додано.

Додано одну вузьку runtime boundary `aiAvailability.ts` і один компонент `AiAvailabilityReview.vue`, що представляє як пропозицію, так і перевірену квитанцію. `AiActionReview` зберігає чинні кнопки, notices та блокування. `AiView` передає поточні вікна з локального стану composable лише для окремого stale-inspection розділу.

## Публічні preview і receipt

Підтримано `propose_availability_create`, `propose_availability_update`, `propose_availability_delete`. Preview містить `type`, `confirmation_required: true`, `before`, `after`, `timezone`, `effects`.

- Create: `before: null`, повний `after`, `after.id: null`. UI пояснює, що ID призначить сервер після збереження.
- Update: повні before/after з тим самим додатним ID; сервер уже об’єднав пропущені аргументи. Усі чотири поля видно; змінені й незмінені поля мають текстові позначки. Законний no-op update не забороняється клієнтом.
- Delete: повний попередній запис з ID у before, `after: null`. Пояснено видалення тільки одного конфігураційного запису.

Runtime narrowing відхиляє невідомі типи, неповні snapshots, пропущені поля замість явного null, неправильні ID, weekday поза 1–7 або не integer, нестрогі clocks, неправильні before/after identities, порожній/нестроковий timezone й planning consent requirements. ID має бути safe positive integer; null допускається лише в ID запропонованого створення. Snapshot містить рівно чотири контрактні поля.

Перевіряються всі вісім effects і їхні точні значення; зайві/відсутні flags відхиляються. `changes_recurring_availability` завжди true; `removes_availability_window` true лише для delete; решта шість false. Backend зберігає interval/overlap/business validation; клієнт її не дублює.

Receipt містить action UUID, відповідний type, persisted `window` або `deleted_window`, timezone та ті самі перевірені effects. Create/update вимагають повний persisted window з додатним ID й `deleted_window: null`; delete — навпаки. Receipt identity/type перевіряються також у REST action parser і executed history events. Невалідна executed receipt дає безпечну помилку 502, а не підтвердження успіху. Невалідний pending preview залишається доступним для безпечного відхилення.

Квитанція показує фактичний create ID, видалену identity та історичні поля. Поточні REST вікна її не реконструюють. Availability має посилання `/planning/availability`; Task fallback та класифікацію як Lesson/StudySession прибрано лише для цих трьох типів.

## Підтвердження, timezone і життєвий цикл

`aiApi.decide()` зберіг сигнатуру й endpoints. Availability confirm/reject надсилають рівно JSON `{}` із чинними session credentials/CSRF. Аргументи вікна, IDs, timezone, fingerprints, tokens і planning consent flags не надсилаються. Повідомлення «так», читання та proposal не виконують бізнес-змін.

Збережено action UUID identity, preflight detail GET, `samePublicValue` (порядок ключів об’єкта незначущий), блокування подвійних submissions, cancellation при навігації, server-owned expiry, reject, replay та хронологічну історію. Змінений preflight material лише оновлює огляд і вимагає нового явного рішення. Втрачена відповідь автоматично перевіряється GET; мутація автоматично не повторюється. `replayed: true` пояснюється як раніше збережене виконання.

Clocks відображаються безпосередньо рядками; вони ніколи не проходять Date/UTC/timestamp formatting. Збережено секунди, ISO weekday і точне `24:00:00`. Preview/receipt використовують власний persisted timezone, навіть якщо поточний профіль уже має інший. Дати службового створення/expiry залишилися у чинному загальному formatter; це не recurring clocks. Дані рендеряться через Vue interpolation, без HTML execution.

Інтерфейс пояснює, що Tasks, Lessons і StudySessions не видаляються, Reminders і числові planning preferences не змінюються, існуючі сесії не переплановуються автоматично. Replanning — окремий процес із власним оглядом/підтвердженням. Історичний preview у terminal action позначено окремо від квитанції.

## Stale-state і refresh

Після перевіреного executed action `refreshAiDomains()` виконує тільки `planningApi.availability(signal)` для availability domain. Результат читання й read error відокремлено від immutable action receipt. Read failure не скасовує виконання й не викликає POST retry; доступна ручна повторна спроба читання.

`action_stale` / `action_validation_failed` блокують confirm старої дії через наявний obsolete-actions механізм і дозволяють rejection. Зміна будь-якого власного тижневого вікна, включно з іншим weekday, може зробити пропозицію stale. Автоматичне безпечне читання й кнопка «Оновити поточну доступність» показують окремий поточний список; старий material не retarget/merge. UI спрямовує до нової AI-пропозиції й сторінки доступності. Збережено обробку conversation_busy, validation, expired/rejected, 401/404/419, persistence_error та network uncertainty.

`AvailabilityView`, `FreeTimeView`, `WorkloadAdviceView` читають дані при відкритті; `PlanPreviewView` зберігає review/token локально й скасовує/прибирає їх при unmount. KeepAlive, спільного planning cache або збереженого preview store немає. Тому глобальну cache infrastructure не додано. Жодного довільного free-slot/advice/plan запиту без дат або автоматичного replanning немає. Усі Backend fingerprints та остаточна авторизація залишаються серверними.

## Змінені файли

| Файл                                                                     | Зміна                                                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `src/types/ai.ts`                                                        | Три action types, публічні snapshots/effects/preview/receipt                           |
| `src/utils/aiAvailability.ts` (новий)                                    | Runtime narrowing контракту                                                            |
| `src/utils/ai.ts`                                                        | Labels, allowlist review dispatch, exclusion from session receipt IDs                  |
| `src/api/ai.ts`                                                          | Перевірка availability executed receipts у action/history boundary                     |
| `src/api/aiRefresh.ts`                                                   | Читання current availability після execution або stale inspection                      |
| `src/components/ai/AiAvailabilityReview.vue` (новий)                     | Exact local before/after, зміни, effects і historical receipt                          |
| `src/components/ai/AiActionReview.vue`                                   | Підключення review/receipt, правильна навігація, stale current windows                 |
| `src/composables/useAiConversation.ts`                                   | Локальні поточні вікна, refresh і stale read без іншого decision flow                  |
| `src/views/AiView.vue`                                                   | Передавання поточних вікон у review                                                    |
| `tests/helpers/aiAvailabilityFixtures.ts` (новий)                        | Exact public fixture shapes                                                            |
| `tests/helpers/aiAvailabilityBackend.ts` (новий)                         | Композиція чинного mock AI Backend та current windows                                  |
| `tests/helpers/aiBackend.ts`                                             | Fixture dispatch/receipt для трьох нових типів                                         |
| `tests/ai-availability.test.ts` (новий)                                  | Validation, presentation, API, receipt та refresh checks                               |
| `tests/ai-availability-state.test.ts` (новий)                            | Confirmation state machine та error/recovery checks                                    |
| `tests/ai-lesson.test.ts`                                                | Оновлено точні розміри розширеного allowlist: 21/31; старі Lesson assertions збережено |
| `e2e/ai-availability.spec.ts` (новий)                                    | Mock browser availability journeys                                                     |
| `public/help/guide/ai-assistant.md`, `public/help/guide/availability.md` | Українська інструкція й межі availability changes                                      |
| `docs/stage18/frontend-stage18c-result.md` (новий)                       | Цей звіт                                                                               |

## Перевірки

Node.js `v22.23.1`, npm `11.20.0`. Усі автоматизовані прикладні HTTP відповіді — локальні mocks. Playwright route handler блокує сторонні origin; реальний Backend/provider не викликається. Якість mock-інтеграції не є live/provider acceptance.

| Команда                                                                                                                                                                        | Результат                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `npm test -- tests/ai-availability.test.ts tests/ai-availability-state.test.ts tests/ai-lesson.test.ts tests/ai-lesson-state.test.ts tests/ai-api.test.ts tests/ai-ui.test.ts` | PASS: 6 файлів, 244 тести, exit 0  |
| `npm run type-check` після виправлення fixtures                                                                                                                                | PASS, exit 0                       |
| `npm run build` після виправлення fixtures                                                                                                                                     | PASS, exit 0                       |
| `npx playwright test e2e/ai-availability.spec.ts --workers=2`                                                                                                                  | PASS: 14 тестів, exit 0            |
| `npm test`                                                                                                                                                                     | PASS: 22 файли, 640 тестів, exit 0 |

Цільові тести охоплюють усі 21 action types; три labels і десятий read label; invalid/missing/null review fields; кожен effect flag; ID/weekday/clock/timezone boundaries; create/update/delete semantics; `24:00:00`; усі українські weekday labels; exact body/credentials/CSRF; no mutation on proposal/read/«так»; explicit confirm/reject; duplicate submission; changed preflight; navigation abort; stale/expired/rejected/replayed states; uncertainty, foreign identity і GET recovery; receipt verification й immutable historical values після помилки/пізніших читань. Старі AI suites перевіряють незмінні Task/Subtask/Reminder/Planning/Lesson flows.

Browser suite охоплює create/update/delete, keyboard confirm/reject, stale current reads без merge, expiry та lost-response/refresh failure. Є desktop/mobile projects, огляд і receipt, світла/темна теми, axe WCAG 2 A/AA, 2.1 AA, 2.2 AA та overflow на 320 px. Підтверджено навігацію до current availability і відсутність automatic replanning/session writes.

## Діагностовані збої

### F18C-01 — public snapshot type compatibility

Перша команда `npm run type-check` завершилася exit 2: `TS2322` у `tests/helpers/aiAvailabilityFixtures.ts:54`. Очікувався типізований public preview, фактично `AvailabilityWindow` interface не має index signature `PublicObject`. Причина — використання REST interface безпосередньо у публічному AI shape. Виправлення: reused mapped `AvailabilitySnapshot` і `PersistedAvailabilitySnapshot` alias з concrete ID для persisted before/receipt, без `any`, unsafe casts або зміни wire contract. Наступний type-check перейшов до окремих нових тестових помилок F18C-02; фінальний gate пройдено.

### F18C-02 — некоректне типізування malformed fixtures і mock call options

Початковий type-check і перший `npm run build` повідомили `TS2322` та `TS18048`/`TS2532` у `tests/ai-availability.test.ts`. Type-check exit 2; build exit 1 через дочірній type-check exit 2 (Vite bundle окремо побудувався). Очікувалися compile-safe negative tests; фактично union malformed before допускав undefined, indexed preview properties теж мали optional тип, а Vitest mock tuple дозволяв відсутній RequestInit.

Підтверджене виправлення: некоректні зовнішні поля задаються через `Object.assign` у negative fixtures; існування before для valid update/delete позначено на місці копіювання; tuple RequestInit явно narrowed для assertions; додано точну перевірку кількості трьох POST calls. Матеріальні assertions не вилучено й не послаблено. Повторні `npm run type-check`, `npm run build`, цільовий і повний Vitest пройшли.

Початкових failed application assertions у Vitest або targeted Playwright не було. Node.js повідомлення `The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set` є неблокувальною діагностикою кольору логів; конфігурацію через нього не змінювали.

## Фінальні gates та acceptance

| Фінальна команда                  | Результат                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run format:check`            | PASS, exit 0; повторено після фінального оформлення цього звіту                          |
| `npm run type-check`              | PASS, exit 0                                                                             |
| `npm run test:e2e -- --workers=2` | PASS, exit 0: повний звичайний набір, 98/98 тестів, 3.9 хв; без live suites              |
| `npm run help:smoke`              | PASS, exit 0: звичайний base та `/planner/`, deep link, media, app return і mobile width |
| `git diff --check`                | PASS, exit 0                                                                             |

`--workers=2` обмежує лише паралельність повного E2E-набору: жодних grep/filter/skip не додано. Повний набір включає нові availability сценарії, попередні AI Lesson/Task/Planning flows, імпорт, розклад, авторизацію, help і accessibility. Нових невиправлених failed assertions або заблокованих локальних gates немає.

Фінальний read-only GitHub API знімок отримано `2026-11-08T17:05:07Z`: Backend workflow `42501369813`, той самий точний SHA `1912ff45be03d5eed3dfeabe5fa6a1a2f13958a4`, `status: completed`, `conclusion: success`, `updated_at: 2026-11-08T16:53:13Z`. На відміну від початкового in_progress, тепер є прямий hosted CI evidence. Це не live/provider acceptance і не перевірка міграції retained deployment.

Live Laravel/provider acceptance не виконувалося. Потрібні розгорнутий сумісний Backend з forward migration Stage 18B та чинна авторизована сесія; цей milestone не мігрує retained database. Автоматичний axe/keyboard не замінює ручне screen-reader тестування на всіх платформах. Obsolete-action блокування повторно використовує чинний локальний conversation mechanism; після нового відкриття остаточний stale/expiry захист забезпечує Backend fingerprint/preflight/confirm.

R01–R48 аудит не виконувався; це наступний окремий milestone. Реалізація готова до цього аудиту; локальні gates та hosted Backend CI мають PASS, live/provider verification має NOT RUN. Build outputs, traces, screenshots, `.env` і credentials до коміту не додаються.

Фінальний статус Stage 18C: **PASS — Frontend integration acceptance за публічним контрактом і локальними mocked suites**. Усі три дії підтримані, чинний decision workflow збережено, exact local clocks і historical receipts перевірено, усі обов’язкові gates пройдено. Функціональних блокерів Stage 18C немає. Зміни комітяться прямо в `main`; фінальний SHA наведено у звіті завершення сесії.
