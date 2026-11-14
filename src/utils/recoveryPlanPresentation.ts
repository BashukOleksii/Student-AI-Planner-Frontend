import { publicText } from './publicText'
import type { PublicObject } from '@/types/ai'
import type { RecoveryDiagnostics, StudyPlan } from '@/types/planning'
import type { StudySession } from '@/types/api'
import { planningReasonLabel } from './planning'

export const recoveryOutcomeIds = (plan: StudyPlan | null) => [
  ...new Set(
    (plan?.warnings ?? []).flatMap((warning) =>
      warning.code === 'stale_planned_session' && typeof warning.study_session_id === 'number'
        ? [warning.study_session_id]
        : [],
    ),
  ),
]

export function recoveryOutcomes(
  diagnostics: RecoveryDiagnostics | undefined,
  details: StudySession[],
) {
  const sessions = new Map(
    (diagnostics?.past_planned_sessions ?? []).map((session) => [
      session.study_session_id,
      session,
    ]),
  )
  for (const session of details) {
    if (session.status === 'planned')
      sessions.set(session.id, {
        ...session,
        study_session_id: session.id,
        work_reason_codes: [],
        allowed_lifecycle_actions: [],
      })
    else sessions.delete(session.id)
  }
  return [...sessions.values()]
}

const labels: Record<string, string> = {
  stale_planned_session: 'Для минулої сесії ще не вказано результат',
  planning_horizon_exhausted: 'У вибраному періоді недостатньо часу',
  no_available_study_time: 'Немає доступного часу для навчання',
  deadline_capacity_exhausted: 'Недостатньо часу до дедлайну',
  daily_study_limit_exceeded: 'Досягнуто денного ліміту',
  weekly_study_limit_exceeded: 'Досягнуто тижневого ліміту',
  missing_estimate: 'Не вказано оцінку тривалості роботи',
  future_reservation_exceeds_remaining_work: 'У плані більше часу, ніж потрібно',
}
export function recoveryReasons(row: PublicObject) {
  const codes = [
    ...(typeof row.code === 'string' ? [row.code] : []),
    ...(Array.isArray(row.reason_codes)
      ? row.reason_codes.filter((code): code is string => typeof code === 'string')
      : []),
  ]
  if (codes.length)
    return [...new Set(codes.map((code) => labels[code] ?? planningReasonLabel(code)))]
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

export function recoveryWarnings(plan: StudyPlan, representedIds: number[]) {
  const seen = new Set<string>()
  return plan.warnings.filter((warning) => {
    if (
      warning.code === 'stale_planned_session' &&
      (typeof warning.study_session_id === 'number'
        ? representedIds.includes(warning.study_session_id)
        : representedIds.length > 0)
    )
      return false
    const key = JSON.stringify([
      warning.code,
      warning.task_id,
      warning.subtask_id,
      warning.study_session_id,
      recoveryReasons(warning),
    ])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function recoveryUnscheduled(plan: StudyPlan) {
  const resolved = [
    'completed_task',
    'completed_subtask',
    'parent_task_completed',
    'subtasks_authoritative',
    'fully_reserved',
  ]
  return [
    ...plan.work_results.filter(
      (row) => typeof row.unscheduled_seconds === 'number' && row.unscheduled_seconds > 0,
    ),
    ...plan.excluded_items.filter(
      (row) =>
        !Array.isArray(row.reason_codes) ||
        !row.reason_codes.some((code) => typeof code === 'string' && resolved.includes(code)),
    ),
  ]
}
