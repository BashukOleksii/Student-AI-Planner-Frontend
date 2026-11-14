import { validateRange } from './planning'

export const planningResults = {
  plan_saved: 'Новий план збережено.',
  recovery_saved: 'План відновлення збережено.',
  replan_saved: 'Перепланування збережено.',
  suggestion_saved: 'Пропозицію застосовано.',
  session_rescheduled: 'Заміни сесії збережено.',
}
export function planningSessionsLocation(
  period: { start_date: string; end_date: string } | null,
  result: keyof typeof planningResults,
) {
  let dates: { start_date?: string; end_date?: string } = {}
  if (period) {
    try {
      validateRange(period)
      dates = { start_date: period.start_date, end_date: period.end_date }
    } catch {
      /* Unsupported periods use the sessions page's default range. */
    }
  }
  return { path: '/planning/sessions', query: { ...dates, result } }
}
