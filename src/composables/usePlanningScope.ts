import { ref, watch, onScopeDispose, type WatchSource } from 'vue'
import type { Task } from '@/types/api'
import { tasksApi } from '@/api/endpoints'
import { planningApi, type WorkOptions } from '@/api/planning'
import { useResource } from './useResource'
import { today, addDays } from '@/utils/dates'
import { validateRange } from '@/utils/planning'
export function usePlanningScope(
  timezone: string,
  taskQuery?: WatchSource<unknown>,
  periodQuery?: WatchSource<{ start_date: unknown; end_date: unknown }>,
  mode: 'planning' | 'replanning' = 'planning',
  periodOnly = false,
) {
  const date = today(timezone)
  const range = ref({ start_date: date, end_date: addDays(date, 6) })
  if (periodQuery)
    watch(
      periodQuery,
      (value) => {
        if (typeof value.start_date !== 'string' || typeof value.end_date !== 'string') return
        const candidate = { start_date: value.start_date, end_date: value.end_date }
        try {
          validateRange(candidate)
          range.value = candidate
        } catch {
          // Keep the current/default range when the link does not contain a valid period.
        }
      },
      { immediate: true },
    )
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
  const search = ref(''),
    childSearch = ref(''),
    childPage = ref(1)
  const taskSearch = ref(''),
    stepSearch = ref('')
  let taskTimer: ReturnType<typeof setTimeout> | undefined
  let stepTimer: ReturnType<typeof setTimeout> | undefined
  watch(search, (value) => {
    clearTimeout(taskTimer)
    taskTimer = setTimeout(() => {
      page.value = 1
      taskSearch.value = value.trim()
    }, 250)
  })
  watch(childSearch, (value) => {
    clearTimeout(stepTimer)
    stepTimer = setTimeout(() => {
      childPage.value = 1
      stepSearch.value = value.trim()
    }, 250)
  })
  onScopeDispose(() => {
    clearTimeout(taskTimer)
    clearTimeout(stepTimer)
  })
  const tasks = useResource<WorkOptions>(
    async (signal) =>
      periodOnly
        ? { data: [], meta: { current_page: 1, last_page: 1, total: 0 } }
        : planningApi.workOptions({ page: page.value, search: taskSearch.value, mode }, signal),
    [page, taskSearch],
  )
  const children = useResource<WorkOptions>(
    async (signal) =>
      taskId.value === null
        ? { data: [], meta: { current_page: 1, last_page: 1, total: 0 } }
        : planningApi.workOptions(
            { task_id: taskId.value, search: stepSearch.value, page: childPage.value, mode },
            signal,
          ),
    [taskId, stepSearch, childPage],
  )
  const childLabel = ref('')
  watch(subtaskId, (id) => {
    childLabel.value = children.data.value?.data.find((row) => row.id === id)?.title ?? ''
  })
  const selectedTask = useResource<Task | null>(
    async (signal) =>
      taskId.value === null ? null : (await tasksApi.get(taskId.value, signal)).data,
    [taskId],
  )
  watch(
    taskId,
    () => {
      subtaskId.value = null
      childSearch.value = ''
      stepSearch.value = ''
      childPage.value = 1
    },
    { flush: 'sync' },
  )
  return {
    childLabel,
    search,
    childSearch,
    childPage,
    range,
    taskId,
    subtaskId,
    page,
    tasks,
    children,
    selectedTask,
    scopeError,
  }
}
