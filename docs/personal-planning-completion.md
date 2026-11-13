# Персональне планування: завершення модуля

Пояснення результатів у StudyProposal/PlanningReview/RecoveryEvidence та workload
показуються українською. Виключені work items відокремлені від допущених, але
нерозміщених. requested=0 із виключеною роботою не показує «усе має час».

FreeTimeView зберігає сирі free intervals і окремо читає
`GET /api/planning/diagnostics`. Сервер перевіряє кожний проміжок незалежно через
наявний allocator/context. Це приклад придатності однієї сесії без дедлайну
конкретного завдання, не новий план. Vue не дублює break/workload правила.
PlanningSettings показує configuration/calendar warnings; advisory не є новим
HTTP 422. Null означає відсутність користувацького обмеження. Break — обов’язковий
мінімальний проміжок і навколо університетських занять. Стилі нижньої free-time
кнопки мають окремий відступ, кольори/Manrope/теми збережено.

Завершення сесії вимагає порожнього спочатку поля фактичних хвилин 1–65535, без
автоматичної підстановки planned time. Сервер також перевіряє REST/domain/AI.
План показує effective_deadline_at та дію редагування простроченої роботи.
TaskSubtasks показує серверний effective_deadline_at, успадкування parent deadline
та редагування; мінімум дедлайнів у Vue не розраховується. Нове поле Subtask
не входить до input/PATCH. Старі fixtures без нього підтримують display fallback.

Adaptive preview містить `replacements[]`. Singular `replacement` — alias тільки
для однієї заміни, null для кількох. StudyProposal показує source, кожний successor
і загальні неперенесені хвилини. PlanPreview, RecoverySuggestions та AiActionReview
потребують unchecked `accept_split_replacements` згоди на поділ, окремо від partial
та cancellation. Старий preview token потрібно оновити (серверна version 2).
Після timeout confirm не повторюється автоматично. Recovery feed перечитується
щохвилини у видимій вкладці; автоматичний detector потребує Backend Scheduler.

Ручні DEMO-сценарії та фактичні IDs збережено в Backend документі
`docs/planning-demo-manual-check.uk.md`. Дані створені для точно перевіреного `o`,
User 10: tasks 62–70, subtasks 40–42, sessions 48–50. Завершення F, зміни умов G/H
і split в робочій БД ще не виконувалися.

Перевірки етапів: type-check/build успішні; останній focused набір 136 tests passed,
перед ним split/AI набір 156 passed. Ширший запуск із subtasks.test.ts: 146 passed,
3 failed. Ці три failures відтворюються у збереженому baseline до змін (старі кнопки
complete/reopen і min datetime input); тести збережено. Повного зеленого suite не
заявляємо. Усі Backend integration tests запускались на disposable MySQL, не на
робочій БД. Ручного браузерного E2E для всіх DEMO-сценаріїв тут не виконувалось.
