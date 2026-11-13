import { expect, test, type Page } from '@playwright/test'
import { actionFixture, messageFixture } from '../tests/helpers/aiBackend'
import { aiSemesterBackend } from '../tests/helpers/aiSemesterBackend'
import type { TurnResult } from '../src/types/ai'

async function setup(
  page: Page,
  options: {
    missing?: boolean
    unknownMarker?: boolean
    uncertain?: boolean
    failureReason?: string
  } = {},
) {
  const semester = aiSemesterBackend()
  const backend = semester.ai
  if (options.failureReason)
    semester.failNext({
      reason: options.failureReason,
      content: 'Пропозицію не створено. Зміни не виконано.',
    })
  backend.addConversation()
  const errors: string[] = []
  let confirms = 0,
    uncertain = false
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (req.url().endsWith('/confirm')) {
      confirms++
      if (options.uncertain) {
        uncertain = true
        return route.abort('failed')
      }
    }
    if (uncertain && /\/actions\/[^/?]+$/.test(new URL(req.url()).pathname))
      return route.abort('failed')
    const response = semester.handle(
      req.url(),
      req.method(),
      req.postDataJSON() ?? {},
      req.headers(),
    )
    if (req.method() === 'POST' && req.url().endsWith('/messages') && response.status === 200) {
      const result = (response.body as { data: TurnResult }).data
      if (options.failureReason && result.tools.some((tool) => !tool.ok)) {
        result.server_message = { kind: 'proposal_not_created' }
        backend.messages.get(1)!.at(-1)!.server_message = result.server_message
      }
      if (options.missing) backend.actions.splice(0)
      if (options.unknownMarker) {
        const marker = { kind: 'future_unknown' }
        Object.assign(result, { server_message: marker })
        Object.assign(backend.messages.get(1)!.at(-1)!, { server_message: marker })
        result.content = 'Please clarify the date for Linear Algebra.'
        backend.messages.get(1)!.at(-1)!.content = result.content
      }
    }
    await route.fulfill({
      status: response.status,
      headers,
      ...(response.status === 204 ? {} : { json: response.body ?? {} }),
    })
  })
  return {
    backend,
    errors,
    get confirms() {
      return confirms
    },
  }
}
async function send(page: Page) {
  await page
    .getByLabel('Повідомлення помічнику', { exact: true })
    .fill('Створи завдання для читання')
  await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click()
}
async function noTechnical(page: Page) {
  const chat = page.locator('.ai-chat')
  await expect(chat.locator('.tool-metadata,.ai-evidence-fields,code')).toHaveCount(0)
  for (const text of [
    'Технічні деталі',
    'Task action proposed.',
    'call_id',
    'confirmation_required',
    'Server-reviewed',
    actionFixture().id,
  ])
    await expect(chat).not.toContainText(text)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('one Task card after POST and reopened history, explicit confirmation and one saved result', async ({
  page,
}) => {
  const state = await setup(page)
  state.backend.nextType = 'propose_task_create'
  await page.goto('/ai/conversations/1')
  await send(page)
  await expect(page.locator('.ai-action-review')).toHaveCount(1)
  await expect(page.locator('.ai-action-review')).toContainText('AI-created task')
  await expect(page.locator('.ai-assistant')).toHaveCount(0)
  await noTechnical(page)
  expect(state.confirms).toBe(0)
  await page.reload()
  await expect(page.locator('.ai-action-review')).toHaveCount(1)
  await expect(page.locator('.ai-assistant')).toHaveCount(0)
  expect(state.confirms).toBe(0)
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.locator('.ai-receipt')).toContainText('AI-created task')
  await expect(page.locator('.ai-event')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toHaveCount(0)
  expect(state.confirms).toBe(1)
  await noTechnical(page)
  expect(state.errors).toEqual([])
})

test('missing card leaves a Ukrainian summary through POST and history', async ({ page }) => {
  const state = await setup(page, { missing: true })
  state.backend.nextType = 'propose_task_create'
  await page.goto('/ai/conversations/1')
  await send(page)
  const summary = 'Пропозицію підготовлено до підтвердження. Зміни ще не виконано.'
  await expect(page.locator('.ai-assistant')).toHaveText(new RegExp(summary.replaceAll('.', '\\.')))
  await expect(page.locator('.ai-action-review')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.ai-timeline')).toContainText(summary)
  await noTechnical(page)
})

test('unknown provenance leaves the meaningful response and names intact', async ({ page }) => {
  const state = await setup(page, { unknownMarker: true })
  state.backend.nextType = 'propose_task_create'
  await page.goto('/ai/conversations/1')
  await send(page)
  await expect(page.locator('.ai-timeline')).toContainText(
    'Please clarify the date for Linear Algebra.',
  )
  await page.reload()
  await expect(page.locator('.ai-timeline')).toContainText(
    'Please clarify the date for Linear Algebra.',
  )
  await expect(page.locator('.ai-action-review')).toHaveCount(1)
  await noTechnical(page)
  expect(state.confirms).toBe(0)
})

test('legacy English history is localized without hiding an unlinked summary', async ({ page }) => {
  const state = await setup(page)
  state.backend.actions.push(actionFixture())
  state.backend.messages.set(1, [
    messageFixture(1, 'Запит', 'user'),
    messageFixture(2, 'Task action proposed. Confirmation is required; no task has changed.'),
  ])
  await page.goto('/ai/conversations/1')
  await expect(page.locator('.ai-assistant')).toHaveCount(1)
  await expect(page.locator('.ai-assistant')).toContainText(
    'Пропозицію підготовлено до підтвердження',
  )
  await noTechnical(page)
  expect(state.confirms).toBe(0)
})

test('unrecognized review cannot be confirmed and never displays its raw payload', async ({
  page,
}) => {
  const state = await setup(page)
  const action = actionFixture()
  action.type = 'future_action'
  action.preview = {
    raw_review: 'PRIVATE_REVIEW',
    effects: ['PRIVATE_EFFECT'],
    status: 'raw_status',
  }
  state.backend.actions.push(action)
  await page.goto('/ai/conversations/1')
  await expect(page.locator('.ai-action-review')).toContainText('Не вдалося перевірити огляд')
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  await expect(page.locator('.ai-action-review')).not.toContainText('PRIVATE_')
  await expect(
    page.getByRole('button', { name: 'Відхилити пропозицію', exact: true }),
  ).toBeEnabled()
  await noTechnical(page)
  expect(state.confirms).toBe(0)
})

test('unknown confirmation result offers a safe read and never automatically repeats the write', async ({
  page,
}) => {
  const state = await setup(page, { uncertain: true })
  state.backend.actions.push(actionFixture())
  await page.goto('/ai/conversations/1')
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.locator('.ai-action-review')).toContainText(
    'Результат підтвердження ще не відомий',
  )
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  await expect(page.locator('.ai-receipt')).toHaveCount(0)
  await page.getByRole('button', { name: 'Перевірити стан дії', exact: true }).click()
  expect(state.confirms).toBe(1)
  await noTechnical(page)
})

test('a marked pair refusal replaces the generic summary once and remains in its original turn', async ({
  page,
}) => {
  const state = await setup(page, { failureReason: 'pair_number_taken' })
  await page.goto('/ai/conversations/1')
  await send(page)
  await expect(page.locator('.ai-occurrence-failure')).toHaveCount(1)
  await expect(page.locator('.ai-occurrence-failure')).toHaveText('Цей номер пари вже зайнятий')
  await expect(page.locator('.ai-timeline')).not.toContainText('Пропозицію не створено.')
  await page.reload()
  await expect(page.locator('.ai-occurrence-failure')).toHaveCount(1)
  await send(page)
  await expect(page.locator('.ai-timeline')).toContainText('Here is your saved academic answer.')
  await expect(page.locator('.ai-occurrence-failure')).toHaveCount(1)
  await expect(page.locator('.ai-timeline')).not.toContainText('Пропозицію не створено.')
  await noTechnical(page)
  expect(state.confirms).toBe(0)
})
