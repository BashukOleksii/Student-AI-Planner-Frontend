# Огляд REST API

[Зміст](README.md) · [Функціональні модулі](functional-overview.md) · [AI-протокол](ai-agent.md)

## Спільний контракт

Застосунок використовує `/api`, **без `/api/v1`**. Нижче наведено фактичні маршрути з [routes/api.php](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/routes/api.php). Параметри в дужках зберігають назви Laravel route binding. Каталог не означає дозвіл виконувати мутації на будь-якому середовищі.

- `Accept: application/json`; для звичайних змін — JSON, для імпорту — FormData.
- Автентифікація SPA: cookie-сеанс Sanctum, `credentials: include`, `GET /sanctum/csrf-cookie` до входу/реєстрації та `X-XSRF-TOKEN` для змін. CSRF endpoint надає Sanctum поза application `/api`.
- Усі доменні й AI-маршрути захищено `auth:sanctum`; register/login публічні, але їхній SPA-контракт теж потребує правильного Origin/Referer, CSRF та сеансу. Logout захищений.
- ID власника не є довільним полем запиту. Form Requests перевіряють дані; Policies/Services і scoped bindings захищають власність та вкладеність.
- Один Resource переважно має форму `{ "data": { ... } }`; звичайна колекція — `{ "data": [...] }`. Пагіновані Tasks/Reminders/Notifications/AI-списки додають `links` і `meta`; не всі колекції пагіновані.
- Free Slots/StudySessions/Effective Schedule додають metadata діапазону й timezone. У Batch `data.rows` — звичайний масив, а не ще один `rows.data`.
- DELETE або logout можуть повертати 204 без JSON. Створення звичайно повертає 201; читання/оновлення — 200. Окремі confirmation responses мають уточнення нижче.

Клієнтські джерела: [client.ts](../../src/api/client.ts), [endpoints.ts](../../src/api/endpoints.ts), [planning.ts](../../src/api/planning.ts), [scheduleImports.ts](../../src/api/scheduleImports.ts), [ai.ts](../../src/api/ai.ts).

## Дати, поля й важливі операції

| Область              | Точний зміст контракту                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile              | name, email, timezone; timezone — IANA; UserResource не видає password/remember_token                                                                                                                                                                                                                  |
| Planning Preferences | PUT замінює п'ять nullable параметрів: max_daily_study_minutes, max_weekly_study_minutes, preferred_break_minutes, min_session_minutes, max_session_minutes                                                                                                                                            |
| Availability         | day_of_week 1–7; starts_at/ends_at як локальні `HH:mm:ss`; позитивний інтервал і відсутність перетину перевіряє сервер                                                                                                                                                                                 |
| Діапазони            | start_date/end_date у `YYYY-MM-DD`, обидві локальні дати включно, максимум 31 дату для планування/сесій/статистики                                                                                                                                                                                     |
| Task/Subtask         | title, nullable description/estimated_minutes/deadline_at; у Task також subject_id і priority 1/2/3. PATCH має зберігати семантику «поле відсутнє» проти явного null. Стан змінюється lifecycle endpoint, не довільним PATCH status.                                                                   |
| Task list            | status, priority, subject_id, deadline_from, deadline_to, page, per_page; фільтри поєднуються, per_page ≤ 100                                                                                                                                                                                          |
| Subtask reorder      | Масив subtask_ids; має охоплювати правильний актуальний набір дітей у потрібному порядку                                                                                                                                                                                                               |
| Lesson               | subject_id, необов'язкові власні teacher_id/academic_period_id, type, room, starts_at, ends_at; заміна й скасування — окремі дії                                                                                                                                                                       |
| XLSX                 | Multipart academic_period_id + schedule_file; `.xlsx`, до 5120 КБ, підтриманий workbook layout. Revalidate/commit працюють із збереженим Batch, не повторним файлом.                                                                                                                                   |
| Plan preview         | start_date/end_date, необов'язкові task_id/subtask_id; дитина потребує батька. Повертає план, preview_token, expires_at.                                                                                                                                                                               |
| Plan confirm         | preview_token, необов'язковий strict boolean accept_partial; успіх **201** із фактичними StudySessions                                                                                                                                                                                                 |
| Replanning confirm   | Додає незалежний strict boolean accept_unplaced_cancellation; успіх **200** із original_sessions/replacement_sessions і summary                                                                                                                                                                        |
| Session lifecycle    | complete приймає необов'язкові позитивні actual_minutes; для невідомої тривалості поле опускають, явний null не проходить Form Request; reschedule — точні UTC starts_at/ends_at, успіх **201** із original/replacement. Майбутні cancel/reschedule та elapsed complete/miss мають різні часові умови. |
| Reminder             | Абсолютний trigger_at або рівно одна відповідна relative target/anchor/offset_minutes комбінація. Anchors: task_deadline, subtask_deadline, session_start. Message до 500 символів; режим/цілі не змінюються довільним PATCH.                                                                          |
| Notifications        | GET підтримує unread_only, page, per_page; POST read зберігає read_at тільки при першому читанні                                                                                                                                                                                                       |
| Comparison           | baseline_start_date/baseline_end_date/current_start_date/current_end_date; однакова кількість локальних дат, baseline перед current, без перетину                                                                                                                                                      |
| AI send              | JSON `{ "content": "..." }`, UUID Idempotency-Key у заголовку, до 4000 змістовних UTF-8 символів; успіх **200**                                                                                                                                                                                        |
| AI decisions         | UUID action у власній conversation; confirm/reject не викликає LLM. Відповідь містить data й replayed; planning consent приходить лише з UI.                                                                                                                                                           |

