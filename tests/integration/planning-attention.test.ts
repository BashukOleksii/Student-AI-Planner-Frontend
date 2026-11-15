import { request } from '@/api/client'
import type { PlanningAttentionStatus } from '@/api/planningAttention'
import { useAuthStore } from '@/stores/auth'
import { usePlanningAttentionStore } from '@/stores/planningAttention'
import { planningMutationSucceeded } from '@/utils/planningMutation'
import { flushPromises } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { user } from '../fixtures'
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
})
