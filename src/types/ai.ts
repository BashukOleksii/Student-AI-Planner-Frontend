import type { Page } from './api'

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
export const actionTypes = [
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
] as const
export type ActionType = (typeof actionTypes)[number]
export type ConsentField = 'accept_partial' | 'accept_unplaced_cancellation'
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
