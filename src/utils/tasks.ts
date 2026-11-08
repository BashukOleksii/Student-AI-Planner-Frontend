import type { TaskStatus } from '@/types/api'

export const taskStatusLabels: Record<TaskStatus, string> = {
  pending: 'Очікує виконання',
  missed: 'Не виконано',
  completed: 'Виконано',
}
