import { ApiError, errorMessage } from '@/api/client'
import { dateTime } from './dates'
import { isLessonAction, lessonPreview } from './aiLesson'
import { isAvailabilityAction, availabilityPreview } from './aiAvailability'
import {
  actionTypes,
  type AiAction,
  type ConsentField,
  type PublicObject,
  type PublicValue,
} from '@/types/ai'

export const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
export const isPublicObject = (v: PublicValue | undefined): v is PublicObject =>
  !!v && typeof v === 'object' && !Array.isArray(v)
export const positiveId = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0
export { validMessage } from './aiInput'
export const actionLabels: Record<string, string> = {
  propose_availability_create: 'Створити інтервал доступності',
  propose_availability_update: 'Змінити інтервал доступності',
  propose_availability_delete: 'Видалити інтервал доступності',
  propose_lesson_create: 'Створити заняття',
  propose_lesson_update: 'Змінити заняття',
  propose_lesson_cancel: 'Скасувати заняття',
  propose_lesson_replacement: 'Замінити заняття',
  propose_task_create: 'Створити завдання',
  propose_task_update: 'Змінити завдання',
  propose_task_complete: 'Завершити завдання',
  propose_task_reopen: 'Відновити завдання',
  propose_subtask_create: 'Створити підзавдання',
  propose_subtask_update: 'Змінити підзавдання',
  propose_subtask_complete: 'Завершити підзавдання',
  propose_subtask_reopen: 'Відновити підзавдання',
  propose_reminder_create: 'Створити нагадування',
  propose_reminder_update: 'Змінити нагадування',
  propose_reminder_cancel: 'Скасувати нагадування',
  propose_study_plan_create: 'Створити навчальний план',
  propose_adaptive_replanning: 'Адаптивне перепланування',
  propose_session_reschedule: 'Перенести навчальну сесію',
  propose_session_mark_missed: 'Позначити навчальну сесію пропущеною',
  propose_session_complete: 'Позначити навчальну сесію виконаною',
}
export const statusLabels = {
  pending: 'Потребує підтвердження',
  executed: 'Виконано',
  rejected: 'Відхилено',
  expired: 'Термін минув',
}
export const toolLabels: Record<string, string> = {
  ...actionLabels,
  get_schedule_for_date: 'Перевірка розкладу',
  list_tasks: 'Перегляд завдань',
  list_study_availability_windows: 'Перегляд навчальної доступності',
  list_study_sessions: 'Перегляд навчальних сесій',
  get_study_recovery_overview: 'Аналіз невиконаної навчальної роботи',
  find_free_study_slots: 'Пошук вільного часу',
  get_progress_statistics: 'Статистика прогресу',
  get_daily_progress_trends: 'Щоденна динаміка',
  compare_progress_periods: 'Порівняння періодів',
  list_subtasks_for_task: 'Перегляд підзавдань',
  list_reminders: 'Перегляд нагадувань',
}
const errors: Record<string, string> = {
  conversation_busy: 'Розмова вже обробляє запит. Зачекайте, оновіть історію та повторіть свідомо.',
  turn_expired:
    'Обробку перервано через завершення строку запиту. Повторіть той самий запит із збереженим ключем.',
  idempotency_conflict:
    'Цей ключ уже пов’язаний з іншим текстом. Перевірте історію; для зміненого повідомлення потрібен новий запит.',
  action_stale: 'Дані змінилися. Цю пропозицію більше не підтверджуйте; попросіть нову.',
  action_conflict: 'Запропоноване перенесення більше не є здійсненним. Попросіть нову пропозицію.',
  action_executed: 'Дію вже виконано. Відхилення не скасовує виконані зміни.',
  action_expired: 'Термін пропозиції минув. Потрібна нова пропозиція.',
  action_token_invalid: 'Захищений огляд більше не дійсний. Попросіть нову пропозицію.',
  action_validation_failed:
    'Сервер більше не дозволяє ці зміни. Перегляньте дані й попросіть нову пропозицію.',
  multiple_actions: 'Запит містить кілька змін. Попросіть одну дію за раз.',
  execution_limit_reached: 'Перевищено ліміт обробки. Звузьте запит або почніть іншу розмову.',
  provider_error:
    'AI-провайдер не завершив запит. Повторення можливе лише за вашим рішенням і може мати вартість.',
  invalid_provider_response:
    'Сервер відхилив некоректну відповідь AI. Перевірте історію перед повторенням.',
  ai_unavailable: 'AI зараз недоступний. Перевірте доступність сервісу пізніше.',
  persistence_error:
    'Не вдалося підтвердити збереження результату. Перевірте історію або поточний стан дії.',
}
export function aiErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? (errors[error.code ?? ''] ?? errorMessage(error))
    : errorMessage(error)
}
export function supportsAction(action: AiAction) {
  return actionTypes.some((type) => type === action.type)
}
export function consentFields(action: AiAction): ConsentField[] {
  const supported: ConsentField[] =
    action.type === 'propose_study_plan_create'
      ? ['accept_partial']
      : action.type === 'propose_adaptive_replanning'
        ? ['accept_partial', 'accept_unplaced_cancellation']
        : []
  const required = action.preview.required_consent
  return supported.filter((field) => Array.isArray(required) && required.includes(field))
}
export interface SessionLifecycleReview {
  study_session_id: number
  task_id: number
  subtask_id: number | null
  current_status: 'planned'
  starts_at: string
  ends_at: string
  proposed_status: 'missed' | 'completed'
  actual_minutes?: number | null
  dependent_reminders: {
    scheduled_count: number
    scheduled_reminder_ids: number[]
    effect_on_confirmation: 'cancel_scheduled'
  }
  confirmation_required: true
}
export function sessionLifecycleReview(action: AiAction): SessionLifecycleReview | null {
  if (!['propose_session_mark_missed', 'propose_session_complete'].includes(action.type))
    return null
  const v = action.preview.review
  if (!isPublicObject(v)) return null
  const complete = action.type === 'propose_session_complete'
  const reminders = v.dependent_reminders
  if (
    !positiveId(v.study_session_id) ||
    !positiveId(v.task_id) ||
    !(v.subtask_id === null || positiveId(v.subtask_id)) ||
    v.current_status !== 'planned' ||
    typeof v.starts_at !== 'string' ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(v.starts_at) ||
    !Number.isFinite(Date.parse(v.starts_at)) ||
    typeof v.ends_at !== 'string' ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(v.ends_at) ||
    !Number.isFinite(Date.parse(v.ends_at)) ||
    v.proposed_status !== (complete ? 'completed' : 'missed') ||
    v.confirmation_required !== true ||
    !isPublicObject(reminders) ||
    !Number.isSafeInteger(reminders.scheduled_count) ||
    Number(reminders.scheduled_count) < 0 ||
    !Array.isArray(reminders.scheduled_reminder_ids) ||
    !reminders.scheduled_reminder_ids.every(positiveId) ||
    reminders.scheduled_reminder_ids.length !== reminders.scheduled_count ||
    reminders.effect_on_confirmation !== 'cancel_scheduled' ||
    (complete
      ? !(
          v.actual_minutes === undefined ||
          v.actual_minutes === null ||
          (Number.isSafeInteger(v.actual_minutes) &&
            Number(v.actual_minutes) >= 1 &&
            Number(v.actual_minutes) <= 65535)
        )
      : Object.hasOwn(v, 'actual_minutes'))
  )
    return null
  return v as unknown as SessionLifecycleReview
}
export function receiptLifecycleSessionId(
  receipt: PublicObject | null,
  action: AiAction,
): number | null {
  if (
    !receipt ||
    !sessionLifecycleReview(action) ||
    receipt.action_id !== action.id ||
    receipt.type !== action.type ||
    receipt.applied !== true ||
    !isPublicObject(receipt.session) ||
    !positiveId(receipt.session.id) ||
    receipt.session.status !==
      (action.type === 'propose_session_complete' ? 'completed' : 'missed') ||
    !isPublicObject(receipt.effects) ||
    receipt.effects.replacement_sessions_created !== false ||
    !Array.isArray(receipt.effects.cancelled_scheduled_reminder_ids) ||
    !receipt.effects.cancelled_scheduled_reminder_ids.every(positiveId)
  )
    return null
  return receipt.session.id
}

