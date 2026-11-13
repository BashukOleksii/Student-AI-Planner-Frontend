import { Temporal } from '@js-temporal/polyfill'
import type { DateRange, PlanningPreferences } from '@/types/planning'
export const weekdays = [
  'Понеділок',
  'Вівторок',
  'Середа',
  'Четвер',
  'П’ятниця',
  'Субота',
  'Неділя',
]
export const preferenceFields: { key: keyof PlanningPreferences; label: string; hint: string }[] = [
  {
    key: 'max_daily_study_minutes',
    label: 'Денний ліміт, хв',
    hint: 'Верхня межа навчального навантаження за місцевий день.',
  },
  {
    key: 'max_weekly_study_minutes',
    label: 'Тижневий ліміт, хв',
    hint: 'Верхня межа за календарний ISO-тиждень.',
  },
  {
    key: 'preferred_break_minutes',
    label: 'Перерва, хв',
    hint: 'Обов’язковий мінімальний проміжок перед і після навчальних сесій та університетських занять.',
  },
  {
    key: 'min_session_minutes',
    label: 'Мінімальна сесія, хв',
    hint: 'Мінімальна допустима тривалість сесії.',
  },
  {
    key: 'max_session_minutes',
    label: 'Максимальна сесія, хв',
    hint: 'Максимальна допустима тривалість сесії.',
  },
]
export function nullableMinutes(value: string): number | null {
  if (value === '') return null
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 65535)
    throw new Error('Введіть ціле число від 1 до 65535 або залиште поле порожнім.')
  return Number(value)
}
export function validateRange(range: DateRange) {
  try {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(range.start_date) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(range.end_date)
    )
      throw new Error()
    const start = Temporal.PlainDate.from(range.start_date),
      end = Temporal.PlainDate.from(range.end_date)
    const days = start.until(end).days
    if (days < 0 || days > 30 || start.year < 1000 || end.year > 9999) throw new Error()
  } catch {
    throw new Error('Виберіть дійсний період від 1 до 31 календарного дня.')
  }
}
export function canonicalWallTime(value: string, end = false) {
  const time = /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time) && !(end && time === '24:00:00'))
    throw new Error('Введіть час HH:MM:SS. 24:00:00 дозволено лише для завершення.')
  return time
}
export function duration(seconds: number) {
  return `${Math.floor(seconds / 60)} хв${seconds % 60 ? ` ${seconds % 60} с` : ''}`
}
export function exactDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'shortOffset',
  }).format(new Date(value))
}
export const sessionStatuses = {
  planned: 'Заплановано',
  completed: 'Завершено',
  missed: 'Пропущено',
  rescheduled: 'Перенесено',
  cancelled: 'Скасовано',
}

