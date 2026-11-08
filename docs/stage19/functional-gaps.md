# Stage 19A-FE — системні прогалини й обмеження доказів

Baseline Frontend: `a3bfbde90f9d1a5d1e30a80155153f824f03b068`. Backend audit/public main: `842a0bc23caa32bce34787145e1fbf77ffe5f41f`; його application baseline `1912ff45be03d5eed3dfeabe5fa6a1a2f13958a4` не змінено audit-комітом. Джерела: [системна матриця](requirements-matrix.md), [Backend gaps](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/842a0bc23caa32bce34787145e1fbf77ffe5f41f/docs/stage19/backend-functional-gaps.md), [Backend audit result](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/842a0bc23caa32bce34787145e1fbf77ffe5f41f/docs/stage19/backend-stage19a-result.md).

G19/V19 IDs збережено для узгодження з Backend; це один системний реєстр, а не дублікати одного дефекту по репозиторіях. P0 — security/data-integrity blocker; P1 — однозначно відсутня обов’язкова поведінка; P2 — integration/quality/verification/hardening; P3 — optional або залежне від продуктового рішення. Підтверджених P0 та безумовно прийнятих P1 feature omissions не знайдено. Це обмежений аудит, не гарантія відсутності всіх дефектів.

Часткові R28/R32 **не оголошуються закритими**: буквальні частини stories лишаються без реалізації до явного scope decision. Немає підтвердженого нового Frontend–Backend breaking API mismatch у перевірених handlers/contracts. Є відтворюваний дефект E2E synchronization V19-08; це тестовий дефект, а не доведена несправність password recovery API.

## Підтверджені відсутні можливості та scope decisions

### G19-01 — пояснення конфліктних пар робіт

- **Вимога / repository / priority:** R28; обидва; P2, семантика потребує рішення.
- **Є:** Stage 17 показує серверний rank, per-work reasons/recommendations, allocation alerts та окремі measured persisted overload periods. Frontend їх не підсумовує й не пересортовує.
- **Немає:** контракту з конкретними двома Tasks/їхніми reservations та поясненням взаємного конфлікту. Task не має власного scheduled interval; його мають StudySessions. Greedy shortfall не доводить глобальну неможливість.
- **Evidence:** Backend `WorkloadAdviceService::analyze/recommendations/persistedViolations`, `WorkloadAdviceResource`, `PlanningConstraintService`; Frontend [WorkloadAdviceView](../../src/views/WorkloadAdviceView.vue), [WorkloadAdvice type](../../src/types/planning.ts), [workload utilities](../../src/utils/workload.ts). [Stage 17 report](../stage17/frontend-result.md).
- **Найменший підхід / reuse:** спершу погодити, чи достатньо capacity/constraint warnings. Якщо потрібні pairs — додати bounded read-only explanation у чинний advice endpoint з того самого owner-scoped context/interval rules; відобразити в наявній сторінці. Не створювати optimizer чи priority algorithm.
- **Dependencies:** точне визначення competing reservations, status/Task attribution, caps та provenance; узгоджений additive API/type shape. Backend — перший, Frontend — окреме завдання після контракту.
- **Acceptance:** або явне прийняття наявної семантики в requirements, або deterministic owned pair evidence, що не змішується з aggregate capacity/excess; без writes і неправдивих impossibility claims.
- **Tests:** Backend overlap/adjacency/один Task з кількома сесіями/foreign history/capacity без pair/limits/unchanged-table snapshots; Frontend exact shape/source labels, empty/unknown cases, no double totals, keyboard/mobile. Reuse [workload.test.ts](../../tests/workload.test.ts), [planning E2E](../../e2e/planning.spec.ts).

### G19-02 — буквальне видалення нагадувань

