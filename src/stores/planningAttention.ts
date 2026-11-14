import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { getPlanningAttention, type PlanningAttentionStatus } from '@/api/planningAttention'
import { onPlanningMutation } from '@/utils/planningMutation'

export const usePlanningAttentionStore = defineStore('planningAttention', () => {
  const auth = useAuthStore()
  const status = ref<PlanningAttentionStatus | null>(null)
  const error = ref<unknown>(null)
  const locallyPending = ref(false)
  let active = false,
    owner: number | null = null,
    version = 0,
    quickReads = 0
  let interval: ReturnType<typeof setInterval> | undefined
  let scheduled: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let inFlight: Promise<void> | undefined

  const display = computed(() => {
    if (error.value || status.value?.check_failed) return 'error'
    if (locallyPending.value || !status.value || status.value.check_pending) return 'checking'
    if (status.value.attention_count > 0) return 'attention'
    if (status.value.has_informational_recommendations || status.value.review_refresh_required)
      return 'information'
    return 'clear'
  })
  function cancelReads() {
    version++
    controller?.abort()
    controller = undefined
    inFlight = undefined
    clearTimeout(scheduled)
    scheduled = undefined
  }
  function refresh(): Promise<void> {
    if (!active || owner === null) return Promise.resolve()
    if (inFlight) return inFlight
    clearTimeout(scheduled)
    scheduled = undefined
    const expectedOwner = owner,
      expectedVersion = ++version
    controller = new AbortController()
    const signal = controller.signal
    inFlight = getPlanningAttention(signal)
      .then((data) => {
        if (!active || owner !== expectedOwner || version !== expectedVersion) return
        status.value = data
        error.value = null
        locallyPending.value = false
        if (data.check_pending && quickReads > 0 && !document.hidden) {
          quickReads--
          scheduled = setTimeout(() => {
            void refresh()
          }, 2000)
        }
      })
      .catch((cause) => {
        if (!signal.aborted && active && owner === expectedOwner && version === expectedVersion) {
          error.value = cause
          status.value = null
          locallyPending.value = false
        }
      })
      .finally(() => {
        if (version === expectedVersion) inFlight = undefined
      })
    return inFlight
  }
  function refreshCurrent() {
    cancelReads()
    quickReads = 3
    return refresh()
  }
  function resetOwner() {
    cancelReads()
    clearInterval(interval)
    interval = undefined
    status.value = null
    error.value = null
    locallyPending.value = false
    owner = auth.user?.id ?? null
    quickReads = 3
    if (active && owner !== null) {
      void refresh()
      interval = setInterval(() => {
        if (!document.hidden) void refresh()
      }, 60000)
    }
  }
  function visibility() {
    if (!document.hidden && active && owner !== null) {
      quickReads = 3
      void refresh()
    }
  }
  function start() {
    if (active) return
    active = true
    document.addEventListener('visibilitychange', visibility)
    resetOwner()
  }
  function stop() {
    active = false
    document.removeEventListener('visibilitychange', visibility)
    cancelReads()
    clearInterval(interval)
    interval = undefined
    owner = null
    status.value = null
    error.value = null
    locallyPending.value = false
  }
  const unsubscribe = onPlanningMutation(() => {
    if (!active || owner === null) return
    cancelReads()
    status.value = null // an old review is no longer asserted current after a mutation
    error.value = null
    locallyPending.value = true
    quickReads = 3
    if (!document.hidden)
      scheduled = setTimeout(() => {
        void refresh()
      }, 300)
  })
  watch(
    () => auth.user?.id,
    () => {
      if (active) resetOwner()
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    stop()
    unsubscribe()
  })
  return { status, error, display, start, stop, refresh, refreshCurrent }
})
