import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { notificationsApi } from '@/api/notifications'
import { useAuthStore } from './auth'

export const useNotificationsStore = defineStore('notifications', () => {
  const auth = useAuthStore()
  const hasUnread = ref(false)
  const revision = ref(0)
  let active = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let pending: Promise<void> | undefined
  function refresh(): Promise<void> {
    if (!active || !auth.authenticated || document.hidden) return Promise.resolve()
    if (pending) return pending
    clearTimeout(timer)
    const current = new AbortController()
    controller = current
    pending = notificationsApi
      .list({ unread_only: 'true', per_page: 1, page: 1 }, current.signal)
      .then((result) => {
        if (!current.signal.aborted) hasUnread.value = result.meta.total > 0
      })
      .catch(() => {
        /* Keep the last confirmed indicator on transient errors. */
      })
      .finally(() => {
        if (controller !== current) return
        pending = undefined
        revision.value++
        if (active && auth.authenticated && !document.hidden)
          timer = setTimeout(() => void refresh(), 30000)
      })
    return pending
  }
  async function afterRead() {
    await pending
    await refresh()
  }
  function visibility() {
    clearTimeout(timer)
    if (!document.hidden) void refresh()
  }
  function clear() {
    clearTimeout(timer)
    controller?.abort()
    controller = undefined
    pending = undefined
    hasUnread.value = false
  }
  function start() {
    if (active) return
    active = true
    document.addEventListener('visibilitychange', visibility)
    void refresh()
  }
  function stop() {
    active = false
    document.removeEventListener('visibilitychange', visibility)
    clear()
  }
  watch(
    () => auth.user?.id,
    () => {
      clear()
      if (active) void refresh()
    },
    { flush: 'sync' },
  )
  return { hasUnread, revision, start, stop, refresh, afterRead }
})
