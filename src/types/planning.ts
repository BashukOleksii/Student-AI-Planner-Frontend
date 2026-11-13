import type { Resource, StudySession, Priority } from './api'
import type { PublicObject } from './ai'
export interface PlanningPreferences {
  max_daily_study_minutes: number | null
  max_weekly_study_minutes: number | null
  preferred_break_minutes: number | null
  min_session_minutes: number | null
  max_session_minutes: number | null
}
export interface AvailabilityWindow {
  id: number
  day_of_week: number
  starts_at: string
  ends_at: string
}
export type AvailabilityInput = Omit<AvailabilityWindow, 'id'>
export interface DateRange {
  start_date: string
  end_date: string
}
export interface WorkScope extends DateRange {
  task_id: number | null
  subtask_id: number | null
}
export interface Interval {
  starts_at: string
  ends_at: string
  duration_seconds: number
}
export interface RangeResource<T> extends Resource<T[]> {
  meta: DateRange & { timezone: string }
}
export interface ProposedSession extends Interval {
  task_id: number
  subtask_id: number | null
}
export interface PlanningUserSummary {
  title: string
  next_step: string
}
export interface StudyPlan {
  user_summary?: PlanningUserSummary
  as_of_utc: string
  start_date: string
  end_date: string
  timezone: string
  sessions: ProposedSession[]
  work_results: PublicObject[]
  excluded_items: PublicObject[]
  warnings: PublicObject[]
  summary: {
    requested_seconds: number
    allocated_seconds: number
    unscheduled_seconds: number
    fully_allocated: boolean
  }
}
export interface WorkloadAdvice {
  as_of_utc: string
  timezone: string
  period: DateRange
  summary: StudyPlan['summary']
  alerts: {
    code: string
    severity: 'warning' | 'info'
    source: 'allocation' | 'selection' | 'persisted_workload'
    affected_seconds: number | null
    affected_work_count: number
  }[]
  work_advice: {
    task_id: number
    subtask_id: number | null
    requested_seconds: number
    allocated_seconds: number
    unscheduled_seconds: number
    reason_codes: string[]
    rank: number
    recommendation_codes: string[]
  }[]
  excluded_items: {
    task_id: number
    subtask_id: number | null
    work_type: 'task' | 'subtask'
    effective_deadline_utc: number | null
    priority: Priority
    position: number | null
    effort: {
      estimated_seconds: number | null
      completed_credit_seconds: number
      remaining_work_seconds: number | null
      future_reserved_seconds: number
      unallocated_work_seconds: number | null
      over_reserved_seconds: number | null
    } | null
    reason_codes: string[]
    recommendation_codes: string[]
  }[]
  warnings: {
    code: string
    task_id: number
    subtask_id: number | null
    study_session_id: number | null
    seconds: number
  }[]
  persisted_workload_violations: {
    code: 'daily_study_limit_exceeded' | 'weekly_study_limit_exceeded'
    period_kind: 'day' | 'iso_week'
    period: string
    scheduled_seconds: number
    limit_seconds: number
    excess_seconds: number
  }[]
}
export interface ReplanningReview {
  user_summary?: PlanningUserSummary
  as_of_utc: string
  start_date: string
  end_date: string
  timezone: string
  session_results: {
    study_session_id: number
    task_id: number
    subtask_id: number | null
    classification: string
    original: Interval
    replacement: Interval | null
    replacements?: Interval[]
    untransferred_seconds: number
    reason_codes: string[]
    replacement_reason_codes: string[]
    explanations?: string[]
  }[]
  released_session_ids: number[]
  work_results: PublicObject[]
  excluded_items: PublicObject[]
  warnings: PublicObject[]
  summary: {
    inspected_sessions: number
    valid_sessions: number
    cannot_replan_sessions: number
    affected_sessions: number
    proposed_replacements: number
    unplaced_sessions: number
    partial_replacements: number
    original_affected_seconds: number
    replacement_seconds: number
    untransferred_seconds: number
    no_changes_needed: boolean
  }
}
export type ProtectedPreview<T> = T & { preview_token: string; expires_at: string }
export interface RecoverySession extends ProposedSession {
  study_session_id: number
  work_reason_codes: string[]
  allowed_lifecycle_actions: string[]
}
export interface RecoveryDiagnostics {
  scope: Pick<WorkScope, 'task_id' | 'subtask_id'>
  history_scope: 'selected_work_all_dates'
  summary: {
    eligible_work_count: number
    missed_session_count: number
    past_planned_session_count: number
    requires_lifecycle_decision: boolean
    actionable: boolean
  }
  missed_sessions: RecoverySession[]
  past_planned_sessions: RecoverySession[]
}
export interface RecoveryPreview {
  recovery: RecoveryDiagnostics
  study_plan: StudyPlan & { preview_token?: string; expires_at?: string }
}
export interface ReplanningResult {
  applied: boolean
  original_sessions: Pick<StudySession, 'id' | 'status'>[]
  replacement_sessions: StudySession[]
  summary: PublicObject
}
export interface ReschedulingResult {
  original: StudySession
  replacement: StudySession
  summary: {
    original_duration_seconds: number
    replacement_duration_seconds: number
    not_transferred_seconds: number
    unallocated_work_seconds: number
  }
}
export type PersistedPlan = Omit<StudyPlan, 'sessions'> & { sessions: StudySession[] }

export interface PlanningDiagnostics {
  as_of_utc: string
  start_date: string
  end_date: string
  timezone: string
  task_deadline_checked: false
  preferences: PlanningPreferences
  warnings: { category: 'configuration' | 'calendar'; code: string }[]
  slots: (Interval & {
    can_schedule: boolean
    candidate: Interval | null
    reason_codes: string[]
  })[]
}
