import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { workCompletionBackend } from '../tests/helpers/workCompletionBackend'
import { sessionFixture } from '../tests/helpers/planningBackend'

test('task filters, one combined completion and completed read-only details on mobile and desktop', async ({
  page,
}, testInfo) => {
  const backend = workCompletionBackend()
  backend.sessions = [sessionFixture(7)]
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
  await page.goto('/tasks')
  await expect(page.getByRole('button', { name: 'Активні', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: /Інші дії/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Завершити', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Завершення роботи' })
  await expect(dialog.locator('input[type="radio"]').first()).toBeChecked()
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
