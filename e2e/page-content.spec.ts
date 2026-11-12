import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { activityBackend } from '../tests/helpers/activityBackend'
import { semesterBackend } from '../tests/helpers/semesterBackend'
import { aiBackend, actionFixture, messageFixture } from '../tests/helpers/aiBackend'

// Never record reset-link or password handoffs, even when a fixture assertion fails.
test.use({ trace: 'off' })

export const contentRoutes = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/',
  '/ai',
  '/ai/conversations/1',
  '/schedule?date=2026-11-02',
  '/schedule?date=2026-11-02&view=week',
  '/schedule/semester-calendar?semester=1&date=2026-11-02&view=week',
  '/schedule/legacy?date=2026-11-02',
  '/schedule/legacy?date=2026-11-02&view=week',
  '/schedule/semester-calendar?semester=1&date=2026-11-02',
  '/schedule?semester=1&date=2026-11-02',
  '/academic',
  '/schedule/semesters/new',
  '/schedule/semesters/1',
  '/schedule/semesters/1/settings',
  '/schedule/semesters/1/rules/new',
  '/schedule/semesters/1/rules/11',
  '/schedule/semesters/1/dates/2026-11-02',
  '/schedule/semesters/1/dates/2026-11-03',
  '/schedule/semester-import',
  '/schedule/semester-imports/41',
  '/schedule/lessons/new',
  '/schedule/lessons/9',
  '/schedule/lessons/9/edit',
  '/schedule/lessons/9/replacement',
  '/schedule/import',
  '/schedule/imports/40',
  '/tasks',
  '/tasks/new',
  '/tasks/1',
  '/planning',
  '/planning/preferences',
  '/planning/availability',
  '/planning/free-time',
  '/planning/workload',
  '/planning/preview',
  '/planning/recovery',
  '/planning/replanning',
  '/planning/suggestions',
  '/planning/suggestions/d1f31316-b23a-456a-a38a-e8fe905a8601',
  '/planning/sessions',
  '/planning/sessions/1',
  '/reminders',
  '/reminders/new',
  '/reminders/1',
  '/reminders/1/edit',
  '/inbox',
  '/statistics',
  '/statistics/trends',
  '/statistics/comparison',
  '/academic/institutions',
  '/academic/periods',
  '/academic/subjects',
  '/academic/teachers',
  '/profile',
  '/missing-page',
]
async function setup(page: Page, publicPage: boolean, readyImport = false) {
  const activity = activityBackend(),
    semester = semesterBackend({ savedDays: true, readyImport }),
    ai = aiBackend()
  ai.addConversation()
  ai.actions.push(actionFixture('propose_adaptive_replanning'))
  await page.clock.setFixedTime(new Date('2026-11-02T08:00:00Z'))
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'content-csrf', url: 'http://localhost:4173' }])
  let recoveryApplied = false
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (publicPage && path === '/api/profile')
      return route.fulfill({ status: 401, json: { message: 'Unauthenticated.' }, headers })
    if (path.startsWith('/api/academic-calendar/')) {
      const legacy = semester.legacy.lessons[0]!
      const legacySubject = semester.legacy.academic.subjects.find(
        (item) => item.id === legacy.subject_id,
      )
      const legacyTeacher = semester.legacy.academic.teachers.find(
        (item) => item.id === legacy.teacher_id,
      )
      const lesson = {
        id: 'demo',
        source_identity: 'semester:1:2026-11-02:rule:11',
        source_type: 'semester_occurrence',
        source: 'base',
        occurs_on: '2026-11-02',
        occurrence_id: 'demo',
        academic_period_id: 5,
        lesson_id: null,
        semester_schedule_id: 1,
        weekly_lesson_rule_id: 11,
        pair_number: 1,
        pair_label: '1-2',
        subject: { id: 21, name: 'Семестрова математика' },
        teacher: { id: 23, name: 'Ірина Савчук' },
        type: 'lecture',
        room: '301',
        starts_at: '2026-11-02T10:00:00+02:00',
        ends_at: '2026-11-02T11:20:00+02:00',
      }
      return route.fulfill({
        headers,
        json: {
          data: [
            lesson,
            {
              ...lesson,
              id: legacy.id,
              source_identity: `legacy_lesson:${legacy.id}`,
              source_type: 'legacy_lesson',
              lesson_id: legacy.id,
              semester_schedule_id: null,
              weekly_lesson_rule_id: null,
              subject: legacySubject ? { id: legacySubject.id, name: legacySubject.name } : null,
              teacher: legacyTeacher ? { id: legacyTeacher.id, name: legacyTeacher.name } : null,
              type: legacy.type,
              starts_at: legacy.starts_at,
              ends_at: legacy.ends_at,
            },
          ],
          meta: {
            timezone: 'Europe/Kyiv',
            start_date: '2026-11-02',
            end_date: path.includes('/week/') ? '2026-11-08' : '2026-11-02',
            total: 2,
            returned: 2,
            limit: 100,
            truncated: false,
          },
        },
      })
    }
    if (path.startsWith('/api/planning/recovery-suggestions')) {
      if (req.method() === 'POST' && path.endsWith('/confirm')) recoveryApplied = true
      const review = {
        id: 'd1f31316-b23a-456a-a38a-e8fe905a8601',
        kind: 'create_plan',
        status: recoveryApplied ? 'applied' : 'pending',
        period: { start_date: '2026-11-02', end_date: '2026-11-08', timezone: 'Europe/Kyiv' },
        actionable: !recoveryApplied,
        confirmation_required: !recoveryApplied,
        requires_lifecycle_decision: false,
        required_confirmation_fields: ['accept_partial'],
        reason_codes: ['eligible_remaining_work'],
        review: {
          version: 1,
          kind: 'create_plan',
          new_work_plan: {
            sessions: [
              {
                task_id: 1,
                subtask_id: null,
                starts_at: '2026-11-03T12:00:00Z',
                ends_at: '2026-11-03T12:30:00Z',
                duration_seconds: 1800,
              },
            ],
            summary: { unallocated_minutes: 30 },
          },
        },
        receipt: recoveryApplied
          ? {
              applied_at: '2026-11-02T08:00:00Z',
              result: {
                summary: { created_count: 1 },
                sessions: [
                  {
                    task_id: 1,
                    subtask_id: null,
                    starts_at: '2026-11-03T12:00:00Z',
                    ends_at: '2026-11-03T12:30:00Z',
                    duration_seconds: 1800,
                  },
                ],
              },
            }
          : null,
        expires_at: '2099-11-02T12:00:00Z',
      }
      return route.fulfill({
        headers,
        json:
          path === '/api/planning/recovery-suggestions'
            ? {
                data: [review],
                meta: { current_page: 1, last_page: 1 },
                automation: { last_scanned_at: null, last_outcome: null },
              }
            : { data: review, ...(path.endsWith('/confirm') ? { replayed: false } : {}) },
      })
    }
    const backend = path.startsWith('/api/ai/')
      ? ai
      : /^\/api\/(semester-schedules|semester-schedule-imports|lessons|schedule|education-institutions|academic-periods|subjects|teachers)/.test(
            path,
          )
        ? semester
        : activity
    const result = backend.handle(req.url(), req.method(), req.postDataJSON() ?? {})
    await route.fulfill({
      status: result.status,
      headers,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
    })
  })
  return { activity, semester, ai }
}
for (const path of contentRoutes)
  test(`content: ${path}`, async ({ page }, info) => {
    await setup(page, ['/login', '/register', '/forgot-password', '/reset-password'].includes(path))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).last()).toBeVisible()
    await expect(page.getByText('Завантажуємо дані…', { exact: true })).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    if (path !== '/reset-password') await expect(page.locator('.error-state')).toHaveCount(0)
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${path} overflow`,
      ).toBe(true)
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
        `${path} ${theme}`,
      ).toEqual([])
      await page.screenshot({
        path: info.outputPath(`${process.env.UX_CAPTURE_PREFIX ?? 'content'}-${theme}.png`),
        fullPage: true,
      })
    }
    writeFileSync(
      info.outputPath('evidence.json'),
      JSON.stringify({
        route: path,
        project: info.project.name,
        themes: ['light', 'dark'],
        files: ['content-light.png', 'content-dark.png'],
      }),
    )
    expect(errors).toEqual([])
  })

async function stateScreenshot(
  page: Page,
  info: import('@playwright/test').TestInfo,
  name: string,
) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    ).toEqual([])
    await page.screenshot({ path: info.outputPath(`state-${name}-${theme}.png`), fullPage: true })
  }
  writeFileSync(
    info.outputPath(`evidence-${name}.json`),
    JSON.stringify({
      route: new URL(page.url()).pathname,
      state: name,
      project: info.project.name,
      themes: ['light', 'dark'],
      files: [`state-${name}-light.png`, `state-${name}-dark.png`],
    }),
  )
}
const fixtureHeaders = {
  'Access-Control-Allow-Origin': 'http://localhost:4173',
  'Access-Control-Allow-Credentials': 'true',
}

test('content states: task loading, server error, empty list and validation', async ({
  page,
}, info) => {
  await setup(page, false)
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route('http://localhost:8000/api/tasks?**', async (route) => {
    await gate
    await route.fallback()
  })
  await page.goto('/tasks')
  await expect(page.getByText('Завантажуємо дані…', { exact: true }).first()).toBeVisible()
  await stateScreenshot(page, info, 'loading')
  release()
  await page.unroute('http://localhost:8000/api/tasks?**')
  await page.route(/http:\/\/localhost:8000\/api\/tasks(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      headers: fixtureHeaders,
      json: { message: 'Service unavailable' },
    }),
  )
  await page.reload()
  await expect(page.getByText('Сервіс тимчасово недоступний')).toBeVisible()
  await stateScreenshot(page, info, 'server-error')
  await page.route(/http:\/\/localhost:8000\/api\/tasks(?:\?.*)?$/, (route) =>
    route.fulfill({
      headers: fixtureHeaders,
      json: {
        data: [],
        links: { first: null, last: null, next: null, prev: null },
        meta: {
          current_page: 1,
          last_page: 1,
          total: 0,
          from: null,
          to: null,
          per_page: 15,
          path: '/api/tasks',
          links: [],
        },
      },
    }),
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Завдань поки немає' })).toBeVisible()
  await stateScreenshot(page, info, 'empty')
  await page.goto('/tasks/new')
  await page.route('http://localhost:8000/api/tasks', async (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 422,
          headers: fixtureHeaders,
          json: { errors: { title: ['Уточніть назву навчальної роботи.'] } },
        })
      : route.fallback(),
  )
  await page.getByLabel('Назва завдання *', { exact: true }).fill('Підготувати звіт')
  await page.getByRole('button', { name: 'Створити завдання', exact: true }).click()
  await expect(page.getByText('Уточніть назву навчальної роботи.').first()).toBeVisible()
  await stateScreenshot(page, info, 'validation')
})

test('content states: selected classes, whole list, day cancellation confirmation', async ({
  page,
}, info) => {
  await setup(page, false)
  await page.goto('/schedule/semesters/1/dates/2026-11-02')
  await expect(page.getByRole('heading', { name: /Після збереження/ })).toBeVisible()
  await stateScreenshot(page, info, 'selected-classes')
  await page.getByRole('button', { name: 'Редагувати як повну заміну дня', exact: true }).click()
  await expect(page.getByText(/Редагування всього списку/)).toBeVisible()
  await stateScreenshot(page, info, 'whole-list')
  await page.getByRole('button', { name: 'Скасувати всі пари на цю дату', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await stateScreenshot(page, info, 'cancel-day-dialog')
})

test('content states: import confirmation and completed receipt', async ({ page }, info) => {
  await setup(page, false, true)
  await page.goto('/schedule/semester-imports/41')
  await page.getByRole('button', { name: 'Переглянути підтвердження імпорту', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: 'Підтвердити імпорт', exact: true }),
  ).toBeDisabled()
  await stateScreenshot(page, info, 'import-confirmation')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Підтвердити імпорт', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Збережена квитанція імпорту', exact: true }),
  ).toBeVisible()
  await stateScreenshot(page, info, 'import-applied')
})

test('content states: proposed and saved study plan', async ({ page }, info) => {
  await setup(page, false)
  await page.goto('/planning/preview')
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пропозиція — ще не збережено' })).toBeVisible()
  await stateScreenshot(page, info, 'plan-proposal')
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check()
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Збережений результат' })).toBeVisible()
  await stateScreenshot(page, info, 'plan-saved')
})

test('content states: AI review and immutable execution receipt', async ({ page }, info) => {
  await setup(page, false)
  await page.goto('/ai/conversations/1')
  const review = page.locator('.ai-action-review')
  await expect(review).toBeVisible()
  await stateScreenshot(page, info, 'ai-proposal')
  for (const checkbox of await review.getByRole('checkbox').all()) await checkbox.check()
  await review.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(review.getByRole('heading', { name: 'Квитанція виконання' })).toBeVisible()
  await stateScreenshot(page, info, 'ai-receipt')
})

test('content states: read-only session and reminder history', async ({ page }, info) => {
  const { activity } = await setup(page, false)
  activity.base.sessions = [
    {
      ...activity.base.sessions[0]!,
      status: 'completed',
      actual_minutes: 25,
      completed_at: '2026-11-02T07:00:00Z',
    },
  ]
  await page.goto('/planning/sessions/1')
  await expect(page.getByText(/Історичний стан збережено/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Завершити сесію', exact: true })).toHaveCount(0)
  await stateScreenshot(page, info, 'session-history')
  await page.goto('/reminders/2')
  await expect(page.getByText(/Це збережена історія/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Скасувати нагадування', exact: true }),
  ).toHaveCount(0)
  await stateScreenshot(page, info, 'reminder-history')
})

test('content states: weekly availability dialog and precise interval validation', async ({
  page,
}, info) => {
  await setup(page, false)
  await page.goto('/planning/availability')
  await page.getByRole('button', { name: 'Додати час: Середа', exact: true }).click()
  await expect(page.getByLabel('День тижня', { exact: true })).toHaveValue('3')
  await stateScreenshot(page, info, 'availability-dialog')
  await page.getByLabel('Кінець інтервалу', { exact: true }).fill('08:00')
  await page.getByRole('button', { name: 'Зберегти інтервал', exact: true }).click()
  await expect(page.getByText(/Кінець має бути пізніше початку/)).toBeVisible()
  await stateScreenshot(page, info, 'availability-validation')
})

// Read failures and loading are exercised against each page's real API dependencies.
// Authentication, profile (already bootstrapped) and 404 have separate state tests.
for (const path of contentRoutes.filter(
  (path) =>
    ![
      '/login',
      '/register',
      '/forgot-password',
      '/reset-password',
      '/profile',
      '/missing-page',
    ].includes(path),
))
  test(`content resilience: ${path}`, async ({ page }, info) => {
    await setup(page, false)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const delay = async (route: import('@playwright/test').Route) => {
      if (new URL(route.request().url()).pathname === '/api/profile') return route.fallback()
      await gate
      await route.fallback()
    }
    await page.route('http://localhost:8000/api/**', delay)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).last()).toBeVisible()
    if (path === '/reminders/new')
      await page.getByLabel('Пов’язати з навчанням', { exact: true }).selectOption('task')
    await expect(page.getByText('Завантажуємо дані…', { exact: true }).first()).toBeVisible()
    await stateScreenshot(page, info, 'page-loading')
    release()
    await page.unroute('http://localhost:8000/api/**', delay)
    await page.route('http://localhost:8000/api/**', async (route) => {
      if (new URL(route.request().url()).pathname === '/api/profile') return route.fallback()
      await route.fulfill({
        status: 503,
        headers: fixtureHeaders,
        json: { message: 'Service unavailable' },
      })
    })
    await page.reload()
    if (path === '/reminders/new')
      await page.getByLabel('Пов’язати з навчанням', { exact: true }).selectOption('task')
    await expect(page.getByText('Сервіс тимчасово недоступний').first()).toBeVisible()
    await stateScreenshot(page, info, 'page-server-error')
  })

for (const path of [
  '/',
  '/schedule',
  '/schedule/semester-calendar',
  '/schedule/legacy',
  '/tasks',
  '/planning',
  '/planning/availability',
  '/planning/free-time',
  '/planning/sessions',
  '/reminders',
  '/inbox',
  '/statistics',
  '/statistics/trends',
  '/academic/institutions',
  '/academic/periods',
  '/academic/subjects',
  '/academic/teachers',
  '/ai',
  '/planning/suggestions',
])
  test(`content empty: ${path}`, async ({ page }, info) => {
    const { activity, semester, ai } = await setup(page, false)
    activity.base.base.tasks.splice(0)
    activity.base.sessions = []
    activity.base.windows = []
    activity.reminders.splice(0)
    activity.notifications = []
    activity.emptyReports = true
    semester.data.weekly_rules = []
    semester.data.date_exceptions = []
    ai.conversations.splice(0)
    await page.route('http://localhost:8000/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (
        [
          '/api/subjects',
          '/api/teachers',
          '/api/education-institutions',
          '/api/academic-periods',
        ].includes(path)
      )
        return route.fulfill({ headers: fixtureHeaders, json: { data: [] } })
      if (path.startsWith('/api/academic-calendar/') || path === '/api/planning/free-slots')
        return route.fulfill({
          headers: fixtureHeaders,
          json: {
            data: [],
            meta: {
              timezone: 'Europe/Kyiv',
              start_date: '2026-11-02',
              end_date: '2026-11-08',
              truncated: false,
              total: 0,
              returned: 0,
              limit: 100,
            },
          },
        })
      if (path === '/api/planning/recovery-suggestions')
        return route.fulfill({
          headers: fixtureHeaders,
          json: {
            data: [],
            meta: { current_page: 1, last_page: 1 },
            automation: { last_scanned_at: null, last_outcome: null },
          },
        })
      await route.fallback()
    })
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).last()).toBeVisible()
    await expect(page.getByText('Завантажуємо дані…', { exact: true })).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    await stateScreenshot(page, info, 'page-empty')
  })

test('content states: recovery proposal and saved result', async ({ page }, info) => {
  await setup(page, false)
  await page.goto('/planning/suggestions/d1f31316-b23a-456a-a38a-e8fe905a8601')
  const review = page.getByRole('region', { name: 'Огляд пропозиції', exact: true })
  await expect(
    review.getByRole('button', { name: 'Підтвердити зміни', exact: true }),
  ).toBeDisabled()
  await stateScreenshot(page, info, 'recovery-review')
  await review.getByRole('checkbox').check()
  await review.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(
    review.getByRole('heading', { name: 'Збережений результат', exact: true }),
  ).toBeVisible()
  await stateScreenshot(page, info, 'recovery-applied')
})

test.describe('sanitized account states', () => {
  test('content account states: accepted email, valid reset form and completed reset', async ({
    page,
  }, info) => {
    await setup(page, true)
    for (const endpoint of ['forgot-password', 'reset-password'])
      await page.route(`http://localhost:8000/api/auth/${endpoint}`, async (route) => {
        if (route.request().method() === 'OPTIONS') return route.fallback()
        await route.fulfill({ headers: fixtureHeaders, json: { message: 'Accepted' } })
      })
    await page.goto('/forgot-password')
    await page.getByLabel('Електронна пошта', { exact: true }).fill('student@example.test')
    await page.getByRole('button', { name: 'Надіслати інструкцію', exact: true }).click()
    await expect(page.getByText(/Якщо обліковий запис із такою адресою існує/)).toBeVisible()
    await stateScreenshot(page, info, 'recovery-email-accepted')
    // The app strips the synthetic link before any screenshot. No secret is displayed.
    await page.goto('/reset-password?token=disposable-offline-fixture&email=student%40example.test')
    await expect(page).toHaveURL(/\/reset-password$/)
    await expect(
      page.getByRole('button', { name: 'Зберегти новий пароль', exact: true }),
    ).toBeVisible()
    await stateScreenshot(page, info, 'reset-form')
    await page.getByLabel('Новий пароль', { exact: true }).fill('x'.repeat(12))
    await page.getByLabel('Підтвердження нового пароля', { exact: true }).fill('x'.repeat(12))
    await page.getByRole('button', { name: 'Зберегти новий пароль', exact: true }).click()
    await expect(
      page.getByText('Пароль скинуто. Увійдіть із новим паролем.', { exact: true }),
    ).toBeVisible()
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
    await stateScreenshot(page, info, 'reset-completed')
  })
})

