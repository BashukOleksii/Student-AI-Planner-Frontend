import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { planningBackend, sessionFixture } from '../tests/helpers/planningBackend'
async function setup(page: Page, loseResponse = false) {
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
  await page.goto('/tasks')
  await page.getByRole('button', { name: 'Позначити невиконаним', exact: true }).click()
  await expect(
    page.getByText('Сервер підтвердив стан завдання: «Не виконано».', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Статус', { exact: true }).selectOption('missed')
  await expect(page.locator('.task-row .badge').first()).toHaveText('Не виконано')
  await page.getByRole('link', { name: 'Відновити роботу', exact: true }).click()
  await expect(page).toHaveURL(/\/planning\/recovery\?task_id=1$/)
  await expect(page.getByLabel('Завдання для планування', { exact: true })).toHaveValue('1')
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
  await expect(page.getByRole('region', { name: 'Пропущені сесії', exact: true })).toContainText(
    'Сесій цієї групи не знайдено.',
  )
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
  await expect(
    page.getByRole('heading', { name: 'Збережений результат', exact: true }),
  ).toBeVisible()
  expect(state.confirmations).toBe(1)
  expect(state.backend.requests.find((r) => r.path.endsWith('/confirm'))).toMatchObject({
    path: '/api/planning/study-plans/confirm',
    body: { preview_token: 'opaqueRecoveryToken==', accept_partial: true },
  })
  expect(state.backend.base.tasks[0]?.status).toBe('missed')
  expect(state.backend.base.requests.some((r) => r.method === 'PATCH')).toBe(false)
  await expect(
    page.getByRole('link', { name: 'Перевірити поточні сесії', exact: true }),
  ).toBeVisible()
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
  await period(page)
  await page.getByLabel('Завдання для планування', { exact: true }).selectOption('1')
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
  await expect(
    page.getByRole('heading', { name: 'Збережений результат', exact: true }),
  ).toBeVisible()
  expect(state.confirmations).toBe(1)
  await page.getByRole('link', { name: 'Сесія №21', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Навчальна сесія №21', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Перенести сесію', exact: true }).click()
  await page.getByLabel('Новий початок', { exact: true }).fill('2026-11-03T11:00')
  await page.getByLabel('Нове завершення', { exact: true }).fill('2026-11-03T11:15')
  await page.getByRole('button', { name: 'Переглянути наслідки', exact: true }).click()
  await expect(page.getByText(/Це негайна операція/)).toBeVisible()
  await page.getByRole('button', { name: 'Підтвердити перенесення', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Фактичний результат перенесення', exact: true }),
  ).toBeVisible()
  expect(state.backend.requests.find((r) => r.path.endsWith('/reschedule'))?.body).toEqual({
    starts_at: '2026-11-03T09:00:00Z',
    ends_at: '2026-11-03T09:15:00Z',
  })
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
      .getByRole('link', { name: 'Сесія №91', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Минулі заплановані сесії', exact: true })
      .getByRole('link', { name: 'Сесія №92', exact: true }),
  ).toHaveAttribute('href', '/planning/sessions/92')
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  expect(state.backend.sessions).toEqual(history)
  expect(state.confirmations).toBe(1)
  expect(
    state.backend.requests.find((r) => r.path === '/api/planning/recovery/preview')?.body,
  ).toEqual({ start_date: '2026-11-09', end_date: '2026-11-15', task_id: null, subtask_id: null })
  expect(await page.content()).not.toContain('opaqueRecoveryToken')
  await expect(
    page.getByText(/Потрібне ваше рішення щодо минулих запланованих сесій/),
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
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(audit.violations, `recovery ${theme}`).toEqual([])
  }
  await page.setViewportSize(testInfo.project.use.viewport ?? { width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('recovery-review.png'), fullPage: true })
  await page.getByRole('button', { name: 'Увімкнути світлу тему', exact: true }).click()
  await page
    .getByLabel('Приймаю частковий план і нерозподілений залишок роботи', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Збережений результат', exact: true }),
  ).toBeVisible()
  expect(state.confirmations).toBe(2)
  expect(
    state.backend.requests.filter((r) => r.path === '/api/planning/study-plans/confirm').at(-1)
      ?.body,
  ).toEqual({ preview_token: 'opaqueRecoveryToken==', accept_partial: true })
  expect(state.backend.sessions.slice(0, history.length)).toEqual(history)
  await page.getByRole('link', { name: 'Перевірити поточні сесії', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Сесія №23', exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Перепланування', exact: true })
    .click()
  await period(page)
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
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
  await expect(
    page.getByRole('heading', { name: 'Збережений результат', exact: true }),
  ).toBeVisible()
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
  await expect(page.getByRole('heading', { name: /Вітаємо/ })).toBeVisible()
  await noOverflow(page)
  await page.goto('/schedule')
  await page.getByRole('link', { name: 'Планування навчання', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Планування навчання', exact: true }),
  ).toBeVisible()
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
  await page.getByRole('link', { name: 'Перевірити поточні сесії', exact: true }).click()
  await page.getByRole('link', { name: 'Сесія №1', exact: true }).click()
  await page.getByLabel('Фактична тривалість, хв (необов’язково)', { exact: true }).fill('25')
  await page.getByRole('button', { name: 'Завершити сесію', exact: true }).click()
  await expect(page.getByText('Завершено', { exact: true })).toBeVisible()
  await expect(page.getByText(/Повторне відкриття/)).toBeVisible()
  expect(state.backend.sessions[0]?.actual_minutes).toBe(25)
  await noOverflow(page)
  expect(state.errors).toEqual([])
})
