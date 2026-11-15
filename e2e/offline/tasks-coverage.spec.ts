import { expect, test, type Page } from '@playwright/test'
import { task } from '../../tests/fixtures'
import { f2Backend } from '../../tests/helpers/f2Backend'

async function taskBackend(page: Page, loseCreateResponse = false) {
  const base = f2Backend()
  const reads: URL[] = []
  base.tasks.splice(
    0,
    base.tasks.length,
    ...Array.from({ length: 16 }, (_, index) => ({
      ...task,
      id: index + 101,
      title: `Завдання ${index + 1}`,
    })),
  )
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'tasks%3Dcsrf', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/tasks')
      reads.push(new URL(request.url()))
    if (request.method() !== 'GET') expect(request.headers()['x-xsrf-token']).toBe('tasks=csrf')
    const result = base.handle(request.url(), request.method(), request.postDataJSON() ?? {})
    if (
      loseCreateResponse &&
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/tasks'
    )
      return route.abort('failed')
    return route.fulfill({
      status: result.status,
      headers,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
    })
  })
  return {
    tasks: base.tasks,
    reads,
    get writes() {
      return base.requests.filter((r) => r.method !== 'GET').map((r) => r.path)
    },
    requests: base.requests,
  }
}

test('deadline range and active pagination recover after completing the final task on page two', async ({
  page,
}) => {
  const backend = await taskBackend(page)
  await page.goto('/tasks')
  await page.locator('.filters-disclosure > summary').click()
  await page.locator('#deadline-from-filter').fill('2026-11-10T12:30')
  await page.locator('#deadline-filter').fill('2026-11-13T12:30')
  await page.getByRole('button', { name: 'Застосувати', exact: true }).click()
  await expect
    .poll(() => Object.fromEntries(backend.reads.at(-1)!.searchParams))
    .toMatchObject({
      deadline_from: '2026-11-10T10:30:00Z',
      deadline_to: '2026-11-13T10:30:00Z',
      page: '1',
    })
  await expect(page.locator('.task-row')).toHaveCount(15)
  await page.getByRole('button', { name: 'Далі →', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Завдання 16', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Завершити', exact: true }).click()
  await page
    .locator('.completion-prompt')
    .getByRole('button', { name: 'Підтвердити завершення', exact: true })
    .click()
  await expect(page.getByRole('link', { name: 'Завдання 1', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Завдання 16', exact: true })).toHaveCount(0)
  expect(backend.writes).toEqual(['/api/tasks/116/complete'])
  expect(backend.tasks.find((t) => t.id === 116)?.status).toBe('completed')
})

test('lost Task creation preserves the draft and reconciles the one saved record through reads', async ({
  page,
}) => {
  const backend = await taskBackend(page, true)
  await page.goto('/tasks/new')
  await page
    .getByLabel('Назва завдання *', { exact: true })
    .fill('Збережене попри втрату відповіді')
  await page.getByRole('button', { name: 'Створити завдання', exact: true }).click()
  await expect(
    page.getByText('Результат збереження потребує перевірки.', { exact: false }),
  ).toBeVisible()
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
  const before = backend.requests.length
  await page.getByRole('button', { name: 'Перевірити актуальні завдання', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Продовжити з цим завданням', exact: true }),
  ).toBeVisible()
  expect(backend.requests.slice(before).every((r) => r.method === 'GET')).toBe(true)
  expect(backend.tasks.filter((t) => t.title === 'Збережене попри втрату відповіді')).toHaveLength(
    1,
  )
  expect(backend.writes).toEqual(['/api/tasks'])
})
