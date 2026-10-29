import { onScopeDispose, shallowRef, ref, watch, type WatchSource } from 'vue'
export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  dependencies: WatchSource[] = [],
) {
  const data = shallowRef<T | null>(null)
  const error = shallowRef<unknown>(null)
  const loading = ref(false)
  let controller: AbortController | undefined
  let active = true
  async function reload() {
    if (!active) return
    controller?.abort()
    const current = new AbortController()
    controller = current
    loading.value = true
    error.value = null
    data.value = null
    try {
      const value = await loader(current.signal)
      if (active && !current.signal.aborted) data.value = value
    } catch (reason) {
      if (active && !current.signal.aborted) error.value = reason
    } finally {
      if (active && !current.signal.aborted) loading.value = false
    }
  }
  watch(
    dependencies,
    () => {
      void reload()
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    active = false
    controller?.abort()
  })
  return { data, error, loading, reload }
}
