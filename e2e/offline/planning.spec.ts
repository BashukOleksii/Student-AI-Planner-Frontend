import { expect, test, type Page } from '@playwright/test'
import { task } from '../../tests/fixtures'
import { planningBackend, sessionFixture } from '../../tests/helpers/planningBackend'
async function setup(page: Page, loseResponse = false) {
  await page.clock.setFixedTime(new Date('2026-11-02T06:00:00Z'))
  const backend = planningBackend(),
    errors: string[] = []
  let confirmations = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'plan%2Bcsrf%3D', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (req.method() !== 'GET') expect(req.headers()['x-xsrf-token']).toBe('plan+csrf=')
    const result = backend.handle(req.url(), req.method(), req.postDataJSON() ?? {})
    if (req.url().endsWith('/confirm')) {
      confirmations++
      if (loseResponse) return route.abort('failed')
    }
    await route.fulfill({
      status: result.status,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
      headers,
    })
  })
  return {
    backend,
    errors,
    get confirmations() {
      return confirmations
    },
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}
async function period(page: Page) {
  await page.getByLabel('Початок періоду', { exact: true }).fill('2026-11-02')
  await page.getByLabel('Кінець періоду', { exact: true }).fill('2026-11-08')
}
test('read-only workload dashboard distinguishes proposal, saved plan and unfinished work', async ({
  page,
}) => {
  const state = await setup(page)
  state.backend.base.tasks.push({ ...task, id: 42, status: 'missed' })
  await page.goto('/planning')
  await page.locator('.planning-nav summary').click()
  const analysisLink = page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Аналіз навантаження', exact: true })
  await analysisLink.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Аналіз навчального навантаження', exact: true }),
  ).toBeVisible()
  const start = page.getByLabel('Початок періоду', { exact: true }),
    end = page.getByLabel('Кінець періоду', { exact: true })
  await start.fill('2026-11-09')
  await end.fill('2026-11-15')
  await page.getByRole('button', { name: 'Проаналізувати навантаження', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.workload-summary')).toContainText('120 хв')
  await expect(page.locator('[data-source="allocation"]')).toContainText('Денний ліміт замалий')
  const saved = page.locator('[data-source="persisted_workload"]')
  await expect(saved).toContainText('Перевищень лімітів: 2')
  await saved.getByText('Переглянути перевищення', { exact: true }).click()
  await expect(saved.getByText('День 2026-11-10', { exact: true })).toBeVisible()
  await expect(saved.getByText('Тиждень 2026-46', { exact: true })).toBeVisible()
  await expect(page.locator('.workload-unplanned a')).toHaveText([
    'Прочитати розділ',
    'Самостійна робота',
    'Самостійна робота',
    'Прочитати розділ',
  ])
  await expect(page.locator('.workload-unplanned').nth(2)).toContainText('Час не вказано')
  await expect(page.locator('.coverage-ring')).toContainText('33%')
  await expect(page.locator('.daily-column')).toHaveCount(7)
  const query = new URLSearchParams(
    state.backend.requests.filter((r) => r.path.endsWith('/workload-advice')).at(-1)!.search,
  )
  expect([...query]).toEqual([
    ['start_date', '2026-11-09'],
    ['end_date', '2026-11-15'],
  ])
  await page.getByRole('button', { name: 'Проаналізувати навантаження', exact: true }).click()
  await expect(page.locator('.workload-summary')).toBeVisible()
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, theme)
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await noOverflow(page)
      if (theme === 'light' && width !== 768) {
        await page.screenshot({
          path: `test-results/workload-${test.info().project.name}-${width}.png`,
          fullPage: true,
        })
      }
    }
  }
  expect(state.backend.requests.every((r) => r.method === 'GET')).toBe(true)
  expect(state.backend.requests.some((r) => /preview|confirm/.test(r.path))).toBe(false)
  expect(await page.content()).not.toMatch(/preview_token|opaquePlanToken/)
  for (let index = 0; index < 5; index++) {
    state.backend.workload.work_advice.push({
      ...state.backend.workload.work_advice[0]!,
      task_id: 200 + index,
      reason_codes: [
        'below_minimum_session_duration',
        'insufficient_break_before',
        'insufficient_break_after',
        'weekly_study_limit_exceeded',
      ],
    })
  }
  await page.getByRole('button', { name: 'Проаналізувати навантаження', exact: true }).click()
  const issuePages = page.getByRole('navigation', { name: 'Сторінки причин' })
  const workPages = page.getByRole('navigation', { name: 'Сторінки незапланованої роботи' })
  await expect(page.locator('.workload-issue')).toHaveCount(4)
  await expect(page.locator('.workload-unplanned')).toHaveCount(4)
  await issuePages.getByRole('button', { name: 'Наступна', exact: true }).click()
  await expect(issuePages).toContainText('Сторінка 2')
  await expect(page.locator('.workload-issue')).toHaveCount(3)
  await workPages.getByRole('button', { name: 'Наступна', exact: true }).click()
  await expect(workPages).toContainText('Сторінка 2')
  await workPages.getByRole('button', { name: 'Попередня', exact: true }).click()
  await page.locator('.workload-unplanned a').first().click()
  await expect(page).toHaveURL('/tasks/42')
  expect(state.backend.requests.some((r) => /preview|confirm/.test(r.path))).toBe(false)
  expect(state.confirmations).toBe(0)
  expect(state.errors).toEqual([])
})
test('unfinished Task opens scoped recovery with explicit preview and partial confirmation', async ({
  page,
}) => {
  const state = await setup(page)
  const diagnostics = state.backend.recovery.recovery
  diagnostics.scope.task_id = 1
  diagnostics.missed_sessions = []
  diagnostics.past_planned_sessions = []
  diagnostics.summary.missed_session_count = 0
  diagnostics.summary.past_planned_session_count = 0
  diagnostics.summary.requires_lifecycle_decision = false
  const history = structuredClone(state.backend.sessions)
  state.backend.base.tasks[0]!.status = 'missed'
  await page.goto('/tasks/1')
  await page.getByRole('link', { name: 'Відновити роботу', exact: true }).click()
  await expect(page).toHaveURL(/\/planning\/recovery\?task_id=1$/)
  await expect(page.getByLabel('Завдання для планування', { exact: true })).toHaveValue(
    state.backend.base.tasks[0]!.title,
  )
  const previewButton = page.getByRole('button', {
    name: 'Знайти час для невиконаної роботи',
    exact: true,
  })
  await expect(previewButton).toBeEnabled()
  expect(state.backend.requests.some((r) => r.path.endsWith('/recovery/preview'))).toBe(false)
  expect(state.confirmations).toBe(0)
  await page.getByLabel('Початок періоду', { exact: true }).fill('2026-11-09')
  await page.getByLabel('Кінець періоду', { exact: true }).fill('2026-11-15')
  await previewButton.click()
  await expect(
    page.getByRole('heading', { name: 'Пропозиція — ще не збережено', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Пропущені сесії', exact: true })).toHaveCount(0)
  expect(state.backend.requests.find((r) => r.path.endsWith('/recovery/preview'))?.body).toEqual({
    start_date: '2026-11-09',
    end_date: '2026-11-15',
    task_id: 1,
    subtask_id: null,
  })
  const confirmButton = page.getByRole('button', { name: 'Підтвердити зміни', exact: true })
  await expect(confirmButton).toBeDisabled()
  expect(state.confirmations).toBe(0)
  expect(state.backend.sessions).toEqual(history)
  expect(await page.content()).not.toContain('opaqueRecoveryToken')
  await page.setViewportSize({ width: 320, height: 844 })
  await noOverflow(page)
  await page
    .getByLabel('Приймаю частковий план і нерозподілений залишок роботи', { exact: true })
    .check()
  await confirmButton.click()
  await expect(page.getByText('План відновлення збережено.', { exact: true })).toBeVisible()
  expect(state.confirmations).toBe(1)
  expect(state.backend.requests.find((r) => r.path.endsWith('/confirm'))).toMatchObject({
    path: '/api/planning/study-plans/confirm',
    body: { preview_token: 'opaqueRecoveryToken==', accept_partial: true },
  })
  expect(state.backend.base.tasks[0]?.status).toBe('missed')
  expect(state.backend.base.requests.some((r) => r.method === 'PATCH')).toBe(false)
  await expect(page).toHaveURL(/\/planning\/sessions\?/)
  await noOverflow(page)
  expect(state.errors).toEqual([])
})
test('complete planning journey: preferences, availability, plan, sessions, recovery and adaptive consent', async ({
  page,
}, testInfo) => {
  const state = await setup(page)
  await page.goto('/planning/preferences')
  await expect(
    page.getByRole('heading', { name: 'Вподобання навчання', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Денний ліміт, хв', { exact: true }).fill('120')
  await page.getByLabel('Тижневий ліміт, хв', { exact: true }).fill('600')
  await page.getByRole('button', { name: 'Зберегти вподобання', exact: true }).click()
  await expect(page.getByText('Вподобання збережено.', { exact: true })).toBeVisible()
  if (!(await page.locator('.planning-nav details[open]').count()))
    await page.locator('.planning-nav summary').click()
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Доступність', exact: true })
    .click()
  await page.getByRole('button', { name: 'Додати інтервал', exact: true }).click()
  await page.getByLabel('Початок інтервалу', { exact: true }).fill('09:00:00')
  await page.getByLabel('Кінець інтервалу', { exact: true }).fill('24:00:00')
  await page.getByRole('button', { name: 'Зберегти інтервал', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.backend.windows[0]).toMatchObject({
    day_of_week: 1,
    starts_at: '09:00:00',
    ends_at: '24:00:00',
  })
  if (!(await page.locator('.planning-nav details[open]').count()))
    await page.locator('.planning-nav summary').click()
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Вільний час', exact: true })
    .click()
  await period(page)
  await page.getByLabel('Мінімальна тривалість, хв', { exact: true }).fill('30')
  await page.getByRole('button', { name: 'Знайти вільний час', exact: true }).click()
  await expect(page.getByText('60 хв', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Новий план', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Попередній перегляд плану', exact: true }),
  ).toBeVisible()
  await period(page)
  await page
    .getByLabel('Завдання для планування', { exact: true })
    .fill(state.backend.base.tasks[0]!.title)
  await page.getByRole('option', { name: state.backend.base.tasks[0]!.title, exact: true }).click()
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Пропозиція — ще не збережено', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  expect(state.confirmations).toBe(0)
  expect(await page.content()).not.toContain('opaquePlanToken')
  await noOverflow(page)
  await page
    .getByLabel('Приймаю частковий результат і неперенесену тривалість', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.getByText('Новий план збережено.', { exact: true })).toBeVisible()
  expect(state.confirmations).toBe(1)
  await page.locator('a[href^="/planning/sessions/21?"]').click()
  await expect(page.getByRole('heading', { name: 'Прочитати розділ', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Перенести сесію', exact: true }).click()
  await page.getByLabel('Новий початок', { exact: true }).fill('2026-11-03T11:00')
  await page.getByLabel('Нове завершення', { exact: true }).fill('2026-11-03T11:15')
  await page.getByRole('button', { name: 'Переглянути наслідки', exact: true }).click()
  await expect(page.getByText(/Після підтвердження буде перевірено/)).toBeVisible()
  await page.getByRole('button', { name: 'Підтвердити перенесення', exact: true }).click()
  await expect(page).toHaveURL(/\/planning\/sessions\?/)
  expect(state.backend.requests.find((r) => r.path.endsWith('/reschedule'))?.body).toEqual({
    starts_at: '2026-11-03T09:00:00Z',
    ends_at: '2026-11-03T09:15:00Z',
  })
  if (!(await page.locator('.planning-nav details[open]').count()))
    await page.locator('.planning-nav summary').click()
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Відновлення роботи', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Відновлення невиконаної роботи', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Початок періоду', { exact: true }).fill('2026-11-09')
  await page.getByLabel('Кінець періоду', { exact: true }).fill('2026-11-15')
  const history = structuredClone(state.backend.sessions)
  await page.getByRole('button', { name: 'Знайти час для невиконаної роботи', exact: true }).click()
  await expect(
    page
      .getByRole('region', { name: 'Пропущені сесії', exact: true })
      .locator('a[href="/planning/sessions/91"]'),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Сесії без результату', exact: true })
      .locator('a[href="/planning/sessions/92"]'),
  ).toHaveAttribute('href', '/planning/sessions/92')
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  expect(state.backend.sessions).toEqual(history)
  expect(state.confirmations).toBe(1)
  expect(
    state.backend.requests.find((r) => r.path === '/api/planning/recovery/preview')?.body,
  ).toEqual({ start_date: '2026-11-09', end_date: '2026-11-15', task_id: null, subtask_id: null })
  expect(await page.content()).not.toContain('opaqueRecoveryToken')
  await expect(
    page.getByText('На сторінці сесії можна вказати, чи її виконано або пропущено', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByLabel(
      'Дозволяю скасувати початкові сесії без заміни та їхні заплановані нагадування',
      { exact: true },
    ),
  ).toHaveCount(0)
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click()
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await noOverflow(page)
    }
  }
  await page.setViewportSize(testInfo.project.use.viewport ?? { width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('recovery-review.png'), fullPage: true })
  await page.getByRole('button', { name: 'Увімкнути світлу тему', exact: true }).click()
  await page
    .getByLabel('Приймаю частковий план і нерозподілений залишок роботи', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.getByText('План відновлення збережено.', { exact: true })).toBeVisible()
  expect(state.confirmations).toBe(2)
  expect(
    state.backend.requests.filter((r) => r.path === '/api/planning/study-plans/confirm').at(-1)
      ?.body,
  ).toEqual({ preview_token: 'opaqueRecoveryToken==', accept_partial: true })
  expect(state.backend.sessions.slice(0, history.length)).toEqual(history)
  await expect(page).toHaveURL(/\/planning\/sessions\?/)
  const savedSession = state.backend.sessions[history.length]!
  await page.getByRole('button', { name: 'Наступний день', exact: true }).click()
  await expect(
    page.locator(`.session-card a[href^="/planning/sessions/${savedSession.id}?"]`),
  ).toBeVisible()
  if (!(await page.locator('.planning-nav details[open]').count()))
    await page.locator('.planning-nav summary').click()
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Перепланування', exact: true })
    .click()
  await period(page)
  await page.getByRole('button', { name: 'Перевірити план', exact: true }).click()
  const partial = page.getByLabel('Приймаю частковий результат і неперенесену тривалість', {
      exact: true,
    }),
    cancellation = page.getByLabel(
      'Дозволяю скасувати початкові сесії без заміни та їхні заплановані нагадування',
      { exact: true },
    )
  await expect(partial).not.toBeChecked()
  await expect(cancellation).not.toBeChecked()
  await partial.check()
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  await cancellation.check()
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('adaptive-review.png'), fullPage: true })
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.getByText('Перепланування збережено.', { exact: true })).toBeVisible()
  expect(
    state.backend.requests.find((r) => r.path === '/api/planning/replanning/confirm')?.body,
  ).toEqual({
    preview_token: 'opaqueReplanToken==',
    accept_partial: true,
    accept_unplaced_cancellation: true,
  })
  await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Ваш день/ })).toBeVisible()
  await noOverflow(page)
  await page.goto('/schedule')
  await page
    .locator('.app-navigation:visible')
    .getByRole('link', { name: 'Мій план', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Мій план', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Обговорити з AI', exact: true }).click()
  await expect(page).toHaveURL(/\/ai$/)
  expect(state.errors).toEqual([])
})
test('lost direct confirmation is inspected without automatic replay; historical lifecycle remains explicit', async ({
  page,
}) => {
  const state = await setup(page, true)
  state.backend.sessions = [sessionFixture(1)]
  await page.goto('/planning/preview')
  await period(page)
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
  await page
    .getByLabel('Приймаю частковий результат і неперенесену тривалість', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.getByText(/Результат підтвердження не встановлено/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  expect(state.confirmations).toBe(1)
  expect(state.backend.sessions).toHaveLength(2)
  await page.getByRole('link', { name: 'Повернутися до сесій', exact: true }).click()
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'))
  await page.locator('.session-card a[href^="/planning/sessions/1?"]').click()
  await page.locator('#actual-minutes').fill('25')
  await page.getByRole('button', { name: 'Завершити сесію', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Завершено$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Завершити сесію', exact: true })).toHaveCount(0)
  expect(state.backend.sessions[0]?.actual_minutes).toBe(25)
  await noOverflow(page)
  expect(state.errors).toEqual([])
})
