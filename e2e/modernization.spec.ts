import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { activityBackend } from '../tests/helpers/activityBackend'

test('unified calendar keeps independent identities and recovery requires explicit consent', async ({
  page,
}) => {
  const backend = activityBackend()
  const review = {
    id: 'd1f31316-b23a-456a-a38a-e8fe905a8601',
    kind: 'create_plan',
    status: 'pending',
    period: { start_date: '2026-11-02', end_date: '2026-11-08', timezone: 'Europe/Kyiv' },
    actionable: true,
    confirmation_required: true,
    requires_lifecycle_decision: false,
    required_confirmation_fields: ['accept_partial'],
    reason_codes: ['eligible_remaining_work'],
    review: {
      version: 1,
      kind: 'create_plan',
      new_work_plan: { sessions: [], summary: { unallocated_minutes: 30 } },
    },
    receipt: null as null | { result: { created_count: number } },
    expires_at: '2099-11-02T12:00:00Z',
  }
  const writes: unknown[] = []
  const lesson = {
    id: 'opaque',
    source_identity: 'semester:1:2026-11-02:rule:2',
    source_type: 'semester_occurrence',
    semester_schedule_id: 1,
    weekly_lesson_rule_id: 2,
    lesson_id: null,
    occurs_on: '2026-11-02',
    subject: { id: 1, name: 'Математика' },
    teacher: null,
    type: null,
    room: null,
    starts_at: '2026-11-02T09:00:00+02:00',
    ends_at: '2026-11-02T10:00:00+02:00',
  }
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url())
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    let body: unknown
    if (url.pathname.startsWith('/api/academic-calendar/'))
      body = {
        data: [
          lesson,
          {
            ...lesson,
            id: 7,
            source_identity: 'legacy_lesson:7',
            source_type: 'legacy_lesson',
            lesson_id: 7,
            semester_schedule_id: null,
          },
        ],
        meta: {
          timezone: 'Europe/Kyiv',
          start_date: '2026-11-02',
          end_date: '2026-11-02',
          total: 2,
          returned: 2,
          limit: 100,
          truncated: false,
        },
      }
    else if (url.pathname.endsWith('/confirm')) {
      writes.push(req.postDataJSON())
      review.status = 'applied'
      review.actionable = false
      review.confirmation_required = false
      review.receipt = { result: { created_count: 1 } }
      body = { data: review, replayed: false }
    } else if (url.pathname === '/api/planning/recovery-suggestions')
      body = {
        data: [review],
        meta: { current_page: 1, last_page: 1 },
        automation: { last_scanned_at: null, last_outcome: null },
      }
    else if (url.pathname.includes('/api/planning/recovery-suggestions/')) body = { data: review }
    else {
      const result = backend.handle(req.url(), req.method(), req.postDataJSON() ?? {})
      return route.fulfill({
        status: result.status,
        headers,
        ...(result.status === 204 ? {} : { json: result.body ?? {} }),
      })
    }
    await route.fulfill({ status: 200, json: body, headers })
  })
  await page.goto('/schedule')
  await expect(page.locator('main .academic-lesson')).toHaveCount(2)
  await expect(page.locator('main a[href="/schedule/lessons/7"]')).toBeVisible()
  await expect(page.locator('main a[href="/schedule/semesters/1/dates/2026-11-02"]')).toBeVisible()
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze())
        .violations,
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goto('/planning/suggestions')
  await page.getByRole('button', { name: 'Переглянути', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Підтвердити зміни' })).toBeDisabled()
  expect(writes).toEqual([])
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Підтвердити зміни' }).click()
  await expect(page.getByText('Збережений результат', { exact: true })).toBeVisible()
  expect(writes).toEqual([{ accept_partial: true, accept_unplaced_cancellation: false }])
  await expect(page.getByRole('button', { name: 'Підтвердити зміни' })).toBeDisabled()
  await expect(page).toHaveURL(new RegExp(`/planning/suggestions/${review.id}$`))
  await page.reload()
  await expect(page.getByText('Збережений результат', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(1)
})
