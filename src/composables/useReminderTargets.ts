import { ref, computed, watch } from 'vue'
import { useResource } from './useResource'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { positiveContext } from '@/utils/reminders'
import type { ReminderTarget } from '@/types/reminders'
export function useReminderTargets(query: Record<string, unknown>) {
  const task = positiveContext(query.task_id),
    child = positiveContext(query.subtask_id)
  const kind = ref<'general' | 'task' | 'subtask'>(
    !query.study_session_id && child && task
      ? 'subtask'
      : !query.study_session_id && task && !child
        ? 'task'
        : 'general',
  )
  const taskId = ref<number | null>(
      kind.value === 'task' || kind.value === 'subtask' ? task : null,
    ),
    childId = ref<number | null>(kind.value === 'subtask' ? child : null),
    page = ref(1),
    taskStatus = ref<'pending' | 'missed'>('pending')
  const tasks = useResource(
    async (signal) =>
      kind.value === 'task' || kind.value === 'subtask'
        ? tasksApi.list({ status: taskStatus.value, page: page.value, per_page: 20 }, signal)
        : null,
    [kind, page, taskStatus],
  )
  const selectedTask = useResource(
    async (signal) =>
      taskId.value && (kind.value === 'task' || kind.value === 'subtask')
        ? tasksApi.get(taskId.value, signal)
        : null,
    [kind, taskId],
  )
  const children = useResource(
    async (signal) =>
      kind.value === 'subtask' && taskId.value
        ? subtasksApi.list(taskId.value, signal).then(async (result) => {
            const parent = await tasksApi.get(taskId.value!, signal)
            return {
              ...result,
              data:
                parent.data.status === 'completed'
                  ? []
                  : result.data.filter((child) => child.status === 'pending'),
            }
          })
        : null,
    [kind, taskId],
  )
  watch(
    taskId,
    () => {
      childId.value = null
    },
    { flush: 'sync' },
  )
  watch(
    kind,
    () => {
      taskId.value = null
      childId.value = null
    },
    { flush: 'sync' },
  )
  watch(
    taskStatus,
    () => {
      page.value = 1
      taskId.value = null
    },
    { flush: 'sync' },
  )
  const target = computed<ReminderTarget | null>(() =>
    kind.value === 'task' &&
    taskId.value !== null &&
    selectedTask.data.value?.data.id === taskId.value &&
    selectedTask.data.value.data.status !== 'completed'
      ? { kind: 'task', id: selectedTask.data.value.data.id }
      : kind.value === 'subtask' &&
          selectedTask.data.value?.data.status !== 'completed' &&
          selectedTask.data.value &&
          children.data.value?.data.some((c) => c.id === childId.value)
        ? { kind: 'subtask', id: childId.value! }
        : null,
  )
  return {
    taskStatus,
    relativeAvailable: computed(() =>
      target.value?.kind === 'task'
        ? !!selectedTask.data.value?.data.deadline_at
        : target.value?.kind === 'subtask'
          ? !!children.data.value?.data.find((c) => c.id === childId.value)?.deadline_at
          : false,
    ),
    kind,
    taskId,
    childId,
    page,
    tasks,
    selectedTask,
    children,
    target,
  }
}
