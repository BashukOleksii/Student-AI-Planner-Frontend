import type { PublicObject } from './ai'
export interface RecoverySuggestion {
  id: string
  kind: 'create_plan' | 'replan' | 'decision_required' | 'warning'
  status: 'pending' | 'applied' | 'rejected' | 'expired' | 'invalidated'
  period: { start_date: string; end_date: string; timezone: string }
  actionable: boolean
  confirmation_required: boolean
  requires_lifecycle_decision: boolean
  required_confirmation_fields: string[]
  reason_codes: string[]
  review: PublicObject
  receipt: PublicObject | null
  expires_at: string | null
}
export interface RecoveryFeed {
  data: RecoverySuggestion[]
  meta: { current_page: number; last_page: number }
  automation: { last_scanned_at: string | null; last_outcome: string | null }
}
