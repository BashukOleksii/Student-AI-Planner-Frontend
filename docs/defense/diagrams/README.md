# Діаграми архітектури та взаємодії

[Зміст комплекту](../README.md) · [Архітектура](../architecture.md) · [Модель даних](../data-model.md)

Кожна діаграма має окремий `.mmd`-файл як редаговане першоджерело й тотожний Mermaid-блок нижче для GitHub-сумісного перегляду. Підписи українські, імена класів/маршрутів/колонок збережено з коду. Ці схеми описують реалізацію, а статус фактичного виконання визначає звіт приймання.

Послідовності скорочують частину middleware, Controller і Resource переходів заради читабельності; доменні HTTP-запити проходять відповідні Controllers/Requests/Policies. Помилкові та негативні гілки не є вичерпним state machine. Позначення ER: PK/FK/UK, звичайні cardinalities; logical morph і sessions.user_id без FK підписані окремо. Повний nullable/UNIQUE/CHECK-контракт — у міграціях, а не в скорочених атрибутах діаграми.

## Каталог

| Схема                         | Mermaid-джерело                                    | Зміст                                                                                         |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Система й зовнішні інтеграції | [system-architecture.mmd](system-architecture.mmd) | Межі SPA/Laravel/MySQL та окремі provider/scheduler гілки.                                    |
| Компоненти Backend            | [backend-components.mmd](backend-components.mmd)   | Логічні відповідальності; Request/Policy/Controller не є новими мережевими сервісами.         |
| Компоненти Frontend           | [frontend-components.mmd](frontend-components.mmd) | Views, компоненти, composables, два Pinia stores і HTTP-шар.                                  |
| Модель даних                  | [data-model.mmd](data-model.mmd)                   | Усі 28 таблиць, вибрані ключові поля; nullable і складені обмеження уточнено в data-model.md. |
| Автентифікація                | [authentication.mmd](authentication.mmd)           | Cookie/CSRF та database session driver, як у перевіреному Stage 8.                            |
| Імпорт XLSX                   | [xlsx-import.mmd](xlsx-import.mmd)                 | Збережений preview, довідники, revalidate, актуальний commit та 409.                          |
| Автоматичне планування        | [study-planning.mmd](study-planning.mmd)           | Preview без нових Sessions, token, повторна перевірка й транзакційний confirm.                |
| AI Tool та явне підтвердження | [ai-confirmation.mmd](ai-confirmation.mmd)         | Схема реалізованого протоколу; реальний paid-provider у Stage 8 не викликався.                |
| Доставка нагадувань           | [reminder-delivery.mmd](reminder-delivery.mmd)     | Схема існуючого коду; dispatcher/Notification delivery у Stage 8 live НЕ ЗАПУСКАЛИСЬ.         |

## Система й зовнішні інтеграції

Межі SPA/Laravel/MySQL та окремі provider/scheduler гілки.

[Редаговане джерело](system-architecture.mmd)

```mermaid
flowchart TB
    student["Студент"]
    xlsx["Підтриманий XLSX-файл"]
    subgraph frontendApp["Незалежний Frontend"]
        spa["Vue 3 SPA: TypeScript, Router, Pinia"]
        transport["API-модулі: fetch, cookie, XSRF"]
        spa --> transport
    end
    subgraph backendApp["Незалежний Laravel Backend"]
        api["REST API та Sanctum"]
        domain["Policies, Requests, Services, Resources"]
        agent["AgentOrchestrator та серверні Tools"]
        dispatcher["ReminderDeliveryService"]
        api --> domain
        api --> agent
        agent --> domain
    end
    db[("MySQL: доменні дані, сеанси, AI-історія")]
    openai["OpenAI Responses API: ключ лише на Backend, live не перевірено"]
    scheduler["Laravel scheduler: щохвилини reminders:dispatch-due --limit=100"]
    student --> spa
    xlsx --> spa
    transport -->|"REST із credentials та CSRF"| api
    domain --> db
    agent <--> openai
    scheduler --> dispatcher
    dispatcher -->|"Notification і sent_at в одній транзакції"| db
```

## Компоненти Backend

Логічні відповідальності; Request/Policy/Controller не є новими мережевими сервісами.

[Редаговане джерело](backend-components.mmd)

