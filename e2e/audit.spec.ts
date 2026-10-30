import { expect, test, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { activityBackend } from '../tests/helpers/activityBackend'
import { scheduleBackend, importRowFixture } from '../tests/helpers/scheduleBackend'
import { aiBackend, actionFixture, messageFixture } from '../tests/helpers/aiBackend'
import { task, page as taskPage } from '../tests/fixtures'
const visualPaths = new Set([
  '/login',
  '/register',
  '/',
  '/schedule',
  '/tasks',
  '/planning/preview',
  '/ai/conversations/1',
  '/reminders',
  '/statistics',
  '/schedule/import',
  '/profile',
])
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
async function audit(page: Page, path: string, testInfo: TestInfo) {
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
    if (visualPaths.has(path))
      await page.screenshot({
        path: testInfo.outputPath(`visual-${path.replace(/\W+/g, '-')}-${theme}.png`),
        fullPage: true,
      })
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
    for (const path of paths) await audit(page, path, testInfo)
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

test('large task collection stays paginated without duplicate navigation requests', async ({
  page,
}) => {
  await setup(page)
  const pages: number[] = []
  await page.route(/http:\/\/localhost:8000\/api\/tasks(?:\?.*)?$/, async (route) => {
    expect(route.request().method()).toBe('GET')
    const number = Number(new URL(route.request().url()).searchParams.get('page') ?? 1)
    pages.push(number)
    const rows = Array.from({ length: 15 }, (_, index) => ({
      ...task,
      id: (number - 1) * 15 + index + 1,
      title: `Колекція ${number}: ${index + 1}`,
    }))
    const result = taskPage(rows, number, 334)
    result.meta.total = 5000
    result.meta.from = (number - 1) * 15 + 1
    result.meta.to = number * 15
    await route.fulfill({
      json: result,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
      },
    })
  })
  await page.goto('/tasks')
  await expect(page.locator('.task-row')).toHaveCount(15)
  await expect(page.getByText('1 / 334 · Усього 5000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Далі →', exact: true }).click()
  await expect(page.getByText('2 / 334 · Усього 5000', { exact: true })).toBeVisible()
  await expect(page.locator('.task-row')).toHaveCount(15)
  await expect(page.getByRole('link', { name: 'Колекція 2: 1', exact: true })).toBeVisible()
  expect(pages).toEqual([1, 2])
})

test('long AI history loads newest and requested older pages without provider calls', async ({
  page,
}, testInfo) => {
  const { ai } = await setup(page)
  ai.messages.set(
    1,
    Array.from({ length: 2000 }, (_, index) =>
      messageFixture(index + 1, `Запис ${index + 1}. ${'Збережена відповідь. '.repeat(40)}`),
    ),
  )
  const historyPages: number[] = []
  const writes: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://localhost:8000') return
    if (request.method() !== 'GET' && request.method() !== 'OPTIONS') writes.push(url.pathname)
    if (url.pathname === '/api/ai/conversations/1/messages')
      historyPages.push(Number(url.searchParams.get('page') ?? 1))
  })
  const started = Date.now()
  await page.goto('/ai/conversations/1')
  await expect(page.locator('.ai-message')).toHaveCount(20)
  await expect(page.locator('.ai-message').last()).toContainText('Запис 2000.')
  await page.getByRole('button', { name: 'Завантажити старіші повідомлення', exact: true }).click()
  await expect(page.locator('.ai-message')).toHaveCount(40)
  await expect(page.locator('.ai-message').first()).toContainText('Запис 1961.')
  await page.reload()
  await expect(page.locator('.ai-message')).toHaveCount(20)
  expect(historyPages).toEqual([1, 100, 99, 1, 100])
  expect(writes).toEqual([])
  await testInfo.attach('long-history-metrics', {
    body: JSON.stringify({
      stored_messages: 2000,
      rendered_messages: 20,
      load_and_reload_ms: Date.now() - started,
    }),
    contentType: 'application/json',
  })
})
