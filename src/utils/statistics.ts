import { Temporal } from '@js-temporal/polyfill'
import type { DateRange } from '@/types/planning'
export function validateReportRange(range: DateRange) {
  try {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(range.start_date) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(range.end_date)
    )
      throw new Error()
    const start = Temporal.PlainDate.from(range.start_date),
      end = Temporal.PlainDate.from(range.end_date),
      days = start.until(end).days
    if (start.year < 1 || end.year > 9999 || days < 0 || days > 30) throw new Error()
  } catch {
    throw new Error('Оберіть від 1 до 31 дійсної календарної дати включно.')
  }
}
export function validateComparison(baseline: DateRange, current: DateRange) {
  validateReportRange(baseline)
  validateReportRange(current)
  if (baseline.end_date >= current.start_date)
    throw new Error('Базовий період має завершитися до початку поточного.')
  if (
    Temporal.PlainDate.from(baseline.start_date).until(baseline.end_date).days !==
    Temporal.PlainDate.from(current.start_date).until(current.end_date).days
  )
    throw new Error('Періоди мають містити однакову кількість календарних дат.')
}
export const sessionKeys = ['planned', 'completed', 'missed', 'rescheduled', 'cancelled'] as const
export const completionLabels = {
  total: 'Усього завершено',
  on_time: 'Вчасно',
  late: 'Із запізненням',
  without_deadline: 'Без дедлайну',
}
export const directionLabels = {
  increased: 'Збільшилося',
  decreased: 'Зменшилося',
  unchanged: 'Без змін',
}
export function signed(value: number) {
  return value > 0 ? `+${value}` : String(value)
}
