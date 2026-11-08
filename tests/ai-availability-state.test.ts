import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useAiConversation } from '@/composables/useAiConversation'
import { setAuthErrorHandler } from '@/api/client'
import { availabilityActionTypes, type AvailabilityActionType } from '@/types/ai'
import { aiAvailabilityBackend } from './helpers/aiAvailabilityBackend'
import {
  availabilityActionFixture,
  availabilityReceiptFixture,
  availabilityWindow,
} from './helpers/aiAvailabilityFixtures'
import { json } from './fixtures'

beforeEach(() => setAuthErrorHandler(undefined))
async function setup(type: AvailabilityActionType = 'propose_availability_create') {
  const backend = aiAvailabilityBackend()
  backend.ai.addConversation()
  backend.ai.actions.push(availabilityActionFixture(type))
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const result = backend.handle(
      url,
      init.method,
      init.body ? JSON.parse(String(init.body)) : {},
      init.headers,
    )
    return result.status === 204
      ? new Response(null, { status: 204 })
      : json(result.body, result.status)
  })
  vi.stubGlobal('fetch', fetch)
  let chat!: ReturnType<typeof useAiConversation>
  const wrapper = mount(
    defineComponent({
      setup() {
        chat = useAiConversation(
          1,
          1,
          () => 'Pacific/Honolulu',
          vi.fn(),
          () => false,
        )
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { backend, fetch, chat, wrapper }
}
it.each(availabilityActionTypes)(
  'read/proposal/"так" never executes %s; explicit confirm sends {} and refreshes only availability',
  async (type) => {
    const { chat, backend } = await setup(type)
    expect(chat.selected.value?.type).toBe(type)
    expect(backend.executions).toBe(0)
    chat.draft.value = 'так'
    await chat.send()
    expect(backend.executions).toBe(0)
    chat.consent.value = { accept_partial: true, accept_unplaced_cancellation: true }
    await chat.decide('confirm')
    expect(backend.executions).toBe(1)
    expect(chat.selected.value?.status).toBe('executed')
    expect(backend.requests.filter((r) => r.path.endsWith('/confirm')).map((r) => r.body)).toEqual([
      {},
    ])
    expect(backend.requests.filter((r) => !r.path.startsWith('/api/ai/'))).toEqual([
      { path: '/api/study-availability-windows', method: 'GET', body: {} },
    ])
    expect(chat.currentAvailability.value).toEqual([...backend.windows.values()])
    expect(chat.messages.value.at(-1)?.action_event?.status).toBe('executed')
    expect(chat.messages.value.map((m) => m.id)).toEqual(
      [...chat.messages.value.map((m) => m.id)].sort((a, b) => a - b),
    )
  },
)
it.each(availabilityActionTypes)(
  'rejects %s using {} without a business write or domain refresh',
  async (type) => {
    const { chat, backend } = await setup(type),
      before = structuredClone([...backend.windows])
    await chat.decide('reject')
    expect(chat.selected.value?.status).toBe('rejected')
    expect(backend.executions).toBe(0)
    expect([...backend.windows]).toEqual(before)
    expect(backend.requests.filter((r) => r.path.endsWith('/reject')).map((r) => r.body)).toEqual([
      {},
    ])
    expect(backend.requests.some((r) => r.path.includes('study-availability'))).toBe(false)
  },
)
it('accepts semantic key reordering but requires renewed review of changed material', async () => {
  const { chat, backend } = await setup('propose_availability_update')
  const action = backend.ai.actions[0]!
  action.preview = Object.fromEntries(Object.entries(action.preview).reverse())
  Object.assign(action.preview.after!, { ends_at: '23:59:59' })
  await chat.decide('confirm')
  expect(chat.decisionNotice.value).toContain('Огляд змінився')
  expect(backend.executions).toBe(0)
  expect(backend.requests.some((r) => r.path.endsWith('/confirm'))).toBe(false)
  await chat.decide('confirm')
  expect(backend.executions).toBe(1)
  expect(chat.selected.value?.receipt?.window).toMatchObject({ ends_at: '23:59:59' })
})
it('disables duplicate submissions and aborts the in-flight request on navigation/unmount', async () => {
  const { chat, backend, fetch, wrapper } = await setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let signal: AbortSignal | null | undefined,
    posts = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) {
        posts++
        signal = init.signal
        await gate
      }
      return fetch(url, init)
    }),
  )
  const pending = chat.decide('confirm')
  await flushPromises()
  expect(chat.decisionBusy.value).toBe(true)
  await Promise.all([chat.decide('confirm'), chat.decide('reject')])
  expect(posts).toBe(1)
  wrapper.unmount()
  expect(signal?.aborted).toBe(true)
  release()
  await pending
  // An aborted/lost request may have persisted; this disposed UI never claims execution or retries.
  expect(chat.selected.value?.status).toBe('pending')
  expect(backend.requests.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(1)
})
it.each([
  [409, 'action_stale', true],
  [422, 'action_validation_failed', true],
  [409, 'conversation_busy', false],
  [410, 'action_expired', false],
  [500, 'persistence_error', false],
  [422, null, false],
  [401, null, false],
  [404, null, false],
  [419, null, false],
] as const)(
  'handles %s/%s with GET recovery, no automatic POST replay and appropriate domain reads',
  async (status, code, obsolete) => {
    const { chat, backend, fetch } = await setup('propose_availability_update')
    const authError = vi.fn()
    setAuthErrorHandler(authError)
    let posts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit = {}) => {
        if (url.endsWith('/confirm')) {
          posts++
          if (code === 'action_expired')
            Object.assign(backend.ai.actions[0]!, {
              status: 'expired',
              state: 'expired',
              confirmation_required: false,
            })
          return Promise.resolve(
            json(code ? { code } : { errors: { body: ['Invalid request.'] } }, status),
          )
        }
        return fetch(url, init)
      }),
    )
    await chat.decide('confirm')
    expect(posts).toBe(1)
    expect(backend.executions).toBe(0)
    expect(chat.decisionError.value).toMatchObject({ status, code })
    expect(chat.needsProposal.value).toBe(obsolete)
    expect(chat.selected.value?.receipt).toBeNull()
    const reads = backend.requests.filter((r) => r.path === '/api/study-availability-windows')
    expect(reads).toHaveLength(obsolete ? 1 : 0)
    if (obsolete) {
      const oldPreview = structuredClone(chat.selected.value!.preview)
      backend.windows.set(99, { ...availabilityWindow(99), day_of_week: 7 })
      await chat.refreshDomains()
      expect(chat.currentAvailability.value).toContainEqual({
        ...availabilityWindow(99),
        day_of_week: 7,
      })
      expect(chat.selected.value!.preview).toEqual(oldPreview)
      await chat.selectAction(chat.selectedId.value!)
      await chat.decide('confirm')
      expect(posts).toBe(1)
      await chat.decide('reject')
      expect(chat.selected.value?.status).toBe('rejected')
    }
    if (status === 401 || status === 419) expect(authError).toHaveBeenCalledWith(status)
  },
)
it('keeps a failed stale read separate and allows fresh windows without making old proposal confirmable', async () => {
  const { chat, backend, fetch } = await setup()
  let failReads = true
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) return Promise.resolve(json({ code: 'action_stale' }, 409))
      if (failReads && url.endsWith('/study-availability-windows'))
        return Promise.resolve(json({}, 503))
      return fetch(url, init)
    }),
  )
  await chat.decide('confirm')
  expect(chat.needsProposal.value).toBe(true)
  expect(chat.domainError.value).toMatchObject({ status: 503 })
  expect(chat.selected.value?.status).toBe('pending')
  expect(chat.currentAvailability.value).toBeNull()
  failReads = false
  await chat.refreshDomains()
  expect(chat.domainError.value).toBeNull()
  expect(chat.currentAvailability.value).toEqual([...backend.windows.values()])
  expect(chat.needsProposal.value).toBe(true)
  expect(backend.executions).toBe(0)
})
it('recovers a lost executed response through GET; failed refresh and later edits preserve the immutable receipt', async () => {
  const { chat, backend, fetch } = await setup(),
    original = structuredClone(backend.ai.actions[0]!)
  let failReads = true,
    posts = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) {
        posts++
        await fetch(url, init)
        throw new TypeError('response lost')
      }
      if (failReads && url.endsWith('/study-availability-windows')) return json({}, 503)
      return fetch(url, init)
    }),
  )
  await chat.decide('confirm')
  expect(chat.selected.value?.status).toBe('executed')
  expect(chat.decisionError.value).toBeNull()
  expect(chat.domainError.value).toMatchObject({ status: 503 })
  expect(chat.selected.value?.receipt).toEqual(availabilityReceiptFixture(original))
  failReads = false
  backend.windows.set(13, { ...availabilityWindow(13), day_of_week: 7 })
  await chat.refreshDomains()
  await chat.decide('confirm')
  expect(chat.selected.value?.receipt).toEqual(availabilityReceiptFixture(original))
  expect(chat.currentAvailability.value).toContainEqual({
    ...availabilityWindow(13),
    day_of_week: 7,
  })
  expect(posts).toBe(1)
  expect(backend.executions).toBe(1)
})
it('blocks mutations while GET recovery is uncertain, then permits explicit inspection', async () => {
  const { chat, backend, fetch } = await setup()
  let gets = 0,
    posts = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) {
        posts++
        return Promise.reject(new TypeError('lost'))
      }
      if (/\/actions\//.test(url) && ++gets > 1) return Promise.resolve(json({}, 503))
      return fetch(url, init)
    }),
  )
  await chat.decide('confirm')
  expect(chat.uncertainDecision.value).toBe(true)
  await chat.decide('confirm')
  await chat.decide('reject')
  expect(posts).toBe(1)
  vi.stubGlobal('fetch', fetch)
  await chat.recoverDecision()
  expect(chat.uncertainDecision.value).toBe(false)
  expect(backend.executions).toBe(0)
})
it.each(['expired', 'rejected'] as const)('cannot confirm terminal %s', async (status) => {
  const { chat, backend } = await setup()
  Object.assign(backend.ai.actions[0]!, { status, state: status, confirmation_required: false })
  await chat.selectAction(chat.selectedId.value!)
  await chat.decide('confirm')
  expect(backend.requests.some((r) => r.path.endsWith('/confirm'))).toBe(false)
})
it('renders executed preflight and replayed response as an earlier execution without further writes', async () => {
  const { chat, backend, fetch } = await setup()
  const action = backend.ai.actions[0]!
  Object.assign(action, {
    status: 'executed',
    state: 'executed',
    confirmation_required: false,
    receipt: availabilityReceiptFixture(action),
  })
  await chat.decide('confirm')
  expect(chat.selected.value?.status).toBe('executed')
  expect(backend.requests.some((r) => r.path.endsWith('/confirm'))).toBe(false)
  const next = availabilityActionFixture('propose_availability_update', 2)
  backend.ai.actions.push(next)
  await chat.selectAction(next.id)
  let posts = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) {
        posts++
        Object.assign(next, {
          status: 'executed',
          state: 'executed',
          confirmation_required: false,
          receipt: availabilityReceiptFixture(next),
        })
        return Promise.resolve(json({ data: next, replayed: true }))
      }
      return fetch(url, init)
    }),
  )
  await chat.decide('confirm')
  expect(chat.decisionNotice.value).toContain('Повторних змін немає')
  expect(chat.selected.value?.receipt).toEqual(availabilityReceiptFixture(next))
  await chat.decide('confirm')
  expect(posts).toBe(1)
})
it('blocks malformed review and foreign/missing preflight actions, with no decision POST', async () => {
  const { chat, backend, fetch } = await setup()
  Object.assign(backend.ai.actions[0]!.preview, { timezone: null })
  await chat.selectAction(chat.selectedId.value!)
  await chat.decide('confirm')
  expect(backend.requests.some((r) => r.path.endsWith('/confirm'))).toBe(false)
  Object.assign(backend.ai.actions[0]!.preview, { timezone: 'Europe/Kyiv' })
  await chat.selectAction(chat.selectedId.value!)
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) =>
      /\/actions\//.test(url)
        ? Promise.resolve(json({ data: { ...backend.ai.actions[0]!, conversation_id: 2 } }))
        : fetch(url, init),
    ),
  )
  await chat.decide('confirm')
  expect(chat.uncertainDecision.value).toBe(true)
  expect(chat.selected.value?.status).toBe('pending')
  expect(backend.requests.some((r) => r.path.endsWith('/confirm'))).toBe(false)
})