```mermaid
flowchart TB
    route["routes/api.php та auth:sanctum"]
    request["Form Requests: поля, типи, часові межі"]
    policy["Policies та Gate: власність і вкладені ресурси"]
    controller["Controllers: HTTP-оркестрація"]
    resource["API Resources: публічні поля"]
    route --> request
    route --> policy
    request --> controller
    policy --> controller
    subgraph servicesLayer["Детерміновані Services"]
        academic["Academic / Schedule / Tasks"]
        imports["ScheduleWorkbookParser та Import Services"]
        planning["StudyPlanningService та Persistence Services"]
        reminders["ReminderService та ReminderDeliveryService"]
        progress["ProgressStatisticsService, Trends, Comparison"]
    end
    controller --> academic
    controller --> imports
    controller --> planning
    controller --> reminders
    controller --> progress
    controller --> conversation["AiConversationService"]
    conversation --> agent["AgentOrchestrator"]
    agent --> adapter["ToolExecutor, ManagementReadTools, proposal Services"]
    adapter --> academic
    adapter --> planning
    adapter --> reminders
    adapter --> progress
    controller --> confirm["TaskActionConfirmationService: явна згода"]
    confirm --> academic
    confirm --> planning
    confirm --> reminders
    agent --> provider["LlmProvider / OpenAiResponsesProvider"]
    academic --> model["Eloquent Models та MySQL"]
    imports --> model
    planning --> model
    reminders --> model
    progress --> model
    conversation --> model
    confirm --> model
    controller --> resource
```

## Компоненти Frontend

Views, компоненти, composables, два Pinia stores і HTTP-шар.

[Редаговане джерело](frontend-components.mmd)

```mermaid
flowchart TB
    main["main.ts: Vue, Pinia, Router"]
    router["src/router: guard, safeRedirect, lazy routes"]
    views["src/views: сторінки та сценарії"]
    components["src/components: форми, діалоги, огляди, таблиці"]
    resource["useResource: loading, error, AbortController"]
    ai["useAiConversation: історія, підтвердження, відновлення"]
    auth["Pinia auth: профіль та стан сеансу"]
    theme["Pinia theme: локальна тема"]
    endpoints["src/api: доменні endpoint-модулі"]
    client["src/api/client.ts: credentials, XSRF, ApiError"]
    types["src/types: доменні та API-типи"]
    laravel["Laravel REST API"]
    main --> router
    main --> auth
    main --> theme
    router --> auth
    router --> views
    views --> components
    views --> resource
    views --> ai
    views --> endpoints
    resource -->|"завантажувач від сторінки"| endpoints
    ai --> endpoints
    auth --> endpoints
    endpoints --> client
    types -.-> views
    types -.-> endpoints
    client --> laravel
    theme --> components
```

## Модель даних

Усі 28 таблиць, вибрані ключові поля; nullable і складені обмеження уточнено в data-model.md.

[Редаговане джерело](data-model.mmd)

