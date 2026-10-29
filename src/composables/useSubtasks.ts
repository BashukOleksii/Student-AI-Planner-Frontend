import { ref, onScopeDispose } from 'vue'
import { subtasksApi } from '@/api/subtasks'
import { useResource } from './useResource'
import type { Subtask, SubtaskInput } from '@/types/api'
export function useSubtasks(taskId: number) {
  const children = useResource((signal) => subtasksApi.list(taskId, signal))
  const progress = useResource((signal) => subtasksApi.progress(taskId, signal))
  const editor = ref<number | null | undefined>(undefined) // closed / new / existing
  const detail = useResource(
    async (signal) =>
      typeof editor.value === 'number'
        ? (await subtasksApi.get(taskId, editor.value, signal)).data
        : null,
    [editor],
  )
  const deleting = ref<Subtask | null>(null)
  const busy = ref('')
  const error = ref<unknown>(null)
  const success = ref('')
  const dirty = ref(false)
  const controller = new AbortController()
  onScopeDispose(() => controller.abort())
  async function refresh() {
    await Promise.all([children.reload(), progress.reload()])
  }
  function open(id: number | null) {
    if (busy.value) return
    error.value = null
    dirty.value = false
    editor.value = id
  }
  function close() {
    if (!busy.value && (!dirty.value || window.confirm('Закрити підзавдання без збереження?'))) {
      editor.value = undefined
      dirty.value = false
    }
  }
  async function perform(key: string, operation: () => Promise<unknown>, done?: () => void) {
    if (busy.value) return
    busy.value = key
    error.value = null
    success.value = ''
    try {
      await operation()
      if (controller.signal.aborted) return
      done?.()
      success.value = 'Підзавдання оновлено.'
      await refresh()
    } catch (e) {
      if (!controller.signal.aborted) error.value = e
    } finally {
      if (!controller.signal.aborted) busy.value = ''
    }
  }
  async function save(input: SubtaskInput) {
    const id = editor.value
    if (id === undefined) return
    const changes = detail.data.value
      ? (Object.fromEntries(
          Object.entries(input).filter(
            ([key, value]) => value !== detail.data.value?.[key as keyof SubtaskInput],
          ),
        ) as Partial<SubtaskInput>)
      : input
    await perform(
      'save',
      () =>
        id === null
          ? subtasksApi.create(taskId, input, controller.signal)
          : subtasksApi.update(taskId, id, changes, controller.signal),
      () => {
        dirty.value = false
        editor.value = undefined
      },
    )
  }
  function toggle(child: Subtask) {
    return perform(`toggle:${child.id}`, () =>
      child.status === 'completed'
        ? subtasksApi.reopen(taskId, child.id, controller.signal)
        : subtasksApi.complete(taskId, child.id, controller.signal),
    )
  }
  function confirmDelete(child: Subtask) {
    if (busy.value) return
    deleting.value = child
    error.value = null
  }
  function remove() {
    const id = deleting.value?.id
    if (!id) return
    return perform(
      'delete',
      () => subtasksApi.remove(taskId, id, controller.signal),
      () => {
        deleting.value = null
      },
    )
  }
  function move(index: number, direction: -1 | 1) {
    if (busy.value || children.loading.value || !children.data.value) return
    const ids = children.data.value.data.map((child) => child.id)
    const other = index + direction
    const currentId = ids[index]
    const otherId = ids[other]
    if (currentId === undefined || otherId === undefined) return
    ids[index] = otherId
    ids[other] = currentId
    return perform(`move:${currentId}`, () => subtasksApi.reorder(taskId, ids, controller.signal))
  }
  return {
    children,
    progress,
    editor,
    detail,
    deleting,
    busy,
    error,
    success,
    dirty,
    refresh,
    open,
    close,
    save,
    toggle,
    confirmDelete,
    remove,
    move,
  }
}
