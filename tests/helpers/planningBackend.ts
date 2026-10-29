import { f2Backend, type MockReply } from './f2Backend'
import { progress, user } from '../fixtures'
import type { StudySession } from '@/types/api'
import type {
  AvailabilityWindow,
  PlanningPreferences,
  ProtectedPreview,
  StudyPlan,
  ReplanningReview,
} from '@/types/planning'
export const sessionFixture = (id = 1): StudySession => ({
  id,
  task_id: 1,
  subtask_id: null,
  starts_at: '2026-11-02T09:00:00Z',
  ends_at: '2026-11-02T09:30:00Z',
  duration_seconds: 1800,
  status: 'planned',
  completed_at: null,
  actual_minutes: null,
})
export const planFixture = (): ProtectedPreview<StudyPlan> => ({
  as_of_utc: '2026-10-30T09:00:00.000000Z',
  start_date: '2026-11-02',
  end_date: '2026-11-08',
  timezone: user.timezone,
  preview_token: 'opaquePlanToken==',
  expires_at: '2026-11-02T09:15:00Z',
  sessions: [
    {
      task_id: 1,
      subtask_id: null,
      starts_at: '2026-11-02T09:00:00Z',
      ends_at: '2026-11-02T09:30:00Z',
      duration_seconds: 1800,
    },
  ],
  work_results: [
    {
      task_id: 1,
      subtask_id: null,
      requested_seconds: 3600,
      allocated_seconds: 1800,
      unscheduled_seconds: 1800,
      reason_codes: ['planning_horizon_exhausted'],
    },
  ],
  excluded_items: [{ task_id: 2, reason_codes: ['missing_estimate'] }],
  warnings: [
    {
      code: 'stale_planned_session',
      task_id: 1,
      subtask_id: null,
      study_session_id: 9,
      seconds: 600,
    },
  ],
  summary: {
    requested_seconds: 3600,
    allocated_seconds: 1800,
    unscheduled_seconds: 1800,
    fully_allocated: false,
  },
})
export const replanFixture = (): ProtectedPreview<ReplanningReview> => {
  const interval = {
    starts_at: '2026-11-02T09:00:00Z',
    ends_at: '2026-11-02T10:00:00Z',
    duration_seconds: 3600,
  }
  return {
    as_of_utc: '2026-10-30T09:00:00.000000Z',
    start_date: '2026-11-02',
    end_date: '2026-11-08',
    timezone: user.timezone,
    preview_token: 'opaqueReplanToken==',
    expires_at: '2026-11-02T09:15:00Z',
    session_results: [
      {
        study_session_id: 1,
        task_id: 1,
        subtask_id: null,
        classification: 'requires_replanning',
        original: interval,
        replacement: {
          ...interval,
          starts_at: '2026-11-03T09:00:00Z',
          ends_at: '2026-11-03T09:30:00Z',
          duration_seconds: 1800,
        },
        untransferred_seconds: 1800,
        reason_codes: ['lesson_overlap'],
        replacement_reason_codes: ['incomplete_relocation'],
      },
      {
        study_session_id: 2,
        task_id: 1,
        subtask_id: null,
        classification: 'requires_replanning',
        original: interval,
        replacement: null,
        untransferred_seconds: 3600,
        reason_codes: ['lesson_overlap'],
        replacement_reason_codes: ['no_replacement_capacity'],
      },
      {
        study_session_id: 3,
        task_id: 1,
        subtask_id: null,
        classification: 'valid',
        original: interval,
        replacement: null,
        untransferred_seconds: 0,
        reason_codes: [],
        replacement_reason_codes: [],
      },
      {
        study_session_id: 4,
        task_id: 1,
        subtask_id: null,
        classification: 'cannot_replan',
        original: interval,
        replacement: null,
        untransferred_seconds: 0,
        reason_codes: ['session_not_future'],
        replacement_reason_codes: [],
      },
    ],
    released_session_ids: [1, 2],
    work_results: [
      {
        task_id: 1,
        subtask_id: null,
        remaining_work_seconds: 7200,
        unallocated_before_replacements: 7200,
        proposed_replacement_seconds: 1800,
        unallocated_after_replacements: 5400,
      },
    ],
    excluded_items: [],
    warnings: [{ code: 'stale_planned_session', task_id: 1, seconds: 3600 }],
    summary: {
      inspected_sessions: 4,
      valid_sessions: 1,
      cannot_replan_sessions: 1,
      affected_sessions: 2,
      proposed_replacements: 1,
      unplaced_sessions: 1,
      partial_replacements: 1,
      original_affected_seconds: 7200,
      replacement_seconds: 1800,
      untransferred_seconds: 5400,
      no_changes_needed: false,
    },
  }
}
export function planningBackend() {
  const base = f2Backend()
  let preferences: PlanningPreferences = {
    max_daily_study_minutes: null,
    max_weekly_study_minutes: null,
    preferred_break_minutes: null,
    min_session_minutes: null,
    max_session_minutes: null,
  }
  let windows: AvailabilityWindow[] = [],
    sessions: StudySession[] = []
  const requests: {
    path: string
    search: string
    method: string
    body: Record<string, unknown>
  }[] = []
  let failure: {
    path: RegExp
    status: number
    method: string
    fields?: Record<string, string[]>
  } | null = null
  let plan = planFixture(),
    replan = replanFixture(),
    nextId = 20
  const reply = (data: unknown, status = 200) => ({ status, body: { data } })
  function handle(
    url: string,
    method = 'GET',
    body: Record<string, unknown> = {},
    headers?: HeadersInit,
  ): MockReply {
    const { pathname: path, search } = new URL(url)
    requests.push({ path, search, method, body })
    if (failure && failure.path.test(path) && failure.method === method) {
      const f = failure
      failure = null
      return { status: f.status, body: { errors: f.fields ?? {} } }
    }
    if (path === '/api/planning-preferences') {
      if (method === 'PUT') preferences = body as unknown as PlanningPreferences
      return reply(preferences)
    }
    if (path.startsWith('/api/study-availability-windows')) {
      const id = Number(path.split('/')[3]),
        found = windows.find((w) => w.id === id)
      if (method === 'GET') return reply(windows)
      if (method === 'DELETE') {
        windows = windows.filter((w) => w.id !== id)
        return { status: 204 }
      }
      const value = { ...(found ?? {}), ...body, id: id || nextId++ } as AvailabilityWindow
      if (method === 'PATCH') windows = windows.map((w) => (w.id === id ? value : w))
      else windows.push(value)
      return reply(value, method === 'POST' ? 201 : 200)
    }
    if (path === '/api/planning/free-slots')
      return {
        status: 200,
        body: {
          data: windows.length
            ? [
                {
                  starts_at: '2026-11-02T07:00:00Z',
                  ends_at: '2026-11-02T08:00:00Z',
                  duration_seconds: 3600,
                },
              ]
            : [],
          meta: {
            timezone: user.timezone,
            start_date: new URL(url).searchParams.get('start_date'),
            end_date: new URL(url).searchParams.get('end_date'),
          },
        },
      }
    if (path === '/api/planning/study-plans/preview') return reply(plan)
    if (path === '/api/planning/replanning/preview') return reply(replan)
    if (path === '/api/planning/study-plans/confirm') {
      sessions.push(sessionFixture(nextId++))
      const { preview_token: _token, expires_at: _expires, ...data } = plan
      return reply({ ...data, sessions: [sessions.at(-1)] }, 201)
    }
    if (path === '/api/planning/replanning/confirm') {
      const replacement = {
        ...sessionFixture(nextId++),
        starts_at: '2026-11-03T09:00:00Z',
        ends_at: '2026-11-03T09:30:00Z',
      }
      sessions.push(replacement)
      return reply({
        applied: true,
        original_sessions: [
          { id: 1, status: 'rescheduled' },
          { id: 2, status: 'cancelled' },
        ],
        replacement_sessions: [replacement],
        summary: {
          rescheduled_sessions: 1,
          cancelled_unplaced_sessions: 1,
          created_replacements: 1,
          untransferred_seconds: 5400,
        },
      })
    }
    if (path === '/api/study-sessions')
      return {
        status: 200,
        body: {
          data: sessions,
          meta: {
            timezone: user.timezone,
            start_date: new URL(url).searchParams.get('start_date'),
            end_date: new URL(url).searchParams.get('end_date'),
          },
        },
      }
    const match = path.match(
      /^\/api\/study-sessions\/(\d+)(?:\/(complete|miss|cancel|reschedule))?$/,
    )
    if (match) {
      const session = sessions.find((s) => s.id === Number(match[1]))
      if (!session) return { status: 404 }
      const action = match[2]
      if (!action) return reply(session)
      if (session.status !== 'planned') return { status: 409 }
      if (action === 'reschedule') {
        session.status = 'rescheduled'
        const replacement = {
          ...session,
          id: nextId++,
          starts_at: String(body.starts_at),
          ends_at: String(body.ends_at),
          duration_seconds:
            (Date.parse(String(body.ends_at)) - Date.parse(String(body.starts_at))) / 1000,
          status: 'planned' as const,
        }
        sessions.push(replacement)
        return reply(
          {
            original: { ...session },
            replacement,
            summary: {
              original_duration_seconds: session.duration_seconds,
              replacement_duration_seconds: replacement.duration_seconds,
              not_transferred_seconds: session.duration_seconds - replacement.duration_seconds,
              unallocated_work_seconds: 5400,
            },
          },
          201,
        )
      }
      session.status =
        action === 'complete' ? 'completed' : action === 'miss' ? 'missed' : 'cancelled'
      session.actual_minutes =
        action === 'complete' && typeof body.actual_minutes === 'number'
          ? body.actual_minutes
          : null
      session.completed_at = action === 'complete' ? '2026-11-02T10:00:00Z' : null
      return reply(session)
    }
    if (path.startsWith('/api/schedule/'))
      return {
        status: 200,
        body: {
          data: [],
          meta: { timezone: user.timezone, start_date: '2026-11-02', end_date: '2026-11-02' },
        },
      }
    if (path === '/api/statistics/progress') return reply(progress)
    return base.handle(url, method, body, headers)
  }
  return {
    handle,
    requests,
    base,
    get windows() {
      return windows
    },
    set windows(v: AvailabilityWindow[]) {
      windows = v
    },
    get sessions() {
      return sessions
    },
    set sessions(v: StudySession[]) {
      sessions = v
    },
    get preferences() {
      return preferences
    },
    set preferences(v: PlanningPreferences) {
      preferences = v
    },
    get plan() {
      return plan
    },
    set plan(v: typeof plan) {
      plan = v
    },
    get replan() {
      return replan
    },
    set replan(v: typeof replan) {
      replan = v
    },
    set failure(v: typeof failure) {
      failure = v
    },
  }
}