```mermaid
erDiagram
    users {
        bigint id PK
        varchar name
        varchar email UK
        varchar password
        varchar timezone
    }
    planning_preferences {
        bigint user_id PK,FK
        smallint max_daily_study_minutes
        smallint max_weekly_study_minutes
        smallint preferred_break_minutes
        smallint min_session_minutes
        smallint max_session_minutes
    }
    study_availability_windows {
        bigint id PK
        bigint user_id FK
        tinyint day_of_week
        time starts_at
        time ends_at
    }
    education_institutions {
        bigint id PK
        bigint user_id FK
        varchar name
    }
    academic_periods {
        bigint id PK
        bigint user_id FK
        bigint education_institution_id FK
        varchar name
        date starts_on
        date ends_on
    }
    subjects {
        bigint id PK
        bigint user_id FK
        bigint education_institution_id FK
        varchar name
        varchar code
        char color
    }
    teachers {
        bigint id PK
        bigint user_id FK
        bigint education_institution_id FK
        varchar name
    }
    schedule_import_batches {
        bigint id PK
        bigint user_id FK
        bigint academic_period_id FK
        varchar status
        varchar original_filename
        char file_hash
        int total_rows
        int valid_rows
        int invalid_rows
        int duplicate_rows
        datetime committed_at
    }
    schedule_import_rows {
        bigint id PK
        bigint schedule_import_batch_id FK
        int row_number
        varchar status
        json raw_data
        json normalized_data
        json validation_errors
        char fingerprint
    }
    lessons {
        bigint id PK
        bigint user_id FK
        bigint academic_period_id FK
        bigint subject_id FK
        bigint teacher_id FK
        bigint schedule_import_batch_id FK
        bigint replaces_lesson_id FK,UK
        varchar type
        datetime starts_at
        datetime ends_at
        varchar status
        char import_fingerprint
        timestamp deleted_at
    }
    tasks {
        bigint id PK
        bigint user_id FK
        bigint subject_id FK
        varchar title
        varchar status
        tinyint priority
        smallint estimated_minutes
        datetime deadline_at
        datetime completed_at
        timestamp deleted_at
    }
    subtasks {
        bigint id PK
        bigint task_id FK
        varchar title
        smallint position
        varchar status
        smallint estimated_minutes
        datetime deadline_at
        datetime completed_at
        timestamp deleted_at
    }
    study_sessions {
        bigint id PK
        bigint user_id FK
        bigint task_id FK
        bigint subtask_id FK
        bigint rescheduled_from_session_id FK,UK
        datetime starts_at
        datetime ends_at
        varchar status
        datetime completed_at
        smallint actual_minutes
    }
    reminders {
        bigint id PK
        bigint user_id FK
        bigint task_id FK
        bigint subtask_id FK
        bigint study_session_id FK
        varchar message
        datetime trigger_at
        varchar anchor
        smallint offset_minutes
        varchar status
        datetime sent_at
    }
    notifications {
        char id PK
        varchar type
        varchar notifiable_type
        bigint notifiable_id
        bigint reminder_id FK,UK
        json data
        timestamp read_at
    }
    ai_conversations {
        bigint id PK
        bigint user_id FK
        timestamp created_at
        timestamp updated_at
    }
    ai_messages {
        bigint id PK
        bigint conversation_id FK
        varchar role
        longtext content
        json tool_calls
        varchar tool_call_id
        timestamp created_at
    }
    ai_conversation_turns {
        bigint id PK
        bigint conversation_id FK
        char request_id
        char input_hash
        char lease_token
        datetime lease_expires_at
        json result
    }
    ai_pending_actions {
        char id PK
        bigint conversation_id FK
        bigint turn_id FK,UK
        varchar call_id
        varchar type
        json arguments
        json preview
        char target_hash
        varchar status
        datetime expires_at
        json receipt
        datetime resolved_at
        longtext protected_payload
    }
    sessions {
        varchar id PK
        bigint user_id
        longtext payload
        int last_activity
    }
    password_reset_tokens {
        varchar email PK
        varchar token
        timestamp created_at
    }
    personal_access_tokens {
        bigint id PK
        varchar tokenable_type
        bigint tokenable_id
        varchar token UK
        timestamp expires_at
    }
    cache {
        varchar key PK
        mediumtext value
        bigint expiration
    }
    cache_locks {
        varchar key PK
        varchar owner
        bigint expiration
    }
    jobs {
        bigint id PK
        varchar queue
        longtext payload
        smallint attempts
    }
    job_batches {
        varchar id PK
        varchar name
        int total_jobs
        int pending_jobs
        int failed_jobs
    }
    failed_jobs {
        bigint id PK
        varchar uuid UK
        varchar connection
        longtext exception
    }
    migrations {
        int id PK
        varchar migration
        int batch
    }
    users ||--o| planning_preferences : "user_id є PK та FK"
    users ||..o{ study_availability_windows : "user_id"
    users ||..o{ education_institutions : "user_id"
    users ||..o{ academic_periods : "user_id"
    users ||..o{ subjects : "user_id"
    users ||..o{ teachers : "user_id"
    users ||..o{ schedule_import_batches : "user_id"
    users ||..o{ lessons : "user_id"
    users ||..o{ tasks : "user_id"
    users ||..o{ study_sessions : "user_id"
    users ||..o{ reminders : "user_id"
    users ||..o{ ai_conversations : "user_id"
    education_institutions |o..o{ academic_periods : "education_institution_id nullable"
    education_institutions |o..o{ subjects : "education_institution_id nullable"
    education_institutions |o..o{ teachers : "education_institution_id nullable"
    academic_periods ||..o{ schedule_import_batches : "academic_period_id"
    academic_periods |o..o{ lessons : "academic_period_id nullable"
    subjects ||..o{ lessons : "subject_id"
    subjects |o..o{ tasks : "subject_id nullable"
    teachers |o..o{ lessons : "teacher_id nullable"
    schedule_import_batches ||..o{ schedule_import_rows : "schedule_import_batch_id"
    schedule_import_batches |o..o{ lessons : "schedule_import_batch_id nullable"
    lessons |o..o| lessons : "replaces_lesson_id nullable UNIQUE"
    tasks ||..o{ subtasks : "task_id"
    tasks ||..o{ study_sessions : "task_id"
    subtasks |o..o{ study_sessions : "subtask_id nullable"
    study_sessions |o..o| study_sessions : "rescheduled_from_session_id nullable UNIQUE"
    tasks |o..o{ reminders : "task_id nullable"
    subtasks |o..o{ reminders : "subtask_id nullable"
    study_sessions |o..o{ reminders : "study_session_id nullable"
    reminders |o..o| notifications : "reminder_id nullable UNIQUE"
    users ||..o{ notifications : "notifiable: логічний morph без FK до users"
    users |o..o{ sessions : "логічний user_id без FK"
    ai_conversations ||..o{ ai_messages : "conversation_id"
    ai_conversations ||..o{ ai_conversation_turns : "conversation_id"
    ai_conversations ||..o{ ai_pending_actions : "conversation_id"
    ai_conversation_turns ||..o| ai_pending_actions : "turn_id UNIQUE"
```

