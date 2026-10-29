import { ApiError, errorMessage } from '@/api/client'
import { dateTime } from './dates'
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
  list_study_sessions: 'Перегляд навчальних сесій',
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
export function reviewSupported(action: AiAction) {
  if (!supportsAction(action)) return false
  const preview = action.preview
  if (
    preview.action !== action.type ||
    preview.confirmation_required !== true ||
    !Array.isArray(preview.effects) ||
    !preview.effects.length ||
    !preview.effects.every((effect) => typeof effect === 'string')
  )
    return false
  if (
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
  mode: 'Режим',
}
export const fieldLabel = (key: string) => labels[key] ?? key.replaceAll('_', ' ')
const values: Record<string, string> = {
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
