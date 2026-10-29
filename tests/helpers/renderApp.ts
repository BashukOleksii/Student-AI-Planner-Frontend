import { mount, flushPromises } from '@vue/test-utils'
import { vi } from 'vitest'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import App from '@/App.vue'
import { makeRouter } from '@/router'
import { useAuthStore } from '@/stores/auth'
import { setAuthErrorHandler } from '@/api/client'
import { f2Backend } from './f2Backend'
export async function renderApp(path: string, backend = f2Backend()) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const result = backend.handle(url, init.method, init.body ? JSON.parse(String(init.body)) : {})
    return new Response(result.status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetch)
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  const router = makeRouter(createMemoryHistory(), pinia)
  setAuthErrorHandler((status) => {
    auth.handleAuthError(status)
    if (
      status === 401 &&
      router.currentRoute.value.matched.length &&
      !router.currentRoute.value.meta.public
    )
      void router.replace('/login')
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router, backend, fetch, auth }
}
