import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import type { Task, TaskInput, SubtaskInput } from '@/types/api'
export interface DraftSubtask {
  key: string
  input: SubtaskInput
  id?: number
  uncertain?: boolean
  beforeIds?: number[]
}
// A user-scoped, in-memory handoff from /tasks/new to the created task editor.
export const useTaskCreationDraft = defineStore('task-creation-draft', () => {
  const parent = ref<Task | null>(null)
  const input = ref<TaskInput | null>(null)
  const items = ref<DraftSubtask[]>([])
  const parentUnknown = ref(false)
  const beforeIds = ref<number[]>([])
  function clear() {
    parent.value = null
    input.value = null
    items.value = []
    parentUnknown.value = false
    beforeIds.value = []
  }
  const auth = useAuthStore()
  watch(() => auth.user?.id, clear)
  return { parent, input, items, parentUnknown, beforeIds, clear }
})
