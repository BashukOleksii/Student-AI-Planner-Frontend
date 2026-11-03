# Docsify user documentation milestone

Дата: 2026-11-03. Незалежне завдання документації; призупинена Stage 11 Frontend AI Lesson integration не виконувалася.

## Межі й джерела

Початковий Frontend HEAD: `d6e03fe79fbe139d5f96949514945cd410e26364`. Початкове робоче дерево було чистим. Кінцевий HEAD лишається тим самим: зміни цього milestone підготовлено в робочому дереві без створення commit. Це не deployment.

Перевірено `AGENTS.md`, поточні router/navigation/layouts, views, domain/AI/planning/reminder components, API, types, tests/fixtures, стилі, Vite/package configuration, `docs/defense/functional-overview.md` і матриці Stage 10. Backend не змінювався, база й платний AI не викликалися. Існуючі defense/Stage 9/10 звіти не переписувалися.

`docs.zip` у доступному середовищі не знайдено; запитано шлях до нього. Архів не вважається переглянутим. Структура, обкладинка, зміст, пошук, власні стилі й медіа реалізовані за описом прикладу в завданні, без його доменного вмісту чи ресурсів. Порівняння з фактичним архівом лишається обмеженням, якщо він буде наданий окремо.

## Результат

`public/help/` містить 18 змістових сторінок: головну та 17 тем у `guide/`. Додатково є `_sidebar.md`, `_coverpage.md`, `_404.md`, `index.html`, `config.js`, `controls.js`, `styles/main.css`, 12 PNG у `_media/`. `vendor/` генерується з npm-пакетів і не комітиться.

Теми: перші кроки; автентифікація; огляд; академічні довідники; розклад; Excel; завдання/підзавдання; доступність/вільні слоти; план/перепланування; сесії; нагадування; Inbox; статистика; AI; профіль; усунення проблем; FAQ. Усі українською, з обмеженнями й підтриманими способами відновлення.

Навігація має звичайне посилання «Допомога» з `import.meta.env.BASE_URL`, новою вкладкою та `noopener noreferrer` в `AppNavigation.vue`, також у спільному public layout входу/реєстрації. Додатковий рядок мобільної навігації враховано в нижньому відступі вмісту; desktop sidebar має вертикальне прокручування для доступу до всіх пунктів і виходу на невисоких екранах. Довідник повертає до кореня застосунку через відносне `../`; Vue Router та auth guards збережено.

Docsify **5.1.0**, штатний search plugin і core CSS тієї самої версії, Manrope з уже наявного `@fontsource/manrope`. Runtime повністю локальний; немає CDN, API-залежності або окремого сервісу. Збірка потребує devDependencies. Ліцензії Docsify (MIT) і Manrope (OFL) копіюються разом із ресурсами. `controls.js` локалізує вбудовані елементи пошуку/меню та усуває вкладену кнопку у markup Docsify 5.1.0; vendor-код не патчиться. Автоматичний зміст, пошук, breadcrumb, обкладинка, світла/темна тема й mobile layout працюють незалежно від Laravel. Повного offline Service Worker немає.

Dev-middleware адресно скеровує `/help/` до статичного HTML, уникаючи SPA fallback. Build копіює public subtree; preview віддає каталог із реальним index. Для справжнього hosting потрібні описані в README правила static-first для `/help/`, коректні MIME types і 404 для відсутніх ресурсів. Origin-root deployment є підтриманою конфігурацією всього SPA; статичний довідник додатково перевіряється під `/planner/help/`. Це не підтвердження підтримки всіх наявних Vue history routes у підкаталозі.

## Медіа

Сценарій `npm run help:screenshots` відтворює поточний Vue UI через наявні deterministic browser fixtures. Усі API перехоплюються; немає реальних облікових даних, live-сервера, приватної бази або paid inference. Знімається основний вміст без account sidebar. Ім’я профілю та ім’я викладача в демо-відповідях замінено до рендерингу. Зображення зняті браузером без графічного редагування чи вигаданої UI.

| Файл                 | Вміст                                            |
| -------------------- | ------------------------------------------------ |
| `dashboard.png`      | Огляд                                            |
| `academic.png`       | Предмети                                         |
| `schedule.png`       | Розклад                                          |
| `excel-import.png`   | Форма завантаження XLSX                          |
| `excel-preview.png`  | Огляд імпорту з помилками й дублікатом           |
| `tasks.png`          | Завдання та підзавдання                          |
| `availability.png`   | Вільні слоти                                     |
| `planning.png`       | Частковий план перед підтвердженням              |
| `study-sessions.png` | Навчальні сесії                                  |
| `reminders.png`      | Нагадування                                      |
| `statistics.png`     | Прогрес                                          |
| `ai-assistant.png`   | Розмова та огляд створення Task з підтвердженням |

Усі 12 зображень мають alt-текст у посібнику; загальний розмір близько 1.2 МіБ. AI-ілюстрація є fixture-демонстрацією підтриманого Task review і не доводить доступність зовнішнього провайдера. Жодного AI Lesson review не додано. Обов’язкових відсутніх знімків немає. Відео — необов’язкове, не додане; немає placeholder-посилання на нього.

## Перевірки

| Команда / перевірка         | Результат                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run format:check`      | PASS                                                                                      |
| `npm run type-check`        | PASS                                                                                      |
| `npm test`                  | PASS: 15 файлів, 390 тестів                                                               |
| `npm run build`             | PASS: production bundle та `dist/help/`                                                   |
| `npm run test:e2e`          | PASS: 62 Chromium desktop/mobile executions, включно з 4 новими Help executions           |
| `npm run help:smoke`        | PASS: dev `:5178/help/` та production preview `:4178/planner/help/`                       |
| `npm run help:screenshots`  | PASS: 1 capture journey, 12 PNG                                                           |
| Структура збірки            | 48 файлів у `dist/help/`, близько 1.8 МіБ; HTML, 21 Markdown, JS/CSS, PNG, fonts/licenses |
| Додатковий візуальний огляд | Світла/темна desktop, ширини 320/390/768 без горизонтального переповнення                 |
| `git diff --check`          | PASS                                                                                      |

Точкові тести: `tests/help.test.ts` (17 тем, local Markdown/media/HTML/CSS assets); `e2e/help.spec.ts` (Docsify замість SPA, 18 sidebar destinations, deep link, усі PNG, пошук, теми та axe, desktop/mobile, публічність без API, звичайні Help links і повернення); `scripts/help-smoke.mjs` (реальний dev і preview окремої збірки з base `/planner/`). Окремий media capture — авторська команда, не частина звичайних regression specs.

Попередні дефекти під час розробки (відносні image paths, dev fallback, nested Docsify toggle та search contrast) були виправлені перед фінальними перевірками. Вони не приховуються вимкненням правил.

## Операційні межі

Немає deployment, live Laravel/MySQL, scheduler-to-Inbox delivery або paid OpenAI verification. Посібник явно розділяє ці межі й не рекламує password reset/change, AI Lesson UI, додаткові statistics metrics або push/email/SMS. Нові можливості документуються лише після реалізації та перевірки.

Відомих зламаних або навмисно відкладених внутрішніх посилань немає. Відсутні optional video і фактична перевірка `docs.zip`, як зазначено вище. Основний README містить процедуру додавання тем, оновлення знімків, asset lifecycle, hosting і локальної перевірки.