## Автентифікація

Cookie/CSRF та database session driver, як у перевіреному Stage 8.

[Редаговане джерело](authentication.mmd)

```mermaid
sequenceDiagram
    actor student as Студент
    participant spa as Vue SPA
    participant api as Laravel API: AuthController, ProfileController, Sanctum
    participant db as MySQL
    student->>spa: Ввести дані входу або реєстрації
    spa->>api: GET /sanctum/csrf-cookie
    api->>db: Збереження сеансу з database driver
    api-->>spa: 204, XSRF і HttpOnly session cookie
    alt Реєстрація
        spa->>api: POST /api/auth/register із X-XSRF-TOKEN
        api->>db: User::create, password hash, timezone
        api->>db: login та regenerate session
        api-->>spa: 201 UserResource
    else Вхід наявного користувача
        spa->>api: POST /api/auth/login із X-XSRF-TOKEN
        api->>db: Перевірити credentials, regenerate session
        api-->>spa: 200 UserResource або 422 validation
    end
    spa->>api: GET /api/profile із cookie
    api->>db: Автентифікований користувач
    api-->>spa: 200, профіль і timezone
    student->>spa: Оновити сторінку
    spa->>api: GET /api/profile, відновлення Pinia auth
    api-->>spa: 200 для чинного сеансу
    student->>spa: Вийти
    spa->>api: POST /api/auth/logout із CSRF
    api->>db: Інвалідувати сеанс
    api-->>spa: 204
    spa->>api: GET /api/profile
    api-->>spa: 401, захищена навігація веде на login
```

## Імпорт XLSX

Збережений preview, довідники, revalidate, актуальний commit та 409.

[Редаговане джерело](xlsx-import.mmd)