const planningReasons: Record<string, string> = {
  no_available_study_time: 'Для залишку роботи не знайдено доступного часу в обраному періоді.',
  below_minimum_session_duration:
    'Доступний проміжок або залишок роботи коротший за мінімальну тривалість сесії.',
  above_maximum_session_duration: 'Тривалість перевищує максимальну тривалість сесії.',
  insufficient_break_before:
    'Перед сесією недостатньо часу на обов’язкову перерву після заняття або іншої сесії.',
  insufficient_break_after:
    'Після сесії недостатньо часу на обов’язкову перерву перед заняттям або іншою сесією.',
  outside_available_study_time:
    'Час виходить за доступні години або перетинається із зайнятим часом.',
  overlapping_break_anchor:
    'Час перетинається з університетським заняттям або запланованою сесією.',
  daily_study_limit_exceeded: 'Денний ліміт навчального навантаження не дозволяє розмістити сесію.',
  weekly_study_limit_exceeded:
    'Тижневий ліміт навчального навантаження не дозволяє розмістити сесію.',
  deadline_exceeded: 'Сесія завершувалася б після ефективного дедлайну роботи.',
  deadline_expired:
    'Дедлайн роботи вже минув. Для звичайного планування потрібно явно переглянути дедлайн.',
  subtasks_authoritative:
    'Плануються підзавдання; оцінка батьківського завдання не додається повторно.',
  parent_task_completed: 'Батьківське завдання вже виконано.',
  fully_reserved: 'Залишок роботи вже зарезервований майбутніми сесіями.',
  completed_effort_satisfies_estimate: 'Зарахована виконана робота вже покриває оцінку тривалості.',
  completed_effort_exceeds_estimate: 'Зараховані виконані зусилля перевищують оцінку роботи.',
  ambiguous_parent_session_attribution:
    'Попередню сесію батьківського завдання неможливо однозначно розподілити між підзавданнями.',
  reservation_targets_completed_work: 'Майбутня сесія стосується вже виконаної роботи.',
  session_targets_deleted_subtask: 'Сесія стосується видаленого підзавдання.',
  session_start_not_future:
    'Сесія вже почалася або залишилася в минулому й потребує вашого рішення.',
  deleted_task: 'Завдання видалено.',
  deleted_subtask: 'Підзавдання видалено.',
  single_replacement_duration_limited: 'Лише частину початкової тривалості вдалося перенести.',
  minimum_above_max_daily_study_minutes:
    'Мінімальна сесія довша за денний ліміт. Вона може бути можливою лише з розподілом часу між місцевими днями; перевірте придатність доступних годин.',
  minimum_above_max_weekly_study_minutes:
    'Мінімальна сесія довша за тижневий ліміт. Перевірте можливість розподілу часу між ISO-тижнями.',
  long_break: 'Перерва довша за максимальну сесію. Це дозволено, але зменшує придатний час.',
  no_suitable_time_in_period:
    'За поточним розкладом і обмеженнями у вибраному періоді не знайдено придатної сесії.',
  availability_not_configured: 'Доступні години для самостійного навчання не визначені.',

  reservation_deadline_exceeded: 'Запланований час навчання виходить за дедлайн роботи',
  missing_estimate: 'Не вказано оцінку тривалості роботи',
  completed_task: 'Завдання вже виконано',
  completed_subtask: 'Підзавдання вже виконано',
  planning_horizon_exhausted: 'У вибраному періоді недостатньо часу для решти роботи',
  deadline_capacity_exhausted: 'До дедлайну недостатньо доступного часу',
  stale_planned_session: 'Минулу заплановану сесію ще не завершено й не позначено пропущеною',
  future_reservation_exceeds_remaining_work:
    'Майбутні сесії вже резервують більше часу, ніж залишок роботи',
  lesson_overlap: 'Час перетинається із заняттям',
  session_not_future: 'Сесія вже почалася або залишилася в минулому',
  no_replacement_capacity: 'Недостатньо часу для заміни сесії',
  incomplete_relocation: 'Лише частину тривалості вдалося розмістити',
}
export function planningReasonLabel(code: string) {
  return (
    planningReasons[code] ?? 'Додаткова умова обмежує планування. Перегляньте пов’язану роботу.'
  )
}
const lifecycleActions: Record<string, string> = {
  complete: 'Завершити сесію',
  miss: 'Позначити пропущеною',
  cancel: 'Скасувати сесію',
  reschedule: 'Перенести сесію',
}
export function lifecycleActionLabel(action: string) {
  return lifecycleActions[action] ?? 'Інша дозволена дія на сторінці сесії'
}

// Runtime narrowing for the shared structured renderer; never render protected review tokens.
export function reviewValue(
  value: unknown,
  explainReasons = true,
  field = '',
): import('@/types/ai').PublicValue {
  if (
    explainReasons &&
    typeof value === 'string' &&
    ['code', 'reason_codes', 'replacement_reason_codes', 'work_reason_codes'].includes(field)
  )
    return planningReasonLabel(value)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((item) => reviewValue(item, explainReasons, field))
  if (typeof value === 'object' && value)
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !['preview_token', 'user_id', '__proto__', 'constructor', 'prototype'].includes(key),
        )
        .map(([key, item]) => [key, reviewValue(item, explainReasons, key)]),
    )
  return null
}

export function wallTimeLabel(value: string) {
  return /^\d{2}:\d{2}:00$/.test(value) ? value.slice(0, 5) : value
}
