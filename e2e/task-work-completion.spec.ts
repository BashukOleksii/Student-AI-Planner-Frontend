import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { workCompletionBackend } from '../tests/helpers/workCompletionBackend'
import { sessionFixture } from '../tests/helpers/planningBackend'

async function mockApi(page: Page, backend: ReturnType<typeof workCompletionBackend>) {
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00Z'))
  const writes: { path: string; body: unknown }[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = request.postDataJSON() ?? {}
    if (request.method() !== 'GET') writes.push({ path: new URL(request.url()).pathname, body })
    const response = backend.handle(request.url(), request.method(), body, request.headers())
    await route.fulfill({ status: response.status, json: response.body ?? {}, headers })
  })
  return { writes, errors }
}

test('task filters, one combined completion and completed read-only details on mobile and desktop', async ({
  page,
}, testInfo) => {
  const backend = workCompletionBackend()
  backend.sessions = [sessionFixture(7)]
  const { writes, errors } = await mockApi(page, backend)
  await page.goto('/tasks')
  await expect(page.getByRole('button', { name: 'Активні', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: /Інші дії/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Завершити', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Завершення роботи' })
  await expect(dialog.locator('.card')).toHaveCount(2)
  await expect(dialog.locator('input[type="radio"]').first()).not.toBeChecked()
  await expect(dialog.locator('.completion-search')).not.toHaveAttribute('open', '')
  await dialog.locator('input[type="radio"][value="7"]').check()
  await expect(dialog.getByLabel('Фактична тривалість, хв', { exact: true })).toHaveValue('')
  await expect(
    dialog.getByRole('button', { name: 'Завершити сесію та завдання', exact: true }),
  ).toBeEnabled()
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value
    }, theme)
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      )
    }
    await page.setViewportSize(testInfo.project.use.viewport ?? { width: 390, height: 844 })
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(audit.violations).toEqual([])
  }
  await page.screenshot({ path: testInfo.outputPath('work-completion-dialog.png'), fullPage: true })
  await dialog.getByLabel('Фактична тривалість, хв', { exact: true }).fill('19')
  await dialog.getByRole('button', { name: 'Завершити сесію та завдання', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(writes).toEqual([
    {
      path: '/api/study-sessions/7/complete',
      body: { actual_minutes: 19, complete_work: true, completion_token: 'reviewed-state' },
    },
  ])
  await expect(page.locator('.task-row')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Активні', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Завершені', exact: true }).click()
  await expect(page.locator('.task-row')).toHaveCount(1)
  await expect(page.locator('.task-row')).not.toContainText('Редагувати')
  await page.getByRole('link', { name: 'Переглянути', exact: true }).click()
  await expect(page.locator('.task-readonly')).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Редагувати/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('older period search identifies the subtask and keeps the work-only action independent', async ({
  page,
}, testInfo) => {
  const backend = workCompletionBackend()
  backend.base.children = [
    {
      id: 4,
      task_id: 1,
      title: 'Розв’язати приклад',
      description: null,
      deadline_at: null,
      estimated_minutes: 30,
      position: 1,
      status: 'pending',
      completed_at: null,
    },
  ]
  backend.sessions = [
    {
      ...sessionFixture(42),
      subtask_id: 4,
      starts_at: '2026-09-10T09:00:00Z',
      ends_at: '2026-09-10T10:00:00Z',
      duration_seconds: 3600,
    },
    {
      ...sessionFixture(43),
      subtask_id: 4,
      starts_at: '2030-11-13T11:00:00Z',
      ends_at: '2030-11-13T12:00:00Z',
    },
  ]
  const { writes, errors } = await mockApi(page, backend)
  await page.goto('/tasks')
  await page.getByRole('button', { name: 'Завершити', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Завершення роботи', exact: true })
  await expect(dialog.locator('.completion-empty')).toHaveText(
    'За цей період немає сесій, доступних для завершення',
  )
  await expect(
    dialog.getByRole('button', { name: 'Завершити тільки завдання', exact: true }),
  ).toBeEnabled()
  await expect(dialog.locator('.completion-work-only')).toContainText('Майбутніх сесій: 1')
  await dialog.getByText('Не бачиш потрібної сесії?', { exact: true }).click()
  await dialog.getByLabel('Початок періоду', { exact: true }).fill('2026-09-01')
  await dialog.getByLabel('Кінець періоду', { exact: true }).fill('2026-09-30')
  await dialog.getByRole('button', { name: 'Знайти сесії', exact: true }).click()
  await expect(dialog.locator('input[type="radio"][value="42"]')).toBeVisible()
  await expect(dialog.locator('input[type="radio"][value="42"]')).not.toBeChecked()
  await dialog.locator('input[type="radio"][value="42"]').check()
  await expect(dialog.locator('.completion-selected')).toContainText(
    'Буде завершено підзавдання «Розв’язати приклад»',
  )
  await expect(dialog.getByLabel('Фактична тривалість, хв', { exact: true })).toHaveValue('')
  await expect(
    dialog.getByRole('button', { name: 'Завершити тільки завдання', exact: true }),
  ).toBeEnabled()
  await dialog.getByLabel('Фактична тривалість, хв', { exact: true }).fill('13')
  await page.screenshot({ path: testInfo.outputPath('older-subtask-session.png'), fullPage: true })
  page.once('dialog', async (confirmation) => {
    expect(confirmation.message()).toContain('1')
    await confirmation.accept()
  })
  await dialog.getByRole('button', { name: 'Завершити сесію та підзавдання', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(writes).toEqual([
    {
      path: '/api/study-sessions/42/complete',
      body: { actual_minutes: 13, complete_work: true, completion_token: 'reviewed-state' },
    },
  ])
  expect(backend.base.tasks[0]!.status).toBe('pending')
  expect(backend.base.children[0]!.status).toBe('completed')
  expect(backend.sessions[1]!.status).toBe('cancelled')
  expect(errors).toEqual([])
})