```mermaid
sequenceDiagram
    actor student as Студент
    participant spa as Vue Import UI
    participant api as Laravel API
    participant preview as ScheduleImportPreviewService
    participant parser as Parser і materializer
    participant commit as ScheduleImportCommitService
    participant db as MySQL
    student->>spa: Обрати AcademicPeriod та підтриманий XLSX
    spa->>api: POST /api/schedule-imports, multipart schedule_file
    api->>api: Form Request, автентифікація, власний період
    api->>preview: create для власника
    preview->>parser: parse, матеріалізація дат, прив'язування довідників
    preview->>db: Зберегти Batch та occurrence rows
    preview-->>api: Збережений preview без створення Lessons
    api-->>spa: 201 ScheduleImportBatchResource з data.rows
    spa->>api: GET /api/schedule-imports/{scheduleImportBatch}
    api-->>spa: Незалежне читання збережених рядків
    opt Є відсутні або неоднозначні довідники
        student->>spa: Виправити власні Subjects і Teachers
        spa->>api: Окремі Academic Context REST-запити
        api->>db: Зберегти дозволені довідники
        spa->>api: POST /api/schedule-imports/{scheduleImportBatch}/revalidate
        api->>db: Оновити concrete preview та лічильники
        api-->>spa: 200, оновлені операції рядків
    end
    student->>spa: Переглянути наслідки й підтвердити
    spa->>api: POST /api/schedule-imports/{scheduleImportBatch}/commit
    api->>commit: commit
    commit->>db: BEGIN, блокування власника, Batch і rows
    commit->>commit: Повторно звірити матеріальний preview
    alt Preview змінився
        commit->>db: COMMIT оновленого preview, без змін Lessons
        commit-->>spa: 409, потрібен новий огляд
    else Preview узгоджений
        commit->>db: create/update/restore або preserve/noop, status committed
        commit->>db: COMMIT єдиного пакета
        commit-->>spa: 200, committed Batch
    end
    spa->>api: GET Batch, Lesson details та effective schedule
    api->>db: Прочитати фактичні результати
    api-->>spa: Ідентифікатори й збережений стан
```

## Автоматичне планування

Preview без нових Sessions, token, повторна перевірка й транзакційний confirm.

[Редаговане джерело](study-planning.mmd)

```mermaid
sequenceDiagram
    actor student as Студент
    participant spa as Vue PlanningReview
    participant api as Laravel API
    participant persistence as StudyPlanPersistenceService
    participant planner as StudyPlanningService
    participant rules as Selection, Context, Allocation, Constraints
    participant db as MySQL
    student->>spa: Обрати локальні дати та роботу
    spa->>api: POST /api/planning/study-plans/preview
    api->>persistence: preview для автентифікованого власника
    persistence->>planner: plan
    planner->>rules: Відібрати роботу і розрахувати допустимі інтервали
    rules->>db: Читання власних даних і timezone
    rules-->>planner: Sessions, залишок, причини й попередження
    planner-->>persistence: Детермінований план без записів
    persistence-->>spa: 200, план, захищений token і expires_at
    student->>spa: Оглянути результат і явно прийняти частковий план за потреби
    spa->>api: POST /api/planning/study-plans/confirm, preview_token, accept_partial
    api->>persistence: confirm
    persistence->>persistence: Перевірити token і згоду
    persistence->>db: BEGIN, lockForUpdate власника
    persistence->>planner: Повторити розрахунок у поточному стані
    planner->>rules: Перевірки й фактичні джерела
    rules->>db: Актуальні дані після блокування
    planner-->>persistence: Поточний матеріальний план
    alt План змінився або початок уже недопустимий
        persistence->>db: ROLLBACK
        persistence-->>spa: 409, новий preview
    else План узгоджений і прийнятий
        persistence->>rules: Перевірити весь пакет сесій
        persistence->>db: INSERT StudySessions, COMMIT
        persistence-->>spa: 201, фактичні ID і allocations
    end
    spa->>api: GET /api/study-sessions та detail за ID
    api->>db: Незалежне читання збереженого стану
    api-->>spa: 200, реальні StudySessions
```

## AI Tool та явне підтвердження

Схема реалізованого протоколу; реальний paid-provider у Stage 8 не викликався.

[Редаговане джерело](ai-confirmation.mmd)