- **Вимога / repository / priority:** R32; обидва; P3 до retention/scope decision.
- **Є:** `POST /reminders/{id}/cancel`, scheduled→cancelled, збереження Reminder та Inbox history. UI правильно каже «Скасувати нагадування», а не обіцяє permanent delete.
- **Немає:** Reminder DELETE Service/endpoint/AI Tool та відповідної UI дії. Це підтверджена відсутність, але вимога саме hard purge не погоджена.
- **Evidence:** [remindersApi](../../src/api/reminders.ts), [ReminderDetailView](../../src/views/ReminderDetailView.vue); Backend `ReminderService::cancel`, `ReminderMutationService::cancel`, routes/API та management registry.
- **Підхід / reuse:** погодити cancellation як функціональне «видалення активного нагадування» або визначити вузький removal contract зі statuses/history retention. У другому випадку reuse поточні owner-serialized mutation Services та ConfirmDialog; не змінювати значення чинного cancel і не стирати immutable AI receipts.
- **Dependencies:** retention, FK/inbox policy, concurrent delivery/removal, eligibility для sent/cancelled, authorization. Не достатньо перейменувати кнопку.
- **Acceptance:** явне продуктове рішення; точні labels. Якщо removal прийнято — owned single-target delete з незруйнованою читабельністю минулих receipts/notifications.
- **Tests:** Backend foreign/missing IDs, race із delivery, rollback, history, інші домени незмінні; Frontend confirm/error/unknown outcome та cancellation regression. Reuse [activity tests](../../tests/activity.test.ts), [activity E2E](../../e2e/activity.spec.ts).

### G19-03 — автономний trigger перенесення

- **Вимога / repository / priority:** R48; ширше тлумачення R10/R24; обидва; P3, optional pending decision.
- **Є:** Task missed status, deterministic remaining effort, user-requested recovery, AI create-plan для unallocated work, adaptive replanning future sources. Усе persistent planning потребує explicit confirmation.
- **Немає:** scheduler/event trigger, opt-in policy та autonomous background execution для перенесення без user request. Scheduler реєструє лише reminders dispatch; Task miss нічого не планує.
- **Evidence:** Backend `routes/console.php`, `TaskService::miss`, `StudyRecoveryPreviewService`, `RemainingEffortService`; Frontend [PlanPreviewView](../../src/views/PlanPreviewView.vue), [StudySessionsView](../../src/views/StudySessionsView.vue), [TaskCard](../../src/components/domain/TaskCard.vue). [Stages 14](../stage14/frontend-result.md)/[16](../stage16/frontend-result.md).
- **Підхід / reuse:** тільки якщо продукт явно приймає автономність — визначити opt-in/revocation/clock/partial policy, compose існуючі deterministic Services, ідемпотентний trigger та видимий history outcome. Немає підстав для другого планувальника або LLM execution bypass.
- **Dependencies:** окрема згода на unattended writes, bounded horizon, races/deadlines/timezone, no-capacity policy, durable identity/receipts.
- **Acceptance:** або збережений документований interactive scope, або за окремим контрактом predictable opt-in at-most-once execution з незмінною missed/completed history.
- **Tests:** duplicate/concurrent/revoked triggers, owner isolation, stale context, no capacity, rollback і unaffected domains; UI consent/status/history. Це не поточний implementation task.

### G19-04 — optional development bundle

- **Вимога / repository / priority:** R47; обидва й operations; P3, system applicability `NOT APPLICABLE` для mandatory acceptance.
- **Є:** manual XLSX workflow, in-app reports, Frontend build/Vitest/Playwright та Backend offline MySQL CI.
- **Немає:** team planning/access model, external calendar integration/export, AI XLSX import Tool, arbitrary file export, automated container→staging→production promotion у перевірених workflows.
- **Evidence:** source S3; Backend routes/registries; Frontend [CI](../../.github/workflows/ci.yml), [scheduleImportsApi](../../src/api/scheduleImports.ts), report views. Ні S1, ні S2 прямо не вимагають PDF/XLSX report download.
- **Підхід / reuse:** обрати одну інтеграцію окремо, reuse existing schedule/import/report Services та UI. Це не пакет «усе відсутнє треба зробити».
- **Dependencies:** погоджені формат/provider, ownership/participants/revocation, credentials/deployment separation.
- **Acceptance/tests:** лише для прийнятого scope — owned bounded export/timezone, safe import review/stale commit, membership isolation або deployment smoke/recovery. Відсутні optional модулі не мають позитивних current tests.

