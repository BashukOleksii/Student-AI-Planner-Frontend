import { expect, test } from '@playwright/test'
import { serveLiveFrontend, liveApi } from './support/liveBrowser'
import { privateAuthPath } from './support/liveSafety'
import type {
  Page as ApiPage,
  Progress,
  Reminder,
  Resource,
  StudySession,
  User,
} from '../src/types/api'
import type {
  AvailabilityWindow,
  Interval,
  PlanningPreferences,
  RangeResource,
} from '../src/types/planning'
import type { InboxNotification } from '../src/types/reminders'
import type { ProgressComparison, ProgressTrends } from '../src/types/statistics'
const paths = [
  '/api/profile',
  '/api/planning-preferences',
  '/api/study-availability-windows',
  '/api/planning/free-slots?start_date=2026-10-01&end_date=2026-10-07',
  '/api/study-sessions?start_date=2026-10-01&end_date=2026-10-07',
  '/api/reminders',
  '/api/notifications?unread_only=true',
  '/api/statistics/progress?start_date=2026-10-01&end_date=2026-10-07',
  '/api/statistics/trends?start_date=2026-10-01&end_date=2026-10-07',
  '/api/statistics/reports/comparison?baseline_start_date=2026-10-01&baseline_end_date=2026-10-07&current_start_date=2026-10-08&current_end_date=2026-10-14',
]
test('real browser CORS, CSRF cookie and protected read boundaries', async ({ page }) => {
  await serveLiveFrontend(page)
  await page.goto('/planning')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  const csrf = await liveApi(page, '/sanctum/csrf-cookie')
  expect(csrf.status).toBe(204)
  const cookies = await page.context().cookies()
  expect(cookies.some((c) => c.name === 'XSRF-TOKEN')).toBe(true)
  expect(cookies.some((c) => c.httpOnly)).toBe(true)
  for (const path of paths) expect((await liveApi(page, path)).status, path).toBe(401)
})
test('authorized existing session reads F4–F6 resources without domain mutations', async ({
  browser,
}) => {
  test.skip(
    !process.env.F7_READ_STORAGE_STATE || !process.env.F7_READ_USER_ID,
    'BLOCKED: no operator-provided authorized read session/identity.',
  )
  const context = await browser.newContext({
      storageState: privateAuthPath(process.env.F7_READ_STORAGE_STATE!),
      timezoneId: 'UTC',
    }),
    page = await context.newPage()
  try {
    await serveLiveFrontend(page)
    await page.goto('/')
    async function read<T>(path: string) {
      const response = await liveApi<T>(page, path)
      expect(response.status, path).toBe(200)
      expect(response.data as unknown).toHaveProperty('data')
      return response.data
    }
    const profile = (await read<Resource<User>>(paths[0]!)).data
    expect(profile.id).toBe(Number(process.env.F7_READ_USER_ID))
    expect(profile.name).toEqual(expect.any(String))
    expect(profile.email).toEqual(expect.stringContaining('@'))
    expect(() => new Intl.DateTimeFormat('en', { timeZone: profile.timezone })).not.toThrow()
    const preferences = (await read<Resource<PlanningPreferences>>(paths[1]!)).data
    for (const key of [
      'max_daily_study_minutes',
      'max_weekly_study_minutes',
      'preferred_break_minutes',
      'min_session_minutes',
      'max_session_minutes',
    ] as const) {
      expect(preferences).toHaveProperty(key)
      if (preferences[key] !== null) expect(Number.isInteger(preferences[key])).toBe(true)
    }
    const availability = (await read<Resource<AvailabilityWindow[]>>(paths[2]!)).data
    expect(Array.isArray(availability)).toBe(true)
    for (const window of availability) {
      expect(window.id).toBeGreaterThan(0)
      expect(window.day_of_week).toBeGreaterThanOrEqual(1)
      expect(window.day_of_week).toBeLessThanOrEqual(7)
      expect(window.starts_at).toMatch(/^\d{2}:\d{2}:\d{2}$/)
      expect(window.ends_at).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    }
    for (const path of [paths[3]!, paths[4]!]) {
      const range = await read<RangeResource<Interval | StudySession>>(path)
      expect(range.meta).toMatchObject({
        timezone: profile.timezone,
        start_date: '2026-10-01',
        end_date: '2026-10-07',
      })
      expect(Array.isArray(range.data)).toBe(true)
      for (const interval of range.data) {
        expect(interval.starts_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
        expect(interval.ends_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
        expect(interval.duration_seconds).toBeGreaterThan(0)
        expect(Date.parse(interval.ends_at) - Date.parse(interval.starts_at)).toBe(
          interval.duration_seconds * 1000,
        )
      }
    }
    for (const path of [paths[5]!, paths[6]!]) {
      const collection = await read<ApiPage<Reminder | InboxNotification>>(path)
      expect(Array.isArray(collection.data)).toBe(true)
      expect(collection.meta.current_page).toBe(1)
      expect(collection.meta.total).toBeGreaterThanOrEqual(collection.data.length)
      expect(collection.meta.per_page).toBeGreaterThan(0)
      expect(collection.links).toMatchObject({
        first: expect.any(String),
        last: expect.any(String),
        prev: null,
      })
      if (collection.meta.total === 0) {
        expect(collection.data).toEqual([])
        expect(collection.meta.from).toBeNull()
        expect(collection.meta.to).toBeNull()
      }
    }
    const progress = (await read<Resource<Progress>>(paths[7]!)).data
    const trends = (await read<Resource<ProgressTrends>>(paths[8]!)).data
    const comparison = (await read<Resource<ProgressComparison>>(paths[9]!)).data
    for (const report of [progress, trends, comparison]) {
      expect(report.timezone).toBe(profile.timezone)
      expect(Number.isFinite(Date.parse(report.as_of_utc))).toBe(true)
      expect(report.as_of_utc).toMatch(/Z$/)
    }
    expect(progress.period).toMatchObject({
      start_date: '2026-10-01',
      end_date: '2026-10-07',
      session_attribution: 'starts_at',
    })
    for (const work of [progress.tasks, progress.subtasks]) {
      for (const count of [
        ...Object.values(work.current),
        ...Object.values(work.completed_in_period),
      ]) {
        expect(Number.isInteger(count)).toBe(true)
        expect(count).toBeGreaterThanOrEqual(0)
      }
    }
    for (const status of ['planned', 'completed', 'missed', 'rescheduled', 'cancelled'] as const)
      expect(progress.study_sessions.started_in_period[status]).toMatchObject({
        count: expect.any(Number),
        scheduled_seconds: expect.any(Number),
      })
    expect(trends.period).toMatchObject({ aggregation: 'day', session_attribution: 'starts_at' })
    expect(trends.days.map((day) => day.date)).toEqual(
      Array.from({ length: 7 }, (_, i) => `2026-10-0${i + 1}`),
    )
    expect(trends.totals.tasks_completed).toEqual(progress.tasks.completed_in_period)
    expect(trends.totals.subtasks_completed).toEqual(progress.subtasks.completed_in_period)
    expect(trends.totals.study_sessions).toEqual(progress.study_sessions.started_in_period)
    expect(comparison.comparison).toEqual({
      equal_nominal_days: true,
      session_attribution: 'starts_at',
      historical_snapshot: false,
    })
    expect(comparison.baseline.period).toMatchObject({
      start_date: '2026-10-01',
      end_date: '2026-10-07',
    })
    expect(comparison.current.period).toMatchObject({
      start_date: '2026-10-08',
      end_date: '2026-10-14',
    })
    expect(comparison.baseline.totals).toEqual(trends.totals)
    expect(comparison.delta.tasks_completed.total).toBe(
      comparison.current.totals.tasks_completed.total -
        comparison.baseline.totals.tasks_completed.total,
    )
    expect(comparison.delta.subtasks_completed.total).toBe(
      comparison.current.totals.subtasks_completed.total -
        comparison.baseline.totals.subtasks_completed.total,
    )
    await page.reload()
    await expect(page).not.toHaveURL(/\/login/)
  } finally {
    await context.close()
  }
})
