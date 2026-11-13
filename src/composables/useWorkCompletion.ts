import { computed, ref, watch } from 'vue'
import { useResource } from './useResource'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { studySessionsApi } from '@/api/studySessions'
import { ApiError } from '@/api/client'
import { WorkCompletionDeclined, workCompletionApi } from '@/api/workCompletion'
import { today, addDays } from '@/utils/dates'
import { nullableMinutes, validateRange } from '@/utils/planning'
import type { Task, Subtask, StudySession } from '@/types/api'

export function useWorkCompletion(
  taskId: number,
  subtaskId: number | null,
  timezone: string,
  done: (type: 'task' | 'subtask') => void,
) {
  const end = today(timezone)
  const range = ref({ start_date: addDays(end, -30), end_date: end })
  const selectedRange = ref({ ...range.value })
  const sessionId = ref<number | null>(null),
    actual = ref(''),
    busy = ref(false),
    blocked = ref(false),
    error = ref<unknown>(null),
    localError = ref('')
  const work = useResource(async (signal) => {
    const [task, children, review] = await Promise.all([
      tasksApi.get(taskId, signal),
      subtasksApi.list(taskId, signal),
      workCompletionApi.review(taskId, subtaskId, signal),
    ])
    return { task: task.data, children: children.data, review }
  })
  const sessions = useResource(
    (signal) => studySessionsApi.list(selectedRange.value, signal),
    [selectedRange],
  )
  const candidates = computed(() =>
    (sessions.data.value?.data ?? []).filter(
      (session) =>
        session.task_id === taskId &&
        (subtaskId === null || session.subtask_id === subtaskId) &&
        session.status === 'planned' &&
        Date.parse(session.starts_at) <= Date.now() &&
        (session.subtask_id === null
          ? work.data.value?.task.status !== 'completed'
          : work.data.value?.children.some(
              (child) => child.id === session.subtask_id && child.status === 'pending',
            )),
    ),
  )
  const selected = computed(() =>
    candidates.value.find((session) => session.id === sessionId.value),
  )
  const sessionReview = useResource(
    async (signal) =>
      sessionId.value === null ? null : studySessionsApi.completionReview(sessionId.value, signal),
    [sessionId],
  )
  watch(sessionId, () => {
    actual.value = ''
    localError.value = ''
  })
  const linkedType = computed(() =>
    selected.value
      ? selected.value.subtask_id === null
        ? 'task'
        : 'subtask'
      : subtaskId === null
        ? 'task'
        : 'subtask',
  )
  const ready = computed(
    () =>
      !busy.value &&
      !blocked.value &&
      !!work.data.value &&
      (subtaskId === null
        ? work.data.value.task.status !== 'completed'
        : work.data.value.children.some(
            (child) => child.id === subtaskId && child.status !== 'completed',
          )) &&
      !work.error.value &&
      (sessionId.value === null ||
        (!!selected.value &&
          !!sessionReview.data.value?.can_complete_work &&
          !!sessionReview.data.value.completion_review &&
          !sessionReview.loading.value &&
          !sessionReview.error.value)),
  )
  function search() {
    try {
      validateRange(range.value)
      localError.value = ''
      sessionId.value = null
      selectedRange.value = { ...range.value }
    } catch (reason) {
      localError.value = reason instanceof Error ? reason.message : 'Перевірте період.'
    }
  }
  function workSnapshot(value: Task | Subtask) {
    return JSON.stringify(value)
  }
  function sessionSnapshot(value: StudySession) {
    return JSON.stringify([
      value.id,
      value.task_id,
      value.subtask_id,
      value.starts_at,
      value.ends_at,
      value.status,
      value.actual_minutes,
      value.completed_at,
    ])
  }
  async function submit() {
    if (!ready.value || !work.data.value) return
    error.value = null
    localError.value = ''
    let minutes: number | null = null
    if (sessionId.value !== null) {
      try {
        minutes = nullableMinutes(actual.value)
        if (minutes === null) throw new Error('Вкажіть фактичні хвилини навчання.')
      } catch (reason) {
        localError.value = reason instanceof Error ? reason.message : 'Перевірте хвилини.'
        return
      }
    }
    busy.value = true
    try {
      const initial = work.data.value
      const currentTask = (await tasksApi.get(taskId)).data
      if (workSnapshot(currentTask) !== workSnapshot(initial.task))
        throw new Error('Завдання змінилося. Отримайте новий огляд завершення.')
      const childId = selected.value?.subtask_id ?? subtaskId
      if (childId !== null) {
        const initialChild = initial.children.find((child) => child.id === childId)
        const currentChild = (await subtasksApi.get(taskId, childId)).data
        if (!initialChild || workSnapshot(currentChild) !== workSnapshot(initialChild))
          throw new Error('Підзавдання змінилося. Отримайте новий огляд завершення.')
      }
      if (selected.value) {
        const current = (await studySessionsApi.get(selected.value.id)).data
        if (sessionSnapshot(current) !== sessionSnapshot(selected.value))
          throw new Error('Сесія змінилася. Отримайте новий огляд завершення.')
      }
      const review = selected.value ? sessionReview.data.value?.completion_review : initial.review
      if (!review) throw new Error('Не вдалося перевірити завершення пов’язаної роботи.')
      if (review.future_sessions_count > 0 && !window.confirm(review.message))
        throw new WorkCompletionDeclined()
      const response = selected.value
        ? await studySessionsApi.complete(selected.value.id, minutes!, {
            complete_work: true,
            completion_token: review.completion_token,
          })
        : await workCompletionApi.complete(taskId, subtaskId, review.completion_token)
      if (response.data.status !== 'completed')
        throw new Error('Сервер не підтвердив завершення. Отримайте новий огляд.')
      done(linkedType.value)
    } catch (reason) {
      if (!(reason instanceof WorkCompletionDeclined)) {
        if (reason instanceof Error && !(reason instanceof ApiError))
          localError.value = reason.message
        else error.value = reason
        blocked.value = !(reason instanceof ApiError && reason.status === 422)
      }
    } finally {
      busy.value = false
    }
  }
  async function refresh() {
    sessionId.value = null
    actual.value = ''
    blocked.value = false
    error.value = null
    localError.value = ''
    await Promise.all([work.reload(), sessions.reload()])
  }
  return {
    range,
    search,
    work,
    sessions,
    candidates,
    sessionId,
    selected,
    sessionReview,
    actual,
    ready,
    busy,
    blocked,
    error,
    localError,
    linkedType,
    submit,
    refresh,
  }
}
