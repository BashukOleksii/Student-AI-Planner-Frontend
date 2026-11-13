import type { WorkloadAdvice } from '@/types/planning'

const labels: Record<string, string> = {
  unscheduled_work: 'Замало доступного часу',
  no_available_study_time: 'Немає доступного часу для навчання',
  planning_horizon_exhausted: 'Замало часу у вибраному періоді',
  deadline_capacity_exhausted: 'Замало часу до дедлайну',
  daily_study_limit_exceeded: 'Денний ліміт замалий',
  weekly_study_limit_exceeded: 'Тижневий ліміт замалий',
  below_minimum_session_duration: 'Вільні проміжки коротші за мінімальну сесію',
  above_maximum_session_duration: 'Сесія довша за дозволену',
  outside_available_study_time: 'Час поза доступними годинами навчання',
  break: 'Бракує часу на перерву між заняттями',
  deadline_exceeded: 'Сесія виходить за дедлайн',
  deadline_expired: 'Дедлайн уже минув',
  missing_estimate: 'Не вказано потрібний час',
  completed_effort_satisfies_estimate: 'Потрібно уточнити оцінку часу',
  overlapping_break_anchor: 'Сесія перетинається з іншим заняттям',
  future_reservation_exceeds_remaining_work: 'У плані більше часу, ніж потрібно',
  stale_planned_session: 'Минула сесія очікує вашого рішення',
  reservation_deadline_exceeded: 'Запланована сесія виходить за дедлайн',
  reservation_targets_completed_work: 'Сесія стосується вже завершеної роботи',
  session_targets_deleted_subtask: 'Підзавдання запланованої сесії видалено',
  ambiguous_parent_session_attribution: 'Уточніть підзавдання для сесії',
  completed_effort_exceeds_estimate: 'Навчання зайняло більше часу, ніж очікувалось',
}
const reasonKey = (code: string) =>
  ['insufficient_break_before', 'insufficient_break_after'].includes(code) ? 'break' : code
export const shortWorkloadReason = (code: string) =>
  labels[reasonKey(code)] ?? 'Перегляньте умови планування'

export interface UnscheduledWork {
  key: string
  task_id: number
  subtask_id: number | null
  seconds: number | null
  reason_codes: string[]
}
const resolvedExclusions = new Set([
  'completed_task',
  'completed_subtask',
  'parent_task_completed',
  'subtasks_authoritative',
  'fully_reserved',
])
const actionableExclusions = new Set([
  'missing_estimate',
  'deadline_expired',
  'completed_effort_satisfies_estimate',
])

export function unscheduledWork(report: WorkloadAdvice | null): UnscheduledWork[] {
  if (!report) return []
  return [
    ...report.work_advice
      .filter((work) => work.unscheduled_seconds > 0)
      .map((work) => ({ ...work, seconds: work.unscheduled_seconds })),
    ...report.excluded_items
      .filter(
        (work) =>
          !work.reason_codes.some((code) => resolvedExclusions.has(code)) &&
          work.reason_codes.some((code) => actionableExclusions.has(code)),
      )
      .map((work) => ({
        ...work,
        seconds: work.reason_codes.includes('completed_effort_satisfies_estimate')
          ? null
          : (work.effort?.unallocated_work_seconds ?? null),
      })),
  ].map((work) => ({
    key: `${work.task_id}:${work.subtask_id ?? 'task'}`,
    task_id: work.task_id,
    subtask_id: work.subtask_id,
    seconds: work.seconds,
    reason_codes: work.reason_codes.length ? work.reason_codes : ['unscheduled_work'],
  }))
}

export function workloadIssues(report: WorkloadAdvice | null) {
  const groups = new Map<string, Map<string, number | null>>()
  function add(code: string, key: string, seconds: number | null) {
    const reason = reasonKey(code)
    if (!groups.has(reason)) groups.set(reason, new Map())
    groups.get(reason)!.set(key, seconds)
  }
  for (const work of unscheduledWork(report)) {
    for (const code of work.reason_codes) add(code, work.key, work.seconds)
  }
  for (const warning of report?.warnings ?? []) {
    add(warning.code, `${warning.task_id}:${warning.subtask_id ?? 'task'}`, warning.seconds)
  }
  return [...groups].map(([code, works]) => ({
    code,
    label: shortWorkloadReason(code),
    count: works.size,
    seconds: [...works.values()].some((value) => value === null)
      ? null
      : [...works.values()].reduce<number>((sum, value) => sum + (value ?? 0), 0),
    tone: ['deadline_expired', 'deadline_exceeded', 'deadline_capacity_exhausted'].includes(code)
      ? 'danger'
      : ['missing_estimate', 'completed_effort_satisfies_estimate'].includes(code)
        ? 'info'
        : 'warning',
  }))
}
