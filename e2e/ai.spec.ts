import { expect, test, type Page } from '@playwright/test'
import { actionFixture, aiBackend } from '../tests/helpers/aiBackend'

async function setup(
  page: Page,
  options: { loseFirstConfirmation?: boolean; replayRetry?: boolean; failFirstSend?: boolean } = {},
) {
  const backend = aiBackend(),
    errors: string[] = [],
    sends: { key: string | undefined; content: unknown }[] = []
  let confirmations = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'ai%2Bcsrf%3D', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body: Record<string, unknown> = req.postDataJSON() ?? {}
    if (req.method() === 'POST') expect(req.headers()['x-xsrf-token']).toBe('ai+csrf=')
    if (req.method() === 'POST' && req.url().endsWith('/messages')) {
      sends.push({ key: req.headers()['idempotency-key'], content: body.content })
      if (options.failFirstSend && sends.length === 1)
        return route.fulfill({
          status: 502,
          json: { code: 'provider_error', message: 'Fixed safe provider failure.' },
          headers,
        })
    }
    if (req.url().endsWith('/confirm')) {
      confirmations++
      if (options.loseFirstConfirmation && confirmations === 1) return route.abort('failed')
      if (options.replayRetry && confirmations === 2)
        backend.handle(req.url(), req.method(), body, req.headers())
    }
    const result = backend.handle(req.url(), req.method(), body, req.headers())
    await route.fulfill({
      status: result.status,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
      headers,
    })
  })
  return {
    backend,
    errors,
    sends,
    get confirmations() {
      return confirmations
    },
  }
}
async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        width: innerWidth,
        overflowing: [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            right: el.getBoundingClientRect().right,
          })),
      })),
    )
    .toMatchObject({ overflowing: [] })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
async function send(page: Page, content: string) {
  await page.getByLabel('Повідомлення помічнику', { exact: true }).fill(content)
  await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click()
}

test('AI conversation creation, read-only answer, keyboard composition and responsive themes', async ({
  page,
}, testInfo) => {
  const state = await setup(page)
  await page.goto('/')
  await page
    .getByRole('link', { name: 'AI-помічник', exact: true })
    .filter({ visible: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Розмов поки немає', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Нова розмова', exact: true }).click()
  await expect(page).toHaveURL(/\/ai\/conversations\/1$/)
  const composer = page.getByLabel('Повідомлення помічнику', { exact: true })
  await composer.fill('Які мої завдання?')
  await composer.press('Enter')
  expect(state.sends).toHaveLength(0)
  await composer.press('Control+Enter')
  await expect(page.getByText('Here is your saved academic answer.', { exact: true })).toBeVisible()
  expect(state.sends[0]?.key).toMatch(/^[0-9a-f-]{36}$/)
  expect(state.backend.executions).toBe(0)
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('ai-chat-light.png'), fullPage: true })
  await page
    .getByRole('button', { name: 'Увімкнути темну тему', exact: true })
    .filter({ visible: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
  await page.reload()
  await expect(page.getByText('Here is your saved academic answer.', { exact: true })).toBeVisible()
  expect(state.sends).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('Task proposal requires an explicit decision and opens the actual receipt Task', async ({
  page,
}) => {
  const state = await setup(page)
  state.backend.addConversation()
  state.backend.nextType = 'propose_task_create'
  await page.goto('/ai/conversations/1')
  await send(page, 'Створи завдання для читання')
  await expect(page.locator('.ai-action-review')).toContainText('Потребує підтвердження')
  expect(state.backend.executions).toBe(0)
  await send(page, 'так')
  await expect(page.locator('.ai-user')).toHaveCount(2)
  expect(state.backend.executions).toBe(0)
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Квитанція виконання', exact: true }),
  ).toBeVisible()
  expect(state.backend.executions).toBe(1)
  const confirm = state.backend.aiRequests.find((r) => r.path.endsWith('/confirm'))
  expect(confirm?.body).toEqual({})
  await page.getByRole('link', { name: 'Відкрити завдання #70', exact: true }).click()
  await expect(page.getByLabel('Назва завдання *', { exact: true })).toHaveValue('AI-created task')
  expect(state.errors).toEqual([])
})

test('reopening retrieves the current pending action and rejection has no business effect', async ({
  page,
}) => {
  const state = await setup(page)
  state.backend.addConversation()
  state.backend.actions.push(actionFixture('propose_reminder_create'))
  await page.goto('/ai/conversations/1')
  await expect(page.locator('.ai-action-review')).toContainText('Час спрацювання (сервер)')
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Відхилити пропозицію', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Відхилити пропозицію', exact: true }).click()
  await expect(page.locator('.ai-action-review')).toContainText(
    'Пропозицію відхилено без виконання змін',
  )
  expect(state.backend.executions).toBe(0)
  await noOverflow(page)
  expect(state.errors).toEqual([])
})

