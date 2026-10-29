import type { User, Task, Page, Progress, Lesson } from '@/types/api'
export const user: User = {
  id: 1,
  name: 'Олена',
  email: 'olena@example.test',
  timezone: 'Europe/Kyiv',
}
export const task: Task = {
  id: 1,
  subject_id: null,
  title: 'Прочитати розділ',
  description: null,
  priority: 2,
  status: 'pending',
  estimated_minutes: 30,
  deadline_at: '2026-11-12T10:00:00Z',
  completed_at: null,
}
export function page<T>(data: T[], current = 1, last = 1): Page<T> {
  return {
    data,
    links: {
      first: '?page=1',
      last: `?page=${last}`,
      prev: current > 1 ? `?page=${current - 1}` : null,
      next: current < last ? `?page=${current + 1}` : null,
    },
    meta: {
      current_page: current,
      last_page: last,
      total: data.length,
      from: data.length ? 1 : null,
      to: data.length || null,
      per_page: 15,
      path: '/api/tasks',
      links: [],
    },
  }
}
const work = () => ({
  current: { total: 0, pending: 0, completed: 0, overdue_pending: 0 },
  completed_in_period: { total: 0, on_time: 0, late: 0, without_deadline: 0 },
})
const bucket = () => ({ count: 0, scheduled_seconds: 0 })
export const progress: Progress = {
  as_of_utc: '2026-10-29T12:00:00.000000Z',
  timezone: user.timezone,
  period: { start_date: '2026-10-01', end_date: '2026-10-29', session_attribution: 'starts_at' },
  tasks: work(),
  subtasks: work(),
  study_sessions: {
    started_in_period: {
      planned: bucket(),
      completed: bucket(),
      missed: bucket(),
      rescheduled: bucket(),
      cancelled: bucket(),
      completed_actual_minutes: 0,
      completed_with_actual_minutes: 0,
      completed_without_actual_minutes: 0,
    },
  },
}
export const lesson: Lesson = {
  id: 1,
  subject: { id: 1, name: 'Архітектура ПЗ', code: 'АПЗ', color: null },
  teacher: { id: 1, name: 'Ірина Коваль' },
  type: 'lecture',
  room: '301',
  starts_at: '2026-10-29T09:00:00+02:00',
  ends_at: '2026-10-29T10:20:00+02:00',
  replaces_lesson_id: null,
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
