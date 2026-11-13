import type { PlanningAttentionStatus } from '@/api/planningAttention'
import type { RecoverySuggestion } from '@/types/recovery'

export const recoveryGroups: { kind: RecoverySuggestion['kind']; title: string }[] = [
  { kind: 'decision_required', title: 'Потрібно вказати результат' },
  { kind: 'replan', title: 'Пропонуємо перенести' },
  { kind: 'warning', title: 'Не вдалося розмістити' },
  { kind: 'create_plan', title: 'Можна створити план' },
]
export function planningCheckLabel(
  status: PlanningAttentionStatus | null,
  failed: boolean,
  checking: boolean,
) {
  if (failed || status?.check_failed || status?.check_state === 'failed')
    return 'Не вдалося перевірити'
  if (status?.check_state === 'not_checked') return 'План ще не перевірено'
  if (
    checking ||
    status?.check_pending ||
    status?.check_state === 'running' ||
    status?.check_state === 'pending' ||
    !status
  )
    return 'Перевіряємо план'
  if (status.review_refresh_required) return 'Попередній огляд застарів'
  if (!status.last_successful_check_at) return 'План ще не перевірено'
  if (status.attention_count === 0) return 'Немає дій, які потребують уваги'
  return 'Перевірку завершено. Перегляньте запропоновані дії.'
}
