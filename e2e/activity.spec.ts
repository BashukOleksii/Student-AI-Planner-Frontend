import { expect, test, type Page } from '@playwright/test'
import { activityBackend } from '../tests/helpers/activityBackend'
async function setup(page: Page) {
  const backend = activityBackend(),
    errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'activity%2Bcsrf%3D', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (req.method() !== 'GET') expect(req.headers()['x-xsrf-token']).toBe('activity+csrf=')
    const result = backend.handle(req.url(), req.method(), req.postDataJSON() ?? {})
    await route.fulfill({
      status: result.status,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
      headers,
    })
  })
  return { backend, errors }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}
test('reminder workflow: absolute Task, relative deadline, edit, cancel and immutable history', async ({
  page,
}, testInfo) => {
  const state = await setup(page)
  await page.goto('/tasks/1')
  await page.getByRole('link', { name: 'Нагадування для завдання', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Нове нагадування', exact: true })).toBeVisible()
  await expect(page.getByLabel('Завдання-ціль', { exact: true })).toHaveValue('1')
  await page.getByLabel('Час нагадування', { exact: true }).fill('2026-11-12T11:00:12')
  await page.getByRole('button', { name: 'Створити нагадування', exact: true }).click()
  await expect(page).toHaveURL(/\/reminders\/10$/)
  expect(state.backend.reminders.find((r) => r.id === 10)).toMatchObject({
    task_id: 1,
    anchor: null,
    trigger_at: '2026-11-12T09:00:12Z',
  })
  await page.reload()
  await expect(page.getByText('Заплановане', { exact: true })).toBeVisible()
  await page.goto('/reminders/new?task_id=1')
  await page.getByLabel('Режим нагадування', { exact: true }).selectOption('relative')
  await page.getByLabel('Зміщення, хвилини', { exact: true }).fill('-30')
  await page.getByRole('button', { name: 'Створити нагадування', exact: true }).click()
  await expect(page).toHaveURL(/\/reminders\/11$/)
  expect(
    state.backend.requests.filter((r) => r.path === '/api/reminders' && r.method === 'POST')[1]
      ?.body,
  ).toEqual({ task_id: 1, message: null, anchor: 'task_deadline', offset_minutes: -30 })
  await page.getByRole('link', { name: 'Редагувати нагадування', exact: true }).click()
  await page.getByLabel('Зміщення, хвилини', { exact: true }).fill('0')
  await page.getByLabel('Повідомлення нагадування', { exact: true }).fill('Повторити розділ')
  await page.getByRole('button', { name: 'Зберегти нагадування', exact: true }).click()
  await expect(page).toHaveURL(/\/reminders\/11$/)
  expect(state.backend.requests.find((r) => r.method === 'PATCH')?.body).toEqual({
    message: 'Повторити розділ',
    offset_minutes: 0,
  })
  await page.getByRole('button', { name: 'Скасувати нагадування', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.backend.requests.filter((r) => r.path.endsWith('/cancel'))).toHaveLength(0)
  await page.getByRole('button', { name: 'Скасувати нагадування', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Підтвердити скасування', exact: true })
    .click()
  await expect(page.getByText('Скасоване', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Редагувати нагадування', exact: true })).toHaveCount(
    0,
  )
  await page.getByRole('link', { name: '← Усі нагадування', exact: true }).click()
  await page.getByLabel('Статус нагадувань', { exact: true }).selectOption('sent')
  await page.getByRole('button', { name: 'Застосувати фільтри', exact: true }).click()
  await expect(page.locator('.reminder-card')).toHaveCount(1)
  await expect(page.locator('.reminder-card').getByText('Надіслане', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Нагадування №2', exact: true }).click()
  await expect(page.getByText(/Це історичний запис/)).toBeVisible()
  await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click()
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('reminder-history-dark.png'), fullPage: true })
  expect(state.errors).toEqual([])
})
test('inbox explicitly reads server notifications and opens historical work/session links', async ({
  page,
}) => {
  const state = await setup(page)
  state.backend.notifications[1]!.study_session_id = 1
  await page.goto('/')
  await page.getByRole('main').getByRole('link', { name: 'Вхідні сповіщення', exact: true }).click()
  await expect(page.locator('.notification-card')).toHaveCount(2)
  expect(state.backend.requests.filter((r) => r.path.endsWith('/read'))).toHaveLength(0)
  await page.getByRole('button', { name: 'Непрочитані', exact: true }).click()
  await expect(page.locator('.notification-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Позначити прочитаним', exact: true }).click()
  await expect(page.getByText('Сповіщень за цим фільтром немає', { exact: true })).toBeVisible()
  expect(state.backend.notifications[0]!.read_at).toBe('2026-10-30T12:00:00Z')
  expect(state.backend.requests.filter((r) => r.path.endsWith('/read'))).toHaveLength(1)
  await page.getByRole('button', { name: 'Усі сповіщення', exact: true }).click()
  await expect(page.locator('.notification-card')).toHaveCount(2)
  await page.getByRole('link', { name: 'Завдання №1', exact: true }).click()
  await expect(page).toHaveURL(/\/tasks\/1$/)
  await page.goBack()
  await page.getByRole('link', { name: 'Навчальна сесія №1', exact: true }).click()
  await expect(page).toHaveURL(/\/planning\/sessions\/1$/)
  await expect(page.getByRole('link', { name: 'Нагадування для сесії', exact: true })).toBeVisible()
  await noOverflow(page)
  expect(state.errors).toEqual([])
})
test('progress, zero-day trends and equal-period comparison remain accessible in both themes', async ({
  page,
}, testInfo) => {
  const state = await setup(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'Повна статистика', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Поточний стан роботи — за весь час', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Невідоме не дорівнює нулю/)).toBeVisible()
  await page.getByLabel('Початок періоду', { exact: true }).fill('2026-10-24')
  await page.getByLabel('Кінець періоду', { exact: true }).fill('2026-10-30')
  await page.getByRole('button', { name: 'Показати звіт', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Статистика та звіти', exact: true })
    .getByRole('link', { name: 'Щоденні тренди', exact: true })
    .click()
  await expect(page.locator('.daily-report')).toHaveCount(7)
  const chart = page.locator('.metric-chart').first()
  await expect(chart.locator('tbody tr')).toHaveCount(7)
  await expect(chart.locator('tbody tr').nth(1).locator('td')).toHaveText('0')
  await page.locator('.daily-report').nth(1).locator('summary').click()
  await expect(
    page.locator('.daily-report').nth(1).getByText('Пропущено', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Статистика та звіти', exact: true })
    .getByRole('link', { name: 'Порівняння періодів', exact: true })
    .click()
  const baseline = page.getByRole('group', { name: 'Базовий період', exact: true }),
    current = page.getByRole('group', { name: 'Поточний період порівняння', exact: true })
  await baseline.getByLabel('Початок періоду', { exact: true }).fill('2026-10-17')
  await baseline.getByLabel('Кінець періоду', { exact: true }).fill('2026-10-23')
  await current.getByLabel('Початок періоду', { exact: true }).fill('2026-10-24')
  await current.getByLabel('Кінець періоду', { exact: true }).fill('2026-10-30')
  await page.getByRole('button', { name: 'Порівняти періоди', exact: true }).click()
  await expect(page.getByText(/Порівняння фактичної тривалості неповне/)).toBeVisible()
  await expect(
    page
      .locator('.comparison-values dd')
      .filter({ hasText: /^Різниця:\s*-2$/ })
      .first(),
  ).toBeVisible()
  await expect(page.getByText('Збільшилося', { exact: true })).toBeVisible()
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
  }
  await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: testInfo.outputPath('comparison-dark.png'), fullPage: true })
  await page.setViewportSize(testInfo.project.use.viewport ?? { width: 390, height: 844 })
  await page.screenshot({
    path: testInfo.outputPath('comparison-project-viewport.png'),
    fullPage: true,
  })
  await page
    .getByRole('navigation', { name: 'Основна навігація', exact: true })
    .filter({ visible: true })
    .getByRole('link', { name: 'Вхідні', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Вхідні сповіщення', exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})
