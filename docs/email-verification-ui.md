# Добровільне підтвердження email у Vue

Контракт прочитано з локального Backend: `git show 643f600:docs/email-verification.md`. Перед змінами перевірено корінь локального Frontend, `git status --short` був порожній, прочитано `AGENTS.md`. Робота — в `main`, без змін Backend, входу, AI, «Вхідних» або каналів нагадувань.

## Поведінка

- У профілі окрема картка відображає адресу з акаунта й `email_verified`: «Email підтверджено» / «Email не підтверджено». Для непідтвердженої адреси користувач явно запитує лист.
- Запит листа — `POST /api/profile/email/verification-notification`, тіло строго `{}`. Адреса не передається. Текст «Лист підтвердження запитано» описує прийнятий запит, а не гарантує доставку листа.
- Стан після PATCH профілю береться з повної відповіді сервера. Немає локального збереження старого прапорця. Нову незбережену адресу спочатку потрібно зберегти; повідомлення про попередній запит листа скидається після зміни адреси.
- `/verify-email` — публічна сторінка, доступна також для вже авторизованого користувача. Вхід залишається добровільною явною дією з чинним внутрішнім `redirect` на цю сторінку. Потік входу та Sanctum не змінено.
- Відкриття, reload, повернення після входу, відновлення CSRF та завершення cooldown **не виконують підтвердження**. POST `{}` викликає лише кнопка «Підтвердити email».
- Після успіху Pinia отримує User із відповіді підтвердження. Неповний success, інший акаунт або інша адреса не перетворюються на локальне підтвердження. Запізніла відповідь після logout або оновлення акаунта не відновлює старий стан.
- 403 має спільне пояснення без вгадування причини: посилання недійсне/прострочене, можна увійти в потрібний акаунт або запросити новий лист із профілю. Явна кнопка зміни акаунта використовує наявний logout і звичайний вхід.
- 429 показує коротке повідомлення та cooldown із `Retry-After` (секунди або HTTP date), блокує повторне натискання до його завершення. Некоректний заголовок не показується як текст. Таймер не запускає мережевих запитів.
- 419 дозволяє явно відновити чинний CSRF-сеанс, після чого потрібне окреме натискання підтвердження. Інші/мережеві помилки мають фіксоване українське пояснення тимчасової недоступності. Сирі повідомлення, поля помилки й підпис не відображаються.

## Межа підписаного шляху

`URLSearchParams.get('verification_path')` читається рівно один раз для кожного нового зовнішнього посилання. Додаткового `decodeURIComponent` немає. Значення не читається з уже декодованого `route.query`. Vue може нормалізувати кодування **зовнішнього** redirect при поверненні після входу; вкладений шлях після одного декодування залишається тим самим.

Дозволено лише точний відносний маршрут `/api/profile/email/verify/{positive numeric id}/{40 hex hash}` і два підписані параметри `expires` та `signature` із числом і 64 hex-символами відповідно. Обидва порядки параметрів приймаються без перестановки. Зайві/повторні параметри, fragment у вкладеному шляху, зовнішній origin, `//`, пробіли/керівні символи, percent-encoded сегменти й подвійне кодування відхиляються до транспорту. Дубльований зовнішній `verification_path` також відхиляється.

Сама перевірка HMAC, строку дії, власності та актуальної адреси залишається на Backend. Frontend не реконструює, не сортує, не перекодовує і не доповнює вкладений query. Перевірка повторюється на вході API-модуля, щоб інший caller не міг підмінити endpoint.

Чинний `request()` виконує `apiBaseUrl + path`, додає cookies/CSRF і origin-only referrer; додаткового `/api` не вставляє. `VITE_API_BASE_URL` у `.env.example` — origin без `/api`, як вимагає контракт. Підписаний шлях не виводиться в текст сторінки, повідомленнях чи журналах, не стає посиланням на Backend і не зберігається в Pinia/localStorage/sessionStorage. Адресний рядок та внутрішнє повернення через login зберігають зовнішнє посилання, щоб reload не втрачав дію. Глобальний `no-referrer` і чинний API referrer не змінено.

## Змінені файли

