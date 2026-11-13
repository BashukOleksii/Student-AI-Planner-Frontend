import { request, ApiError } from './client'
import { isObject } from '@/utils/ai'
export type AttentionKind = 'decision_required' | 'replan' | 'warning' | 'create_plan'
export interface PlanningAttentionStatus {
  attention_count: number
  most_important_kind: AttentionKind | null
  counts: Record<AttentionKind, number>
  has_informational_recommendations: boolean
  check_state: 'idle' | 'pending' | 'running' | 'failed' | 'not_checked'
  check_pending: boolean
  last_successful_check_at: string | null
  check_failed: boolean
  unverified_suggestion_count: number
  review_refresh_required: boolean
}
const kinds = ['decision_required', 'replan', 'warning', 'create_plan']
function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}
export async function getPlanningAttention(signal?: AbortSignal): Promise<PlanningAttentionStatus> {
  const value = await request<unknown>('/api/planning/attention-status', { signal })
  const data = isObject(value) && isObject(value.data) ? value.data : null
  if (
    !data ||
    !count(data.attention_count) ||
    !count(data.unverified_suggestion_count) ||
    !isObject(data.counts) ||
    !kinds.every((kind) => count((data.counts as Record<string, unknown>)[kind])) ||
    !(data.most_important_kind === null || kinds.includes(String(data.most_important_kind))) ||
    !['idle', 'pending', 'running', 'failed', 'not_checked'].includes(String(data.check_state)) ||
    typeof data.check_pending !== 'boolean' ||
    typeof data.check_failed !== 'boolean' ||
    typeof data.review_refresh_required !== 'boolean' ||
    typeof data.has_informational_recommendations !== 'boolean' ||
    !(
      data.last_successful_check_at === null ||
      (typeof data.last_successful_check_at === 'string' &&
        Number.isFinite(Date.parse(data.last_successful_check_at)))
    )
  )
    throw new ApiError(502)
  return data as unknown as PlanningAttentionStatus
}
