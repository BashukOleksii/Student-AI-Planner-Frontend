import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { workCompletionBackend } from '../tests/helpers/workCompletionBackend'
import { sessionFixture } from '../tests/helpers/planningBackend'

async function mockApi(page: Page, backend: ReturnType<typeof workCompletionBackend>) {
  await page.clock.setFixedTime(new Date('2026-11-13T10:00:00Z'))
  const writes: { path: string; body: unknown }[] = [],
    errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', async (dialog) => {
    errors.push('Unexpected modal confirmation')
    await dialog.dismiss()
  })
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request(),
      headers = {
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
for (const kind of ['task', 'subtask'] as const) {
  test(`inline ${kind} completion: no modal, Back, error and server consent`, async ({
    page,
  }, testInfo) => {
    const backend = workCompletionBackend()
    if (kind === 'subtask')
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
    backend.sessions = [{ ...sessionFixture(1), subtask_id: kind === 'subtask' ? 4 : null }]
    const { writes, errors } = await mockApi(page, backend)
    await page.goto(kind === 'task' ? '/tasks' : '/tasks/1')
    const start = async () => {
      if (kind === 'task')
        await page.getByRole('button', { name: 'Завершити', exact: true }).click()
      else
        await page
          .getByRole('checkbox', { name: 'Виконано: Розв’язати приклад', exact: true })
          .click()
    }
    await start()
    const panel = page.getByRole('region', {
      name: `Завершення: ${kind === 'task' ? 'Прочитати розділ' : 'Розв’язати приклад'}`,
      exact: true,
    })
    await expect(
      panel.getByRole('button', { name: 'Підтвердити завершення', exact: true }),
    ).toBeEnabled()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(panel.locator('input,select,details')).toHaveCount(0)
    await expect(panel.locator('.completion-consequence')).toHaveCount(0)
    expect(writes).toEqual([])
    await panel.getByRole('button', { name: 'Назад', exact: true }).click()
    await expect(panel).toHaveCount(0)
    expect(writes).toEqual([])
    backend.sessions.push({
      ...sessionFixture(2),
      subtask_id: kind === 'subtask' ? 4 : null,
      starts_at: '2030-01-01T09:00:00Z',
      ends_at: '2030-01-01T09:30:00Z',
    })
    await start()
    await expect(panel).toContainText(
      'Майбутні заплановані сесії буде скасовано, а час у плані звільниться.',
    )
    await expect(panel).toContainText('Сесій: 1')
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        )
      }
    }
    await page.setViewportSize(testInfo.project.use.viewport ?? { width: 390, height: 844 })
    const audit = await new AxeBuilder({ page }).include('.completion-prompt').analyze()
    expect(audit.violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('inline-completion.png'), fullPage: true })
    backend.failure = { path: /\/complete$/, method: 'POST', status: 503 }
    await panel.getByRole('button', { name: 'Підтвердити завершення', exact: true }).click()
    await expect(panel.getByRole('alert').first()).toBeVisible()
    expect(backend.base.tasks[0]!.status).toBe('pending')
    expect(writes).toHaveLength(1)
    backend.failure = null
    await panel.getByRole('button', { name: 'Отримати новий огляд', exact: true }).click()
    await expect(
      panel.getByRole('button', { name: 'Підтвердити завершення', exact: true }),
    ).toBeEnabled()
    expect(writes).toHaveLength(1)
    await panel.getByRole('button', { name: 'Підтвердити завершення', exact: true }).click()
    await expect(panel).toHaveCount(0)
    expect(writes).toEqual(
      Array.from({ length: 2 }, () => ({
        path: kind === 'task' ? '/api/tasks/1/complete' : '/api/tasks/1/subtasks/4/complete',
        body: { completion_token: 'reviewed-state' },
      })),
    )
    expect(backend.sessions[0]!.status).toBe('planned')
    expect(backend.sessions[1]!.status).toBe('cancelled')
    if (kind === 'subtask') {
      expect(backend.base.tasks[0]!.status).toBe('pending')
      expect(backend.base.children[0]!.status).toBe('completed')
    } else expect(backend.base.tasks[0]!.status).toBe('completed')
    expect(errors).toEqual([])
  })
}
