import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { aiLessonBackend } from '../tests/helpers/aiLessonBackend'
import { lessonActionFixture } from '../tests/helpers/aiLessonFixtures'
import { lessonActionTypes, type LessonActionType } from '../src/types/ai'
const actionLabels: Record<LessonActionType, string> = {
  propose_lesson_create: 'Створити заняття',
  propose_lesson_update: 'Змінити заняття',
  propose_lesson_cancel: 'Скасувати заняття',
  propose_lesson_replacement: 'Замінити заняття',
}

async function setup(
  page: Page,
  type: LessonActionType,
  options: {
    reuseId?: boolean
    loseResponse?: boolean
    failReads?: boolean
    error?: 'action_stale' | 'action_validation_failed' | 'expired'
  } = {},
) {
  const backend = aiLessonBackend()
  backend.ai.addConversation()
  backend.ai.nextType = type
  const errors: string[] = [],
    decisions: { path: string; body: unknown }[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let failReads = !!options.failReads
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'lesson%2Bcsrf', url: 'http://localhost:4173' }])
  await page.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url())
    if (url.origin === 'http://localhost:4173') return route.continue()
    if (url.origin !== 'http://localhost:8000') return route.abort()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = req.postDataJSON() ?? {}
    if (req.method() !== 'GET') expect(req.headers()['x-xsrf-token']).toBe('lesson+csrf')
    expect(req.method() === 'GET' || !url.pathname.startsWith('/api/lessons')).toBe(true)
    if (url.pathname.endsWith('/confirm') || url.pathname.endsWith('/reject')) {
      expect(body).toEqual({})
      decisions.push({ path: url.pathname, body })
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
        return route.fulfill({
          status: options.error === 'action_stale' ? 409 : 422,
          headers,
          json: { code: options.error },
        })
      }
    }
    if (failReads && /^\/api\/lessons\//.test(url.pathname))
      return route.fulfill({ status: 503, headers, json: {} })
    const result = backend.handle(req.url(), req.method(), body, req.headers())
    if (options.reuseId && url.pathname.endsWith('/messages') && req.method() === 'POST') {
      const action = backend.ai.actions[0]!
      Object.assign(action.preview.after!, { id: 22 })
    }
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
    .fill('Запропонуй зміну заняття за вказаними даними.')
  await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click()
  await expect(page.locator('.ai-lesson-review')).toBeVisible()
}
for (const type of lessonActionTypes) {
  test(`${type}: complete escaped review, keyboard confirmation, receipt and authoritative schedule`, async ({
    page,
  }) => {
    const state = await setup(page, type, { reuseId: type === 'propose_lesson_replacement' })
    await propose(page)
    const review = page.locator('.ai-action-review')
    await expect(
      review.getByRole('heading', { name: actionLabels[type], exact: true }),
    ).toBeVisible()
    await expect(review).toContainText('Europe/Kyiv')
    await expect(review).toContainText('StudySessions')
    expect(await review.getByRole('checkbox').count()).toBe(0)
    expect(state.backend.executions).toBe(0)
    expect(state.decisions).toHaveLength(0)
    if (type === 'propose_lesson_update') {
      await expect(review.locator('.ai-field-changed')).toHaveCount(1)
      await expect(review).toContainText('Демо-викладач')
    }
    if (type === 'propose_lesson_replacement') {
      await expect(review).toContainText('історичний ID №22')
      await expect(review).toContainText('2026-11-13T21:30:00Z')
      await expect(review).toContainText('2026-11-13T23:30:00Z')
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(
        audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    const confirm = page.getByRole('button', { name: 'Підтвердити зміни', exact: true })
    await confirm.focus()
    await page.keyboard.press('Enter')
    await expect(
      review.getByRole('heading', { name: 'Квитанція виконання', exact: true }),
    ).toBeVisible()
    expect(state.backend.executions).toBe(1)
    expect(state.decisions).toHaveLength(1)
    const id =
      type === 'propose_lesson_replacement' ? 22 : type === 'propose_lesson_create' ? 20 : 9
    await expect(
      review.getByRole('link', { name: `Відкрити заняття №${id}`, exact: true }),
    ).toHaveAttribute('href', `/schedule/lessons/${id}`)
    await expect(review.getByRole('link', { name: 'До завдань', exact: true })).toHaveCount(0)
    await expect(review.locator('a[href^="/planning/sessions/"]')).toHaveCount(0)
    if (type === 'propose_lesson_replacement') {
      await expect(
        review.getByRole('link', { name: 'Початкове заняття №9', exact: true }),
      ).toHaveAttribute('href', '/schedule/lessons/9')
      expect(state.backend.requests.some((r) => r.path === '/api/lessons/9')).toBe(true)
      for (const date of ['2026-11-12', '2026-11-13', '2026-11-14'])
        expect(state.backend.requests.some((r) => r.path === `/api/schedule/date/${date}`)).toBe(
          true,
        )
    }
    await review.getByRole('link', { name: `Відкрити заняття №${id}`, exact: true }).click()
    await expect(page.getByRole('heading', { name: `Заняття №${id}`, exact: true })).toBeVisible()
    await page.goto(
      `/schedule?date=${type === 'propose_lesson_replacement' ? '2026-11-13' : '2026-11-12'}`,
    )
    await expect(page.getByRole('heading', { name: 'Розклад', exact: true })).toBeVisible()
    await expect(page.locator('.schedule-days .lesson')).toHaveCount(
      type === 'propose_lesson_cancel' ? 0 : type === 'propose_lesson_create' ? 2 : 1,
    )
    expect(state.errors).toEqual([])
  })
}
test('Lesson rejection preserves schedule; expired terminal response cannot be confirmed', async ({
  page,
}) => {
  const state = await setup(page, 'propose_lesson_cancel', { error: 'expired' })
  await propose(page)
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.locator('.ai-action-review')).toContainText('Термін минув')
  expect(state.backend.executions).toBe(0)
  const next = lessonActionFixture('propose_lesson_replacement', 2)
  state.backend.ai.actions.unshift(next)
  await page.getByRole('button', { name: 'Оновити дії', exact: true }).click()
  await page.getByRole('button', { name: 'Переглянути пропозицію', exact: true }).first().click()
  const reject = page.getByRole('button', { name: 'Відхилити пропозицію', exact: true })
  await reject.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.ai-action-review')).toContainText('Пропозицію відхилено')
  expect(state.backend.executions).toBe(0)
  expect(state.backend.lessons.get(9)?.status).toBe('active')
})
for (const error of ['action_stale', 'action_validation_failed'] as const) {
  test(`Lesson ${error} requires new proposal and permits rejection without re-confirmation`, async ({
    page,
  }) => {
    const state = await setup(page, 'propose_lesson_update', { error })
    await propose(page)
    await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
    await expect(page.locator('.ai-action-review')).toContainText(error)
    await expect(
      page.getByRole('button', { name: 'Підтвердити зміни', exact: true }),
    ).toBeDisabled()
    expect(state.backend.executions).toBe(0)
    expect(state.decisions).toHaveLength(1)
    await page.getByRole('button', { name: 'Відхилити пропозицію', exact: true }).click()
    await expect(page.locator('.ai-action-review')).toContainText('Пропозицію відхилено')
    expect(state.backend.executions).toBe(0)
  })
}
test('lost Lesson response recovers executed receipt; failed refresh retries reads only', async ({
  page,
}) => {
  const state = await setup(page, 'propose_lesson_replacement', {
    loseResponse: true,
    failReads: true,
  })
  await propose(page)
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.locator('.ai-action-review')).toContainText('Квитанція виконання')
  await expect(page.locator('.ai-action-review')).toContainText('Дію виконано, але')
  expect(state.backend.executions).toBe(1)
  state.allowReads()
  await page.getByRole('button', { name: 'Оновити пов’язані дані', exact: true }).click()
  await expect(page.locator('.ai-action-review')).not.toContainText('Дію виконано, але')
  expect(state.decisions).toHaveLength(1)
  expect(state.backend.executions).toBe(1)
})
