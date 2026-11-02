# Фінальна оцінка Stage 10

[Зміст](README.md) · [Операційна перевірка](operational-verification.md)

## Рішення

**Stage 10 умовно завершено в дозволеному обсязі: traceability та підтверджені UI-виправлення виконано; full requirements compliance не досягнуто.** Операційне приймання dispatcher, paid provider, Figma parity та HTTPS staging не заявляється. Нові архітектурні можливості не реалізовувалися без окремого approval.

## Версії та облік

| Показник                          | Результат                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend starting → ending HEAD   | `469d7e96abb0d90a80cdba377f83f8e6bb4a8081` → той самий SHA; Stage 10 зміни не закомітовані                                                                                                                               |
| Backend starting → ending HEAD    | `f618bba290f919dc3561b0462c59b3b86ade82d8` → той самий SHA; source незмінений                                                                                                                                            |
| Actual Laravel application routes | **90/90 accounted** із runtime route:list + source                                                                                                                                                                       |
| Категорії API                     | **89 UI COVERED**, **1 PROGRAMMATICALLY COVERED**; INTENTIONALLY NOT EXPOSED / MISSING FRONTEND INTEGRATION / NEEDS VERIFICATION — **0** на рівні наявних route bindings                                                 |
| Vue Router                        | **35/35 records**, 27 view-файлів; академічний record має 4 значення, redirect/catch-all обліковано                                                                                                                      |
| Джерела вимог                     | Прочитано S1/S2/S3, source copy byte-identical; 48 груп із line references: 34 IMPLEMENTED, 6 PARTIALLY IMPLEMENTED, 6 NOT IMPLEMENTED, 1 NOT VERIFIED, 1 NOT APPLICABLE; це групи різної ваги, не відсоток виконання ТЗ |
| AI allowlist                      | **9 reads + 14 proposals = 23**; 9 representative protocol workflows mapped                                                                                                                                              |
| Нові persistent fixture IDs       | Немає; retained S8 account/DB не replay-илися                                                                                                                                                                            |
| Hosted CI exact changed source    | **NOT RUN**: commit/push не виконувалися; старий frontend CI не приписано новим змінам                                                                                                                                   |

## Конкретні виправлення

- `src/views/TasksView.vue`: authoritative pagination reconciliation після зміни набору записів, lower deadline bound, місцевий час → UTC, validation feedback. При complete/reopen останнього рядка другої сторінки студент знову бачить решту записів, а не порожню сторінку без pager.
- `src/views/TaskEditorView.vue`, `src/components/domain/TaskForm.vue`: busy/uncertain guards. При network/5xx збереження не повторюється, draft залишається, link веде до перевірки фактичного списку. 422/419 лишаються відновлюваними.
- `src/styles/main.css`: два deadline inputs переносяться на нові рядки за доступною шириною. Перший повний Chromium pass виявив overflow на проміжному desktop-розмірі; причину виправлено, assertion не послаблено.
- `tests/ui.test.ts`: 6 regressions спочатку failed (exit 1), після fix — PASS; covers pending/completed pagination, filter contract/backend errors, uncertain create/update та duplicate pending submit.
- `e2e/tasks-coverage.spec.ts`: два mock E2E workflows, desktop/mobile, перевірка ширин 320/768/1024/1440 та light/dark, reconciliation реалістичного lost-response-after-persistence сценарію.
- Шість українських deliverables у `docs/stage10/`, route/runtime snapshot та компактні evidence; дослівне джерело у `docs/requirements/`. Stage 9 traceability intro/limitations точково оновлено після отримання оригіналу. `.prettierignore` зберігає лише verbatim source copy.

## Регресія

| Перевірка                                                                                  | Підсумок                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `npm run format:check`                                                                     | exit 0                                                                          |
| `npm run type-check`                                                                       | exit 0                                                                          |
| `npm test`                                                                                 | exit 0; **388 passed / 14 files**                                               |
| `npm run build`                                                                            | exit 0                                                                          |
| `npm run test:e2e -- --workers=4 --retries=0 --output=test-results/stage10-chromium-final` | exit 0; **58 passed**, no retries                                               |
| `npm run test:cross-browser …`                                                             | exit 1; **29 Firefox passed**, 58 WebKit launch failures (BLOCKED dependencies) |
| Backend DB-free Unit suite                                                                 | exit 0; **2084 passed / 6273 assertions**                                       |
| `git diff --check`                                                                         | exit 0                                                                          |

