# Українські системні тексти Frontend

Зіставлено з `docs/backend-uk-localization.md` Backend на коміті `b1cf1b7`.
Наявні зміни довідника та VerifyEmailView.vue збережено без редагування в цій задачі.

## Реалізація

- Спільний шар показу помилок приймає лише явні повідомлення та шаблони з перевіреного каталогу. Каталог publicMessages.json містить сталі публічні літерали Backend b1cf1b7 та локальних валідаторів. Нові повідомлення контракту потребують явного перегляду каталогу. Невідоме повідомлення має український запасний текст; наявність кирилиці не є критерієм довіри.
- Конкретні допустимі українські помилки полів збережено. Ключі полів, HTTP-статуси, Retry-After, 401/419, коди та структуровані дані конфліктів лишаються для обробки. Загальний 409 не називає невідому причину зміною даних чи простроченням.
- Історичні помилки імпорту мають український наступний крок. Координати та назви аркушів із відомого формату збережені; назви файлів і довідників не перекладаються.
- Невідомі системні статуси/поля та причини не перетворюються на машинні підписи. Пояснення відновлення й наслідків AI більше не перевіряються лише за кирилицею. Картки підтвердження лишаються.
- Нативні обмеження форм збережено; додано українські повідомлення валідації. Наявні власні custom validity повідомлення не перекриваються. Значення дат, часовий пояс і запити не перетворюються.

## Фактичні перевірки

Перевірено код маршрутів, форм і шляхів повідомлень; це не браузерне приймання. Перевірка типів, production build і git diff --check пройшли. Автоматизовані тести не додавалися, не редагувалися й не запускалися.

Ручних перевірок екранів у браузері не виконано: немає підключеної браузерної сесії. Читання профілю з локального Backend localhost:8000 повернуло HTTP 500. Не пройдено наскрізь невалідну форму в English, прострочений огляд, конфлікт підтвердження, некоректний Excel, відключення мережі, нове нагадування без тексту й нагадування з латинським текстом. Нові українські шаблони нагадувань підтверджено лише за контрактом Backend; фактичну доставку тут не перевірено.

## Залишкові джерела іншої мови

- Нативні календарі/сегменти дати можуть залежати від мови браузера: розклад і окремі заняття, завдання/підзавдання, періоди планування та статистики, навчальні періоди, нагадування, доступність і перенесення сесії. Клавіатурне введення збережено, але роботу в English не перевірено; lang=uk не гарантує мову самого календаря.
- Нативний вибір файлу може показувати англійські системні написи на сторінках семестрового та історичного імпорту. Заміну файлового елемента не впроваджено.
- Довільні відповіді та стара історія AI, введені назви/описи, власні повідомлення нагадувань, назви файлів/аркушів залишені дослівно. Старі англійські повідомлення у Вхідних не змінюються без надійної ознаки системного походження.
- Невідомі історичні діагностики без розпізнаваної структури мають загальний наступний крок; їхню первісну причину не вгадуємо.

## Змінені файли

- `src/api/client.ts`
- `src/api/workCompletion.ts`
- `src/components/domain/SubtaskForm.vue`
- `src/components/domain/TaskCard.vue`
- `src/components/domain/TaskForm.vue`
- `src/components/planning/RecoveryEvidence.vue`
- `src/components/planning/SessionCard.vue`
- `src/components/planning/StudyProposal.vue`
- `src/components/reminders/ReminderCard.vue`
- `src/components/reminders/ReminderForm.vue`
- `src/components/schedule/ImportBatchSummary.vue`
- `src/components/schedule/ImportRowCard.vue`
- `src/components/schedule/LessonForm.vue`
- `src/components/schedule/SemesterImportCatalog.vue`
- `src/components/statistics/ReportRangeForm.vue`
- `src/components/statistics/SessionSummary.vue`
- `src/components/ui/ErrorState.vue`
- `src/components/ui/TaskDateTimeField.vue`
- `src/components/ui/TaskMinutesField.vue`
- `src/composables/useAvailabilitySetup.ts`
- `src/composables/useWorkCompletion.ts`
- `src/main.ts`
- `src/utils/ai.ts`
- `src/utils/aiEffects.ts`
- `src/utils/recoveryPlanPresentation.ts`
- `src/utils/replanningPresentation.ts`
- `src/utils/scheduleImport.ts`
- `src/utils/semesterImport.ts`
- `src/utils/statistics.ts`
- `src/views/AvailabilityView.vue`
- `src/views/FreeTimeView.vue`
- `src/views/PlanPreviewView.vue`
- `src/views/PlanningSettingsView.vue`
- `src/views/ReminderEditorView.vue`
- `src/views/RemindersView.vue`
- `src/views/StatisticsView.vue`
- `src/views/StudySessionView.vue`
- `src/views/StudySessionsView.vue`
- `src/views/TaskEditorView.vue`
- `src/views/TasksView.vue`
- `src/views/WorkloadAdviceView.vue`
- `src/utils/publicText.ts`
- `src/utils/publicMessages.json`
- `src/utils/nativeValidation.ts`
- `docs/frontend-uk-localization.md` — цей звіт.
