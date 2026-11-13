import { localDate, localEndDate } from '../../src/utils/dates'
import { user } from '../fixtures'
import { planningBackend } from './planningBackend'
export function workCompletionBackend() {
  const backend = planningBackend()
  const original = backend.handle
  backend.handle = (url, method = 'GET', body = {}, headers) => {
    const query = new URL(url),
      path = query.pathname
    if (path === '/api/study-sessions' && method === 'GET') {
      const result = original(url, method, body, headers)
      if (result.status !== 200) return result
      const start = query.searchParams.get('start_date')!,
        end = query.searchParams.get('end_date')!
      return {
        status: 200,
        body: {
          data: backend.sessions.filter(
            (session) =>
              localDate(session.starts_at, user.timezone) <= end &&
              localEndDate(session.ends_at, user.timezone) >= start,
          ),
          meta: { start_date: start, end_date: end, timezone: user.timezone },
        },
      }
    }
    const workMatch = path.match(/^\/api\/tasks\/(\d+)(?:\/subtasks\/(\d+))?\/completion-review$/)
    const sessionReview = path.match(/^\/api\/study-sessions\/(\d+)\/completion-review$/)
    function review(taskId: number, childId: number | null) {
      const count = backend.sessions.filter(
        (s) =>
          s.task_id === taskId &&
          (childId === null || s.subtask_id === childId) &&
          s.status === 'planned' &&
          Date.parse(s.starts_at) > Date.now(),
      ).length
      return {
        future_sessions_count: count,
        completion_token: 'reviewed-state',
        message: `Буде скасовано майбутніх сесій: ${count}`,
      }
    }
    if (workMatch)
      return {
        status: 200,
        body: review(Number(workMatch[1]), workMatch[2] ? Number(workMatch[2]) : null),
      }
    if (sessionReview) {
      const session = backend.sessions.find((s) => s.id === Number(sessionReview[1]))!
      return {
        status: 200,
        body: {
          can_complete_work: session.status === 'planned',
          work_type: session.subtask_id === null ? 'task' : 'subtask',
          completion_review: review(session.task_id, session.subtask_id),
        },
      }
    }
    const sessionComplete = path.match(/^\/api\/study-sessions\/(\d+)\/complete$/)
    const workComplete = path.match(/^\/api\/tasks\/(\d+)(?:\/subtasks\/(\d+))?\/complete$/)
    const source = sessionComplete
      ? backend.sessions.find((s) => s.id === Number(sessionComplete[1]))
      : null
    const result = original(url, method, body, headers)
    if (
      result.status < 300 &&
      method === 'POST' &&
      (workComplete || (source && body.complete_work))
    ) {
      const taskId = source?.task_id ?? Number(workComplete![1])
      const childId = source?.subtask_id ?? (workComplete?.[2] ? Number(workComplete[2]) : null)
      const work =
        childId === null
          ? backend.base.tasks.find((t) => t.id === taskId)
          : backend.base.children.find((c) => c.id === childId)
      if (work) {
        work.status = 'completed'
        work.completed_at = new Date().toISOString()
      }
      backend.sessions.forEach((session) => {
        if (
          session.task_id === taskId &&
          (childId === null || session.subtask_id === childId) &&
          session.status === 'planned' &&
          Date.parse(session.starts_at) > Date.now()
        )
          session.status = 'cancelled'
      })
    }
    return result
  }
  return backend
}