Точні UTC доменні моменти мають вигляд `YYYY-MM-DDTHH:mm:ssZ`. Поля as_of_utc та службові AI timestamps можуть мати мікросекунди. Локальні дати й availability не можна перетворювати на UTC простим дописуванням `Z`.

Перелік не замінює Form Requests як машинний валідатор і не встановлює однакові максимуми пагінації для різних модулів. Невідомі поля відхиляються там, де це прямо реалізовано відповідним Request; не слід приписувати цей режим усім endpoints без винятку.

Для XLSX HTTP 201 підтверджує створення Batch, а не успішний імпорт: parser/materialization може залишити `status=failed` із помилкою. Потрібно перевіряти status, лічильники та rows. Ні `uploaded`, ні `validated` не означають, що Lessons уже створено.

## Помилки і відновлення

| HTTP            | Значення і дія клієнта                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 401             | Немає чинного автентифікованого сеансу; повторний вхід                                                                        |
| 403 / 404       | Заборона або недоступний ресурс; Policies часто повертають 404 для чужого запису                                              |
| 409             | Застарілий preview, конфлікт Session/Reminder/AI або idempotency conflict; прочитати актуальний стан і виконати нову явну дію |
| 410             | Прострочена AI-дія                                                                                                            |
| 419             | Невідповідність CSRF/сеансу; явне відновлення без автоматичного повторення мутації                                            |
| 422             | Помилки полів/доменної валідації; зазвичай `{ message, errors: { field: [...] } }`. AI також має фіксовані code.              |
| 429             | Обмеження частоти AI-повідомлень; врахувати Retry-After                                                                       |
| 500 / 502 / 503 | Внутрішній збій / проблема provider-відповіді / недоступна AI-конфігурація; не показувати сирий SQL чи upstream payload       |

Імпортний 409 **може зберегти оновлений preview**, не змінюючи Lessons. Для прямого планування прострочений/невалідний token — 422, зміна матеріального плану — 409. Втрачена відповідь не доводить rollback. GET того самого Batch/Session або AI action/receipt передує будь-якому повтору. Ідемпотентність AI messages/actions не слід переносити на довільний POST створення Task.

Серверні помилки визначено [bootstrap/app.php](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/bootstrap/app.php) і [AiAgentException](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/f618bba290f919dc3561b0462c59b3b86ade82d8/app/Exceptions/AiAgentException.php).

## Повний каталог application routes