### G19-05 — AI catalog name discovery

- **Вимога / repository / priority:** R21, usability R07/R20; переважно Backend, FE acceptance; P2 limitation, core Lesson actions IMPLEMENTED.
- **Є:** ручні owned academic selectors і CRUD; Lesson AI actions працюють з точними IDs, отриманими з відомих даних чи явного вводу/уточнення.
- **Немає:** bounded AI lookup Tools для Subject/Teacher/AcademicPeriod names, які ще не трапилися в reads. Не можна вважати неповний перший page чи вигаданий ID правильним target.
- **Evidence:** Backend `AgentOrchestrator::instructions`, `LessonActionRegistry`; Frontend [useLessonCatalog](../../src/composables/useLessonCatalog.ts), [AcademicView](../../src/views/AcademicView.vue), [AiLessonReview](../../src/components/ai/AiLessonReview.vue), [AI user guide](../../public/help/guide/ai-assistant.md).
- **Підхід / reuse:** якщо natural-name creation прийнято як додатковий scope — owner-scoped read adapter навколо academic Services з exact-match/ambiguity/pagination semantics; proposals лишаються exact-ID. FE reuse timeline labels/clarification, без нової mutation engine.
- **Dependencies:** пошук/неоднозначність/caps, same-owner associations; approval нового read Tool contract.
- **Acceptance/tests:** owned candidates only, empty/ambiguous responses, foreign isolation, lookup→proposal fake-provider sequence, не вигадувати associations; FE labels/safe text/clarification й чинні Lesson confirmation regressions.

### G19-06 — відсутній application login/register rate limiter

- **Вимога / repository / priority:** R41/R42/R45 hardening; Backend, FE regression; P2, перед production. Це не доведений takeover і не окрема явно сформульована story.
- **Є:** Sanctum session/CSRF, credential validation, rotation, owner checks; password та AI message named throttles. FE generic 429/Retry-After feedback уже є.
- **Немає:** login/register route middleware/global/per-credential attempt limiter у перевірених routes, AuthController, Requests та AppServiceProvider. Gateway policy не перевірено.
- **Evidence:** pinned Backend `routes/api.php`, `AuthController`, `LoginRequest`, `RegisterRequest`, `AppServiceProvider`; [Frontend client](../../src/api/client.ts), [ErrorState](../../src/components/ui/ErrorState.vue), [LoginView](../../src/views/LoginView.vue), [RegisterView](../../src/views/RegisterView.vue).
- **Підхід / reuse:** існуючий Laravel rate-limiting middleware зі shared-cache identity/IP budgets; тонкі Controllers, uniform credential errors, без нового auth framework. FE reuse notice, без автоматичних retries.
- **Dependencies:** бюджети/вікна, trusted proxy/IP і shared cache; уникати enumeration/permanent lockout. Верифікований gateway-only policy можливий лише як явно прийнята й перевірена deployment dependency.
- **Acceptance:** safe 429 + retry metadata для повторів; нормальний login/register/CSRF/session/recovery працюють; unrelated identities не блокуються довільно.
- **Tests:** Backend repeated invalid/unknown/existing attempts, cache-window reset, keys, registration bounds, successful rotation, multiple-worker behavior; FE mocked 429/Retry-After та збереження form/no retry. Окремий погоджений Backend hardening task; цей аудит нічого не виправляє.

## Операційна й тестова верифікація — окремо від відсутніх features

### V19-01 — поточна доставка нагадувань

