# Архітектура AI-агента

[Зміст](README.md) · [Послідовність виклику та підтвердження](diagrams/ai-confirmation.mmd) · [Докази](testing-and-results.md)

## Роль агента і межа довіри

Агент перетворює природномовний намір на послідовність викликів фіксованих серверних Tools. Його роль — оркестрація. Розклад, залишок роботи, вільний час, план, строки, нагадування та показники розраховують Laravel Services.

Довірений користувач надходить з Laravel Sanctum. Текст повідомлень, історія, назви завдань та результати Tools вважаються даними, а не новими системними інструкціями. Дозволені імена й схеми визначаються серверними registry. LLM не може передати інший `user_id`, додати довільний PHP-клас чи викликати непередбачений writer.

Джерела: [AgentOrchestrator](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/AgentOrchestrator.php), [ToolExecutor](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/Tools/ToolExecutor.php), [OpenAiResponsesProvider](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/OpenAiResponsesProvider.php).

## Фактичні інструменти

Оркестратор об'єднує **9 інструментів читання і 14 інструментів підготовки пропозицій**. Це 23 визначення, а не 23 прямі способи змінити БД.

| Registry                                        | Зареєстровані назви                                                                                                                                                                       | Виконання                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ToolRegistry`                                  | `get_schedule_for_date`, `list_tasks`, `find_free_study_slots`, `list_study_sessions`, `get_progress_statistics`, `get_daily_progress_trends`, `compare_progress_periods`                 | `ToolExecutor` → `ReadOnlyTools` → доменні Services                            |
| `SubtaskReminderActionRegistry.readDefinitions` | `list_subtasks_for_task`, `list_reminders`                                                                                                                                                | `ManagementReadTools` → `SubtaskService` / `ReminderService`                   |
| `TaskActionRegistry`                            | `propose_task_create`, `propose_task_update`, `propose_task_complete`, `propose_task_reopen`                                                                                              | `TaskActionProposalService` готує перевірену пропозицію                        |
| `SubtaskReminderActionRegistry.definitions`     | `propose_subtask_create`, `propose_subtask_update`, `propose_subtask_complete`, `propose_subtask_reopen`, `propose_reminder_create`, `propose_reminder_update`, `propose_reminder_cancel` | `SubtaskReminderActionService.prepare`                                         |
| `PlanningActionRegistry`                        | `propose_study_plan_create`, `propose_adaptive_replanning`, `propose_session_reschedule`                                                                                                  | `PlanningActionService.prepare` із повторним використанням Services планування |

Registry-джерела: [читання](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/Tools/ToolRegistry.php), [Task](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/Actions/TaskActionRegistry.php), [Subtask/Reminder](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/Actions/SubtaskReminderActionRegistry.php), [планування](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/Actions/PlanningActionRegistry.php).

Немає зареєстрованих AI-дій видалення Task, зміни порядку Subtasks, імпорту розкладу, доставки Reminder, зміни Inbox чи довільного SQL. Наявність відповідного звичайного REST API не додає такого Tool автоматично. У поточному AI-потоці **кожна доменна зміна потребує окремого підтвердження**, включно зі створенням одного завдання.

## Обробка повідомлення

1. Клієнт створює/відкриває власну розмову. POST повідомлення містить `content` і UUID у заголовку `Idempotency-Key`.
2. `SendAiMessageRequest` перевіряє JSON, дозволені поля, змістовний UTF-8 текст до 4000 символів і формат ключа.
3. `AiConversationService` у короткій транзакції резервує хід через `ai_conversation_turns`. Унікальна пара `(conversation_id, request_id)` і `input_hash` прив'язують повтор до початкового змісту. Активна lease захищає одну розмову від одночасних ходів.
4. Поза відкритою DB-транзакцією завантажується обмежена історія, після чого `AgentOrchestrator` викликає `LlmProvider`.
5. `OpenAiResponsesProvider` надсилає запит до `https://api.openai.com/v1/responses`. Секрет залишається на сервері. Безстановий протокол передає перевірені continuation items; `store=false` не означає відсутності локальної історії в MySQL.
6. Оркестратор перевіряє весь пакет call ID, схеми й ліміти, потім послідовно виконує серверні адаптери. Опція provider `parallel_tool_calls=true` не робить доменні записи паралельними.
7. Результат читання повертається провайдеру як function output. Пропозиція проходить серверну підготовку, але доменні записи ще не створюються. За один хід допускається щонайбільше **одна спроба пропозиції зміни** серед усіх доменів; друга спричиняє `multiple_actions`.
8. Коротка завершальна транзакція зберігає повідомлення, результат ходу й за наявності `ai_pending_actions`. Для пропозицій фінальний публічний текст контролює сервер, щоб модель не могла видати пропозицію за виконану зміну.

За замовчуванням конфігурація обмежує хід 5 раундами, 8 Tool calls, 20 повідомленнями історії та 180 секундами; lease — 240 секунд, rate limit — 10 повідомлень/хвилину. Це налаштовувані серверні межі з перевіркою допустимості, а не виміряна тривалість відповіді чи гарантія витрат. Джерело: [config/ai.php](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/config/ai.php).

## Історія і публічні дані

