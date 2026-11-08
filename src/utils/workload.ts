import { duration, planningReasonLabel } from './planning'
import type { WorkloadAdvice } from '@/types/planning'

const reasons: Record<string, string> = {
  unscheduled_work: 'Частину роботи не вдалося розмістити під час поточного планування.',
  no_available_study_time: 'Поточне планування не знайшло доступного навчального часу.',
  planning_horizon_exhausted:
    'У межах вибраного періоду алгоритм не знайшов додаткового придатного розміщення.',
  deadline_capacity_exhausted:
    'Поточне планування не знайшло достатньо придатного часу до дедлайну.',
  daily_study_limit_exceeded: 'Денний ліміт обмежив поточне розміщення роботи.',
  weekly_study_limit_exceeded: 'Тижневий ліміт обмежив поточне розміщення роботи.',
  below_minimum_session_duration: 'Придатний інтервал коротший за мінімальну тривалість сесії.',
  above_maximum_session_duration: 'Тривалість перевищує налаштовану максимальну тривалість сесії.',
  outside_available_study_time: 'Розміщення виходить за межі доступного навчального часу.',
  overlapping_break_anchor:
    'Розміщення перетинається з інтервалом, від якого враховується перерва.',
  insufficient_break_before: 'Перед сесією недостатньо часу для налаштованої перерви.',
  insufficient_break_after: 'Після сесії недостатньо часу для налаштованої перерви.',
  deadline_exceeded: 'Дедлайн не дозволяє це розміщення.',
  excluded_work: 'Частину роботи виключено з цієї спроби планування. Перегляньте окремий список.',
}
export function workloadReasonLabel(
  code: string,
  source?: WorkloadAdvice['alerts'][number]['source'],
) {
  if (source === 'persisted_workload') {
    if (code === 'daily_study_limit_exceeded')
      return 'Заплановане навантаження перевищує встановлений денний ліміт.'
    if (code === 'weekly_study_limit_exceeded')
      return 'Заплановане навантаження перевищує встановлений тижневий ліміт.'
  }
  return reasons[code] ?? planningReasonLabel(code)
}
const recommendations: Record<string, { label: string; path: string }> = {
  follow_planning_order: {
    label: 'Дотримуйтеся порядку роботи, наданого планувальником.',
    path: '/planning/preview',
  },
  review_planning_period: {
    label: 'Перегляньте діапазон дат для нового плану.',
    path: '/planning/preview',
  },
  consider_recovery_preview: {
    label: 'Перегляньте можливість відновлення залишку роботи.',
    path: '/planning/recovery',
  },
  review_study_availability: {
    label: 'Перевірте доступні інтервали навчання.',
    path: '/planning/availability',
  },
  review_deadline: { label: 'Перевірте дедлайн роботи.', path: '/tasks' },
  review_study_limits: {
    label: 'Перегляньте денний і тижневий ліміти навчання.',
    path: '/planning/preferences',
  },
  review_session_duration: {
    label: 'Перегляньте мінімальну та максимальну тривалість сесій.',
    path: '/planning/preferences',
  },
  review_break_preferences: {
    label: 'Перевірте вподобання щодо перерв між сесіями.',
    path: '/planning/preferences',
  },
  supply_estimated_effort: { label: 'Укажіть оцінку тривалості роботи.', path: '/tasks' },
}
export function workloadRecommendation(code: string, taskId: number) {
  const advice = recommendations[code]
  return {
    label:
      advice?.label ??
      'Додаткова рекомендація сервера. Перегляньте пов’язану роботу перед змінами.',
    to:
      advice?.path === '/tasks'
        ? `/tasks/${taskId}`
        : advice?.path === '/planning/recovery'
          ? `${advice.path}?task_id=${taskId}`
          : advice?.path,
  }
}
export const workloadDuration = (seconds: number | null) =>
  seconds === null ? 'Невідомо' : duration(seconds)
export const effortFields: {
  key: keyof NonNullable<WorkloadAdvice['excluded_items'][number]['effort']>
  label: string
}[] = [
  { key: 'estimated_seconds', label: 'Початкова оцінка' },
  { key: 'completed_credit_seconds', label: 'Зараховані виконані зусилля' },
  { key: 'remaining_work_seconds', label: 'Залишок роботи' },
  { key: 'future_reserved_seconds', label: 'Майбутні резервування' },
  { key: 'unallocated_work_seconds', label: 'Незарезервований залишок' },
  { key: 'over_reserved_seconds', label: 'Надлишкове резервування' },
]
