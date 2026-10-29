import type { Resource, StudySession } from './api'
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
export interface StudyPlan {
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
export interface ReplanningReview {
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
    untransferred_seconds: number
    reason_codes: string[]
    replacement_reason_codes: string[]
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
