import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useAiConversation } from '@/composables/useAiConversation'
import { setAuthErrorHandler } from '@/api/client'
import { lessonActionTypes, type LessonActionType } from '@/types/ai'
import { aiLessonBackend } from './helpers/aiLessonBackend'
import { lessonActionFixture, lessonReceiptFixture } from './helpers/aiLessonFixtures'
import { json } from './fixtures'

beforeEach(() => setAuthErrorHandler(undefined))
async function setup(type: LessonActionType = 'propose_lesson_create') {
  const backend = aiLessonBackend()
  backend.ai.addConversation()
  backend.ai.actions.push(lessonActionFixture(type))
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
  const committed = vi.fn()
  const wrapper = mount(
    defineComponent({
      setup() {
        chat = useAiConversation(
          1,
          1,
          () => 'Europe/Kyiv',
          committed,
          () => false,
        )
        return () => h('div')
      },
    }),
  )
  await flushPromises()
  return { backend, fetch, chat, committed, wrapper }
}
it.each(lessonActionTypes)(
  'loading/sending ordinary text does not commit %s; only explicit confirm writes',
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
  },
)
it('accepts reordered keys on preflight, but requires a new review for changed values', async () => {
  const { chat, backend } = await setup('propose_lesson_update')
  const action = backend.ai.actions[0]!
  action.preview = Object.fromEntries(Object.entries(action.preview).reverse())
  await chat.decide('confirm')
  expect(backend.executions).toBe(1)
  const second = lessonActionFixture('propose_lesson_update', 2)
  backend.ai.actions.push(second)
  await chat.selectAction(second.id)
  Object.assign(second.preview.after!, { room: 'Changed' })
  await chat.decide('confirm')
  expect(backend.executions).toBe(1)
  expect(chat.decisionNotice.value).toContain('Огляд змінився')
})
it('guards confirm/reject against double submits while a request is pending', async () => {
  const { chat, fetch, backend } = await setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let posts = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) {
        posts++
        await gate
      }
      return fetch(url, init)
    }),
  )
  const first = chat.decide('confirm')
  await flushPromises()
  expect(chat.decisionBusy.value).toBe(true)
  await Promise.all([chat.decide('confirm'), chat.decide('reject')])
  expect(posts).toBe(1)
  release()
  await first
  expect(backend.executions).toBe(1)
})
it.each([
  [409, 'action_stale', true],
  [422, 'action_validation_failed', true],
  [410, 'action_expired', false],
  [409, 'action_executed', false],
  [409, 'conversation_busy', false],
  [500, 'persistence_error', false],
  [422, null, false],
  [401, null, false],
  [419, null, false],
  [404, null, false],
] as const)(
  'recovers %s %s through GET without replaying a write',
  async (status, code, obsolete) => {
    const { chat, fetch, backend } = await setup('propose_lesson_update')
    const authError = vi.fn()
    setAuthErrorHandler(authError)
    let posts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit = {}) => {
        if (url.endsWith(code === 'action_executed' ? '/reject' : '/confirm')) {
          posts++
          if (code === 'action_executed') {
            const action = backend.ai.actions[0]!
            action.receipt = lessonReceiptFixture(action)
            Object.assign(action, {
              status: 'executed',
              state: 'executed',
              confirmation_required: false,
            })
          }
          if (code === 'action_expired')
            Object.assign(backend.ai.actions[0]!, {
              status: 'expired',
              state: 'expired',
              confirmation_required: false,
            })
          return Promise.resolve(
            json({ ...(code ? { code } : { errors: { body: ['Invalid request.'] } }) }, status),
          )
        }
        return fetch(url, init)
      }),
    )
    await chat.decide(code === 'action_executed' ? 'reject' : 'confirm')
    expect(posts).toBe(1)
    expect(backend.executions).toBe(0)
    expect(chat.needsProposal.value).toBe(obsolete)
    if (code === 'action_executed') {
      expect(chat.selected.value?.status).toBe('executed')
      expect(chat.decisionError.value).toBeNull()
    } else expect(chat.decisionError.value).toMatchObject({ status, code })
    expect(backend.requests.some((r) => /\/actions\//.test(r.path) && r.method === 'GET')).toBe(
      true,
    )
    if (obsolete) {
      await chat.decide('confirm')
      expect(posts).toBe(1)
      expect(backend.requests.some((r) => r.path.startsWith('/api/schedule/'))).toBe(true)
      await chat.decide('reject')
      expect(chat.selected.value?.status).toBe('rejected')
    }
    if (status === 401 || status === 419) expect(authError).toHaveBeenCalledWith(status)
  },
)
it('recovers a lost executed response and preserves receipt when subsequent reads fail; refresh retry never rewrites', async () => {
  const { chat, backend, fetch } = await setup('propose_lesson_replacement')
  let failReads = true,
    posts = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) {
        posts++
        await fetch(url, init)
        throw new TypeError('Lost response')
      }
      if (failReads && /\/api\/lessons\//.test(url)) return json({}, 503)
      return fetch(url, init)
    }),
  )
  await chat.decide('confirm')
  const receipt = structuredClone(chat.selected.value?.receipt)
  expect(chat.selected.value?.status).toBe('executed')
  expect(chat.decisionError.value).toBeNull()
  expect(chat.domainError.value).toMatchObject({ status: 503 })
  expect(backend.executions).toBe(1)
  expect(posts).toBe(1)
  await chat.decide('confirm')
  failReads = false
  await chat.refreshDomains()
  expect(chat.domainError.value).toBeNull()
  expect(chat.selected.value?.receipt).toEqual(receipt)
  expect(posts).toBe(1)
})
it('blocks uncertain mutations until an explicit authoritative recovery succeeds', async () => {
  const { chat, backend, fetch } = await setup()
  let actionGets = 0,
    posts = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) {
        posts++
        return Promise.reject(new TypeError('lost'))
      }
      if (/\/actions\//.test(url) && ++actionGets > 1) return Promise.resolve(json({}, 503))
      return fetch(url, init)
    }),
  )
  await chat.decide('confirm')
  expect(chat.uncertainDecision.value).toBe(true)
  await chat.decide('reject')
  await chat.decide('confirm')
  expect(posts).toBe(1)
  vi.stubGlobal('fetch', fetch)
  await chat.recoverDecision()
  expect(chat.uncertainDecision.value).toBe(false)
  await chat.decide('confirm')
  expect(backend.executions).toBe(1)
})
it('honors executed preflight/replayed receipts and never interprets a Lesson original as a session', async () => {
  const { chat, backend } = await setup('propose_lesson_replacement')
  const action = backend.ai.actions[0]!
  action.receipt = lessonReceiptFixture(action)
  Object.assign(action, { status: 'executed', state: 'executed', confirmation_required: false })
  await chat.decide('confirm')
  expect(chat.selected.value?.status).toBe('executed')
  expect(backend.requests.some((r) => r.path.endsWith('/confirm'))).toBe(false)
  expect(backend.requests.some((r) => r.path.includes('study-sessions'))).toBe(false)
})
