import type { Progress } from '../../src/types/api'

// Count assertions must not treat the additive nullable completion percentage as a count.
export function workCountValues(work: Progress['subtasks']): number[] {
  return [
    work.current.total,
    work.current.pending,
    work.current.completed,
    work.current.overdue_pending,
    ...Object.values(work.completed_in_period),
  ]
}
