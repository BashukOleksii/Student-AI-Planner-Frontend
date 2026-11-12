import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { aiAvailabilityBackend } from '../tests/helpers/aiAvailabilityBackend'
import { availabilityWindow } from '../tests/helpers/aiAvailabilityFixtures'
import { availabilityActionTypes, type AvailabilityActionType } from '../src/types/ai'

async function setup(
  page: Page,
  type: AvailabilityActionType,
  options: {
    loseResponse?: boolean
    failReads?: boolean
    error?: 'action_stale' | 'expired'
  } = {},
) {
  const backend = aiAvailabilityBackend()
  backend.ai.addConversation()
  backend.ai.nextType = type
  const errors: string[] = [],
    decisions: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let failReads = !!options.failReads
  await page
    .context()
    .addCookies([
      { name: 'XSRF-TOKEN', value: 'availability%2Bcsrf', url: 'http://localhost:4173' },
    ])
  await page.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.origin === 'http://localhost:4173') return route.continue()
    if (url.origin !== 'http://localhost:8000') return route.abort()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = request.postDataJSON() ?? {}
    if (request.method() !== 'GET') {
      expect(request.headers()['x-xsrf-token']).toBe('availability+csrf')
      expect(url.pathname.startsWith('/api/ai/')).toBe(true)
    }
    if (/\/(confirm|reject)$/.test(url.pathname)) {
      expect(request.postData()).toBe('{}')
      decisions.push(url.pathname)
      if (options.error && url.pathname.endsWith('/confirm')) {
        if (options.error === 'expired') {
          const action = backend.ai.actions[0]!
          Object.assign(action, {
            status: 'expired',
            state: 'expired',
            confirmation_required: false,
          })
          return route.fulfill({ status: 410, headers, json: { data: action, replayed: false } })
        }
        return route.fulfill({ status: 409, headers, json: { code: 'action_stale' } })
      }
    }
    if (failReads && url.pathname === '/api/study-availability-windows')
      return route.fulfill({ status: 503, headers, json: {} })
    const result = backend.handle(request.url(), request.method(), body, request.headers())
    if (options.loseResponse && url.pathname.endsWith('/confirm')) return route.abort('failed')
    return route.fulfill({
      status: result.status,
      headers,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
    })
  })
  return {
    backend,
    errors,
    decisions,
    allowReads() {
      failReads = false
    },
  }
}
async function propose(page: Page) {
  await page.goto('/ai/conversations/1')
  await page
    .getByLabel('Повідомлення помічнику', { exact: true })
    .fill('Запропонуй одну зміну щотижневої доступності.')
  await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click()
  await expect(page.locator('.ai-availability-review')).toBeVisible()
}
async function keyboardConfirm(page: Page) {
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).focus()
  await page.keyboard.press('Enter')
}
for (const type of availabilityActionTypes) {
  test(`${type}: exact local review, keyboard confirmation, historical receipt, current availability`, async ({
    page,
  }) => {
    const state = await setup(page, type)
    await propose(page)
    const review = page.locator('.ai-action-review'),
      preview = review.locator('.ai-availability-review')
    await expect(preview).toContainText('Europe/Kyiv')
    await expect(preview).toContainText('Понеділок')
    await expect(preview).toContainText('не переплановуються')
    if (type === 'propose_availability_create')
      await expect(preview).toContainText('Буде призначено після збереження')
    if (type === 'propose_availability_update') {
      await expect(preview.locator('.ai-field-changed')).toHaveCount(2)
      await expect(preview).toContainText('Без змін')
      await expect(preview).toContainText('16:00:01')
    }
    if (type === 'propose_availability_delete')
      await expect(preview).toContainText('лише один запис конфігурації щотижневої доступності №12')
    else await expect(preview).toContainText('24:00:00')
    expect(await review.getByRole('checkbox').count()).toBe(0)
    expect(state.backend.executions).toBe(0)
    expect(state.decisions).toHaveLength(0)
    await page.getByLabel('Повідомлення помічнику', { exact: true }).fill('так')
    await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click()
    await expect(page.getByLabel('Повідомлення помічнику', { exact: true })).toHaveValue('')
    expect(state.backend.executions).toBe(0)
    expect(state.decisions).toHaveLength(0)
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      await page.setViewportSize({ width: 320, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([])
    }
    await keyboardConfirm(page)
    const receipt = review.locator('.ai-receipt')
    await expect(receipt).toContainText('Квитанція виконання')
    await expect(receipt).toContainText(
      type === 'propose_availability_delete' ? 'Видалений інтервал' : 'Збережений інтервал',
    )
    await expect(receipt).toContainText(type === 'propose_availability_create' ? '№13' : '№12')
    await expect(receipt).toContainText('Europe/Kyiv')
    await expect(
      receipt.locator('a[href^="/tasks"], a[href^="/schedule"], a[href^="/planning/sessions"]'),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toHaveCount(
      0,
    )
    expect(state.decisions).toHaveLength(1)
    expect(state.backend.executions).toBe(1)
    expect(state.backend.requests.some((r) => r.path === '/api/study-availability-windows')).toBe(
      true,
    )
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(audit.violations).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await receipt.getByRole('link', { name: 'До навчальної доступності', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Щотижнева доступність', exact: true }),
    ).toBeVisible()
    if (type === 'propose_availability_delete')
      await expect(page.locator('.planning-week .session-card')).toHaveCount(0)
    else await expect(page.locator('.planning-week')).toContainText('20:00:03 — 24:00')
    expect(
      state.backend.requests.some((r) =>
        /free-slots|study-plans|replanning|study-sessions/.test(r.path),
      ),
    ).toBe(false)
    expect(state.errors).toEqual([])
  })
}
test('availability rejection preserves configuration and has no receipt or mutation', async ({
  page,
}) => {
  const state = await setup(page, 'propose_availability_delete')
  await propose(page)
  const before = [...state.backend.windows.values()]
  await page.getByRole('button', { name: 'Відхилити пропозицію', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.ai-action-review')).toContainText(
    'Пропозицію відхилено без виконання змін',
  )
  await expect(page.locator('.ai-receipt')).toHaveCount(0)
  expect(state.backend.executions).toBe(0)
  expect([...state.backend.windows.values()]).toEqual(before)
  expect(state.decisions).toHaveLength(1)
  expect(state.decisions[0]).toMatch(/\/reject$/)
})
test('stale availability permits current-window reads and rejection, never reconfirmation or silent merging', async ({
  page,
}) => {
  const state = await setup(page, 'propose_availability_update', { error: 'action_stale' })
  await propose(page)
  await keyboardConfirm(page)
  await expect(page.locator('.ai-availability-current')).toContainText(
    'Попросіть нову AI-пропозицію',
  )
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  state.backend.windows.set(99, { ...availabilityWindow(99), day_of_week: 7 })
  await page.getByRole('button', { name: 'Оновити поточну доступність', exact: true }).click()
  await expect(page.locator('.ai-availability-current')).toContainText(
    '№99 · Неділя · 16:00:01 — 20:00:02',
  )
  await expect(page.locator('.ai-action-review > .ai-availability-review')).toContainText(
    '24:00:00',
  )
  await expect(page.locator('.ai-receipt')).toHaveCount(0)
  expect(state.backend.executions).toBe(0)
  expect(state.decisions).toHaveLength(1)
  await page.getByRole('button', { name: 'Відхилити пропозицію', exact: true }).click()
  await expect(page.locator('.ai-action-review')).toContainText('Пропозицію відхилено')
  expect(state.decisions).toHaveLength(2)
  expect(state.backend.executions).toBe(0)
})
test('expired availability cannot be confirmed or presented as applied', async ({ page }) => {
  const state = await setup(page, 'propose_availability_create', { error: 'expired' })
  await propose(page)
  await keyboardConfirm(page)
  await expect(page.locator('.ai-action-review')).toContainText('Термін минув')
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toHaveCount(0)
  await expect(page.locator('.ai-receipt')).toHaveCount(0)
  expect(state.backend.executions).toBe(0)
  expect(state.decisions).toHaveLength(1)
})
test('lost response recovers immutable receipt via GET; failed refresh retries reads only', async ({
  page,
}) => {
  const state = await setup(page, 'propose_availability_create', {
    loseResponse: true,
    failReads: true,
  })
  await propose(page)
  await keyboardConfirm(page)
  const receipt = page.locator('.ai-receipt')
  await expect(receipt).toContainText('Дію виконано, але пов’язані дані не вдалося оновити')
  await expect(receipt).toContainText('20:00:03')
  await expect(receipt).toContainText('24:00:00')
  expect(state.decisions).toHaveLength(1)
  expect(state.backend.executions).toBe(1)
  state.backend.windows.set(13, { ...availabilityWindow(13), day_of_week: 7 })
  state.allowReads()
  await receipt.getByRole('button', { name: 'Оновити пов’язані дані', exact: true }).click()
  await expect(receipt).not.toContainText('Дію виконано, але')
  await expect(receipt).toContainText('Понеділок')
  await expect(receipt).toContainText('20:00:03')
  expect(state.decisions).toHaveLength(1)
  await receipt.getByRole('link', { name: 'До навчальної доступності', exact: true }).click()
  await expect(page.locator('.planning-week')).toContainText('16:00:01 — 20:00:02')
  expect(state.backend.executions).toBe(1)
  expect(state.errors).toEqual([])
})
