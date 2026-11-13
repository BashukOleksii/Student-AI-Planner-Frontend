import { computed, onScopeDispose, ref } from 'vue'
import { useResource } from './useResource'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { ApiError } from '@/api/client'
import { workCompletionApi } from '@/api/workCompletion'

export function useWorkCompletion(taskId: number, subtaskId: number | null, done: () => void) {
  const busy = ref(false),
    blocked = ref(false),
    error = ref<unknown>(null),
    localError = ref('')
  let active = true
  onScopeDispose(() => {
    active = false
  })
  const work = useResource(async (signal) => {
    const [task, child, review] = await Promise.all([
      tasksApi.get(taskId, signal),
      subtaskId === null ? null : subtasksApi.get(taskId, subtaskId, signal),
      workCompletionApi.review(taskId, subtaskId, signal),
    ])
    return { task: task.data, child: child?.data ?? null, review }
  })
  const ready = computed(
    () =>
      !busy.value &&
      !blocked.value &&
      !work.loading.value &&
      !work.error.value &&
      !!work.data.value &&
      (subtaskId === null
        ? work.data.value.task.status !== 'completed'
        : work.data.value.child?.status === 'pending'),
  )
  async function submit() {
    if (!ready.value || !work.data.value) return
    const initial = work.data.value
    busy.value = true
    error.value = null
    localError.value = ''
    try {
      const currentTask = (await tasksApi.get(taskId)).data
      if (JSON.stringify(currentTask) !== JSON.stringify(initial.task))
        throw new Error('Завдання змінилося. Отримайте новий огляд завершення.')
      if (subtaskId !== null) {
        const currentChild = (await subtasksApi.get(taskId, subtaskId)).data
        if (JSON.stringify(currentChild) !== JSON.stringify(initial.child))
          throw new Error('Підзавдання змінилося. Отримайте новий огляд завершення.')
      }
      // The adjacent confirmation supplies consent for this exact server-reviewed set.
      const response = await workCompletionApi.complete(
        taskId,
        subtaskId,
        initial.review.completion_token,
      )
      if (response.data.status !== 'completed')
        throw new Error('Сервер не підтвердив завершення. Отримайте новий огляд.')
      if (active) done()
    } catch (reason) {
      if (!active) return
      if (reason instanceof Error && !(reason instanceof ApiError))
        localError.value = reason.message
      else error.value = reason
      blocked.value = !(reason instanceof ApiError && reason.status === 422)
    } finally {
      busy.value = false
    }
  }
  async function refresh() {
    if (busy.value) return
    blocked.value = false
    error.value = null
    localError.value = ''
    await work.reload()
  }
  return { work, ready, busy, blocked, error, localError, submit, refresh }
}
