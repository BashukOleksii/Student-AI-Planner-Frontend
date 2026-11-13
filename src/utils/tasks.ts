import type { TaskStatus } from '@/types/api'

export const taskStatusLabels: Record<TaskStatus, string> = {
  pending: 'Очікує виконання',
  missed: 'Не виконано',
  completed: 'Завершено',
}

export function taskMinutes(value: string): number | null {
  if (value === '') return null
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > 65535
  )
    throw new Error('Укажіть ціле число хвилин від 1 до 65535 без дробів і наукової нотації.')
  return Number(value)
}