```mermaid
sequenceDiagram
    actor student as Студент
    participant spa as Vue AI UI
    participant conversation as AiConversationService
    participant agent as AgentOrchestrator
    participant provider as OpenAiResponsesProvider
    participant tools as Серверні registry та адаптери
    participant domain as Детерміновані Services
    participant confirm as TaskActionConfirmationService
    participant db as MySQL
    student->>spa: Повідомлення з наміром
    spa->>conversation: POST /api/ai/conversations/{conversation}/messages, Idempotency-Key
    conversation->>db: Коротка транзакція claim ходу або читання готового result
    alt Готовий результат того самого ключа
        db-->>conversation: Збережений публічний результат
        conversation-->>spa: 200 без нового provider-виклику
    else Новий або дозволений повтор незавершеного ходу
        conversation->>agent: run з власником, історією та lease checkpoint
        loop У межах серверного ліміту раундів
            agent->>provider: Responses-запит поза DB-транзакцією
            provider-->>agent: Перевірені text та function calls
            agent->>tools: Перевірити allowlist, call ID та arguments
            tools->>domain: Прочитати дані або підготувати одну пропозицію
            domain-->>tools: Детермінований результат без виконання запропонованої зміни
            tools-->>agent: Tool result для наступного раунду
        end
        agent-->>conversation: Публічна відповідь і можлива proposal
        conversation->>db: Атомарно зберегти messages, turn result, pending action
        conversation-->>spa: 200, summaries та confirmation_required
    end
    student->>spa: Оглянути дію й явно підтвердити
    spa->>confirm: POST /api/ai/conversations/{conversation}/actions/{action}/confirm
    confirm->>db: BEGIN, перевірка власності, блокування й стан дії
    alt Дія вже executed
        db-->>confirm: Збережений receipt
        confirm-->>spa: 200, replayed=true без повторної зміни
    else Чинна pending-дія
        confirm->>domain: Виконати збережену дію з актуальними перевірками та згодами
        domain->>db: Доменні записи в тій самій транзакції
        confirm->>db: Receipt, executed, подія історії, COMMIT
        confirm-->>spa: 200, підтверджений результат
    end
    spa->>conversation: GET /api/ai/conversations/{conversation}/messages
    conversation-->>spa: Збережена історія без приватного provider state
    spa->>confirm: GET /api/ai/conversations/{conversation}/actions/{action}
    confirm-->>spa: Збережений статус та receipt
    spa->>domain: Незалежні доменні GET через відповідні Controllers
    domain-->>spa: Фактичні доменні записи
```

## Доставка нагадувань

Схема існуючого коду; dispatcher/Notification delivery у Stage 8 live НЕ ЗАПУСКАЛИСЬ.

[Редаговане джерело](reminder-delivery.mmd)

```mermaid
sequenceDiagram
    participant scheduler as Laravel scheduler
    participant command as reminders:dispatch-due
    participant delivery as ReminderDeliveryService
    participant db as MySQL
    actor student as Студент
    participant spa as Vue Inbox
    participant inbox as NotificationInboxService
    scheduler->>command: Щохвилини, --limit=100
    command->>delivery: dispatchDue
    delivery->>db: Вибрати bounded scheduled із trigger_at не пізніше now
    loop Для кожного кандидата
        delivery->>db: BEGIN, User, цілі та Reminder під блокуваннями
        delivery->>delivery: Повторно перевірити due, targets, anchor та відсутність receipt
        alt Ціль більше не придатна
            delivery->>db: status=cancelled, COMMIT
        else Чинне нагадування
            delivery->>db: INSERT notifications з унікальним reminder_id
            delivery->>db: Reminder status=sent, sent_at, потім COMMIT
        end
    end
    command-->>scheduler: Лічильники selected/sent/cancelled/skipped/failed
    student->>spa: Відкрити Inbox
    spa->>inbox: GET /api/notifications через автентифікований Controller
    inbox->>db: Власна пагінована вибірка
    inbox-->>spa: 200, Notification Resources
    student->>spa: Позначити прочитаним
    spa->>inbox: POST /api/notifications/{notification}/read
    inbox->>db: Транзакція, власність, read_at лише якщо null
    inbox-->>spa: 200, збережений read_at
    spa->>inbox: Повторне POST read
    inbox-->>spa: 200, той самий read_at
```

## Перевірка й використання

Синтаксис і фактичний SVG-рендер перевіряються локальним Mermaid 11.17.2 у Chromium, окремо від застосунку. Результати та спосіб відтворення наведені у [verification.md](../verification.md). Тимчасові parser/browser залежності встановлено поза репозиторієм; package.json і lockfile застосунку не змінені.

Для слайдів експортувати потрібний фрагмент у SVG/PNG з Mermaid-сумісного редактора або локального рендерера. Повна ER придатна для технічного додатка; на слайді показати читабельну предметну підмножину. Діаграми не створювалися у Figma, не потребують його доступу та не доводять Figma-паритет.
