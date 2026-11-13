import { tasksApi } from './endpoints'
import type { Page, Task, TaskFilters } from '@/types/api'
export type TaskListFilters = Omit<TaskFilters, 'status'> & { status?: Task['status'] | 'active' }
type TaskPage = {
  data: Task[]
  meta: Pick<Page<Task>['meta'], 'current_page' | 'last_page' | 'per_page' | 'total'>
}

// The current API accepts one status. Merge complete sorted prefixes, never filter a loaded page.
export async function taskListPage(
  filters: TaskListFilters,
  signal?: AbortSignal,
): Promise<TaskPage> {
  const { status, ...rest } = filters
  if (status !== 'active') return tasksApi.list({ ...rest, status }, signal)
  const page = filters.page ?? 1,
    size = filters.per_page ?? 15,
    needed = page * size
  async function prefix(status: 'pending' | 'missed') {
    const rows: Task[] = []
    let next = 1,
      total = 0
    do {
      const result = await tasksApi.list({ ...rest, status, page: next, per_page: 100 }, signal)
      rows.push(...result.data)
      total = result.meta.total
      if (next >= result.meta.last_page) break
      next++
    } while (rows.length < needed)
    return { rows, total }
  }
  const [pending, missed] = await Promise.all([prefix('pending'), prefix('missed')])
  const rows = [...pending.rows, ...missed.rows].sort((a, b) => {
    if (a.deadline_at === null || b.deadline_at === null)
      return Number(a.deadline_at === null) - Number(b.deadline_at === null) || a.id - b.id
    return Date.parse(a.deadline_at) - Date.parse(b.deadline_at) || a.id - b.id
  })
  const total = pending.total + missed.total
  return {
    data: rows.slice((page - 1) * size, page * size),
    meta: {
      current_page: page,
      last_page: Math.max(1, Math.ceil(total / size)),
      per_page: size,
      total,
    },
  }
}
