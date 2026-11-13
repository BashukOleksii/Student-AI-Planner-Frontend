import { expect, test, type Page } from '@playwright/test'
import { activityBackend, progressFixture } from '../tests/helpers/activityBackend'
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
  await expect(page.getByLabel('Яке завдання', { exact: true })).toHaveValue('1')
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
  await page.getByLabel('Коли нагадати', { exact: true }).selectOption('relative')
  await page.getByLabel('За скільки хвилин до або після', { exact: true }).fill('-30')
  await page.getByRole('button', { name: 'Створити нагадування', exact: true }).click()
  await expect(page).toHaveURL(/\/reminders\/11$/)
  expect(
    state.backend.requests.filter((r) => r.path === '/api/reminders' && r.method === 'POST')[1]
      ?.body,
  ).toEqual({ task_id: 1, message: null, anchor: 'task_deadline', offset_minutes: -30 })
  await page.getByRole('link', { name: 'Редагувати нагадування', exact: true }).click()
  await page.getByLabel('За скільки хвилин до або після', { exact: true }).fill('0')
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
  await page.locator('.reminder-card a[href="/reminders/2"]').click()
  await expect(page.getByText(/Це збережена історія/)).toBeVisible()
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
  if (await page.locator('.mobile-nav').isVisible())
    await page.locator('.mobile-nav summary').click()
  await page
    .locator('.app-navigation:visible')
    .getByRole('link', { name: 'Вхідні', exact: true })
    .click()
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
  await page.locator('.notification-card a[href="/tasks/1"]').first().click()
  await expect(page).toHaveURL(/\/tasks\/1$/)
  await page.goBack()
  await page.getByRole('link', { name: 'Переглянути навчальну сесію', exact: true }).click()
  await expect(page).toHaveURL(/\/planning\/sessions\/1$/)
  await expect(page.getByRole('link', { name: 'Нагадування для сесії', exact: true })).toBeVisible()
  await noOverflow(page)
  expect(state.errors).toEqual([])
})
test('progress, zero-day trends and comparison share one responsive page in both themes', async ({
  page,
}, testInfo) => {
  const state = await setup(page)
  const report = progressFixture()
  report.subject_workload_in_period[0]!.subject_name = `Математика: ${'ДовгаНазва'.repeat(12)}`
  state.backend.progressOverride = report
  await page.goto('/statistics')
  const root = page.locator('.progress-page')
  for (const title of [
    'Огляд прогресу',
    'Статистика за предметами',
    'Тренди',
    'Порівняння періодів',
  ])
    await expect(root.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(root.locator('details,table,[role="tab"]')).toHaveCount(0)
  await expect(
    page.getByRole('navigation', { name: 'Статистика та звіти', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Останні сім днів', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Поточний тиждень', exact: true })).toHaveCount(0)
  await expect(root.locator('.progress-metric')).toHaveCount(6)
  await expect(root.locator('.subject-workload')).toHaveCount(3)
  await expect(root.locator('.subject-workload').last().getByRole('heading')).toHaveText(
    'Без прив’язки до предмета',
  )
  await expect(root.locator('.donut-total strong')).toHaveText('150')
  await expect(root.locator('.subject-unknown')).toHaveText('Без записаного часу: 1')
  await expect(root.locator('.trend-card')).toHaveCount(4)
  await expect(root.locator('.trend-card').first().locator('.daily-point')).toHaveCount(7)
  await expect(root.locator('.trend-card').first().locator('.daily-point').nth(1)).toHaveAttribute(
    'aria-label',
    /: 0 хв$/,
  )
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, theme)
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await noOverflow(page)
    }
  }
  await page.setViewportSize(testInfo.project.use.viewport ?? { width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('progress-cards-dark.png'), fullPage: true })
  const overviewForm = root.locator('.report-range-form')
  await overviewForm.getByLabel('Початок періоду', { exact: true }).fill('2026-10-24')
  await overviewForm.getByLabel('Кінець періоду', { exact: true }).fill('2026-10-30')
  await overviewForm.getByRole('button', { name: 'Показати звіт', exact: true }).click()
  await expect
    .poll(
      () =>
        state.backend.requests.filter((r) => r.path === '/api/statistics/progress').at(-1)?.search,
    )
    .toBe('?start_date=2026-10-24&end_date=2026-10-30')
  await expect
    .poll(
      () =>
        state.backend.requests.filter((r) => r.path === '/api/statistics/trends').at(-1)?.search,
    )
    .toBe('?start_date=2026-10-24&end_date=2026-10-30')
  const comparison = root.locator('.progress-comparison')
  const baseline = comparison.getByRole('group', { name: 'Період A', exact: true }),
    current = comparison.getByRole('group', { name: 'Період B', exact: true })
  await baseline.getByLabel('Початок періоду', { exact: true }).fill('2026-10-17')
  await baseline.getByLabel('Кінець періоду', { exact: true }).fill('2026-10-23')
  await current.getByLabel('Початок періоду', { exact: true }).fill('2026-10-24')
  await current.getByLabel('Кінець періоду', { exact: true }).fill('2026-10-30')
  await comparison.getByRole('button', { name: 'Порівняти періоди', exact: true }).click()
  await expect(comparison.locator('.comparison-card')).toHaveCount(6)
  await expect(comparison.locator('.comparison-card').first()).toContainText('Різниця: -2')
  await expect(comparison.locator('.comparison-card').nth(4)).toContainText('Різниця: -20 хв')
  await expect(comparison.locator('.comparison-unknown')).toContainText('лише записані хвилини')
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
  }
  await page.setViewportSize(testInfo.project.use.viewport ?? { width: 390, height: 844 })
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light'
  })
  await page.screenshot({ path: testInfo.outputPath('progress-cards-light.png'), fullPage: true })
  expect(
    state.backend.requests
      .filter((r) => r.path.startsWith('/api/statistics/'))
      .every((r) => r.method === 'GET'),
  ).toBe(true)
  expect(state.errors).toEqual([])
})

test('progress keeps empty reports, subject pagination and independent error recovery usable', async ({
  page,
}) => {
  const state = await setup(page)
  state.backend.emptyReports = true
  await page.goto('/statistics')
  await expect(page.getByText('Активність ще не зафіксовано', { exact: true })).toBeVisible()
  await expect(page.locator('.donut-chart')).toHaveCount(0)
  await expect(page.locator('.comparison-card .comparison-delta')).toHaveText(
    Array(6).fill('→ Без змін'),
  )
  state.backend.emptyReports = false
  const report = progressFixture()
  report.subject_workload_in_period = Array.from({ length: 7 }, (_, i) => ({
    ...report.subject_workload_in_period[0]!,
    subject_id: i + 1,
    subject_name: `Предмет ${i + 1}`,
  }))
  state.backend.progressOverride = report
  state.backend.failure = { path: /statistics\/trends$/, method: 'GET', status: 503 }
  await page.reload()
  await expect(page.locator('.subject-workload')).toHaveCount(5)
  await expect(page.locator('.comparison-card')).toHaveCount(6)
  await page.getByRole('button', { name: 'Наступна', exact: true }).click()
  await expect(page.locator('.subject-workload')).toHaveCount(2)
  await expect(page.locator('.subject-workload').first()).toContainText('Предмет 6')
  await expect(page.locator('.donut-total strong')).toHaveText('420')
  await expect(page.locator('.progress-trends .trend-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Повторити завантаження трендів', exact: true }).click()
  await expect(page.locator('.progress-trends .trend-card')).toHaveCount(4)
  await noOverflow(page)
})
