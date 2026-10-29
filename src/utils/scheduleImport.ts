import { toLocalInput } from './dates'
import { exactDateTime } from './planning'
import type { ImportStatus, ImportOperation } from '@/types/scheduleImport'
export const importStatuses: Record<ImportStatus, string> = {
  uploaded: 'Потребує виправлень',
  validated: 'Перевірено — готовий огляд',
  committed: 'Імпорт застосовано',
  failed: 'Обробка файлу не вдалася',
  cancelled: 'Скасований пакет',
}
export const rowStatuses = {
  valid: 'Дійсний рядок',
  invalid: 'Помилка перевірки',
  duplicate: 'Дублікат',
}
export const operationLabels: Record<ImportOperation, string> = {
  create: 'Створити заняття',
  update: 'Оновити заняття',
  restore: 'Відновити видалене заняття',
  preserve: 'Зберегти поточний стан',
  noop: 'Без змін',
}
export function validateScheduleFile(file: File | null, period: number | null): string {
  if (!period || !Number.isSafeInteger(period) || period < 1)
    return 'Оберіть власний навчальний період.'
  if (!file) return 'Оберіть XLSX-файл розкладу.'
  if (!/\.xlsx$/i.test(file.name)) return 'Підтримується лише розширення .xlsx.'
  if (file.size === 0) return 'Файл порожній.'
  if (file.size > 5120 * 1024) return 'Розмір файлу перевищує 5 MiB (5120 KiB).'
  return ''
}
export function importReturnId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function importInstantLabel(value: string | null, timezone: string) {
  if (value === null) return 'Не вказано'
  try {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value))
      return 'Некоректна UTC-мітка; перегляньте помилки рядка.'
    toLocalInput(value, timezone)
    return exactDateTime(value, timezone)
  } catch {
    return 'Некоректна UTC-мітка; перегляньте помилки рядка.'
  }
}