Таблицю сформовано зі статичних декларацій маршрутів поточного Backend і перевірено з ними повторно. Laravel також приймає HEAD для GET; нижче наведено явно оголошені методи. `/up` — framework health route поза цим каталогом; він не замінює перевірку MySQL, session чи провайдера.

| Метод    | Точний маршрут                                                  | Controller / метод                           | Доступ         |
| -------- | --------------------------------------------------------------- | -------------------------------------------- | -------------- |
| `POST`   | `/api/auth/register`                                            | `AuthController::register`                   | `SPA public`   |
| `POST`   | `/api/auth/login`                                               | `AuthController::login`                      | `SPA public`   |
| `POST`   | `/api/auth/logout`                                              | `AuthController::logout`                     | `auth:sanctum` |
| `POST`   | `/api/ai/conversations`                                         | `AiConversationController::store`            | `auth:sanctum` |
| `GET`    | `/api/ai/conversations`                                         | `AiConversationController::index`            | `auth:sanctum` |
| `GET`    | `/api/ai/conversations/{conversation}`                          | `AiConversationController::show`             | `auth:sanctum` |
| `GET`    | `/api/ai/conversations/{conversation}/actions`                  | `AiTaskActionController::index`              | `auth:sanctum` |
| `GET`    | `/api/ai/conversations/{conversation}/actions/{action}`         | `AiTaskActionController::show`               | `auth:sanctum` |
| `POST`   | `/api/ai/conversations/{conversation}/actions/{action}/confirm` | `AiTaskActionController::confirm`            | `auth:sanctum` |
| `POST`   | `/api/ai/conversations/{conversation}/actions/{action}/reject`  | `AiTaskActionController::reject`             | `auth:sanctum` |
| `GET`    | `/api/ai/conversations/{conversation}/messages`                 | `AiConversationController::messages`         | `auth:sanctum` |
| `POST`   | `/api/ai/conversations/{conversation}/messages`                 | `AiConversationController::send`             | `auth:sanctum` |
| `GET`    | `/api/statistics/reports/comparison`                            | `ProgressComparisonController::index`        | `auth:sanctum` |
| `GET`    | `/api/statistics/progress`                                      | `ProgressStatisticsController::index`        | `auth:sanctum` |
| `GET`    | `/api/statistics/trends`                                        | `ProgressTrendsController::index`            | `auth:sanctum` |
| `GET`    | `/api/notifications`                                            | `NotificationController::index`              | `auth:sanctum` |
| `POST`   | `/api/notifications/{notification}/read`                        | `NotificationController::read`               | `auth:sanctum` |
| `GET`    | `/api/reminders`                                                | `ReminderController::index`                  | `auth:sanctum` |
| `POST`   | `/api/reminders`                                                | `ReminderController::store`                  | `auth:sanctum` |
| `GET`    | `/api/reminders/{reminder}`                                     | `ReminderController::show`                   | `auth:sanctum` |
| `PATCH`  | `/api/reminders/{reminder}`                                     | `ReminderController::update`                 | `auth:sanctum` |
| `POST`   | `/api/reminders/{reminder}/cancel`                              | `ReminderController::cancel`                 | `auth:sanctum` |
| `GET`    | `/api/profile`                                                  | `ProfileController::show`                    | `auth:sanctum` |
| `PATCH`  | `/api/profile`                                                  | `ProfileController::update`                  | `auth:sanctum` |
| `GET`    | `/api/planning/free-slots`                                      | `FreeSlotController::index`                  | `auth:sanctum` |
| `POST`   | `/api/planning/study-plans/preview`                             | `StudyPlanController::preview`               | `auth:sanctum` |
| `POST`   | `/api/planning/replanning/preview`                              | `StudyReplanningController::preview`         | `auth:sanctum` |
| `POST`   | `/api/planning/replanning/confirm`                              | `StudyReplanningController::confirm`         | `auth:sanctum` |
| `POST`   | `/api/planning/study-plans/confirm`                             | `StudyPlanController::confirm`               | `auth:sanctum` |
| `GET`    | `/api/study-sessions`                                           | `StudySessionController::index`              | `auth:sanctum` |
| `GET`    | `/api/study-sessions/{studySession}`                            | `StudySessionController::show`               | `auth:sanctum` |
| `POST`   | `/api/study-sessions/{studySession}/complete`                   | `StudySessionController::complete`           | `auth:sanctum` |
| `POST`   | `/api/study-sessions/{studySession}/miss`                       | `StudySessionController::miss`               | `auth:sanctum` |
| `POST`   | `/api/study-sessions/{studySession}/cancel`                     | `StudySessionController::cancel`             | `auth:sanctum` |
| `POST`   | `/api/study-sessions/{studySession}/reschedule`                 | `StudySessionController::reschedule`         | `auth:sanctum` |
| `GET`    | `/api/planning-preferences`                                     | `PlanningPreferenceController::show`         | `auth:sanctum` |
| `PUT`    | `/api/planning-preferences`                                     | `PlanningPreferenceController::update`       | `auth:sanctum` |
| `GET`    | `/api/study-availability-windows`                               | `StudyAvailabilityWindowController::index`   | `auth:sanctum` |
| `POST`   | `/api/study-availability-windows`                               | `StudyAvailabilityWindowController::store`   | `auth:sanctum` |
| `PATCH`  | `/api/study-availability-windows/{studyAvailabilityWindow}`     | `StudyAvailabilityWindowController::update`  | `auth:sanctum` |
| `DELETE` | `/api/study-availability-windows/{studyAvailabilityWindow}`     | `StudyAvailabilityWindowController::destroy` | `auth:sanctum` |
| `GET`    | `/api/education-institutions`                                   | `EducationInstitutionController::index`      | `auth:sanctum` |
| `POST`   | `/api/education-institutions`                                   | `EducationInstitutionController::store`      | `auth:sanctum` |
| `GET`    | `/api/education-institutions/{educationInstitution}`            | `EducationInstitutionController::show`       | `auth:sanctum` |
| `PATCH`  | `/api/education-institutions/{educationInstitution}`            | `EducationInstitutionController::update`     | `auth:sanctum` |
| `DELETE` | `/api/education-institutions/{educationInstitution}`            | `EducationInstitutionController::destroy`    | `auth:sanctum` |
| `GET`    | `/api/academic-periods`                                         | `AcademicPeriodController::index`            | `auth:sanctum` |
| `POST`   | `/api/academic-periods`                                         | `AcademicPeriodController::store`            | `auth:sanctum` |
| `GET`    | `/api/academic-periods/{academicPeriod}`                        | `AcademicPeriodController::show`             | `auth:sanctum` |
| `PATCH`  | `/api/academic-periods/{academicPeriod}`                        | `AcademicPeriodController::update`           | `auth:sanctum` |
| `DELETE` | `/api/academic-periods/{academicPeriod}`                        | `AcademicPeriodController::destroy`          | `auth:sanctum` |
| `GET`    | `/api/subjects`                                                 | `SubjectController::index`                   | `auth:sanctum` |
| `POST`   | `/api/subjects`                                                 | `SubjectController::store`                   | `auth:sanctum` |
| `GET`    | `/api/subjects/{subject}`                                       | `SubjectController::show`                    | `auth:sanctum` |
| `PATCH`  | `/api/subjects/{subject}`                                       | `SubjectController::update`                  | `auth:sanctum` |
| `DELETE` | `/api/subjects/{subject}`                                       | `SubjectController::destroy`                 | `auth:sanctum` |
| `GET`    | `/api/teachers`                                                 | `TeacherController::index`                   | `auth:sanctum` |
| `POST`   | `/api/teachers`                                                 | `TeacherController::store`                   | `auth:sanctum` |
| `GET`    | `/api/teachers/{teacher}`                                       | `TeacherController::show`                    | `auth:sanctum` |
| `PATCH`  | `/api/teachers/{teacher}`                                       | `TeacherController::update`                  | `auth:sanctum` |
| `DELETE` | `/api/teachers/{teacher}`                                       | `TeacherController::destroy`                 | `auth:sanctum` |
| `POST`   | `/api/lessons`                                                  | `LessonController::store`                    | `auth:sanctum` |
| `GET`    | `/api/lessons/{lesson}`                                         | `LessonController::show`                     | `auth:sanctum` |
| `PATCH`  | `/api/lessons/{lesson}`                                         | `LessonController::update`                   | `auth:sanctum` |
| `DELETE` | `/api/lessons/{lesson}`                                         | `LessonController::destroy`                  | `auth:sanctum` |
| `POST`   | `/api/lessons/{lesson}/cancel`                                  | `LessonController::cancel`                   | `auth:sanctum` |
| `POST`   | `/api/lessons/{lesson}/replacement`                             | `LessonController::replacement`              | `auth:sanctum` |
| `GET`    | `/api/schedule/today`                                           | `ScheduleController::today`                  | `auth:sanctum` |
| `GET`    | `/api/schedule/date/{date}`                                     | `ScheduleController::date`                   | `auth:sanctum` |
| `GET`    | `/api/schedule/week/{date}`                                     | `ScheduleController::week`                   | `auth:sanctum` |
| `POST`   | `/api/schedule-imports`                                         | `ScheduleImportController::store`            | `auth:sanctum` |
| `GET`    | `/api/schedule-imports/{scheduleImportBatch}`                   | `ScheduleImportController::show`             | `auth:sanctum` |
| `POST`   | `/api/schedule-imports/{scheduleImportBatch}/revalidate`        | `ScheduleImportController::revalidate`       | `auth:sanctum` |
| `POST`   | `/api/schedule-imports/{scheduleImportBatch}/commit`            | `ScheduleImportController::commit`           | `auth:sanctum` |
| `GET`    | `/api/tasks`                                                    | `TaskController::index`                      | `auth:sanctum` |
| `POST`   | `/api/tasks`                                                    | `TaskController::store`                      | `auth:sanctum` |
| `GET`    | `/api/tasks/{task}`                                             | `TaskController::show`                       | `auth:sanctum` |
| `GET`    | `/api/tasks/{task}/progress`                                    | `TaskController::progress`                   | `auth:sanctum` |
| `PATCH`  | `/api/tasks/{task}`                                             | `TaskController::update`                     | `auth:sanctum` |
| `DELETE` | `/api/tasks/{task}`                                             | `TaskController::destroy`                    | `auth:sanctum` |
| `POST`   | `/api/tasks/{task}/complete`                                    | `TaskController::complete`                   | `auth:sanctum` |
| `POST`   | `/api/tasks/{task}/reopen`                                      | `TaskController::reopen`                     | `auth:sanctum` |
| `GET`    | `/api/tasks/{task}/subtasks`                                    | `SubtaskController::index`                   | `auth:sanctum` |
| `POST`   | `/api/tasks/{task}/subtasks`                                    | `SubtaskController::store`                   | `auth:sanctum` |
| `POST`   | `/api/tasks/{task}/subtasks/reorder`                            | `SubtaskController::reorder`                 | `auth:sanctum` |
| `GET`    | `/api/tasks/{task}/subtasks/{subtask}`                          | `SubtaskController::show`                    | `auth:sanctum` |
| `PATCH`  | `/api/tasks/{task}/subtasks/{subtask}`                          | `SubtaskController::update`                  | `auth:sanctum` |
| `DELETE` | `/api/tasks/{task}/subtasks/{subtask}`                          | `SubtaskController::destroy`                 | `auth:sanctum` |
| `POST`   | `/api/tasks/{task}/subtasks/{subtask}/complete`                 | `SubtaskController::complete`                | `auth:sanctum` |
| `POST`   | `/api/tasks/{task}/subtasks/{subtask}/reopen`                   | `SubtaskController::reopen`                  | `auth:sanctum` |

Усього явно оголошених application routes: **90**. Окремо Sanctum надає `GET /sanctum/csrf-cookie`.
