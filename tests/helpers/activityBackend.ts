import { planningBackend, sessionFixture } from './planningBackend'
import { page as makePage, user } from '../fixtures'
import type { Reminder, Progress, Page } from '@/types/api'
import type { InboxNotification } from '@/types/reminders'
import type {
  ActivityMetrics,
  SessionMetrics,
  ProgressComparison,
  ProgressTrends,
} from '@/types/statistics'
import { addDays } from '@/utils/dates'
export const reminderFixture = (id = 1): Reminder => ({
  id,
  task_id: 1,
  subtask_id: null,
  study_session_id: null,
  message: 'Перевірити матеріал',
  trigger_at: '2026-11-12T09:45:00Z',
  anchor: null,
  offset_minutes: null,
  status: 'scheduled',
  sent_at: null,
})
export const notificationFixture = (
  id = '11111111-1111-4111-8111-111111111111',
): InboxNotification => ({
  id,
  type: 'reminder',
  reminder_id: 2,
  message: 'Час повторити матеріал',
  task_id: 1,
  subtask_id: null,
  study_session_id: null,
  trigger_at: '2026-10-29T08:00:00Z',
  created_at: '2026-10-29T08:01:00Z',
  read_at: null,
})
export function sessionMetrics(): SessionMetrics {
  return {
    planned: { count: 1, scheduled_seconds: 1800 },
    completed: { count: 2, scheduled_seconds: 7200 },
    missed: { count: 1, scheduled_seconds: 3600 },
    rescheduled: { count: 1, scheduled_seconds: 3600 },
    cancelled: { count: 1, scheduled_seconds: 3600 },
    completed_actual_minutes: 25,
    completed_with_actual_minutes: 1,
    completed_without_actual_minutes: 1,
  }
}
export function activityFixture(): ActivityMetrics {
  return {
    tasks_completed: { total: 5, on_time: 3, late: 1, without_deadline: 1 },
    subtasks_completed: { total: 2, on_time: 1, late: 1, without_deadline: 0 },
    study_sessions: sessionMetrics(),
  }
}
export function zeroActivity(): ActivityMetrics {
  return {
    tasks_completed: { total: 0, on_time: 0, late: 0, without_deadline: 0 },
    subtasks_completed: { total: 0, on_time: 0, late: 0, without_deadline: 0 },
    study_sessions: {
      planned: { count: 0, scheduled_seconds: 0 },
      completed: { count: 0, scheduled_seconds: 0 },
      missed: { count: 0, scheduled_seconds: 0 },
      rescheduled: { count: 0, scheduled_seconds: 0 },
      cancelled: { count: 0, scheduled_seconds: 0 },
      completed_actual_minutes: 0,
      completed_with_actual_minutes: 0,
      completed_without_actual_minutes: 0,
    },
  }
}
export function progressFixture(start_date = '2026-10-24', end_date = '2026-10-30'): Progress {
  return {
    as_of_utc: '2026-10-30T12:00:00.123456Z',
    timezone: user.timezone,
    period: { start_date, end_date, session_attribution: 'starts_at' },
    tasks: {
      current: { total: 9, pending: 4, completed: 5, overdue_pending: 2 },
      completed_in_period: activityFixture().tasks_completed,
    },
    subtasks: {
      current: { total: 5, pending: 3, completed: 2, overdue_pending: 1 },
      completed_in_period: activityFixture().subtasks_completed,
    },
    study_sessions: { started_in_period: sessionMetrics() },
  }
}
export function comparisonFixture(): ProgressComparison {
  const current = activityFixture(),
    baseline = activityFixture()
  baseline.tasks_completed = { total: 7, on_time: 5, late: 1, without_deadline: 1 }
  baseline.subtasks_completed = { total: 3, on_time: 2, late: 1, without_deadline: 0 }
  baseline.study_sessions.completed_actual_minutes = 45
  baseline.study_sessions.missed = { count: 0, scheduled_seconds: 0 }
  const delta = zeroActivity()
  delta.tasks_completed = { total: -2, on_time: -2, late: 0, without_deadline: 0 }
  delta.subtasks_completed = { total: -1, on_time: -1, late: 0, without_deadline: 0 }
  delta.study_sessions.missed = { count: 1, scheduled_seconds: 3600 }
  delta.study_sessions.completed_actual_minutes = -20
  return {
    as_of_utc: '2026-10-30T12:00:00.123456Z',
    timezone: user.timezone,
    comparison: {
      equal_nominal_days: true,
      session_attribution: 'starts_at',
      historical_snapshot: false,
    },
    baseline: { period: { start_date: '2026-10-17', end_date: '2026-10-23' }, totals: baseline },
    current: { period: { start_date: '2026-10-24', end_date: '2026-10-30' }, totals: current },
    delta,
    observations: {
      task_completions: 'decreased',
      subtask_completions: 'decreased',
      missed_sessions: 'increased',
      known_actual_minutes: 'decreased',
      baseline_has_unknown_actual_minutes: true,
      current_has_unknown_actual_minutes: true,
    },
  }
}
export function activityBackend() {
  const base = planningBackend(),
    reminders: Reminder[] = [
      reminderFixture(),
      { ...reminderFixture(2), status: 'sent', sent_at: '2026-10-29T08:01:00Z' },
      { ...reminderFixture(3), status: 'cancelled' },
    ]
  let notifications: InboxNotification[] = [
      notificationFixture(),
      {
        ...notificationFixture('22222222-2222-4222-8222-222222222222'),
        type: 'notification',
        reminder_id: null,
        task_id: null,
        message: 'Інше безпечне сповіщення',
        trigger_at: null,
        read_at: '2026-10-29T09:00:00Z',
      },
    ],
    nextId = 10
  base.sessions = [sessionFixture()]
  base.base.children = [
    {
      id: 4,
      task_id: 1,
      title: 'Чернетка',
      description: null,
      deadline_at: '2026-11-12T10:00:00Z',
      estimated_minutes: 30,
      position: 1,
      status: 'pending',
      completed_at: null,
    },
  ]
  const requests: {
    path: string
    search: string
    method: string
    body: Record<string, unknown>
  }[] = []
  let failure: {
      path: RegExp
      method: string
      status: number
      fields?: Record<string, string[]>
    } | null = null,
    emptyReports = false
  function paginated<T>(values: T[], url: URL): Page<T> {
    const current = Number(url.searchParams.get('page') ?? 1),
      size = Number(url.searchParams.get('per_page') ?? 20),
      last = Math.max(1, Math.ceil(values.length / size)),
      data = values.slice((current - 1) * size, current * size),
      page = makePage(data, current, last)
    page.meta.total = values.length
    page.meta.per_page = size
    page.meta.path = url.origin + url.pathname
    page.links.next =
      current < last
        ? `${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), page: String(current + 1) })}`
        : null
    return page
  }
  function handle(
    rawUrl: string,
    method = 'GET',
    body: Record<string, unknown> = {},
    headers?: HeadersInit,
  ) {
    const url = new URL(rawUrl),
      path = url.pathname
    requests.push({ path, search: url.search, method, body })
    const reply = (data: unknown, status = 200) => ({ status, body: { data } })
    if (failure && failure.path.test(path) && failure.method === method) {
      const f = failure
      failure = null
      return { status: f.status, body: { errors: f.fields ?? {} } }
    }
    if (path === '/api/reminders') {
      if (method === 'GET') {
        let data = reminders
        if (url.searchParams.has('status'))
          data = data.filter((r) => r.status === url.searchParams.get('status'))
        if (url.searchParams.has('trigger_from'))
          data = data.filter(
            (r) =>
              r.trigger_at >= url.searchParams.get('trigger_from')! &&
              r.trigger_at <= url.searchParams.get('trigger_to')!,
          )
        return { status: 200, body: paginated(data, url) }
      }
      if (method === 'POST') {
        const relative = typeof body.anchor === 'string',
          value = {
            ...reminderFixture(nextId++),
            task_id: null,
            subtask_id: null,
            study_session_id: null,
            message: null,
            ...body,
            anchor: relative ? body.anchor : null,
            offset_minutes: relative ? body.offset_minutes : null,
            trigger_at: relative ? '2026-11-12T09:45:00Z' : body.trigger_at,
            status: 'scheduled',
            sent_at: null,
          } as Reminder
        reminders.push(value)
        return reply(value, 201)
      }
    }
    const target = path.match(/^\/api\/reminders\/(\d+)(?:\/(cancel))?$/)
    if (target) {
      const record = reminders.find((r) => r.id === Number(target[1]))
      if (!record) return { status: 404 }
      if (method === 'GET') return reply(record)
      if (record.status !== 'scheduled') return { status: 409 }
      if (target[2]) {
        record.status = 'cancelled'
        return reply(record)
      }
      Object.assign(record, body)
      return reply(record)
    }
    if (path === '/api/notifications')
      return {
        status: 200,
        body: paginated(
          url.searchParams.get('unread_only') === 'true'
            ? notifications.filter((n) => n.read_at === null)
            : notifications,
          url,
        ),
      }
    const read = path.match(/^\/api\/notifications\/([^/]+)\/read$/)
    if (read) {
      const record = notifications.find((n) => n.id === read[1])
      if (!record) return { status: 404 }
      record.read_at ??= '2026-10-30T12:00:00Z'
      return reply(record)
    }
    if (path === '/api/statistics/progress') {
      const progress = progressFixture(
        url.searchParams.get('start_date')!,
        url.searchParams.get('end_date')!,
      )
      if (emptyReports) {
        progress.tasks.current = { total: 0, pending: 0, completed: 0, overdue_pending: 0 }
        progress.subtasks.current = { ...progress.tasks.current }
        progress.tasks.completed_in_period = zeroActivity().tasks_completed
        progress.subtasks.completed_in_period = zeroActivity().subtasks_completed
        progress.study_sessions.started_in_period = zeroActivity().study_sessions
      }
      return reply(progress)
    }
    if (path === '/api/statistics/trends') {
      const start_date = url.searchParams.get('start_date')!,
        end_date = url.searchParams.get('end_date')!,
        days: ProgressTrends['days'] = []
      for (let date = start_date; date <= end_date; date = addDays(date, 1))
        days.push({
          date,
          ...(!emptyReports && date === start_date ? activityFixture() : zeroActivity()),
        })
      return reply({
        as_of_utc: '2026-10-30T12:00:00.123456Z',
        timezone: user.timezone,
        period: { start_date, end_date, aggregation: 'day', session_attribution: 'starts_at' },
        days,
        totals: emptyReports ? zeroActivity() : activityFixture(),
      })
    }
    if (path === '/api/statistics/reports/comparison') {
      const data = comparisonFixture()
      data.baseline.period = {
        start_date: url.searchParams.get('baseline_start_date')!,
        end_date: url.searchParams.get('baseline_end_date')!,
      }
      data.current.period = {
        start_date: url.searchParams.get('current_start_date')!,
        end_date: url.searchParams.get('current_end_date')!,
      }
      if (emptyReports) {
        data.baseline.totals = zeroActivity()
        data.current.totals = zeroActivity()
        data.delta = zeroActivity()
        data.observations = {
          task_completions: 'unchanged',
          subtask_completions: 'unchanged',
          missed_sessions: 'unchanged',
          known_actual_minutes: 'unchanged',
          baseline_has_unknown_actual_minutes: false,
          current_has_unknown_actual_minutes: false,
        }
      }
      return reply(data)
    }
    return base.handle(rawUrl, method, body, headers)
  }
  return {
    handle,
    requests,
    base,
    reminders,
    get notifications() {
      return notifications
    },
    set notifications(v: InboxNotification[]) {
      notifications = v
    },
    set failure(v: typeof failure) {
      failure = v
    },
    set emptyReports(v: boolean) {
      emptyReports = v
    },
  }
}
