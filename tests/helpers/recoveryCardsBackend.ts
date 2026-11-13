import { recoveryPresentationBackend } from './recoveryPresentationBackend'
import type { RecoverySuggestion } from '@/types/recovery'
export function recoveryCardsBackend(count = 1, lastPage = 1) {
  const base = recoveryPresentationBackend()
  const kinds: RecoverySuggestion['kind'][] = [
    'decision_required',
    'replan',
    'warning',
    'create_plan',
  ]
  const suggestions = Array.from({ length: count }, (_, index): RecoverySuggestion => ({
    ...base.suggestion,
    id: `card-${index}`,
    kind: kinds[index % kinds.length]!,
  }))
  const requests: { path: string; method: string; search: string }[] = []
  return {
    suggestions,
    requests,
    handle(url: string, method = 'GET', body = {}) {
      const parsed = new URL(url),
        path = parsed.pathname
      requests.push({ path, method, search: parsed.search })
      if (method === 'GET' && path === '/api/planning/recovery-suggestions')
        return {
          status: 200,
          body: {
            data: suggestions,
            meta: {
              current_page: Number(parsed.searchParams.get('page') ?? 1),
              last_page: lastPage,
            },
            automation: {
              last_scanned_at: base.check.last_successful_check_at,
              last_outcome: 'suggested',
            },
          },
        }
      const suggestion = suggestions.find(
        (item) => path === `/api/planning/recovery-suggestions/${item.id}`,
      )
      if (method === 'GET' && suggestion) return { status: 200, body: { data: suggestion } }
      return base.handle(url, method, body)
    },
  }
}
