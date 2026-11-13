import { semesterActionTypes } from '@/utils/aiSemester'
import type { LessonType, Page } from './api'
import type { AvailabilityWindow } from './planning'

export interface Conversation {
  id: number
  created_at: string | null
  updated_at: string | null
}
export interface ToolCall {
  call_id: string
  name: string
}
export interface ToolResult {
  call_id: string | null
  name: string
  ok: boolean
  error_code: string | null
}
export type ActionStatus = 'pending' | 'executed' | 'rejected' | 'expired'
export type ActionEvent = { action_id: string } & (
  | { status: 'failed'; receipt: null; error_code: string }
  | { status: 'executed'; receipt: PublicObject; error_code?: never }
  | { status: 'rejected' | 'expired'; receipt: null; error_code?: never }
)
export interface AiMessage {
  id: number
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  content_truncated: boolean
  tool_calls: ToolCall[]
  tool_calls_truncated: boolean
  tool_result: ToolResult | null
  created_at: string | null
  action_event?: ActionEvent
}
// Public review/receipt fields are heterogeneous. They are narrowed at the API boundary
// and rendered as structured text, never executed or interpreted as Tool arguments.
export type PublicValue = string | number | boolean | null | PublicValue[] | PublicObject
export interface PublicObject {
  [key: string]: PublicValue
}
export const lessonActionTypes = [
  'propose_lesson_create',
  'propose_lesson_update',
  'propose_lesson_cancel',
  'propose_lesson_replacement',
] as const
export type LessonActionType = (typeof lessonActionTypes)[number]
export type NamedAcademicReference = { id: number; name: string }
export type LessonSnapshot = {
  id: number | null
  subject_id: number | null
  teacher_id: number | null
  academic_period_id: number | null
  subject: NamedAcademicReference | null
  teacher: NamedAcademicReference | null
  academic_period: NamedAcademicReference | null
  type: LessonType
  room: string | null
  starts_at: string
  ends_at: string
  status: 'active' | 'cancelled' | 'replaced'
  replaces_lesson_id: number | null
  replacement_id: number | null
}
export type LessonPreview = {
  type: LessonActionType
  confirmation_required: true
  before: LessonSnapshot | null
  after: LessonSnapshot
  effects: {
    original_becomes_replaced: boolean
    restores_original: false
    study_sessions_rescheduled: false
    import_identity_preserved: true
  }
}
export type LessonReceipt = {
  action_id: string
  type: LessonActionType
  lesson: LessonSnapshot & { id: number }
  original: (LessonSnapshot & { id: number }) | null
}
export const sessionLifecycleActionTypes = [
  'propose_session_mark_missed',
  'propose_session_complete',
] as const
export type SessionLifecycleActionType = (typeof sessionLifecycleActionTypes)[number]
export const availabilityActionTypes = [
  'propose_availability_create',
  'propose_availability_update',
  'propose_availability_delete',
] as const
export type AvailabilityActionType = (typeof availabilityActionTypes)[number]
export type AvailabilitySnapshot = Omit<AvailabilityWindow, 'id'> & { id: number | null }
export type PersistedAvailabilitySnapshot = AvailabilitySnapshot & { id: number }
export type AvailabilityEffects = {
  changes_recurring_availability: true
  removes_availability_window: boolean
  reschedules_existing_sessions: false
  changes_planning_preferences: false
  deletes_tasks: false
  deletes_lessons: false
  deletes_study_sessions: false
  changes_reminders: false
}
export type AvailabilityPreview = {
  type: AvailabilityActionType
  confirmation_required: true
  before: PersistedAvailabilitySnapshot | null
  after: AvailabilitySnapshot | null
  timezone: string
  effects: AvailabilityEffects
}
export type AvailabilityReceipt = {
  action_id: string
  type: AvailabilityActionType
  window: PersistedAvailabilitySnapshot | null
  deleted_window: PersistedAvailabilitySnapshot | null
  timezone: string
  effects: AvailabilityEffects
}
export const actionTypes = [
  ...semesterActionTypes,
  'propose_task_create',
  'propose_task_update',
  'propose_task_complete',
  'propose_task_reopen',
  'propose_subtask_create',
  'propose_subtask_update',
  'propose_subtask_complete',
  'propose_subtask_reopen',
  'propose_reminder_create',
  'propose_reminder_update',
  'propose_reminder_cancel',
  'propose_study_plan_create',
  'propose_adaptive_replanning',
  'propose_session_reschedule',
  ...sessionLifecycleActionTypes,
  ...lessonActionTypes,
  ...availabilityActionTypes,
] as const
export type ActionType = (typeof actionTypes)[number]
export type ConsentField =
  'accept_partial' | 'accept_unplaced_cancellation' | 'accept_split_replacements'
export interface AiAction {
  id: string
  conversation_id: number
  call_id: string
  type: string // Unknown public types are readable, but cannot be confirmed by this client.
  status: ActionStatus
  state: 'confirmation_required' | Exclude<ActionStatus, 'pending'>
  confirmation_required: boolean
  preview: PublicObject
  expires_at: string | null
  created_at: string | null
  resolved_at: string | null
  receipt: PublicObject | null
}
export interface TurnResult {
  conversation_id: number
  user_message_id: number
  assistant_message_id: number
  content: string
  tools: ToolResult[]
  action?: {
    id: string
    state: 'confirmation_required'
    call_id: string
    preview: PublicObject
    expires_at: string | null
  }
}
export interface DecisionResult {
  data: AiAction
  replayed: boolean
}
export type AiPage<T> = Page<T>
export interface PendingIntent {
  ownerId: number
  conversationId: number
  key: string
  content: string
  createdAt: number
}
