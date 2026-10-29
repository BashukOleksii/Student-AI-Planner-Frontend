import type { Progress } from './api'
import type { DateRange } from './planning'
export type CompletionMetrics = Progress['tasks']['completed_in_period']
export type SessionMetrics = Progress['study_sessions']['started_in_period']
export interface ActivityMetrics {
  tasks_completed: CompletionMetrics
  subtasks_completed: CompletionMetrics
  study_sessions: SessionMetrics
}
export interface ProgressTrends {
  as_of_utc: string
  timezone: string
  period: DateRange & { aggregation: 'day'; session_attribution: 'starts_at' }
  days: (ActivityMetrics & { date: string })[]
  totals: ActivityMetrics
}
export interface ComparisonInput {
  baseline_start_date: string
  baseline_end_date: string
  current_start_date: string
  current_end_date: string
}
export type Direction = 'increased' | 'decreased' | 'unchanged'
export interface ProgressComparison {
  as_of_utc: string
  timezone: string
  comparison: {
    equal_nominal_days: boolean
    session_attribution: 'starts_at'
    historical_snapshot: boolean
  }
  baseline: { period: DateRange; totals: ActivityMetrics }
  current: { period: DateRange; totals: ActivityMetrics }
  delta: ActivityMetrics
  observations: {
    task_completions: Direction
    subtask_completions: Direction
    missed_sessions: Direction
    known_actual_minutes: Direction
    baseline_has_unknown_actual_minutes: boolean
    current_has_unknown_actual_minutes: boolean
  }
}
