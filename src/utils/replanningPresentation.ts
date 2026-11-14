import { publicText } from './publicText'
import { isObject } from './ai'
import type { ReplanningReview, ReplanningResult } from '@/types/planning'
import type { PublicObject } from '@/types/ai'
import { planningReasonLabel } from './planning'
export type ReplanningRow = ReplanningReview['session_results'][number]
export const replanningReplacements = (row: ReplanningRow) =>
  row.replacements ?? (row.replacement ? [row.replacement] : [])
export const replanningIssues = (review: ReplanningReview) =>
  review.session_results.filter((row) => row.classification !== 'valid')
export const hasReplanningIssues = (review: ReplanningReview) =>
  replanningIssues(review).length > 0 ||
  review.summary.affected_sessions > 0 ||
  review.summary.cannot_replan_sessions > 0
const shortReasons: Record<string, string> = {
  lesson_overlap: 'Перетинається із заняттям',
  overlapping_break_anchor: 'Перетинається з іншим заняттям',
  session_not_future: 'Сесія вже почалася — потрібне ваше рішення',
  session_start_not_future: 'Сесія вже почалася — потрібне ваше рішення',
  stale_planned_session: 'Сесія вже почалася — потрібне ваше рішення',
  outside_available_study_time: 'Час поза доступними годинами навчання',
  no_replacement_capacity: 'Немає доступного часу для заміни',
  incomplete_relocation: 'Знайдено час лише для частини роботи',
  deadline_exceeded: 'Не вкладається в дедлайн',
  deadline_expired: 'Дедлайн уже минув',
  daily_study_limit_exceeded: 'Перевищено денний ліміт',
  weekly_study_limit_exceeded: 'Перевищено тижневий ліміт',
  insufficient_break_before: 'Бракує перерви перед сесією',
  insufficient_break_after: 'Бракує перерви після сесії',
  missing_estimate: 'Не вказано потрібний час',
  below_minimum_session_duration: 'Вільний проміжок коротший за мінімальну сесію',
}
export function replanningReasons(row: {
  code?: unknown
  reason_codes?: unknown
  replacement_reason_codes?: unknown
  explanations?: unknown
}) {
  const codes = [
    row.code,
    ...(Array.isArray(row.reason_codes) ? row.reason_codes : []),
    ...(Array.isArray(row.replacement_reason_codes) ? row.replacement_reason_codes : []),
  ].filter((code): code is string => typeof code === 'string')
  if (codes.length)
    return [...new Set(codes.map((code) => shortReasons[code] ?? planningReasonLabel(code)))]
  return Array.isArray(row.explanations)
    ? [
        ...new Set(
          row.explanations.map((text) =>
            publicText(text, 'Перевірте поточну роботу та створіть новий огляд.'),
          ),
        ),
      ]
    : []
}
const category = (code: string) =>
  ['session_not_future', 'session_start_not_future', 'stale_planned_session'].includes(code)
    ? 'outcome'
    : code
export function uniqueReplanningWarnings(review: ReplanningReview) {
  const rows = replanningIssues(review),
    seen = new Set<string>()
  const result: PublicObject[] = []
  for (const warning of [...review.warnings, ...review.excluded_items]) {
    const codes = [
      warning.code,
      ...(Array.isArray(warning.reason_codes) ? warning.reason_codes : []),
    ].filter((code): code is string => typeof code === 'string')
    const remainingCodes = codes.filter(
      (code) =>
        !rows.some((row) => {
          const same =
            typeof warning.study_session_id === 'number'
              ? warning.study_session_id === row.study_session_id
              : typeof warning.task_id === 'number' &&
                warning.task_id === row.task_id &&
                (warning.subtask_id ?? null) === row.subtask_id
          const rowCodes = [...row.reason_codes, ...row.replacement_reason_codes].map(category)
          return (
            same &&
            (rowCodes.includes(category(code)) ||
              (row.untransferred_seconds > 0 &&
                ['unscheduled_work', 'no_replacement_capacity', 'incomplete_relocation'].includes(
                  code,
                )))
          )
        }),
    )
    if (codes.length && !remainingCodes.length) continue
    // Preserve unique reasons even when the same warning also repeats a source issue.
    const item: PublicObject = codes.length
      ? { ...warning, code: null, reason_codes: remainingCodes }
      : warning
    const reasons = replanningReasons(item)
    const key = JSON.stringify([item.study_session_id, item.task_id, item.subtask_id, reasons])
    if (seen.has(key) || !reasons.length) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

// Older receipts can omit intervals/group links. Never infer source associations from dates.
export function isReplanningReview(value: unknown): value is ReplanningReview {
  if (!isObject(value) || !isObject(value.summary)) return false
  const summary = value.summary
  const interval = (row: unknown) =>
    isObject(row) &&
    typeof row.starts_at === 'string' &&
    Number.isFinite(Date.parse(row.starts_at)) &&
    typeof row.ends_at === 'string' &&
    Number.isFinite(Date.parse(row.ends_at)) &&
    typeof row.duration_seconds === 'number'
  return (
    typeof value.start_date === 'string' &&
    typeof value.end_date === 'string' &&
    typeof value.timezone === 'string' &&
    Array.isArray(value.session_results) &&
    value.session_results.every(
      (row) =>
        isObject(row) &&
        typeof row.study_session_id === 'number' &&
        typeof row.classification === 'string' &&
        interval(row.original) &&
        (row.replacements === undefined ||
          (Array.isArray(row.replacements) && row.replacements.every(interval))) &&
        (row.replacement === null || row.replacement === undefined || interval(row.replacement)) &&
        Array.isArray(row.reason_codes) &&
        Array.isArray(row.replacement_reason_codes),
    ) &&
    ['released_session_ids', 'work_results', 'excluded_items', 'warnings'].every((key) =>
      Array.isArray(value[key]),
    ) &&
    [
      'affected_sessions',
      'proposed_replacements',
      'untransferred_seconds',
      'cannot_replan_sessions',
    ].every((key) => typeof summary[key] === 'number')
  )
}
export function isReplanningResult(value: unknown): value is ReplanningResult {
  return (
    isObject(value) &&
    value.applied === true &&
    isObject(value.summary) &&
    Array.isArray(value.original_sessions) &&
    value.original_sessions.every(
      (row) => isObject(row) && typeof row.id === 'number' && typeof row.status === 'string',
    ) &&
    Array.isArray(value.replacement_sessions) &&
    value.replacement_sessions.every(
      (row) =>
        isObject(row) &&
        typeof row.id === 'number' &&
        typeof row.starts_at === 'string' &&
        typeof row.ends_at === 'string' &&
        typeof row.duration_seconds === 'number',
    ) &&
    (value.replacement_groups === undefined ||
      (Array.isArray(value.replacement_groups) &&
        value.replacement_groups.every(
          (group) =>
            isObject(group) &&
            typeof group.original_session_id === 'number' &&
            Array.isArray(group.successor_session_ids) &&
            group.successor_session_ids.every((id) => typeof id === 'number'),
        )))
  )
}
