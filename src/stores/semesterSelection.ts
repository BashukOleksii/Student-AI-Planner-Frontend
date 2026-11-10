import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'
import { useAuthStore } from './auth'

export const useSemesterSelection = defineStore('semesterSelection', () => {
  const auth = useAuthStore()
  const selected = shallowRef<number | null>(null)
  watch(
    () => auth.user?.id,
    () => {
      selected.value = null
    },
    { flush: 'sync' },
  )
  return { selected }
})