export function reviewSupported(action: AiAction) {
  if (!supportsAction(action)) return false
  const preview = action.preview
  if (isAvailabilityAction(action.type))
    return (
      action.confirmation_required === (action.status === 'pending') &&
      availabilityPreview(preview, action.type) !== null
    )
  if (isLessonAction(action.type))
    return (
      action.confirmation_required === (action.status === 'pending') &&
      lessonPreview(preview, action.type) !== null
    )
  if (
    preview.action !== action.type ||
    preview.confirmation_required !== true ||
    !Array.isArray(preview.effects) ||
    !preview.effects.length ||
    !preview.effects.every((effect) => typeof effect === 'string')
  )
    return false
  if (['propose_session_mark_missed', 'propose_session_complete'].includes(action.type)) {
    if (
      action.confirmation_required !== (action.status === 'pending') ||
      !Array.isArray(preview.required_consent) ||
      preview.required_consent.length !== 0 ||
      sessionLifecycleReview(action) === null
    )
      return false
  } else if (
    [
      'propose_study_plan_create',
      'propose_adaptive_replanning',
      'propose_session_reschedule',
    ].includes(action.type)
  ) {
    if (!isPublicObject(preview.review) || !Array.isArray(preview.required_consent)) return false
    const fields =
      action.type === 'propose_session_reschedule'
        ? ['original', 'replacement', 'summary', 'validation', 'feasibility_confirmed']
        : [
            'as_of_utc',
            'start_date',
            'end_date',
            'timezone',
            'work_results',
            'excluded_items',
            'warnings',
            'summary',
            ...(action.type === 'propose_study_plan_create'
              ? ['sessions']
              : ['session_results', 'released_session_ids']),
          ]
    if (!fields.every((field) => Object.hasOwn(preview.review as PublicObject, field))) return false
  } else {
    if (
      !(preview.before === null || isPublicObject(preview.before)) ||
      !isPublicObject(preview.changes)
    )
      return false
    if (action.type.startsWith('propose_subtask_') && !isPublicObject(preview.parent)) return false
    if (
      action.type.startsWith('propose_reminder_') &&
      !['absolute', 'relative'].includes(String(preview.mode))
    )
      return false
  }
  const required = action.preview.required_consent
  return (
    required === undefined ||
    (Array.isArray(required) &&
      required.every((field) => consentFields(action).includes(field as ConsentField)))
  )
}
const labels: Record<string, string> = {
  lesson: 'Збережене заняття',
  subject: 'Предмет',
  teacher: 'Викладач',
  academic_period: 'Навчальний період',
  academic_period_id: 'Навчальний період ID',
  room: 'Аудиторія',
  replaces_lesson_id: 'Заміна для заняття ID',
  replacement_id: 'Заняття-замінник ID',
  name: 'Назва',
  id: 'ID',
  title: 'Назва',
  description: 'Опис',
  status: 'Статус',
  priority: 'Пріоритет',
  task_id: 'Завдання ID',
  subtask_id: 'Підзавдання ID',
  subject_id: 'Предмет ID',
  study_session_id: 'Сесія ID',
  estimated_minutes: 'Орієнтовна тривалість, хв',
  deadline_at: 'Дедлайн',
  completed_at: 'Завершено',
  position: 'Позиція',
  starts_at: 'Початок',
  ends_at: 'Кінець',
  duration_seconds: 'Тривалість, с',
  message: 'Повідомлення',
  trigger_at: 'Час спрацювання (сервер)',
  anchor: 'Опорна подія',
  offset_minutes: 'Зміщення, хв',
  sent_at: 'Надіслано',
  start_date: 'Початкова дата',
  end_date: 'Кінцева дата',
  timezone: 'Часовий пояс',
  as_of_utc: 'Станом на',
  sessions: 'Запропоновані сесії',
  work_results: 'Результати розподілу роботи',
  excluded_items: 'Виключені елементи',
  warnings: 'Попередження',
  summary: 'Підсумок',
  session_results: 'Перевірені початкові сесії та заміни',
  released_session_ids: 'Сесії, що звільняються / скасовуються',
  original: 'Початковий стан',
  replacement: 'Запропонована заміна',
  original_sessions: 'Початкові сесії після виконання',
  replacement_sessions: 'Створені заміни',
  classification: 'Класифікація',
  reason_codes: 'Коди причин',
  replacement_reason_codes: 'Причини заміни',
  untransferred_seconds: 'Неперенесена тривалість, с',
  original_duration_seconds: 'Початкова тривалість, с',
  replacement_duration_seconds: 'Тривалість заміни, с',
  not_transferred_seconds: 'Неперенесена тривалість, с',
  unallocated_work_seconds: 'Нерозподілена робота, с',
  requested_seconds: 'Запитана тривалість, с',
  allocated_seconds: 'Розміщена тривалість, с',
  unscheduled_seconds: 'Нерозміщена тривалість, с',
  remaining_work_seconds: 'Залишок роботи, с',
  unallocated_before_replacements: 'Нерозподілено до замін, с',
  proposed_replacement_seconds: 'Запропонована тривалість замін, с',
  unallocated_after_replacements: 'Нерозподілено після замін, с',
  inspected_sessions: 'Перевірено сесій',
  valid_sessions: 'Сесії без змін',
  cannot_replan_sessions: 'Сесії, які неможливо перепланувати',
  affected_sessions: 'Сесії зі змінами',
  proposed_replacements: 'Запропоновано замін',
  original_affected_seconds: 'Початкова тривалість змінених сесій, с',
  replacement_seconds: 'Загальна тривалість замін, с',
  rescheduled_sessions: 'Перенесено сесій',
  cancelled_unplaced_sessions: 'Скасовано сесій без нового місця',
  created_replacements: 'Створено замін',
  no_changes_needed: 'Зміни не потрібні',
  work_type: 'Тип роботи',
  effective_deadline_utc: 'Ефективний дедлайн',
  effort: 'Обсяг роботи',
  estimated_seconds: 'Оцінка тривалості, с',
  completed_credit_seconds: 'Зараховано виконання, с',
  future_reserved_seconds: 'Зарезервовано на майбутнє, с',
  over_reserved_seconds: 'Надлишково зарезервовано, с',
  code: 'Код причини',
  seconds: 'Тривалість, с',
  fully_allocated: 'Роботу розподілено повністю',
  partial_replacements: 'Часткові заміни',
  unplaced_sessions: 'Сесії без нового місця',
  validation: 'Рівень перевірки',
  feasibility_confirmed: 'Здійсненність підтверджена',
  actual_minutes: 'Фактична тривалість, хв',
  action_id: 'ID дії',
  type: 'Тип',
  applied: 'Зміни застосовано',
  current_status: 'Поточний стан',
  proposed_status: 'Запропонований стан',
  dependent_reminders: 'Пов’язані заплановані нагадування',
  scheduled_count: 'Кількість запланованих нагадувань',
  scheduled_reminder_ids: 'Нагадування, які буде скасовано',
  effect_on_confirmation: 'Дія після підтвердження',
  cancelled_scheduled_reminder_ids: 'Скасовані заплановані нагадування',
  replacement_sessions_created: 'Автоматично створено замін',

  mode: 'Режим',
}
export const fieldLabel = (key: string) => labels[key] ?? key.replaceAll('_', ' ')
const values: Record<string, string> = {
  active: 'Активне',
  replaced: 'Замінене',
  lecture: 'Лекція',
  practical: 'Практичне',
  laboratory: 'Лабораторна',
  seminar: 'Семінар',
  consultation: 'Консультація',
  exam: 'Іспит',
  other: 'Заняття',
  pending: 'До виконання',
  completed: 'Виконано',
  planned: 'Заплановано',
  cancelled: 'Скасовано',
  rescheduled: 'Перенесено',
  missed: 'Пропущено',
  scheduled: 'Заплановано',
  sent: 'Надіслано',
  failed: 'Невдала спроба',
  absolute: 'Абсолютний час',
  relative: 'Відносно події',
  valid: 'Зберегти без змін',
  cannot_replan: 'Неможливо перепланувати',
  requires_replanning: 'Потребує перепланування',
  preliminary: 'Лише попередня перевірка',
  task: 'Завдання',
  subtask: 'Підзавдання',
}
export function displayValue(
  value: string | number | boolean | null,
  key: string,
  timezone: string,
) {
  if (value === null) return 'Не вказано / очистити'
  if (typeof value === 'boolean') return value ? 'Так' : 'Ні'
  if (
    typeof value === 'number' &&
    key === 'effective_deadline_utc' &&
    Number.isFinite(new Date(value * 1000).getTime())
  ) {
    const instant = new Date(value * 1000).toISOString()
    return `${dateTime(instant, timezone)} · ${timezone} · ${instant}`
  }
  if (typeof value === 'number' && key === 'priority')
    return { 1: 'Низький (1)', 2: 'Звичайний (2)', 3: 'Високий (3)' }[value] ?? String(value)
  if (typeof value === 'string') {
    if (/^\d{4}-\d\d-\d\dT/.test(value) && !Number.isNaN(Date.parse(value)))
      return `${dateTime(value, timezone)} · ${timezone} · ${value}`
    return values[value] ?? value
  }
  return String(value)
}
export function receiptTaskId(receipt: PublicObject | null): number | null {
  if (!receipt) return null
  if (isPublicObject(receipt.task) && positiveId(receipt.task.id)) return receipt.task.id
  if (isPublicObject(receipt.subtask) && positiveId(receipt.subtask.task_id))
    return receipt.subtask.task_id
  return null
}

export function receiptSessionIds(receipt: PublicObject | null): number[] {
  if (
    !receipt ||
    (typeof receipt.type === 'string' &&
      (isLessonAction(receipt.type) || isAvailabilityAction(receipt.type)))
  )
    return []
  const records = [
    receipt.original,
    receipt.replacement,
    ...(Array.isArray(receipt.sessions) ? receipt.sessions : []),
    ...(Array.isArray(receipt.replacement_sessions) ? receipt.replacement_sessions : []),
  ]
  return [
    ...new Set(
      records
        .filter(isPublicObject)
        .map((record) => record.id)
        .filter(positiveId),
    ),
  ]
}

export function receiptReminderId(receipt: PublicObject | null): number | null {
  return receipt && isPublicObject(receipt.reminder) && positiveId(receipt.reminder.id)
    ? receipt.reminder.id
    : null
}
