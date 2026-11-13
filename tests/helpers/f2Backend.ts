import type { AcademicKind, AcademicRecord, Subtask, TaskProgress } from '@/types/api'
import { user, task, page } from '../fixtures'
export interface MockReply {
  status: number
  body?: unknown
}
export function f2Backend() {
  const academic: Record<AcademicKind, AcademicRecord[]> = {
    institutions: [],
    periods: [],
    subjects: [],
    teachers: [],
  }
  const tasks = [{ ...task }]
  let children: Subtask[] = []
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = []
  let nextId = 10
  let failure: {
    path: RegExp
    method: string
    status: number
    fields?: Record<string, string[]>
  } | null = null
  let progressOverride: TaskProgress | null = null
  const paths: Record<string, AcademicKind> = {
    'education-institutions': 'institutions',
    'academic-periods': 'periods',
    subjects: 'subjects',
    teachers: 'teachers',
  }
  function handle(
    url: string,
    method = 'GET',
    body: Record<string, unknown> = {},
    _headers?: HeadersInit,
  ): MockReply {
    const path = new URL(url).pathname
    requests.push({ path, method, body })
    const reply = (data: unknown, status = 200) => ({ status, body: { data } })
    if (failure && failure.method === method && failure.path.test(path)) {
      const error = failure
      failure = null
      return { status: error.status, body: { errors: error.fields ?? {} } }
    }
    if (path === '/api/planning/attention-status')
      return reply({
        attention_count: 0,
        most_important_kind: null,
        counts: { decision_required: 0, replan: 0, warning: 0, create_plan: 0 },
        has_informational_recommendations: false,
        check_state: 'idle',
        check_pending: false,
        last_successful_check_at: '2026-11-13T08:00:00Z',
        check_failed: false,
        unverified_suggestion_count: 0,
        review_refresh_required: false,
      })
    if (path === '/api/planning/recovery-suggestions')
      return {
        status: 200,
        body: {
          data: [],
          meta: { current_page: 1, last_page: 1 },
          automation: { last_scanned_at: null, last_outcome: null },
        },
      }
    if (path.startsWith('/api/academic-calendar/'))
      return {
        status: 200,
        body: {
          data: [],
          meta: {
            timezone: user.timezone,
            start_date: '2026-11-02',
            end_date: '2026-11-02',
            truncated: false,
            total: 0,
            returned: 0,
            limit: 100,
          },
        },
      }
    if (path === '/api/semester-schedules') return reply([])
    if (path === '/api/profile') return reply(user)
    if (path === '/sanctum/csrf-cookie' || path === '/api/auth/logout') return { status: 204 }
    if (path === '/api/auth/login' || path === '/api/auth/register') return reply(user)
    const resource = path.match(
      /^\/api\/(education-institutions|academic-periods|subjects|teachers)(?:\/(\d+))?$/,
    )
    if (resource) {
      const kind = paths[resource[1]!]!
      const id = resource[2] ? Number(resource[2]) : null
      const records = academic[kind]
      const found = records.find((r) => r.id === id)
      if (id && !found) return { status: 404 }
      if (method === 'GET') return reply(id ? found : records)
      if (method === 'DELETE') {
        academic[kind] = records.filter((r) => r.id !== id)
        if (kind === 'institutions')
          for (const key of ['periods', 'subjects', 'teachers'] as const)
            academic[key] = academic[key].map((r) =>
              'education_institution_id' in r && r.education_institution_id === id
                ? { ...r, education_institution_id: null }
                : r,
            )
        return { status: 204 }
      }
      const defaults =
        kind === 'institutions'
          ? {}
          : {
              education_institution_id: null,
              ...(kind === 'subjects' ? { code: null, color: null } : {}),
            }
      const record = {
        ...defaults,
        ...(found ?? {}),
        ...body,
        id: id ?? nextId++,
      } as AcademicRecord
      if (id) academic[kind] = records.map((r) => (r.id === id ? record : r))
      else records.push(record)
      return reply(record, id ? 200 : 201)
    }
    const parent = tasks[0]!
    if (path === '/api/planning/work-options') {
      const params = new URL(url).searchParams
      const taskId = Number(params.get('task_id')) || null
      const parent = taskId ? tasks.find((t) => t.id === taskId) : undefined
      if (taskId && !parent) return { status: 404 }
      const steps = children.filter((c) => c.task_id === taskId)
      const rows = taskId
        ? parent?.status === 'completed'
          ? []
          : steps.filter((c) => c.status !== 'completed')
        : tasks.filter((t) => t.status !== 'completed')
      const term = (params.get('search') ?? '').toLocaleLowerCase('uk')
      const matched = rows.filter((row) => row.title.toLocaleLowerCase('uk').includes(term))
      return {
        status: 200,
        body: {
          data: matched.map(({ id, title }) => ({ id, title })),
          meta: {
            current_page: 1,
            last_page: 1,
            total: matched.length,
            has_subtasks: steps.length > 0,
            all_subtasks_completed:
              steps.length > 0 && steps.every((c) => c.status === 'completed'),
            task_available:
              parent?.status !== 'completed' &&
              (!steps.length || steps.some((c) => c.status !== 'completed')),
          },
        },
      }
    }
    if (path === '/api/tasks') {
      if (method === 'POST') {
        const added = { ...task, ...body, id: nextId++ }
        tasks.push(added)
        return reply(added, 201)
      }
      const params = new URL(url).searchParams,
        status = params.get('status'),
        filtered = tasks.filter((task) => !status || task.status === status),
        current = Number(params.get('page') ?? 1),
        size = Number(params.get('per_page') ?? 20),
        result = page(
          filtered.slice((current - 1) * size, current * size),
          current,
          Math.max(1, Math.ceil(filtered.length / size)),
        )
      result.meta.total = filtered.length
      result.meta.per_page = size
      return { status: 200, body: result }
    }
    if (/^\/api\/tasks\/\d+(?:\/subtasks\/\d+)?\/completion-review$/.test(path))
      return {
        status: 200,
        body: {
          future_sessions_count: 0,
          completion_token: 'empty',
          message: 'Немає майбутніх сесій',
        },
      }
    const taskRoute = path.match(/^\/api\/tasks\/(\d+)(?:\/(miss|complete|reopen))?$/)
    if (taskRoute) {
      const record = tasks.find((task) => task.id === Number(taskRoute[1]))
      if (!record) return { status: 404 }
      if (method === 'POST' && taskRoute[2]) {
        if (taskRoute[2] === 'miss' && record.status === 'completed') return { status: 409 }
        record.status =
          taskRoute[2] === 'miss' ? 'missed' : taskRoute[2] === 'complete' ? 'completed' : 'pending'
        record.completed_at = record.status === 'completed' ? '2026-11-08T12:00:00Z' : null
      } else if (method === 'PATCH') Object.assign(record, body)
      return reply(record)
    }
    if (path === `/api/tasks/${parent.id}/progress`) {
      const completed = children.filter((c) => c.status === 'completed').length
      return reply(
        progressOverride ?? {
          task_id: parent.id,
          total_subtasks: children.length,
          completed_subtasks: completed,
          progress_percent: children.length
            ? Math.round((completed / children.length) * 100)
            : null,
        },
      )
    }
    const nested = path.match(
      /^\/api\/tasks\/(\d+)\/subtasks(?:\/(reorder|\d+)(?:\/(complete|reopen))?)?$/,
    )
    if (nested) {
      if (!tasks.some((task) => task.id === Number(nested[1]))) return { status: 404 }
      if (Number(nested[1]) !== parent.id && method === 'GET' && !nested[2]) return reply([])
      if (nested[2] === 'reorder') {
        const ids = body.subtask_ids as number[]
        children = ids.map((id, index) => ({
          ...children.find((c) => c.id === id)!,
          position: index + 1,
        }))
        return reply(children)
      }
      const id = nested[2] ? Number(nested[2]) : null
      const found = children.find((c) => c.id === id && c.task_id === parent.id)
      if (id && !found) return { status: 404 }
      if (method === 'GET') return reply(id ? found : children)
      if (method === 'DELETE') {
        children = children.filter((c) => c.id !== id)
        return { status: 204 }
      }
      if (nested[3]) {
        found!.status = nested[3] === 'complete' ? 'completed' : 'pending'
        found!.completed_at = found!.status === 'completed' ? '2026-10-29T12:00:00Z' : null
        return reply(found)
      }
      const child: Subtask = {
        id: id ?? nextId++,
        task_id: parent.id,
        position: children.length + 1,
        title: '',
        description: null,
        deadline_at: null,
        estimated_minutes: null,
        status: 'pending',
        completed_at: null,
        ...found,
        ...body,
      }
      if (id) children = children.map((c) => (c.id === id ? child : c))
      else children.push(child)
      return reply(child, id ? 200 : 201)
    }
    return { status: 404 }
  }
  return {
    academic,
    tasks,
    requests,
    handle,
    get children() {
      return children
    },
    set children(value: Subtask[]) {
      children = value
    },
    set failure(value: typeof failure) {
      failure = value
    },
    set progressOverride(value: TaskProgress | null) {
      progressOverride = value
    },
  }
}
