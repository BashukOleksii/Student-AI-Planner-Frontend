import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { Temporal } from '@js-temporal/polyfill'
import { authorizeLive, dispatchAllowed } from './support/liveSafety'
import { serveLiveFrontend, liveApi } from './support/liveBrowser'
import type {
  Resource,
  Page as ApiPage,
  User,
  Task,
  Subtask,
  StudySession,
  Reminder,
  Schedule,
  Progress,
} from '../src/types/api'
import type {
  PlanningPreferences,
  AvailabilityWindow,
  ProtectedPreview,
  StudyPlan,
  PersistedPlan,
  ReplanningReview,
  ReplanningResult,
  ReschedulingResult,
  RangeResource,
} from '../src/types/planning'
import type { ScheduleImportBatch } from '../src/types/scheduleImport'
import type { InboxNotification } from '../src/types/reminders'
import type { ProgressTrends, ProgressComparison } from '../src/types/statistics'
const authorization = authorizeLive('system')
async function api<T>(
  page: Page,
  path: string,
  method = 'GET',
  body?: unknown,
  status = 200,
): Promise<T> {
  const response = await liveApi<T>(page, path, method, body)
  expect(response.status, `${method} ${path}`).toBe(status)
  return response.data
}
async function notificationsFor(page: Page, reminderId: number) {
  const matches: InboxNotification[] = []
  for (let number = 1; ; number++) {
    const result = await api<ApiPage<InboxNotification>>(
      page,
      `/api/notifications?per_page=100&page=${number}`,
    )
    expect(result.meta.current_page).toBe(number)
    matches.push(...result.data.filter((item) => item.reminder_id === reminderId))
    if (number >= result.meta.last_page) return matches
  }
}
async function upload(page: Page, period: number) {
  await page.goto('/schedule/import')
  await page.getByLabel('Навчальний період імпорту *', { exact: true }).selectOption(String(period))
  await page.locator('input[type="file"]').setInputFiles('public/examples/schedule-example.xlsx')
  const result = page.waitForResponse(
    (r) => r.url().endsWith('/api/schedule-imports') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Завантажити й перевірити', exact: true }).click()
  const response = await result
  expect(response.status()).toBe(201)
  const batch: Resource<ScheduleImportBatch> = await response.json()
  return batch.data
}
async function review(
  page: Page,
  path: string,
  start: string,
  end: string,
  task: number,
  child: number,
) {
  await page.goto(path)
  await page.getByLabel('Початок періоду', { exact: true }).fill(start)
  await page.getByLabel('Кінець періоду', { exact: true }).fill(end)
  await page.getByLabel('Завдання для планування', { exact: true }).selectOption(String(task))
  await page.getByLabel('Підзавдання для планування', { exact: true }).selectOption(String(child))
  const result = page.waitForResponse(
    (r) => r.url().endsWith('/preview') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
  const response = await result
  expect(response.status()).toBe(200)
  return response
}
async function confirmReview(page: Page, status: number) {
  for (const label of [
    'Приймаю частковий результат і неперенесену тривалість',
    'Дозволяю скасувати початкові сесії без заміни та їхні заплановані нагадування',
  ]) {
    const control = page.getByLabel(label, { exact: true })
    if (await control.count()) {
      await expect(control).not.toBeChecked()
      await control.check()
    }
  }
  const result = page.waitForResponse(
    (r) => r.url().endsWith('/confirm') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  const response = await result
  expect(response.status()).toBe(status)
  return response
}
// Not run by offline CI. Reuses an explicitly approved empty account; retains its
// fixture/history and never resets the DB, creates accounts or invokes AI.
test('authorized real XLSX → planning → sessions → reminders → reports → logout', async ({
  page,
}, testInfo) => {
  await serveLiveFrontend(page)
  await page.goto('/')
  const owner = (await api<Resource<User>>(page, '/api/profile')).data
  expect(owner.id).toBe(authorization.grant.user_id)
  const prefix = `F7 ${Date.now()}`,
    zone = owner.timezone
  const now = Temporal.Now.plainDateISO(zone),
    start = now.add({ days: 14 }).add({ days: 1 - now.add({ days: 14 }).dayOfWeek }),
    end = start.add({ days: 6 })
  const utc = (date: string, clock: string) =>
    Temporal.PlainDateTime.from(`${date}T${clock}`)
      .toZonedDateTime(zone, { disambiguation: 'reject' })
      .toInstant()
      .toString({ smallestUnit: 'second' })
  const dates = `start_date=${start}&end_date=${end}`
  // Refuse to overwrite an account with existing work/configuration.
  expect((await api<ApiPage<Task>>(page, '/api/tasks')).meta.total).toBe(0)
  expect((await api<ApiPage<Reminder>>(page, '/api/reminders')).meta.total).toBe(0)
  expect(
    (await api<Resource<AvailabilityWindow[]>>(page, '/api/study-availability-windows')).data,
  ).toEqual([])
  expect(
    Object.values(
      (await api<Resource<PlanningPreferences>>(page, '/api/planning-preferences')).data,
    ).every((v) => v === null),
  ).toBe(true)
  expect(
    (await api<RangeResource<StudySession>>(page, `/api/study-sessions?${dates}`)).data,
  ).toEqual([])
  for (const endpoint of ['subjects', 'teachers', 'academic-periods', 'education-institutions'])
    expect((await api<Resource<unknown[]>>(page, `/api/${endpoint}`)).data).toEqual([])
  await page.reload()
  expect((await api<Resource<User>>(page, '/api/profile')).data.id).toBe(owner.id)
  expect((await liveApi(page, '/api/profile', 'PATCH', { name: owner.name }, false)).status).toBe(
    419,
  )
  await api(page, '/sanctum/csrf-cookie', 'GET', undefined, 204)
  const institution = (
    await api<Resource<{ id: number }>>(
      page,
      '/api/education-institutions',
      'POST',
      { name: prefix },
      201,
    )
  ).data
  const period = (
    await api<Resource<{ id: number }>>(
      page,
      '/api/academic-periods',
      'POST',
      {
        name: prefix,
        education_institution_id: institution.id,
        starts_on: String(start),
        ends_on: String(end),
      },
      201,
    )
  ).data
  const first = await upload(page, period.id)
  expect(first.status).toBe('uploaded')
  expect(first.invalid_rows).toBeGreaterThan(0)
  expect(
    (await api<Resource<ScheduleImportBatch>>(page, `/api/schedule-imports/${first.id}`)).data.rows,
  ).toEqual(first.rows)
  const subjects = new Map<string, number>()
  for (const name of new Set(
    first.rows.map((row) => row.subject_name).filter((v): v is string => !!v),
  ))
    subjects.set(
      name,
      (
        await api<Resource<{ id: number }>>(
          page,
          '/api/subjects',
          'POST',
          { name, education_institution_id: institution.id },
          201,
        )
      ).data.id,
    )
  for (const name of new Set(
    first.rows.map((row) => row.teacher_name).filter((v): v is string => !!v),
  ))
    await api(
      page,
      '/api/teachers',
      'POST',
      { name, education_institution_id: institution.id },
      201,
    )
  const valid = (
    await api<Resource<ScheduleImportBatch>>(
      page,
      `/api/schedule-imports/${first.id}/revalidate`,
      'POST',
      {},
    )
  ).data
  expect(valid.status).toBe('validated')
  expect(valid.invalid_rows).toBe(0)
  const concurrent = await upload(page, period.id)
  expect(concurrent.status).toBe('validated')
  const committed = (
    await api<Resource<ScheduleImportBatch>>(
      page,
      `/api/schedule-imports/${first.id}/commit`,
      'POST',
      {},
    )
  ).data
  expect(committed.status).toBe('committed')
  expect(committed.committed_at).not.toBeNull()
  const schedule = await api<Schedule>(page, `/api/schedule/week/${start}`)
  expect(schedule.data.length).toBeGreaterThan(0)
  for (const lesson of schedule.data)
    expect((await api<Resource<{ id: number }>>(page, `/api/lessons/${lesson.id}`)).data.id).toBe(
      lesson.id,
    )
  const changed = await liveApi<Resource<ScheduleImportBatch>>(
    page,
    `/api/schedule-imports/${concurrent.id}/commit`,
    'POST',
    {},
  )
  expect(changed.status).toBe(409)
  expect(changed.data.data.id).toBe(concurrent.id)
  const duplicate = (
    await api<Resource<ScheduleImportBatch>>(page, `/api/schedule-imports/${concurrent.id}`)
  ).data
  expect(duplicate.duplicate_rows).toBeGreaterThan(0)
  expect(duplicate.rows.some((row) => row.operation === 'noop')).toBe(true)
  expect(
    (
      await api<Resource<ScheduleImportBatch>>(
        page,
        `/api/schedule-imports/${concurrent.id}/commit`,
        'POST',
        {},
      )
    ).data.status,
  ).toBe('committed')
  expect((await api<Schedule>(page, `/api/schedule/week/${start}`)).data.map((l) => l.id)).toEqual(
    schedule.data.map((l) => l.id),
  )
  const task = (
    await api<Resource<Task>>(
      page,
      '/api/tasks',
      'POST',
      {
        title: prefix,
        subject_id: [...subjects.values()][0],
        priority: 3,
        estimated_minutes: 180,
        deadline_at: utc(String(end), '23:00:00'),
      },
      201,
    )
  ).data
  const child = (
    await api<Resource<Subtask>>(
      page,
      `/api/tasks/${task.id}/subtasks`,
      'POST',
      { title: `${prefix} child`, estimated_minutes: 180, deadline_at: task.deadline_at },
      201,
    )
  ).data
  const preferences: PlanningPreferences = {
    max_daily_study_minutes: 45,
    max_weekly_study_minutes: 90,
    preferred_break_minutes: 5,
    min_session_minutes: 15,
    max_session_minutes: 30,
  }
  await api(page, '/api/planning-preferences', 'PUT', preferences)
  expect(
    (await api<Resource<PlanningPreferences>>(page, '/api/planning-preferences')).data,
  ).toEqual(preferences)
  for (let day = 1; day <= 7; day++)
    await api(
      page,
      '/api/study-availability-windows',
      'POST',
      { day_of_week: day, starts_at: '20:00:00', ends_at: '22:00:00' },
      201,
    )
  expect(
    (await api<RangeResource<unknown>>(page, `/api/planning/free-slots?${dates}`)).data.length,
  ).toBeGreaterThan(0)
  const preview: Resource<ProtectedPreview<StudyPlan>> = await (
    await review(page, '/planning/preview', String(start), String(end), task.id, child.id)
  ).json()
  expect(preview.data.sessions.length).toBeGreaterThan(0)
  const plan: Resource<PersistedPlan> = await (await confirmReview(page, 201)).json()
  for (const session of plan.data.sessions)
    expect(
      (await api<Resource<StudySession>>(page, `/api/study-sessions/${session.id}`)).data,
    ).toEqual(session)
  // A new academic blocker is legal Lesson input; only Laravel determines replanning.
  const source = plan.data.sessions[0]!
  await api(
    page,
    '/api/lessons',
    'POST',
    {
      subject_id: [...subjects.values()][0],
      type: 'other',
      starts_at: source.starts_at,
      ends_at: source.ends_at,
    },
    201,
  )
  const adaptive: Resource<ProtectedPreview<ReplanningReview>> = await (
    await review(page, '/planning/replanning', String(start), String(end), task.id, child.id)
  ).json()
  expect(adaptive.data.summary.affected_sessions).toBeGreaterThan(0)
  const adapted: Resource<ReplanningResult> = await (await confirmReview(page, 200)).json()
  for (const original of adapted.data.original_sessions)
    expect(
      (await api<Resource<StudySession>>(page, `/api/study-sessions/${original.id}`)).data.status,
    ).toBe(original.status)
  const replacement = adapted.data.replacement_sessions[0]
  expect(replacement).toBeDefined()
  const moved = (
    await api<Resource<ReschedulingResult>>(
      page,
      `/api/study-sessions/${replacement!.id}/reschedule`,
      'POST',
      { starts_at: utc(String(end), '20:00:00'), ends_at: utc(String(end), '20:30:00') },
      201,
    )
  ).data
  expect(
    (await api<Resource<StudySession>>(page, `/api/study-sessions/${replacement!.id}`)).data.status,
  ).toBe('rescheduled')
  const sessionReminder = (
    await api<Resource<Reminder>>(
      page,
      '/api/reminders',
      'POST',
      { study_session_id: moved.replacement.id, anchor: 'session_start', offset_minutes: -15 },
      201,
    )
  ).data
  await api(page, `/api/study-sessions/${moved.replacement.id}/cancel`, 'POST', {})
  expect(
    (await api<Resource<Reminder>>(page, `/api/reminders/${sessionReminder.id}`)).data.status,
  ).toBe('cancelled')
  const relative = (
    await api<Resource<Reminder>>(
      page,
      '/api/reminders',
      'POST',
      { task_id: task.id, anchor: 'task_deadline', offset_minutes: -60 },
      201,
    )
  ).data
  const shifted = Temporal.Instant.from(task.deadline_at!)
    .add({ seconds: 1800 })
    .toString({ smallestUnit: 'second' })
  await api(page, `/api/tasks/${task.id}`, 'PATCH', { deadline_at: shifted })
  expect(
    (await api<Resource<Reminder>>(page, `/api/reminders/${relative.id}`)).data.trigger_at,
  ).toBe(
    Temporal.Instant.from(shifted).subtract({ seconds: 3600 }).toString({ smallestUnit: 'second' }),
  )
  const childReminder = (
    await api<Resource<Reminder>>(
      page,
      '/api/reminders',
      'POST',
      { subtask_id: child.id, anchor: 'subtask_deadline', offset_minutes: -30 },
      201,
    )
  ).data
  // Keep the child deadline within the parent's newly extended deadline.
  await api(page, `/api/tasks/${task.id}/subtasks/${child.id}`, 'PATCH', { deadline_at: shifted })
  expect(
    (await api<Resource<Reminder>>(page, `/api/reminders/${childReminder.id}`)).data.trigger_at,
  ).toBe(
    Temporal.Instant.from(shifted).subtract({ seconds: 1800 }).toString({ smallestUnit: 'second' }),
  )
  const absolute = (
    await api<Resource<Reminder>>(
      page,
      '/api/reminders',
      'POST',
      { message: prefix, trigger_at: shifted },
      201,
    )
  ).data
  await api(page, `/api/reminders/${absolute.id}`, 'PATCH', { message: `${prefix} updated` })
  await api(page, `/api/reminders/${absolute.id}/cancel`, 'POST', {})
  expect((await api<Resource<Reminder>>(page, `/api/reminders/${absolute.id}`)).data.status).toBe(
    'cancelled',
  )
  await api(page, `/api/tasks/${task.id}/complete`, 'POST', {})
  expect(
    (await api<Resource<Subtask>>(page, `/api/tasks/${task.id}/subtasks/${child.id}`)).data.status,
  ).toBe('pending')
  expect((await api<Resource<Reminder>>(page, `/api/reminders/${relative.id}`)).data.status).toBe(
    'cancelled',
  )
  expect(
    (await api<Resource<Reminder>>(page, `/api/reminders/${childReminder.id}`)).data.status,
  ).toBe('cancelled')
  if (dispatchAllowed(authorization.grant, process.env.F7_LIVE_ALLOW_DISPATCH)) {
    const trigger = Temporal.Now.instant().add({ seconds: 10 }).toString({ smallestUnit: 'second' })
    const due = (
      await api<Resource<Reminder>>(
        page,
        '/api/reminders',
        'POST',
        { message: `${prefix} dispatch`, trigger_at: trigger },
        201,
      )
    ).data
    await expect
      .poll(() => Date.now(), { timeout: 20000, intervals: [1000] })
      .toBeGreaterThan(Date.parse(trigger))
    execFileSync('php', ['artisan', 'reminders:dispatch-due', '--limit=100'], {
      cwd: authorization.backendRoot,
      stdio: 'pipe',
      timeout: 30000,
    })
    const sent = (await api<Resource<Reminder>>(page, `/api/reminders/${due.id}`)).data
    expect(sent.status).toBe('sent')
    expect(sent.sent_at).not.toBeNull()
    const delivered = await notificationsFor(page, due.id)
    expect(delivered).toHaveLength(1)
    const notification = delivered[0]!
    expect(notification.read_at).toBeNull()
    const read = (
      await api<Resource<InboxNotification>>(
        page,
        `/api/notifications/${notification!.id}/read`,
        'POST',
      )
    ).data
    expect(read.read_at).not.toBeNull()
    expect(
      (
        await api<Resource<InboxNotification>>(
          page,
          `/api/notifications/${notification!.id}/read`,
          'POST',
        )
      ).data.read_at,
    ).toBe(read.read_at)
    const persisted = await notificationsFor(page, due.id)
    expect(persisted).toHaveLength(1)
    expect(persisted[0]!.read_at).toBe(read.read_at)
  } else
    testInfo.annotations.push({
      type: 'blocked',
      description:
        'Actual delivery requires separate F7_LIVE_ALLOW_DISPATCH=1 and disposable-database grant.',
    })
  const today = Temporal.Now.plainDateISO(zone),
    recent = `start_date=${today.subtract({ days: 6 })}&end_date=${today}`
  const progress = (await api<Resource<Progress>>(page, `/api/statistics/progress?${recent}`)).data
  for (const status of ['planned', 'completed', 'missed', 'rescheduled', 'cancelled'] as const)
    expect(progress.study_sessions.started_in_period[status]).toHaveProperty('scheduled_seconds')
  expect(
    (await api<Resource<ProgressTrends>>(page, `/api/statistics/trends?${recent}`)).data.days,
  ).toHaveLength(7)
  expect(
    (
      await api<Resource<ProgressComparison>>(
        page,
        `/api/statistics/reports/comparison?baseline_start_date=${today.subtract({ days: 13 })}&baseline_end_date=${today.subtract({ days: 7 })}&current_start_date=${today.subtract({ days: 6 })}&current_end_date=${today}`,
      )
    ).data.comparison.historical_snapshot,
  ).toBe(false)
  await page.goto('/statistics')
  await expect(
    page.getByRole('heading', { name: 'Статистика прогресу', exact: true }),
  ).toBeVisible()
  await api(page, '/api/auth/logout', 'POST', {}, 204)
  expect((await liveApi(page, '/api/profile')).status).toBe(401)
  await page.goto('/planning')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await testInfo.attach('retained-fixture-identifiers', {
    body: JSON.stringify({
      owner_id: owner.id,
      prefix,
      period_id: period.id,
      task_id: task.id,
      child_id: child.id,
      import_ids: [first.id, concurrent.id],
      partial: !preview.data.summary.fully_allocated,
    }),
    contentType: 'application/json',
  })
})
