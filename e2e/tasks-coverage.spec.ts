import { expect, test, type Page } from '@playwright/test'
import type { Task } from '../src/types/api'
import { user, task, page as taskPage } from '../tests/fixtures'

async function taskBackend(page: Page, loseCreateResponse = false) {
  const tasks: Task[] = Array.from({ length: 16 }, (_, i) => ({
    ...task,
    id: i + 1,
    title: `Завдання ${i + 1}`,
  }))
  const writes: string[] = []
  const reads: string[] = []
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method(),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      }
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const reply = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers })
    if (url.pathname === '/api/profile') return reply({ data: user })
    if (url.pathname === '/api/subjects') return reply({ data: [] })
    if (method === 'GET' && url.pathname === '/api/tasks') {
      reads.push(url.search)
      const status = url.searchParams.get('status'),
        from = url.searchParams.get('deadline_from'),
        to = url.searchParams.get('deadline_to'),
        current = Number(url.searchParams.get('page') ?? 1),
        filtered = tasks.filter(
          (t) =>
            (!status || t.status === status) &&
            (!from || (!!t.deadline_at && t.deadline_at >= from)) &&
            (!to || (!!t.deadline_at && t.deadline_at <= to)),
        ),
        response = taskPage(
          filtered.slice((current - 1) * 15, current * 15),
          current,
          Math.max(1, Math.ceil(filtered.length / 15)),
        )
      response.meta.total = filtered.length
      return reply(response)
    }
    if (url.pathname === '/api/tasks' && method === 'POST') {
      writes.push(url.pathname)
      tasks.push({ ...task, ...request.postDataJSON(), id: 17 })
      if (loseCreateResponse) return route.abort('failed')
      return reply({ data: tasks.at(-1) }, 201)
    }
    const match = url.pathname.match(/^\/api\/tasks\/(\d+)\/complete$/)
    if (match && method === 'POST') {
      writes.push(url.pathname)
      const found = tasks.find((t) => t.id === Number(match[1]))!
      found.status = 'completed'
      return reply({ data: found })
    }
    throw new Error(`Unexpected mocked request ${method} ${url.pathname}`)
  })
  return { tasks, writes, reads }
}

test('deadline range and filtered pagination recover after completing the last task', async ({
  page,
}) => {
  const backend = await taskBackend(page)
  await page.goto('/tasks')
  await page.getByLabel('Статус', { exact: true }).selectOption('pending')
  await page.locator('.filters-disclosure > summary').click()
  await page.locator('#deadline-from-filter').fill('2026-11-10T12:30')
  await page.locator('#deadline-filter').fill('2026-11-13T12:30')
  await page.getByRole('button', { name: 'Застосувати', exact: true }).click()
  await expect.poll(() => backend.reads.at(-1)).toContain('deadline_from=2026-11-10T10%3A30%3A00Z')
  await page.getByRole('button', { name: 'Далі →', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Завдання 16', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Завершити', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Завдання 1', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Завдання 16', exact: true })).toHaveCount(0)
  expect(backend.writes).toEqual(['/api/tasks/16/complete'])
  expect(backend.reads.at(-1)).toContain('page=1')
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
  }
})

test('lost task creation response preserves the draft and permits read-only reconciliation', async ({
  page,
}) => {
  const backend = await taskBackend(page, true)
  await page.goto('/tasks/new')
  await page
    .getByLabel('Назва завдання *', { exact: true })
    .fill('Збережене попри втрату відповіді')
  await page.getByRole('button', { name: 'Створити завдання', exact: true }).click()
  await expect(page.getByText('Результат збереження невідомий', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Назва завдання *', { exact: true })).toHaveValue(
    'Збережене попри втрату відповіді',
  )
  await expect(page.getByRole('button', { name: 'Створити завдання', exact: true })).toBeDisabled()
  await page
    .locator('form')
    .evaluate((form) =>
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
  expect(backend.writes).toEqual(['/api/tasks'])
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('link', { name: 'Перевірити актуальні завдання →' }).click()
  await expect(page.getByRole('heading', { name: 'Завдання', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Далі →', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Збережене попри втрату відповіді', exact: true }),
  ).toBeVisible()
  expect(backend.tasks.filter((t) => t.title === 'Збережене попри втрату відповіді')).toHaveLength(
    1,
  )
  expect(backend.writes).toHaveLength(1)
})