`ai_conversations` належить користувачу. `ai_messages` зберігає ролі, текст, Tool call ID і службові дані; `ai_conversation_turns` зберігає lease та довговічний результат ідемпотентного ходу. `ai_pending_actions` містить UUID, тип, аргументи, preview, строк дії, стан і receipt.

`protected_payload` AI-планування — зашифрований cast моделі й приховане поле; звичайні `arguments`/`preview` JSON не оголошуються автоматично зашифрованими. Браузер отримує тільки публічний огляд. `AiMessageResource` повертає короткі Tool summaries: ім'я, call ID, успіх і допустимий код помилки, а не сирі аргументи, результати чи provider reasoning. [Клієнтський API-модуль](../../src/api/ai.ts) додатково перевіряє форми даних і відсікає приватні ключі.

Повідомлення читаються зі snapshot-пагінацією `through_id`; поточна сторінка не означає всю історію. Обрізані результати явно позначаються. Tools для Sessions/Subtasks мають власні обмеження обсягу; агент не повинен видавати часткову вибірку за повну.

## Явне підтвердження

UI відображає `confirmation_required`, а студент переглядає фактичний preview і натискає підтвердження або відхилення. Текстове «так» у чаті не виконує дію.

Запити мають точні маршрути:

- `POST /api/ai/conversations/{conversation}/actions/{action}/confirm`;
- `POST /api/ai/conversations/{conversation}/actions/{action}/reject`.

`TaskActionConfirmationService` є спільною точкою підтвердження попри історичну назву класу. Він перевіряє власника розмови/дії, поточний стан, строк дії, актуальність цілі та за потреби захищений матеріальний план. Далі викликає відповідний Task/Subtask/Reminder/Planning Service. Доменна зміна, `receipt`, статус `executed` і подія в історії фіксуються атомарно. Повтор підтвердження виконаної дії повертає збережений результат із `replayed=true`, а не створює повторний доменний запис.

Стани дії: `pending`, `executed`, `rejected`, `expired`. Публічна подія `failed` може описувати невдалу спробу планування; це **не додатковий стан колонки status**. Строк пропозиції — до 15 хвилин, для планування може бути коротшим через строк доменного токена. Він не продовжується мовчки.

Частковий план/коротша заміна потребують `accept_partial`; скасування неперенесених джерел — ще й окремого `accept_unplaced_cancellation`. Ці прапорці приходять із явного REST-підтвердження UI, не від LLM.

Джерела: [TaskActionConfirmationService](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/Actions/TaskActionConfirmationService.php), [PlanningActionService](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Services/AI/Actions/PlanningActionService.php).

## Помилки та відновлення

| Ситуація                                       | Реакція                                            |
| ---------------------------------------------- | -------------------------------------------------- |
| Повтор ключа з іншим текстом                   | 409 `idempotency_conflict`                         |
| Інший активний хід/втрачена lease              | 409 `conversation_busy` / `turn_expired`           |
| Немає конфігурації провайдера                  | 503 `ai_unavailable`                               |
| Мережевий збій або некоректна відповідь моделі | 502 `provider_error` / `invalid_provider_response` |
| Вичерпано межі чи запропоновано кілька змін    | 422 `execution_limit_reached` / `multiple_actions` |
| Ціль змінилася або план став нездійсненним     | 409 `action_stale` / `action_conflict`             |
| Дія прострочена                                | 410 `action_expired`                               |

Після невизначеної відповіді на повідомлення клієнт зберігає початковий зміст/ключ, читає історію і допускає свідомий повтор з тим самим ключем. Зафіксований хід відтворюється з БД; невдалий до фіксації запит може повторно звернутися до провайдера й коштувати коштів. Це не гарантія «рівно одного платного виклику». Після невизначеного confirm читається та сама дія/receipt і доменні записи. Прямий preview планування не має такого самого довговічного receipt-протоколу; ці механізми не можна ототожнювати.

## Приклади для пояснення комісії

| Природномовний намір                       | Очікуваний маршрут оркестрації                                                            | Статус прикладу                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| «Покажи заняття на конкретну дату»         | `get_schedule_for_date` → `ScheduleService` → фактичні Lessons                            | Ілюстрація зареєстрованого Tool; вибір реальною моделлю в Stage 8 не перевірявся      |
| «Знайди вільний час між двома датами»      | `find_free_study_slots` → `FreeTimeService`; за уточненням — пропозиція плану             | Доменний розрахунок перевірено напряму; платний діалог не виконано                    |
| «Заплануй роботу над визначеним завданням» | Читання ID/стану → `propose_study_plan_create` → preview → явна згода → Service → receipt | AI-потік покритий тестами з підмінним провайдером; реальний REST-план Stage 8 пройшов |
| «Нагадай за годину до дедлайну»            | Уточнення цілі → `propose_reminder_create` → огляд anchor/offset → confirm → Reminder     | Детерміноване створення/синхронізація пройшли Stage 8; доставка окремо не запускалась |

Жоден рядок не є доказом реального paid-provider діалогу. Поточне приймання перевірило домен і детерміновану AI-інтеграцію тестами, але не якість рішень платної моделі, не статистичну ефективність рекомендацій і не навчання власної LLM.
