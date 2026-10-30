import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { activityBackend } from '../tests/helpers/activityBackend'
import { scheduleBackend, importRowFixture } from '../tests/helpers/scheduleBackend'
import { aiBackend, actionFixture } from '../tests/helpers/aiBackend'
async function setup(page: Page, publicPage = false) {
  const activity = activityBackend(),
    schedule = scheduleBackend(),
    ai = aiBackend()
  ai.addConversation()
  ai.actions.push(actionFixture('propose_adaptive_replanning'))
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (publicPage && url.pathname === '/api/profile')
      return route.fulfill({ status: 401, json: { message: 'Unauthenticated.' }, headers })
    const backend = url.pathname.startsWith('/api/ai/')
      ? ai
      : /^\/api\/(schedule|lessons)/.test(url.pathname)
        ? schedule
        : activity
    const result = backend.handle(request.url(), request.method(), request.postDataJSON() ?? {})
    await route.fulfill({
      status: result.status,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
      headers,
    })
  })
  return { activity, schedule, ai }
}
async function audit(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page.getByText('Завантажуємо дані…', { exact: true })).toHaveCount(0)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme
    }, theme)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      `${path} ${theme}`,
    ).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${path} overflow`,
    ).toBe(true)
  }
}
for (const [name, paths] of Object.entries({
  'public forms': ['/login', '/register'],
  'academic, schedule and work': [
    '/',
    '/academic/subjects',
    '/schedule',
    '/schedule/lessons/new',
    '/schedule/import',
    '/schedule/imports/40',
    '/tasks',
    '/tasks/1',
  ],
  'planning and AI': [
    '/planning',
    '/planning/preferences',
    '/planning/availability',
    '/planning/free-time',
    '/planning/preview',
    '/planning/replanning',
    '/planning/sessions',
    '/planning/sessions/1',
    '/ai/conversations/1',
  ],
  'reminders, reports and profile': [
    '/reminders',
    '/reminders/new?task_id=1',
    '/reminders/1',
    '/inbox',
    '/statistics',
    '/statistics/trends',
    '/statistics/comparison',
    '/profile',
  ],
}))
  test(`WCAG automated audit: ${name}`, async ({ page }, testInfo) => {
    test.setTimeout(180000)
    await setup(page, name === 'public forms')
    for (const path of paths) await audit(page, path)
    await page.screenshot({ path: testInfo.outputPath('audit-final-screen.png'), fullPage: true })
  })
test('keyboard dialog focus, reduced motion, text resize and browser history', async ({ page }) => {
  await setup(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/reminders/1')
  const open = page.getByRole('button', { name: 'Скасувати нагадування', exact: true })
  await open.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const violations = await new AxeBuilder({ page })
    .withTags(['wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.violations).toEqual([])
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(open).toBeFocused()
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: '← Усі нагадування', exact: true }).click()
  await expect(page).toHaveURL(/\/reminders$/)
  await page.goBack()
  await expect(
    page.getByRole('heading', { name: 'Нагадування №1', exact: true, level: 1 }),
  ).toBeVisible()
})

test('large persisted preview records rendering cost without changing backend rows', async ({
  page,
}, testInfo) => {
  const { schedule } = await setup(page)
  const batch = schedule.batches[0]!
  batch.rows = Array.from({ length: 600 }, (_, i) => importRowFixture(i + 1))
  batch.status = 'validated'
  batch.total_rows = 600
  batch.valid_rows = 600
  batch.invalid_rows = 0
  batch.duplicate_rows = 0
  const started = Date.now()
  await page.goto('/schedule/imports/40')
  await expect(page.locator('.import-row')).toHaveCount(600)
  const metrics = {
    rows: 600,
    dom_nodes: await page.locator('*').count(),
    load_ms: Date.now() - started,
  }
  await testInfo.attach('large-preview-metrics', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  })
})