test('lost confirmation is recovered by GET; deliberate retry can replay without duplicate execution', async ({
  page,
}) => {
  const state = await setup(page, { loseFirstConfirmation: true, replayRetry: true })
  state.backend.addConversation()
  state.backend.actions.push(actionFixture())
  await page.goto('/ai/conversations/1')
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.locator('.ai-action-review [role="alert"]')).toBeVisible()
  expect(state.confirmations).toBe(1)
  expect(state.backend.executions).toBe(0)
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.locator('.ai-action-review')).toContainText('Повторних змін немає')
  expect(state.confirmations).toBe(2)
  expect(state.backend.executions).toBe(1)
  await expect(page.locator('.ai-event')).toHaveCount(1)
  expect(state.errors).toEqual([])
})

test('adaptive review shows complete cancellation effects and requires two independent consent flags', async ({
  page,
}, testInfo) => {
  const state = await setup(page)
  state.backend.addConversation()
  state.backend.nextType = 'propose_adaptive_replanning'
  await page.goto('/ai/conversations/1')
  await send(page, 'Переплануй мої сесії на 12 листопада')
  const review = page.locator('.ai-action-review')
  const confirm = page.getByRole('button', { name: 'Підтвердити зміни', exact: true })
  const checks = review.getByRole('checkbox')
  await expect(checks).toHaveCount(2)
  await expect(checks.nth(0)).not.toBeChecked()
  await expect(checks.nth(1)).not.toBeChecked()
  await expect(confirm).toBeDisabled()
  await expect(review).toContainText('Сесії, що звільняються / скасовуються')
  await expect(review).toContainText('Неперенесена тривалість, с')
  await expect(review).toContainText('no_replacement_capacity')
  await checks.nth(0).check()
  await expect(confirm).toBeDisabled()
  const originalViewport = page.viewportSize()!
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
  }
  await page.setViewportSize(originalViewport)
  await page
    .getByRole('button', { name: 'Увімкнути темну тему', exact: true })
    .filter({ visible: true })
    .click()
  await noOverflow(page)
  await page.screenshot({
    path: testInfo.outputPath('ai-planning-review-dark.png'),
    fullPage: true,
  })
  await checks.nth(1).check()
  await confirm.click()
  await expect(
    page.getByRole('heading', { name: 'Квитанція виконання', exact: true }),
  ).toBeVisible()
  expect(state.backend.aiRequests.find((r) => r.path.endsWith('/confirm'))?.body).toEqual({
    accept_partial: true,
    accept_unplaced_cancellation: true,
  })
  expect(state.backend.executions).toBe(1)
  await noOverflow(page)
  expect(state.errors).toEqual([])
})

test('provider failure survives reload and retries only the saved original intent', async ({
  page,
}) => {
  const state = await setup(page, { failFirstSend: true })
  state.backend.addConversation()
  await page.goto('/ai/conversations/1')
  await send(page, ' Exact read-only question ')
  await expect(page.getByText('Код: provider_error', { exact: true })).toBeVisible()
  expect(state.sends).toHaveLength(1)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Є незавершений або непідтверджений запит', exact: true }),
  ).toBeVisible()
  expect(state.sends).toHaveLength(1)
  await page.getByRole('button', { name: 'Повторити цей запит', exact: true }).click()
  await expect(page.getByText('Here is your saved academic answer.', { exact: true })).toBeVisible()
  expect(state.sends).toHaveLength(2)
  expect(state.sends[1]).toEqual(state.sends[0])
  await expect(page.locator('.ai-user')).toHaveCount(1)
  expect(state.errors).toEqual([])
})
