import { ref, watch, type WatchSource } from 'vue'
import type { Task } from '@/types/api'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { useResource } from './useResource'
import { today, addDays } from '@/utils/dates'
export function usePlanningScope(timezone: string, taskQuery?: WatchSource<unknown>) {
  const date = today(timezone)
  const range = ref({ start_date: date, end_date: addDays(date, 6) })
  const taskId = ref<number | null>(null),
    subtaskId = ref<number | null>(null),
    page = ref(1)
  const scopeError = ref('')
  if (taskQuery)
    watch(
      taskQuery,
      (value) => {
        scopeError.value = ''
        if (value === undefined) {
          taskId.value = null
          return
        }
        if (
          typeof value !== 'string' ||
          !/^[1-9]\d*$/.test(value) ||
          !Number.isSafeInteger(Number(value))
        ) {
          taskId.value = null
          scopeError.value =
            'Некоректний ідентифікатор завдання в посиланні. Виберіть завдання або явно виберіть усю доступну роботу.'
          return
        }
        taskId.value = Number(value)
      },
      { immediate: true },
    )
  const tasks = useResource(
    (signal) => tasksApi.list({ page: page.value, per_page: 20 }, signal),
    [page],
  )
  const children = useResource(
    async (signal) =>
      taskId.value === null ? { data: [] } : subtasksApi.list(taskId.value, signal),
    [taskId],
  )
  const selectedTask = useResource<Task | null>(
    async (signal) =>
      taskId.value === null ? null : (await tasksApi.get(taskId.value, signal)).data,
    [taskId],
  )
  watch(
    taskId,
    () => {
      subtaskId.value = null
    },
    { flush: 'sync' },
  )
  return { range, taskId, subtaskId, page, tasks, children, selectedTask, scopeError }
}
