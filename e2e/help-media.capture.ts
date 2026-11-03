import { lessonActionFixture } from '../tests/helpers/aiLessonFixtures'
import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { activityBackend } from '../tests/helpers/activityBackend'
import { scheduleBackend } from '../tests/helpers/scheduleBackend'
import { aiBackend, messageFixture } from '../tests/helpers/aiBackend'

test('capture public help illustrations from the real UI with isolated demo fixtures', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.clock.install({ time: new Date('2026-11-02T06:00:00Z') })
  const activity = activityBackend()
  const schedule = scheduleBackend()
  const ai = aiBackend()
  schedule.academic.teachers.forEach((teacher) => {
    teacher.name = 'Демо-викладач'
  })
  schedule.batches.forEach((batch) =>
    batch.rows.forEach((row) => {
      if (row.teacher_id) row.teacher_name = 'Демо-викладач'
    }),
  )
  activity.base.base.academic.subjects.push(...schedule.academic.subjects)
  ai.addConversation()
  const action = lessonActionFixture('propose_lesson_replacement')
  ai.actions.push(action)
  ai.messages.set(1, [
    messageFixture(1, 'Запропонуй заміну заняття №9 на новий час із указаним предметом.', 'user'),
    messageFixture(
      2,
      'Підготував пропозицію. Перегляньте поля та підтвердьте зміни окремою кнопкою.',
    ),
  ])
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Every API request is fulfilled locally. Never contact a live database/provider.
  await page.route('**/*', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const origin = new URL(req.url()).origin
    if (origin === 'http://localhost:4173') return route.continue()
    if (origin !== 'http://localhost:8000') return route.abort()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const backend = path.startsWith('/api/ai/')
      ? ai
      : /^\/api\/(schedule|lessons)/.test(path) ||
          path === '/api/teachers' ||
          path === '/api/academic-periods'
        ? schedule
        : activity
    const result = backend.handle(req.url(), req.method(), req.postDataJSON() ?? {})
    const body =
      path === '/api/profile'
        ? {
            data: {
              id: 1,
              name: 'Демо-студент',
              email: 'demo@example.test',
              timezone: 'Europe/Kyiv',
            },
          }
        : result.body
    await route.fulfill({
      status: result.status,
      ...(result.status === 204 ? {} : { json: body }),
      headers,
    })
  })
  await mkdir('public/help/_media', { recursive: true })
  const screens = [
    ['dashboard', '/'],
    ['academic', '/academic/subjects'],
    ['schedule', '/schedule?date=2026-11-02'],
    ['excel-import', '/schedule/import'],
    ['excel-preview', '/schedule/imports/40'],
    ['tasks', '/tasks/1'],
    ['availability', '/planning/free-time'],
    ['planning', '/planning/preview'],
    ['study-sessions', '/planning/sessions'],
    ['reminders', '/reminders'],
    ['statistics', '/statistics'],
    ['ai-assistant', '/ai/conversations/1'],
  ] as const
  for (const [name, path] of screens) {
    await page.goto(path)
    await expect(page.locator('#main-content h1')).toBeVisible()
    await expect(page.getByText('Завантажуємо дані…', { exact: true })).toHaveCount(0)
    if (name === 'planning') {
      await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
      await expect(
        page.getByRole('heading', { name: 'Пропозиція — ще не збережено' }),
      ).toBeVisible()
    }
    if (name === 'ai-assistant') {
      await expect(
        page.getByRole('button', { name: 'Підтвердити зміни', exact: true }),
      ).toBeVisible()
    }
    await page.evaluate(() => document.fonts.ready)
    const content = page.locator('#main-content')
    expect(await content.innerText()).not.toMatch(/olena@|Олена|Ірина|Коваль|XSRF|csrf|token/i)
    await content.screenshot({ path: `public/help/_media/${name}.png`, animations: 'disabled' })
  }
  expect(errors).toEqual([])
})