- `src/types/api.ts` — boolean `User.email_verified` із чинного контракту.
- `src/api/emailVerification.ts` — два наявні endpoints, `{}`, повторна перевірка цільового шляху та success User.
- `src/utils/emailVerification.ts` — одноразове декодування wrapper, вузька валідація, українські повідомлення й Retry-After.
- `src/composables/useEmailVerificationFeedback.ts` — спільне відображення помилки/cooldown без автоматичних запитів.
- `src/stores/auth.ts` — оновлення Pinia з відповіді підтвердження, захист від запізнілих відповідей.
- `src/router/index.ts`, `src/views/VerifyEmailView.vue` — публічна сторінка явного підтвердження.
- `src/views/ProfileView.vue` — стан адреси й добровільний запит листа.
- `tests/fixtures.ts`, `tests/helpers/emailVerificationBackend.ts`, `tests/email-verification.test.ts` — контрактні fixtures і регресії.
- `tests/ui.test.ts` — лише очікування асинхронного переходу після входу через `vi.waitFor`, без зміни потрібного destination чи перевірок завдань.
- `e2e/email-verification.spec.ts` — підробний API, desktop/mobile, без trace для підписаних посилань.
- `docs/email-verification-ui.md` — цей звіт.

## Команди й результати

З кореня Frontend:

```bash
npm run type-check
npm run build
npx vitest run tests/email-verification.test.ts tests/auth.test.ts tests/passwords.test.ts
npx vitest run tests/ui.test.ts --testNamePattern 'profile|protected content|logs in through'
npx playwright test e2e/email-verification.spec.ts e2e/passwords.spec.ts --workers=4
```

- Type checking — успішно, exit 0.
- Production build — успішно, exit 0.
- Цільові Vitest — **54/54, 3 файли**, exit 0: безпечні/пошкоджені шляхи, незмінний вкладений query, cookies/CSRF, нуль POST до кліку, повернення після входу, серверний статус профілю, Retry-After, 419, захист від запізнілих/подвійних записів.
- Фільтр профілю/входу — **4 успішних, 27 пропущених за фільтром**, exit 0.
- Playwright — **16/16**, desktop/mobile Chromium, exit 0. Включає повний fake-сценарій email та чинний сценарій відновлення пароля.

Ширшу перевірку також виконано:

```bash
npx vitest run tests/ui.test.ts
```

Результат: **26 успішних, 5 failures, exit 1**. Невдалі сценарії стосуються створення/завершення завдань, старих очікувань модального вікна/повідомлень і pending task save. Їх не змінено в цьому завданні. Ті самі п’ять збоїв відтворено на початковому Frontend `08e723f` у тимчасовому знімку, без branch/worktree/clone або перезапису робочих файлів:

```bash
python3 - <<'PY'
import pathlib, subprocess, tempfile, os
root = pathlib.Path.cwd()
baseline = pathlib.Path(tempfile.mkdtemp(prefix='frontend-email-baseline.'))
paths = ['src', 'tests', 'vitest.config.ts', 'package.json', 'tsconfig.json',
         'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.tests.json', 'env.d.ts']
archive = subprocess.check_output(['git', 'archive', '08e723f', *paths])
subprocess.run(['tar', '-x', '-C', str(baseline)], input=archive, check=True)
os.symlink(root / 'node_modules', baseline / 'node_modules', target_is_directory=True)
result = subprocess.run(['node', str(root / 'node_modules/vitest/vitest.mjs'),
                         'run', 'tests/ui.test.ts'], cwd=baseline)
raise SystemExit(result.returncode)
PY
```

Контроль: **26 успішних, ті самі 5 failures, exit 1**. У фактичній команді архівували `HEAD`, який на той момент був `08e723f`; тут зафіксовано коміт для відтворення. Повний репозиторний набір зеленою регресією не оголошується.

## Що не перевірялося

**Доставка пошти не перевірялася.** Підробний API не надсилає листів, не перевіряє HMAC і не є тестом SMTP або Mailpit. Локальний Backend читався лише для контракту; робоча БД, SMTP, Mailpit та живий LLM не використовувалися. Firefox/Safari й повний набір тестів застосунку не запускалися. Поштові нагадування та перемикач такого каналу не додавалися.
