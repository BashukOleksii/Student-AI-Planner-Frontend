import { expect, test, type Page } from '@playwright/test'
import { task, page as taskPage } from '../../tests/fixtures'
import { activityBackend } from '../../tests/helpers/activityBackend'
import { actionFixture, aiBackend, messageFixture } from '../../tests/helpers/aiBackend'
import { importRowFixture, scheduleBackend } from '../../tests/helpers/scheduleBackend'
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
  const reads: string[] = []
  await page.route(/http:\/\/localhost:8000\/api\/tasks(?:\?.*)?$/, async (route) => {
    expect(route.request().method()).toBe('GET')
    const params = new URL(route.request().url()).searchParams
    const status = params.get('status')
    const current = Number(params.get('page') ?? 1)
    const size = Number(params.get('per_page') ?? 15)
    reads.push(`${status}:${current}`)
    const data =
      status === 'missed'
        ? []
        : Array.from({ length: size }, (_, index) => {
            const id = (current - 1) * size + index + 1
            return {
              ...task,
              id,
              title: `Колекція ${Math.floor((id - 1) / 15) + 1}: ${((id - 1) % 15) + 1}`,
            }
          })
    const result = taskPage(data, current, status === 'missed' ? 1 : Math.ceil(5000 / size))
    Object.assign(result.meta, { total: status === 'missed' ? 0 : 5000, per_page: size })
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
  await expect(page.getByRole('link', { name: 'Колекція 2: 1', exact: true })).toBeVisible()
  expect(reads.sort()).toEqual(['missed:1', 'missed:1', 'pending:1', 'pending:1'])
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