- **Вимога / repository / priority:** R33; обидва/operations; P2 verification.
- **Є/evidence:** Backend real-MySQL delivery/concurrency tests; FE Inbox/read UI; [Stage 15 archive](../stage15/frontend-live-acceptance.md) REM-01/02 підтвердив справжні scheduler ticks, sent, рівно одну Inbox notification та незмінний read_at після наступного tick.
- **Не підтверджено:** те саме для актуальних audited SHAs/deployed schema. Stage 19A-BE сам не спостерігав live delivery; це не заперечує старого архівного результату.
- **Підхід/reuse/dependencies:** новий явно дозволений disposable runtime/account/grant, наявний scheduler і guarded [stage15.live.spec.ts](../../e2e/stage15.live.spec.ts); не запускати другий dispatcher проти retained reminders. Reminder database delivery не потребує queue worker.
- **Acceptance/tests:** одна future-due reminder→real tick→sent→одна notification→read; другий tick без duplicate; current HTTP/runtime identity. Жодних зовнішніх push/email обіцянок.

### V19-02 — актуальні password/session/mail operations

- **Вимога / repository / priority:** R43/R44; обидва/operations; P2 verification.
- **Є/evidence:** Backend PasswordManagement tests; FE форми/URL cleanup і mocks; Stage 15 archive MAIL-01/02 підтвердив database job→справжній Mailpit лист→reset→old/new login. Той результат не містить current Backend Git SHA; reset не доводить current-password change/other-session revocation.
- **Не підтверджено:** current queue/mail/trusted HTTPS link/session revocation, зовнішній SMTP acceptance. 202 і simulated email link не є доставкою.
- **Підхід/reuse/dependencies:** дозволений ізольований mailbox/queue/runtime, наявний worker, guarded system suite, дві disposable sessions. Не читати чужі листи й не виводити reset URLs/tokens.
- **Acceptance/tests:** actual delivery, one-use/expired/reused tokens, очищений URL, old/new login, current-session preservation для change, other-session revocation, safe 419/429/uncertain outcomes. V19-08 окремо блокує поточний mock browser gate.

### V19-03 — реальна природна мова

- **Вимога / repository / priority:** R17–R25/R30/R40; обидва/provider operations; P2 verification.
- **Є/evidence:** 31 schemas/validators, deterministic Services, native OpenAI/Gemini fakes і FE scripted responses. Вони доводять protocol/guards, а не коректність довільного language intent.
- **Не підтверджено:** real Ukrainian intent selection, ambiguity/clarification, grounded multi-round explanations і narrative report quality. Operator-reported старий Gemini success не є незалежною corpus evaluation.
- **Підхід/reuse/dependencies:** окремо погоджений короткий corpus та бюджет/provider/runtime; чинні [AI live config](../../playwright.ai-live.config.ts), guards, registry і confirmation flow. Цей аудит не авторизує витрати.
- **Acceptance/tests:** ground facts у reads, не вигадувати IDs, правильний Tool/arguments, clarification для ambiguity, no unconfirmed writes, receipt-based wording. Результати model quality окремо від deterministic system correctness.

### V19-04 — поточна реальна Frontend–Backend композиція

- **Вимога / repository / priority:** усі користувацькі групи, особливо R21/R22/R35/R37/R38; обидва; P2 verification.
- **Є:** незалежний FE code/API/types/tests audit у цьому milestone **закрив Backend handoff-потребу перевірити наявність UI**; 640 Vitest, domain mocked E2E, відповідні Backend Services/contracts.
- **Не підтверджено:** actual HTTP pair для нових Lesson/availability AI message→confirm→receipt→domain GET та workload-advice; latest deployed integration не випливає з окремих passing suites.
- **Evidence/reuse:** [AiActionReview](../../src/components/ai/AiActionReview.vue), [useAiConversation](../../src/composables/useAiConversation.ts), [refreshAiDomains](../../src/api/aiRefresh.ts), [Stage 11 live plan](../stage11/live-acceptance.md). Цей план — prerequisites, не вже виконаний тест.
- **Підхід/dependencies:** новий disposable Laravel/MySQL/Frontend instance з перевіреною identity/migrations; no-outbound scripted provider seam лише в testing runtime; existing endpoints/Services/CSRF, без browser route mocks для application API. Не підміняти pending rows напряму.
- **Acceptance/tests:** read/propose не пишуть; explicit {} або planning-only consent; reject/stale/expired не застосовуються; executed/replayed receipts, response-loss GET recovery, failed refresh не стирає receipt, current availability і plan reads без auto-replanning. Real-model quality лишається V19-03.

