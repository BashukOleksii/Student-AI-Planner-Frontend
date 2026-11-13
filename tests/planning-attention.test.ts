import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePlanningAttentionStore } from '@/stores/planningAttention'
import PlanningAttentionIndicator from '@/components/planning/PlanningAttentionIndicator.vue'
import { planningMutationSucceeded } from '@/utils/planningMutation'
import { request } from '@/api/client'
import type { PlanningAttentionStatus } from '@/api/planningAttention'
import { user } from './fixtures'
import { renderApp } from './helpers/renderApp'
import { f2Backend } from './helpers/f2Backend'
const normal = (): PlanningAttentionStatus => ({
  attention_count: 0,
  most_important_kind: null,
  counts: { decision_required: 0, replan: 0, warning: 0, create_plan: 0 },
  check_state: 'idle',
  check_pending: false,
  last_successful_check_at: '2026-11-13T08:00:00Z',
  check_failed: false,
  has_informational_recommendations: false,
  unverified_suggestion_count: 0,
  review_refresh_required: false,
})
let pinia: ReturnType<typeof createPinia> | undefined
afterEach(() => {
  if (pinia) disposePinia(pinia)
  pinia = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})
function setup() {
  pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { ...user }
  const store = usePlanningAttentionStore()
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: normal() }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  return { auth, store, fetch }
}
describe('Global planning attention', () => {
  it.each(['clear', 'attention', 'checking', 'error', 'information'] as const)(
    'renders %s without raw codes',
    async (state) => {
      const { store } = setup()
      store.status = normal()
      if (state === 'attention') {
        store.status.attention_count = 1
        store.status.most_important_kind = 'replan'
      }
      if (state === 'checking') {
        store.status.check_state = 'pending'
        store.status.check_pending = true
      }
      if (state === 'error') {
        store.status.check_state = 'failed'
        store.status.check_failed = true
      }
      if (state === 'information') {
        store.status.has_informational_recommendations = true
        store.status.most_important_kind = 'create_plan'
      }
      const wrapper = mount(PlanningAttentionIndicator, {
        global: {
          plugins: [pinia!],
          stubs: { RouterLink: { template: '<a href="/planning/suggestions"><slot /></a>' } },
        },
      })
      if (state === 'clear') {
        expect(wrapper.find('a').exists()).toBe(false)
        return
      }
      expect(wrapper.get('a').attributes('aria-label')).toBeTruthy()
      expect(wrapper.get('a').attributes('href')).toBe('/planning/suggestions')
      expect(wrapper.text()).not.toMatch(/replan|create_plan|pending/)
      if (state === 'checking') expect(wrapper.text()).toContain('Перевіряємо план')
      if (state === 'error')
        expect(wrapper.text()).toContain('Не вдалося перевірити актуальність плану')
    },
  )
  it('offers explicit refresh in history when an unchanged review has expired', () => {
    const { store } = setup()
    store.status = { ...normal(), review_refresh_required: true, unverified_suggestion_count: 1 }
    expect(store.display).toBe('information')
    const wrapper = mount(PlanningAttentionIndicator, {
      global: { plugins: [pinia!], stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('Попередня пропозиція застаріла')
    expect(wrapper.getComponent(RouterLinkStub).props('to')).toEqual({
      path: '/planning/suggestions',
      query: { status: 'all' },
    })
  })
  it('refreshes after a confirmed transport mutation without repeating the write', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { store, fetch } = setup()
    store.start()
    await flushPromises()
    await request('/api/study-availability-windows/1', {
      method: 'PATCH',
      body: { ends_at: '16:00:00' },
    })
    expect(store.display).toBe('checking')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(store.display).toBe('clear')
    expect(
      vi.mocked(globalThis.fetch).mock.calls.filter((call) => call[1]?.method === 'PATCH'),
    ).toHaveLength(1)
  })
  it('starts one poller, coalesces mutations, hides old results, and stops on logout', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { store, auth, fetch } = setup()
    store.start()
    store.start()
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)
    store.status = { ...normal(), attention_count: 1, most_important_kind: 'replan' }
    planningMutationSucceeded('/api/study-availability-windows/1', 'PATCH')
    planningMutationSucceeded('/api/planning-preferences', 'PUT')
    expect(store.display).toBe('checking')
    expect(store.status).toBeNull()
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(59700)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(3)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetch).toHaveBeenCalledTimes(3)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(4)
    auth.clear()
    expect(store.status).toBeNull()
    await vi.advanceTimersByTimeAsync(180000)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it('bounds quick reads for pending analysis and reports transport failure', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { store, fetch } = setup()
    fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ data: { ...normal(), check_pending: true, check_state: 'pending' } }),
        ),
    )
    store.start()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(20000)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(store.display).toBe('checking')
    fetch.mockRejectedValueOnce(new Error('Offline'))
    await store.refresh()
    expect(store.display).toBe('error')
  })
  it('discards an old account response even if cancellation is ignored by transport', async () => {
    const { store, auth, fetch } = setup()
    let deliver: ((value: Response) => void) | undefined
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          deliver = resolve
        }),
    )
    store.start()
    auth.user = { ...user, id: user.id + 1 }
    await flushPromises()
    expect(store.status?.attention_count).toBe(0)
    deliver!(
      new Response(
        JSON.stringify({
          data: { ...normal(), attention_count: 1, most_important_kind: 'replan' },
        }),
      ),
    )
    await flushPromises()
    expect(store.status?.attention_count).toBe(0)
  })
  it('does not notify after validation failure, preview, GET or inbox mutation', async () => {
    vi.useFakeTimers()
    const { store, fetch } = setup()
    store.start()
    await flushPromises()
    planningMutationSucceeded('/api/planning/study-plans/preview', 'POST')
    planningMutationSucceeded('/api/semester-schedules/1/weekly-rules/preview', 'POST')
    planningMutationSucceeded('/api/notifications/1/read', 'POST')
    planningMutationSucceeded('/api/tasks', 'GET')
    expect(store.display).toBe('clear')
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ errors: {} }), { status: 422 }))
    await expect(request('/api/tasks/1', { method: 'PATCH', body: {} })).rejects.toBeTruthy()
    expect(store.display).toBe('clear')
  })
  it('keeps a single header poller when navigating between pages', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const backend = f2Backend()
    const app = await renderApp('/tasks', backend)
    const count = () =>
      backend.requests.filter((r) => r.path === '/api/planning/attention-status').length
    expect(count()).toBe(1)
    await app.router.push('/profile')
    await flushPromises()
    await app.router.push('/tasks')
    await flushPromises()
    expect(count()).toBe(1)
    await vi.advanceTimersByTimeAsync(60000)
    await flushPromises()
    expect(count()).toBe(2)
    app.wrapper.unmount()
    await vi.advanceTimersByTimeAsync(60000)
    expect(count()).toBe(2)
  })
})
