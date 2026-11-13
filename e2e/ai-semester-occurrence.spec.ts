import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { aiSemesterBackend } from '../tests/helpers/aiSemesterBackend'
import { occurrenceType } from '../tests/helpers/aiSemesterFixtures'

async function setup(page: Page) {
  const backend = aiSemesterBackend(),
    errors: string[] = [],
    confirms: string[] = []
  backend.ai.addConversation()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (req.method() === 'POST' && req.url().endsWith('/confirm')) confirms.push(req.url())
    const response = backend.handle(
      req.url(),
      req.method(),
      req.postDataJSON() ?? {},
      req.headers(),
    )
    await route.fulfill({
      status: response.status,
      ...(response.status === 204 ? {} : { json: response.body ?? {} }),
      headers,
    })
  })
  return { backend, errors, confirms }
}
async function send(page: Page, content: string) {
  await page.getByLabel('Повідомлення помічнику', { exact: true }).fill(content)
  await page
    .locator('.ai-composer')
    .getByRole('button', { name: 'Надіслати повідомлення', exact: true })
    .click()
}
async function noTechnicalTimeline(page: Page) {
  const timeline = page.getByRole('list', { name: 'Історія повідомлень', exact: true })
  await expect(timeline.locator('.ai-tool,.tool-metadata,.ai-tool-result')).toHaveCount(0)
  for (const text of [
    'Дані перевірено',
    'call_id',
    'read_call',
    occurrenceType,
    'invalid_arguments',
    'pair_number_taken',
    'time_overlap',
    'date_cancelled',
    'unexpected_reason',
  ])
    await expect(timeline).not.toContainText(text)
}
test('student adds one third pair, explicitly confirms it and reopens the saved result', async ({
  page,
}, testInfo) => {
  const { backend, errors, confirms } = await setup(page)
  backend.ai.nextType = occurrenceType
  await page.goto('/ai/conversations/1')
  await send(page, 'Додай третю пару з фізики на робочу суботу 14 листопада')
  const card = page.locator('.ai-action-review')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Пара №3')
  await expect(card).toContainText('Фізика')
  await expect(card).toContainText('Олена Коваль')
  await expect(card).toContainText('12:00 — 13:00 · Europe/Kyiv')
  await expect(card).toContainText('Ауд. 301')
  await expect(card).toContainText('Зміна лише на цю дату. Інші пари залишаться без змін')
  await expect(card).not.toContainText('Предмет 1')
  await expect(card).not.toContainText('Предмет 2')
  await expect(card.locator('.review-comparison,.snapshot-lesson')).toHaveCount(0)
  await noTechnicalTimeline(page)
  expect(confirms).toEqual([])
  expect(backend.ai.executions).toBe(0)
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize(testInfo.project.use.viewport ?? { width: 390, height: 844 })
  const audit = await new AxeBuilder({ page })
    .include('.ai-timeline')
    .include('.ai-action-review')
    .analyze()
  expect(audit.violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('new-third-pair.png'), fullPage: true })
  await card.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(card.locator('.ai-receipt')).toContainText('Пара №3')
  await expect(card.locator('.ai-semester-occurrence-create')).toHaveCount(1)
  await expect(card.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toHaveCount(0)
  expect(confirms).toHaveLength(1)
  expect(backend.ai.executions).toBe(1)
  await page.reload()
  await expect(page.locator('.ai-event')).toContainText('Зміни успішно застосовано')
  await page.getByRole('button', { name: 'Переглянути пропозицію', exact: true }).click()
  await expect(card).toHaveCount(1)
  await expect(card.locator('.ai-semester-occurrence-create')).toHaveCount(1)
  await expect(card.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toHaveCount(0)
  await noTechnicalTimeline(page)
  expect(confirms).toHaveLength(1)
  expect(errors).toEqual([])
})

test('all safe reasons appear once in the correct turn after send, another read and history reload', async ({
  page,
}) => {
  const { backend, errors, confirms } = await setup(page)
  const cases = [
    ['pair_number_taken', 'Цей номер пари вже зайнятий'],
    ['time_overlap', 'Обраний час перетинається з іншим заняттям'],
    ['date_cancelled', 'Цей день скасовано. Спочатку віднови або явно заміни його розклад'],
    [
      undefined,
      'Не вдалося створити пропозицію нової пари. Уточни дату, номер і час або перевір розклад.',
    ],
    [
      'unexpected_reason',
      'Не вдалося створити пропозицію нової пари. Уточни дату, номер і час або перевір розклад.',
    ],
  ] as const
  for (const [index, [reason, label]] of cases.entries()) {
    const conversation = index === 0 ? backend.ai.conversations[0]! : backend.ai.addConversation()
    backend.failNext({ reason, content: 'Яку саме дату ти маєш на увазі?' })
    await page.goto(`/ai/conversations/${conversation.id}`)
    await send(page, 'Додай третю пару на робочу суботу')
    await expect(page.locator('.ai-occurrence-failure')).toHaveCount(1)
    await expect(page.locator('.ai-occurrence-failure')).toHaveText(label)
    await expect(page.locator('.ai-timeline')).toContainText('Яку саме дату ти маєш на увазі?')
    const anchor = await page
      .locator('.ai-occurrence-failure')
      .locator('..')
      .locator('..')
      .getAttribute('data-message-id')
    await send(page, 'Просто покажи мій розклад')
    await expect(page.locator('.ai-timeline')).toContainText('Here is your saved academic answer.')
    await expect(page.locator('.ai-occurrence-failure')).toHaveCount(1)
    await expect(page.locator(`[data-message-id="${anchor}"]`)).toContainText(label)
    await page.reload()
    await expect(page.locator('.ai-occurrence-failure')).toHaveCount(1)
    await expect(page.locator(`[data-message-id="${anchor}"]`)).toContainText(label)
    await noTechnicalTimeline(page)
    await expect(page.locator('.ai-action-review')).toHaveCount(0)
  }
  expect(confirms).toEqual([])
  expect(errors).toEqual([])
})
