import { ref, computed, watch } from 'vue'
import { useResource } from './useResource'
import { tasksApi } from '@/api/endpoints'
import { subtasksApi } from '@/api/subtasks'
import { studySessionsApi } from '@/api/studySessions'
import { today, addDays } from '@/utils/dates'
import { positiveContext } from '@/utils/reminders'
import type { ReminderTarget } from '@/types/reminders'
export function useReminderTargets(timezone: string, query: Record<string, unknown>) {
  const task = positiveContext(query.task_id),
    child = positiveContext(query.subtask_id),
    session = positiveContext(query.study_session_id)
  const kind = ref<'general' | 'task' | 'subtask' | 'session'>(
    session && !task && !child
      ? 'session'
      : child && task && !session
        ? 'subtask'
        : task && !child && !session
          ? 'task'
          : 'general',
  )
  const taskId = ref<number | null>(
      kind.value === 'task' || kind.value === 'subtask' ? task : null,
    ),
    childId = ref<number | null>(kind.value === 'subtask' ? child : null),
    sessionId = ref<number | null>(kind.value === 'session' ? session : null),
    page = ref(1),
    taskStatus = ref<'pending' | 'missed'>('pending')
  const date = today(timezone),
    range = ref({ start_date: date, end_date: addDays(date, 6) }),
    selectedRange = ref({ ...range.value })
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
  const sessions = useResource(
    async (signal) =>
      kind.value === 'session'
        ? studySessionsApi.list(selectedRange.value, signal).then(async (result) => {
            const candidates = result.data.filter(
              (s) => s.status === 'planned' && Date.parse(s.starts_at) > Date.now(),
            )
            const eligible = await Promise.all(
              candidates.map(async (session) => {
                const task = await tasksApi.get(session.task_id, signal)
                if (task.data.status === 'completed') return null
                if (session.subtask_id) {
                  const child = await subtasksApi.get(session.task_id, session.subtask_id, signal)
                  if (child.data.status !== 'pending') return null
                }
                return session
              }),
            )
            return { ...result, data: eligible.filter((s) => s !== null) }
          })
        : null,
    [kind, selectedRange],
  )
  const selectedSession = useResource(
    async (signal) =>
      kind.value === 'session' && sessionId.value
        ? studySessionsApi.get(sessionId.value, signal)
        : null,
    [kind, sessionId],
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
      sessionId.value = null
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
        : kind.value === 'session' &&
            sessionId.value !== null &&
            selectedSession.data.value?.data.id === sessionId.value &&
            sessions.data.value?.data.some(
              (s) => s.id === sessionId.value && Date.parse(s.starts_at) > Date.now(),
            )
          ? { kind: 'session', id: selectedSession.data.value.data.id }
          : null,
  )
  return {
    taskStatus,
    relativeAvailable: computed(() =>
      target.value?.kind === 'task'
        ? !!selectedTask.data.value?.data.deadline_at
        : target.value?.kind === 'subtask'
          ? !!children.data.value?.data.find((c) => c.id === childId.value)?.deadline_at
          : target.value?.kind === 'session',
    ),
    kind,
    taskId,
    childId,
    sessionId,
    page,
    range,
    selectedRange,
    tasks,
    selectedTask,
    children,
    sessions,
    selectedSession,
    target,
  }
}
