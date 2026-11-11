import { ApiError } from './client'
import { calendarDate } from '@/utils/semesterSchedule'
import { isObject } from '@/utils/ai'
import type { RecoverySuggestion, RecoveryFeed } from '@/types/recovery'
const invalid = (): never => {
  throw new ApiError(502)
}
export function recoverySuggestion(value: unknown, expectedId?: string): RecoverySuggestion {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    (expectedId !== undefined && value.id !== expectedId) ||
    !['create_plan', 'replan', 'decision_required', 'warning'].includes(String(value.kind)) ||
    !['pending', 'applied', 'rejected', 'expired', 'invalidated'].includes(String(value.status)) ||
    !isObject(value.period) ||
    !['start_date', 'end_date', 'timezone'].every(
      (key) =>
        typeof value.period === 'object' &&
        value.period !== null &&
        typeof (value.period as Record<string, unknown>)[key] === 'string',
    ) ||
    !['actionable', 'confirmation_required', 'requires_lifecycle_decision'].every(
      (key) => typeof value[key] === 'boolean',
    ) ||
    !Array.isArray(value.required_confirmation_fields) ||
    !value.required_confirmation_fields.every((field) => typeof field === 'string') ||
    !isObject(value.review) ||
    !(value.receipt === null || isObject(value.receipt)) ||
    !(value.expires_at === null || typeof value.expires_at === 'string')
  )
    return invalid()
  if (
    !calendarDate(value.period.start_date) ||
    !calendarDate(value.period.end_date) ||
    (value.expires_at !== null && !Number.isFinite(Date.parse(String(value.expires_at))))
  )
    return invalid()
  try {
    new Intl.DateTimeFormat('uk-UA', { timeZone: String(value.period.timezone) })
  } catch {
    return invalid()
  }
  // Validate control fields at the trust boundary; nested evidence remains complete and read-only.
  return value as unknown as RecoverySuggestion
}
export function recoveryResource(value: unknown, expectedId?: string) {
  if (!isObject(value)) return invalid()
  return { data: recoverySuggestion(value.data, expectedId) }
}
export function recoveryFeed(value: unknown): RecoveryFeed {
  if (
    !isObject(value) ||
    !Array.isArray(value.data) ||
    !isObject(value.meta) ||
    !Number.isSafeInteger(value.meta.current_page) ||
    !Number.isSafeInteger(value.meta.last_page) ||
    Number(value.meta.current_page) < 1 ||
    Number(value.meta.last_page) < 1 ||
    !isObject(value.automation)
  )
    return invalid()
  return {
    ...value,
    data: value.data.map((item) => recoverySuggestion(item)),
  } as unknown as RecoveryFeed
}

export function recoveryReviewSupported(suggestion: RecoverySuggestion) {
  const review = suggestion.review
  const plan = suggestion.kind === 'replan' ? review.adaptive_replanning : review.new_work_plan
  return (
    review.version === 1 &&
    review.kind === suggestion.kind &&
    isObject(plan) &&
    isObject(plan.summary) &&
    Array.isArray(suggestion.kind === 'replan' ? plan.session_results : plan.sessions)
  )
}
