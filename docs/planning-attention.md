# Глобальний індикатор стану плану

Backend контракт і повна інструкція: `Student-AI-Planner-Backend/docs/planning-attention.md`.

AppLayout містить компактний PlanningAttentionIndicator поруч із bell. API
`GET /api/planning/attention-status` читається тільки через api/planningAttention.ts;
Pinia planningAttention зберігає стан та керує одним poller. Немає бізнес-розрахунків
free time, workload або feasibility у Vue. Inbox/reminders не змінено.

Стани індикатора:

- clear — додаткового елемента немає;
- attention — актуальний replan/decision_required/warning, український aria-label;
- information — нейтральний create_plan або потреба оновити expired review;
- checking — pending/running/not_checked; попередні counts не показуються як актуальні;
- error — «Не вдалося перевірити актуальність плану».

Клік веде на `/planning/suggestions`; expired review відкриває `?status=all`,
звідки можна переглянути запис та натиснути «Новий огляд». Категорії не показуються
сирими кодами. Використано Manrope, чинні theme tokens, aria-label/title,
focus-visible та 36px icon link без розтягування мобільного хедера.

Після authenticated layout mount/login — один GET; після visibility return — GET;
у видимій вкладці — раз на 60 секунд. api/client повідомляє про успішні релевантні
mutations через planningMutation listeners. Store негайно ховає старий результат,
об’єднує сигнали за 300ms і робить максимум три швидкі follow-up GET через 2s,
коли аналіз ще pending. Потім лишається 60s interval. Preview/GET/невдалі responses
та звичайний inbox не сигналізують про зміну плану. POST не повторюється.

Route navigation не монтує нові pollers. Logout/account change скидають дані,
abort-ять поточний запит; version/owner fence відкидає старі відповіді навіть
при проігнорованому abort. Layout unmount і Pinia dispose прибирають timer/listener.
Старий окремий 60s full recovery feed timer у PlanningView прибрано.
RecoverySuggestions підтримує перехід в історію та пояснення незавершеної перевірки.

Backend потребує чинної migration `2026_11_13_000002_add_recovery_check_delivery_state`,
worker `php artisan queue:work database --queue=default --sleep=1 --tries=3 --timeout=60`
та резервного `php artisan schedule:work`. Вони запускаються з каталогу Backend,
в окремих терміналах. На перевіреній local машині обидва процеси були наявні;
один owner-only контрольний job фактично пройшов через worker без зміни business
records. Сам Frontend не запускає worker або detector.

Для поточного DEMO G використовуйте task 69 та **чинну сесію 57**, не вже перенесену
49: 2026-11-15 16:15–17:15 Kyiv. Як явну ручну дію тимчасово змініть неділю з
08:00–22:00 на 08:00–16:00. Перевірте checking → problem в хедері іншої сторінки,
перейдіть до пропозиції. Не підтверджуйте перенесення для цього тесту. Поверніть
неділю до 22:00: саме проблема G має зникнути після аналізу, source 57 лишається
planned у тому самому інтервалі. Інші tasks можуть залишити власні рекомендації.
Виконуйте до початку сесії; фактичний стан перевіряйте в UI. Тут availability і
DEMO-сесії не змінювалися, браузерний сценарій не виконувався.

Змінені файли: AppLayout, PlanningAttentionIndicator, planningAttention API/store,
planningMutation utility, api/client, PlanningView, RecoverySuggestionsView,
styles/planning.css, planning-attention.test.ts, f2Backend mock. У page-content
узгоджено старе очікування тексту з вже реалізованим «Неперенесено».

Перевірки: цільові component/store/API integration tests; npm run type-check та
npm run build. Повний suite зберігає 53 старі failing tests із того самого baseline;
нових failing names немає. Тести не видалялися/не послаблювалися. Точні поточні
лічильники та Backend перевірки записані в Backend звіті planning-attention.md.