Перший повний Chromium run: exit 1, 57 passed/1 failed (responsive filter); подальший targeted/final результат зафіксовано окремо в [verification-results.json](evidence/verification-results.json). Unit/backend результати не повторювалися без зміни відповідної логіки. Browser accessibility/keyboard audit входить до повного pass; manual assistive/device/native Safari checks не проводилися.

## Відповідність та пріоритети перед захистом

Розклад/ручні заняття/заміни, XLSX, Tasks/Subtasks, constraints/free slots, planning/explicit replanning, session lifecycle, reminder management/Inbox та in-app reports мають належний UI до існуючого API. Немає підтверджених неінтегрованих application routes. Це не усуває початкових формальних прогалин:

1. **P1 — AI schedule/replacement mutations (A2).** У user stories це пряма вимога. Наявні reads не дають права заявляти AI CRUD занять. Потрібен allowlisted proposal/confirm/fingerprint/receipt flow через LessonService; додавання action types потребує migration чинного DB check constraint і frontend review support.
2. **P1 — change/recover password (A1a/A1b).** Реальних endpoints/forms немає. Наявність users/password reset table цього не закриває. Change — current-password flow/session policy; recovery — broker/token/mail/throttle/expiry + нові public UI routes.
3. **P2 — completion percent / subject workload (A4).** Статистика повертає counts/days/scheduled/actual values, але не загальний completion rate чи subject aggregate. Потрібні узгоджені populations/period semantics і серверний aggregate.
4. **P2 — незавершена робота.** User-requested planning/replanning підтримано, але adaptive source scope — future planned sessions. Missed/elapsed remaining work потребує нового plan; Task deadline PATCH не запускає relocation. Autonomous scheduler відсутній (A3), обов'язковість потребує рішення C2.
5. **Неоднозначності C1–C4.** Cancel Reminder з історією проти буквального delete; background automation; AI availability management; downloadable report. Рішення запропоновано й запитано, без відповіді не оголошено погодженим. File export/team/calendar — кандидати S3, не автоматично обов'язкові formal features.

Точні files/tests/design proposals наведено в [requirements-coverage](requirements-coverage.md). Один approval має стосуватися конкретної capability; кілька нових backend модулів мовчки не додаються. За відсутності відповіді на окремий запит A1–A4 лишаються **не схвалені та не реалізовані**.

## Операційні outcomes і демонстрація

**Reminder dispatcher — BLOCKED:** grant explicitly `database_disposable=false`, `allow_dispatch=false`; flags не змінено. Static transaction/locking/idempotency flow перевірено, pure delivery rules PASS, але справжній sent/Notification/read persistence не виконано. Потрібна інша явно disposable isolated DB, чинний operator grant, `F7_LIVE_ALLOW_DISPATCH=1` і controlled due fixture.

**Paid provider — BLOCKED:** немає окремого платного bounded approval/private credentials; жодного paid request/AI live record. Детерміновані mocked Tool-selection/protocol checks не означають перевіреної якості реального NL.

**WebKit — BLOCKED:** новий cross-browser run має exit 1: 29 Firefox PASS та 58 WebKit launch failures через відсутні host dependencies на Fedora 44; UI assertions WebKit не виконувалися. Chromium 58 PASS і Firefox 29 PASS актуальні, історичний WebKit PASS не переноситься на зміни.

**Figma — BLOCKED:** source exports не надано, Figma tool у поточному session catalog відсутній. Academic Minimalism і responsive/light-dark/a11y checks збережено; Figma parity не заявлена.

Для захисту використовувати збережені S8 fixtures і [demo runbook](../demo-scenario.md), показати реальні XLSX/Task/plan/replanning та reports і чесно розмежувати серверний deterministic algorithm, mocked AI protocol і невиконаний paid smoke. Не запускати empty-account system harness на populated user 1. Late/elapsed historical edge fixtures, dispatcher, provider, HTTPS staging і production потребують окремих дозволів/інфраструктури, а не SQL backdating чи reset retained DB.