### V19-05 — Backend CI diagnostics і неповний явний Gemini action matrix

- **Вимога / repository / priority:** AI domains та якість доказів; Backend; P2 verification/CI.
- **Є/evidence:** baseline hosted full MySQL suite 6214 tests/60976 assertions, 1 deprecation/320 notices; named Gemini action step 250/3456. [Backend result](https://github.com/BashukOleksii/Student-AI-Planner-Backend/blob/842a0bc23caa32bce34787145e1fbf77ffe5f41f/docs/stage19/backend-stage19a-result.md) і pinned workflow. У явному Gemini step відсутній `AiAvailabilityActionsTest`; ширший local Stage 18B matrix — історичний доказ, не hosted coverage.
- **Не підтверджено:** детальні причини notices/deprecation; новий hosted Gemini availability action step. Відсутність case не є failed application behavior.
- **Підхід/reuse/dependencies:** пізніше додати наявний test class до чинного offline Gemini command, показати diagnostics у positively guarded disposable MySQL CI. Assertions/guards не прибирати; новий framework/paid provider не потрібні.
- **Acceptance/tests:** current full suite плюс повний native-fixture action matrix, діагностовані warning causes, без false diagnostics-free PASS. Backend task, Frontend поведінку змінювати не потрібно.

### V19-06 — deployment/runtime identity та configuration

- **Вимога / repository / priority:** усі integration flows, R10/R22/R43/R44/R45 особливо; обидва/operations; P2 verification.
- **Є:** source/CI forward migrations, cookie/CSRF/config rules, finite sessions, module-level URL handling. Stage 15 runtime identities є історичними.
- **Не перевірено:** current retained schema migration state, origin/CORS/cookie flags/HTTPS, reset-link access logging, gateway throttles, active scheduler/worker. Цей аудит не читав `.env`, credentials/grants або SQL.
- **Evidence:** pinned BE migrations/config and `GeminiGenerateContentProvider`: код відмовляє default `gemini-2.5-flash` on/after `2026-12-01T00:00:00Z`. Це факт локального guard, не зовнішня заява про провайдерну підтримку.
- **Підхід/reuse/dependencies:** операторські current identity/config attestations для дозволеного deployment; forward-only migrations не відкатувати/не тестувати на retained data; explicit supported model configuration до code cutoff.
- **Acceptance/tests:** HTTP process→approved disposable schema binding, applied migration set, trusted reset origin, CORS/CSRF/cookies, privacy-safe logs; ordinary auth/security/recovery flows. Жодного автоматичного provisioning у цьому milestone.

### V19-07 — focused AI missed-Task composition fixture

- **Вимога / repository / priority:** R24 (також R10); Backend, FE regression; P2 test coverage.
- **Є:** independently tested remaining-effort/recovery і AI create/adaptive flows; FE missed Task→scoped recovery journey. Current code приймає missed work через shared selection.
- **Немає:** окремого offline fake-provider missed-Task message→plan proposal→confirm→receipt regression, виявленого у поточному `AiPlanningActionsTest`. Це відсутність composition evidence, не відсутність recovery implementation.
- **Підхід/reuse/dependencies:** existing Backend native fake/provider/action infrastructure та `RemainingEffortService`; після fixture-contract вибрати, чи потрібна додаткова FE fixture композиція. Не додавати новий Tool лише заради тесту.
- **Acceptance/tests:** completed credit/reservations/remaining effort, scope, missed history untouched, explicit partial consent, stale/expiry/rollback, executed receipt/replay, subsequent session GET. No paid calls або autonomous writes.

### V19-08 — відтворюваний mobile password E2E navigation race

- **Вимога / repository / priority:** R44, quality gate; Frontend tests; P2 confirmed test defect, не application feature gap.
- **Є:** password UI/API runtime path, passing Vitest та isolated mobile scenario. Hosted baseline CI раніше success.
- **Підтверджений дефект:** [passwords.spec.ts](../../e2e/passwords.spec.ts): після click «Забули пароль?» тест одразу fill однойменного email control. Trace другого full run: fill `87655–87661 ms` на `/login`; `/forgot-password` snapshot лише `87698 ms`. Нове email field порожнє; forgot-password POST і CSRF request після submit відсутні. HTML validation не допускає submit, acknowledgement не з’являється.
- **Очікування / факт:** generic role=status acknowledgement; `Timeout: 5000ms`, `element(s) not found` at line 37. Два `npm run test:e2e -- --workers=2` — exit 1, щоразу 97 PASS / 1 FAIL. `npx playwright test e2e/passwords.spec.ts --project=mobile --workers=1` — exit 0, 1 PASS. Повторні запуски не виправили проблему.
- **Підхід / reuse:** у **наступному окремому завданні** дочекатися authoritative route/forgot heading та за потреби scope форму перед fill. Reuse чинні Playwright locator assertions; не збільшувати timeout, не skip, не послаблювати acknowledgement/CSRF/privacy assertions.
- **Dependencies:** жодного Backend, БД, LLM чи product decision; дозволений наступний test-only change. У цьому documentation-only milestone тести й застосунок не редагуються.
- **Acceptance/tests:** targeted mobile+desktop journey проходить, повний 98-case suite з concurrency проходить без retries; submit доходить до existing mock endpoint, token privacy/explicit login збережено. Попередні failed commands лишаються в evidence.
- **System conclusion:** повний локальний browser gate зараз FAIL; це конкретний blocker безумовного quality acceptance, а не доказ відсутності R44 або недоступності SMTP.

## Roadmap і один рекомендований наступний milestone

1. **Рекомендовано наступним: Stage 19C-0 — acceptance readiness, вузьке test-only закриття V19-08.** Окреме Frontend Codex завдання: синхронізувати navigation/password form у чинному тесті, зберегти всі assertions, прогнати targeted mobile/desktop та повний suite; application behavior не змінювати. Це підготовка acceptance evidence, не нова функціональна вимога і не початок Stage 19C у поточній сесії. Найменший незалежний confirmed blocker має точну причину й не потребує зовнішніх ресурсів.
2. **Stage 19B — лише якщо product decision підтвердить обов’язкову функціональну прогалину.** Спершу вирішити G19-01/G19-02. Для прийнятого pair explanation — окреме Backend additive read-contract завдання, потім Frontend rendering/tests; для прийнятого removal — окрема retention/Service/API робота, потім UI. Не запускати обидва bundles або автономність автоматично. G19-06 — окремий малий Backend security-hardening follow-up перед production; джерела не дозволяють приписати його як уже прийняту нову mandatory story. Рекомендацію Backend про пріоритет цього hardening збережено.
3. **Stage 19C-1 — актуальне ізольоване cross-application acceptance.** Після локального browser gate — почати з R22 exact availability lifecycle на справжньому HTTP без paid provider, далі Lesson/recovery/auth/import/tasks/reminders/statistics/authorization. Кожний write лише в новій позитивно перевіреній disposable instance із дозволом. Створити current SHA-pinned ledger; reuse existing guarded suites, не старі grants.
4. **Окрема language evaluation V19-03 і optional G19-03/04/05.** Лише за окремим бюджетом/scope; не є приводом робити непідтверджені mutations чи додавати unrelated features зараз.

Повний final system acceptance не оголошується. Інвентаризацію й traceability завершено; conditional verdict зберігає partial requirements, current test failure та неперевірені operational capabilities як різні речі.
