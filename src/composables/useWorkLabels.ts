import { computed, inject, onScopeDispose, provide, reactive, watch, type InjectionKey } from 'vue'
import { tasksApi } from '@/api/endpoints'
import { academicApi } from '@/api/academic'
import { subtasksApi } from '@/api/subtasks'

type Labels = {
  tasks: Map<number, string>
  subtasks: Map<number, string>
  subjects: Map<number, string>
}
const key: InjectionKey<Labels> = Symbol('work-labels')
// Resolve only work referenced by the current screen. Never guess a missing/deleted name.
export function useWorkLabels(source: () => unknown) {
  const labels = reactive<Labels>({ tasks: new Map(), subtasks: new Map(), subjects: new Map() })
  const requested = new Set<string>()
  const controller = new AbortController()
  provide(key, labels)
  onScopeDispose(() => controller.abort())
  watch(
    source,
    (value) => {
      const visit = (item: unknown) => {
        if (!item || typeof item !== 'object') return
        if (Array.isArray(item)) {
          item.forEach(visit)
          return
        }
        const row = item as Record<string, unknown>
        if (typeof row.task_id === 'number' && row.task_id > 0) {
          const id = row.task_id
          if (!requested.has(`task:${id}`)) {
            requested.add(`task:${id}`)
            void tasksApi
              .get(id, controller.signal)
              .then(({ data }) => {
                if (!controller.signal.aborted) labels.tasks.set(id, data.title)
              })
              .catch(() => {
                /* History remains readable when a target is unavailable. */
              })
          }
          if (typeof row.subtask_id === 'number' && !requested.has(`children:${id}`)) {
            requested.add(`children:${id}`)
            void subtasksApi
              .list(id, controller.signal)
              .then(({ data }) => {
                if (!controller.signal.aborted)
                  data.forEach((child) => labels.subtasks.set(child.id, child.title))
              })
              .catch(() => {})
          }
        }
        if (
          typeof row.subject_id === 'number' &&
          row.subject_id > 0 &&
          !requested.has(`subject:${row.subject_id}`)
        ) {
          const id = row.subject_id
          requested.add(`subject:${id}`)
          void academicApi.subjects
            .get(id, controller.signal)
            .then(({ data }) => {
              if (!controller.signal.aborted) labels.subjects.set(id, data.name)
            })
            .catch(() => {})
        }
        Object.values(row).forEach(visit)
      }
      visit(value)
    },
    { immediate: true, deep: true },
  )
  return labels
}
export function useWorkName(
  taskId: () => number | null | undefined,
  subtaskId: () => number | null | undefined = () => null,
  ownLabels?: Labels,
) {
  const labels = ownLabels ?? inject(key, null)
  return computed(() => {
    const child = subtaskId(),
      task = taskId()
    return (
      (child && labels?.subtasks.get(child)) ||
      (task && labels?.tasks.get(task)) ||
      (child ? 'Навчальний крок' : 'Самостійна робота')
    )
  })
}

export function useSubjectName(id: () => number | null) {
  const labels = inject(key, null)
  return computed(() =>
    id() === null ? 'Без предмета' : (labels?.subjects.get(id()!) ?? 'Предмет недоступний'),
  )
}
