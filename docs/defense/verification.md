# Перевірка документації Stage 9

[Зміст](README.md)

## Обсяг і джерела

Вихідний Frontend HEAD: `f15a3cad48f9fb8824e1389fd60b78c2f7b9b226`; Backend: `f618bba290f919dc3561b0462c59b3b86ade82d8`. Робота обмежена документацією, Mermaid-джерелами та пов'язаними локальними перевірками документації. Бізнес-логіка, конфігурація, міграції, application tests і залежності репозиторіїв не змінювалися. Інтеграцію не повторювали, нових користувачів/fixtures не створювали, dispatcher/provider/deployment не запускали.

Прочитано інструкції обох репозиторіїв, маршрути й міграції, цільові Controllers/Requests/Resources/Policies/Models, Services планування/імпорту/нагадувань/статистики та AI registry/orchestrator/provider/confirmation. Звірено frontend router, transport, API/types/stores/composables, чинні технічні документи та звіти F1–F8. GitHub metadata, steps і підсумкові журнали перевірено саме для двох SHA; [результати](testing-and-results.md#перевірені-github-actions) і [метадані](ci-evidence.json).

## Відтворення статичних перевірок

З кореня Frontend за наявності sibling checkout Backend:

```bash
python3 docs/defense/validate-docs.py --backend ../student-planner-backend
```

Це не запускає Laravel і не підключається до БД. Перевіряються:

- відносні Markdown-посилання й anchors;
- прив'язані до SHA backend source links проти локальних файлів;
- рівність повного каталогу 90 маршрутів статичним Route-деклараціям і наявність Controller methods;
- згадані backend class names;
- ER-набір таблиць/вибраних колонок/FK і наявність відповідних зв'язків;
- точні 9 read/14 proposal Tool names;
- тотожність Mermaid-блоків галереї окремим `.mmd`;
- прості шаблони можливих секретів у документах.

Це цільовий статичний checker поточного синтаксису репозиторію, не універсальний PHP/Markdown parser, не повна перевірка nullability/DDL та не security audit. Службова migrations і фінальне додавання protected_payload враховані явно; їхнє походження додатково перевірено у коді/міграціях. Зовнішні source links перевіряються щодо checkout, а не нескінченними HTTP-запитами.

## Відтворення Mermaid-перевірки

Потрібні вже встановлені frontend dev-залежності та Chromium із наявного Playwright setup. Mermaid встановлюється тільки у тимчасовий каталог, без зміни package.json/lockfile проєкту:

```bash
npm install --prefix /tmp/student-planner-stage9-mermaid --no-package-lock --no-audit --no-fund mermaid@11.17.2
node docs/defense/validate-mermaid.mjs /tmp/student-planner-stage9-mermaid/node_modules/mermaid/dist/mermaid.min.js /tmp/student-planner-stage9-diagrams
```

Для кожного з дев'яти `.mmd` інструмент виконує `mermaid.parse`, справжній `mermaid.render` у Chromium і перевірку XML SVG; зберігає SVG, PNG та validation-results.json у вказаний тимчасовий каталог. Це перевірка діаграм, не application E2E і не запит до Figma. На першій перевірці виявлено й усунено розділювач `;` у sequence-підписі доставки; початковий невдалий parse не зараховано як PASS.

## Контроль фактичних тверджень

Під час звіряння виправлено чернеткове API-формулювання: для невідомої actual_minutes поле complete-запиту треба **опускати**; явний null не проходить `CompleteStudySessionRequest`, хоча збережене значення може бути null. У схемах уточнено скорочені HTTP-переходи й відділено logical morph від фізичного FK. Нові діаграми не додають таблиць study_plans/free_slots/reports чи неіснуючих Tools.

Сценарій показу враховує completed Task 1 і заповнений acceptance account, прострочення операторських grants і реальний календар. Читання старого Batch не видається за новий upload; fallback REST не видається за paid AI; cancelled Reminder не видається за доставлену Notification. Усі відкриті Stage 8 категорії збережено.

## Підсумковий запис перевірок

Підсумковий статус документаційного комплекту: **PASS, готовий до рев'ю** в межах доступних джерел.

| Перевірка                  | Результат                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Статичний checker          | PASS: 14 Markdown-документів у перевіреному наборі, 173 посилання, з них 23 backend source links, 120 перевірених згадок класів із повторами між документами |
| REST і Tools               | PASS: усі 90 application routes та Controller methods, 9 read Tools і 14 proposals збігаються з кодом                                                        |
| ER                         | PASS: 28 таблиць, 179 показаних колонок і відповідні FK-зв'язки; скорочений ER не видається за повний DDL                                                    |
| Mermaid 11.17.2 / Chromium | PASS: 9 із 9 джерел пройшли parse, SVG XML та фактичний render; SVG/PNG збережено поза Git                                                                   |
| Сценарій і слайди          | PASS: 14 слайдів; неперервний план на 840 секунд (14 хвилин), не вимірювання швидкодії                                                                       |
| Форматування               | PASS: `npm run format:check`; застосунок не перебудовувався                                                                                                  |
| Whitespace                 | PASS: `git diff --check`                                                                                                                                     |
| Приватність                | PASS: відомі приватні credential-значення відсутні в нових документах; `.auth/` не відстежується Git; metadata CI не містять сирих журналів                  |
| Application tests          | NOT RUN у Stage 9: application code не змінено; використано явно датовані попередні результати й перевірені hosted runs                                      |

Змінено два наявні файли: `README.md` і `docs/demo-scenario.md`. Створено **24 файли** під `docs/defense/`: 11 основних Markdown-документів, каталог/галерею `diagrams/README.md`, 9 `.mmd`, `ci-evidence.json` та два локальні validators. Перелік змістових документів наведено в README комплекту, усіх дев'яти діаграм — у їхньому каталозі.

Фінальні `git diff --stat` і `git status --short --untracked-files=all` показують лише ці документаційні зміни. Нові файли не додавалися до index, тому `git diff --stat` сам по собі показує лише два змінені tracked Markdown; повний перелік нових файлів дає status. Backend clean; обидва HEAD незмінні. Коміт/push/deployment не виконувалися. Документація не набуває нового hosted CI-статусу до окремого коміту й завершеного run.

Локальні результати поточної перевірки: `/tmp/stage9-doc-validation.json`, `/tmp/student-planner-stage9-diagrams/validation-results.json`, `/tmp/stage9-format-check.log`. Вони не потрібні для роботи застосунку й не містять сеансових даних.

## Відсутні матеріали й редакційні уточнення

Оригінальне академічне ТЗ, офіційні реквізити, кафедральні шаблони та критерії оцінювання не надані. Матриця явно спирається на поточні можливості й наявні BR-позначення. У backend H4 readiness-документі збереглася історична фраза про ще не реалізований незалежний frontend; для поточного стану її спростовує чинний Vue-репозиторій і Stage 8. Backend-звіт залишено історичним, а актуальний стан пояснено тут. Перед захистом узгодити це часовими поясненнями, не використовувати старий вступ як поточний висновок.
