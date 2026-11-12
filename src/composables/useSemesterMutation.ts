import { ref, shallowRef, onScopeDispose, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

export function uncertainMutation(error: unknown) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500
}
export function useSemesterMutation(confirmLeave?: () => boolean | Promise<boolean>) {
  const auth = useAuthStore()
  const busy = ref(false)
  const dirty = ref(false)
  const error = shallowRef<unknown>(null)
  const blocked = ref<'stale' | 'uncertain' | null>(null)
  const review = ref(false)
  let active = true
  function leave() {
    return (
      !auth.user ||
      (!busy.value &&
        (!(dirty.value || blocked.value === 'uncertain') ||
          (confirmLeave
            ? confirmLeave()
            : window.confirm(
                'Залишити сторінку? Незбережені зміни або стан перевірки буде втрачено.',
              ))))
    )
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault()
    event.returnValue = true
  }
  watch(
    () => dirty.value || busy.value || blocked.value === 'uncertain',
    (protect) => {
      if (protect) window.addEventListener('beforeunload', beforeUnload)
      else window.removeEventListener('beforeunload', beforeUnload)
    },
  )
  onBeforeRouteLeave(leave)
  onBeforeRouteUpdate(leave)
  onScopeDispose(() => {
    active = false
    window.removeEventListener('beforeunload', beforeUnload)
  })
  async function run<T>(action: () => Promise<T>) {
    if (busy.value || blocked.value || review.value) return
    busy.value = true
    error.value = null
    try {
      const result = await action()
      if (active) {
        dirty.value = false
        return result
      }
    } catch (reason) {
      if (!active) return
      error.value = reason
      if (reason instanceof ApiError && reason.status === 409) blocked.value = 'stale'
      if (uncertainMutation(reason)) blocked.value = 'uncertain'
    } finally {
      busy.value = false
    }
  }
  return { busy, dirty, error, blocked, review, run }
}
