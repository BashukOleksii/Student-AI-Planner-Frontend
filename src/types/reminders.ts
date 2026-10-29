import type { Reminder } from './api'
export type ReminderTarget = { kind: 'task' | 'subtask' | 'session'; id: number }
export interface ReminderTargetFields {
  task_id?: number
  subtask_id?: number
  study_session_id?: number
}
export type ReminderInput = ReminderTargetFields & { message?: string | null } & (
    | { trigger_at: string; anchor?: never; offset_minutes?: never }
    | { anchor: Exclude<Reminder['anchor'], null>; offset_minutes: number; trigger_at?: never }
  )
export type ReminderPatch = { message?: string | null } & (
  { trigger_at?: string; offset_minutes?: never } | { offset_minutes?: number; trigger_at?: never }
)
export interface ReminderFilters {
  status?: Reminder['status']
  trigger_from?: string
  trigger_to?: string
  page?: number
  per_page?: number
}
export interface InboxNotification {
  id: string
  type: string
  reminder_id: number | null
  message: string
  task_id: number | null
  subtask_id: number | null
  study_session_id: number | null
  trigger_at: string | null
  created_at: string | null
  read_at: string | null
}
export interface InboxFilters {
  unread_only?: 'true' | 'false'
  page?: number
  per_page?: number
}
