import { ref, watch } from 'vue'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { useResource } from './useResource'
import { today, addDays } from '@/utils/dates'
export function usePlanningScope(timezone: string) {
  const date = today(timezone)
  const range = ref({ start_date: date, end_date: addDays(date, 6) })
  const taskId = ref<number | null>(null),
    subtaskId = ref<number | null>(null),
    page = ref(1)
  const tasks = useResource(
    (signal) => tasksApi.list({ page: page.value, per_page: 20 }, signal),
    [page],
  )
  const children = useResource(
    async (signal) =>
      taskId.value === null ? { data: [] } : subtasksApi.list(taskId.value, signal),
    [taskId],
  )
  watch(
    taskId,
    () => {
      subtaskId.value = null
    },
    { flush: 'sync' },
  )
  return { range, taskId, subtaskId, page, tasks, children }
}
