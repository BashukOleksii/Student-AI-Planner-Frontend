import { Temporal } from '@js-temporal/polyfill'
import type { Reminder } from '@/types/api'
import type { ReminderTarget, ReminderTargetFields } from '@/types/reminders'
export const reminderStatuses: Record<Reminder['status'], string> = {
  scheduled: 'Заплановане',
  sent: 'Надіслане',
  cancelled: 'Скасоване',
}
export const anchorLabels: Record<Exclude<Reminder['anchor'], null>, string> = {
  task_deadline: 'Дедлайн завдання',
  subtask_deadline: 'Власний дедлайн підзавдання',
  session_start: 'Початок сесії',
}
export function targetFields(target: ReminderTarget | null): ReminderTargetFields {
  return target
    ? {
        [target.kind === 'task'
          ? 'task_id'
          : target.kind === 'subtask'
            ? 'subtask_id'
            : 'study_session_id']: target.id,
      }
    : {}
}
export function targetAnchor(target: ReminderTarget): Exclude<Reminder['anchor'], null> {
  return target.kind === 'task'
    ? 'task_deadline'
    : target.kind === 'subtask'
      ? 'subtask_deadline'
      : 'session_start'
}
export function signedOffset(value: string): number {
  if (!/^-?(0|[1-9]\d*)$/.test(value) || Number(value) < -32768 || Number(value) > 32767)
    throw new Error('Вкажіть ціле зміщення від -32768 до 32767 хвилин.')
  return Number(value)
}
export function meaningfulReminder(value: string) {
  return /[^\p{Z}\p{C}\s]/u.test(value)
}
export function validReminderRange(from: string | null, to: string | null) {
  if (!from && !to) return
  if (!from || !to) throw new Error('Вкажіть обидві межі часу або очистіть обидві.')
  const seconds =
    Temporal.Instant.from(to).epochMilliseconds - Temporal.Instant.from(from).epochMilliseconds
  if (seconds < 0 || seconds > 366 * 86400 * 1000)
    throw new Error('Часовий діапазон має бути впорядкованим і не перевищувати 366 днів.')
}
export function positiveContext(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}