test('content populated details: grouped free periods and conversational Tool result', async ({
  page,
}, info) => {
  const { ai } = await setup(page, false)
  await page.route('http://localhost:8000/api/planning/free-slots?**', (route) =>
    route.fulfill({
      headers: fixtureHeaders,
      json: {
        data: [
          {
            starts_at: '2026-11-02T12:00:00Z',
            ends_at: '2026-11-02T12:30:00Z',
            duration_seconds: 1800,
          },
          {
            starts_at: '2026-11-02T14:00:00Z',
            ends_at: '2026-11-02T15:00:00Z',
            duration_seconds: 3600,
          },
          {
            starts_at: '2026-11-03T12:00:00Z',
            ends_at: '2026-11-03T13:00:00Z',
            duration_seconds: 3600,
          },
        ],
        meta: { start_date: '2026-11-02', end_date: '2026-11-08', timezone: 'Europe/Kyiv' },
      },
    }),
  )
  await page.goto('/planning/free-time')
  await expect(page.locator('main .card')).toHaveCount(3)
  await expect(page.getByText('14:00 — 14:30', { exact: true })).toBeVisible()
  await stateScreenshot(page, info, 'free-periods')
  const answer = messageFixture(2, 'Перевірю ваші завдання та найближчі дедлайни.')
  answer.tool_calls = [{ call_id: 'offline-read', name: 'list_tasks' }]
  const tool = messageFixture(3, '', 'tool')
  tool.tool_result = { call_id: 'offline-read', name: 'list_tasks', ok: true, error_code: null }
  ai.messages.set(1, [
    messageFixture(1, 'Що варто зробити цього тижня?', 'user'),
    answer,
    tool,
    messageFixture(
      4,
      'Почніть із читання розділу. Для змін навчального плану перегляньте окрему пропозицію нижче.',
    ),
  ])
  await page.goto('/ai/conversations/1')
  await expect(page.locator('.ai-message')).toHaveCount(4)
  await expect(page.locator('.ai-tool-result')).toContainText('Перевірку виконано')
  await stateScreenshot(page, info, 'chat-read-result')
})
