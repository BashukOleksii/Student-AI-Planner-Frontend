import { f2Backend } from './f2Backend'
import type { RecoverySuggestion } from '@/types/recovery'
import type { PlanningAttentionStatus } from '@/api/planningAttention'
export function recoveryPresentationBackend() {
  const base = f2Backend()
  const writes: string[] = []
  const check: PlanningAttentionStatus = {
    attention_count: 1,
    most_important_kind: 'replan',
    counts: { decision_required: 0, replan: 1, warning: 0, create_plan: 0 },
    has_informational_recommendations: false,
    check_state: 'idle',
    check_pending: false,
    last_successful_check_at: '2026-11-13T08:00:00Z',
    check_failed: false,
    unverified_suggestion_count: 0,
    review_refresh_required: false,
  }
  const suggestion: RecoverySuggestion = {
    id: 'example',
    kind: 'replan',
    status: 'pending',
    period: { start_date: '2026-11-02', end_date: '2026-11-08', timezone: 'Europe/Kyiv' },
    actionable: true,
    confirmation_required: true,
    requires_lifecycle_decision: false,
    required_confirmation_fields: [],
    reason_codes: [],
    expires_at: '2099-11-02T12:00:00Z',
    receipt: null,
    review: {
      version: 1,
      kind: 'replan',
      adaptive_replanning: { summary: {}, session_results: [] },
    },
  }
  return {
    check,
    suggestion,
    writes,
    handle(url: string, method = 'GET', body = {}) {
      const path = new URL(url).pathname
      if (path === '/api/planning/attention-status') return { status: 200, body: { data: check } }
      if (path.includes('/recovery-suggestions')) {
        if (method !== 'GET') {
          writes.push(path)
          return { status: 409, body: {} }
        }
        return {
          status: 200,
          body: path.endsWith('/example')
            ? { data: suggestion }
            : {
                data: [suggestion],
                meta: { current_page: 1, last_page: 1 },
                automation: {
                  last_scanned_at: check.last_successful_check_at,
                  last_outcome: 'suggested',
                },
              },
        }
      }
      return base.handle(url, method, body)
    },
  }
}
