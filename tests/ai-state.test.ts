import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useAiConversation } from '@/composables/useAiConversation'
import { setAuthErrorHandler } from '@/api/client'
import { aiBackend, actionFixture, aiPage, messageFixture } from './helpers/aiBackend'
import { json } from './fixtures'

beforeEach(() => setAuthErrorHandler(undefined))
async function setup(withAction = false) {
  const backend = aiBackend()
  backend.addConversation()
  if (withAction) backend.actions.push(actionFixture())
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
  return { backend, fetch, chat, wrapper, committed }
}
it('aborts superseded history reads and ignores late results from refresh/unmount', async () => {
  const { chat, fetch, wrapper } = await setup()
  const pending: { resolve: (r: Response) => void; signal: AbortSignal | null | undefined }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      if (url.includes('/messages'))
        return new Promise<Response>((resolve) => pending.push({ resolve, signal: init.signal }))
      return fetch(url, init)
    }),
  )
  const old = chat.history(),
    current = chat.history()
  expect(pending[0]?.signal?.aborted).toBe(true)
  pending[1]!.resolve(json(aiPage([messageFixture(2, 'new')], '/api/ai/conversations/1/messages')))
  await current
  pending[0]!.resolve(json(aiPage([messageFixture(1, 'old')], '/api/ai/conversations/1/messages')))
  await old
  expect(chat.messages.value.map((message) => message.content)).toEqual(['new'])
  const leaving = chat.history()
  wrapper.unmount()
  expect(pending[2]?.signal?.aborted).toBe(true)
  pending[2]!.resolve(json(aiPage([messageFixture(3, 'late')], '/api/ai/conversations/1/messages')))
  await leaving
  expect(chat.messages.value.map((message) => message.content)).toEqual(['new'])
})
it('aborts stale action details, including a recovery read superseded by selection', async () => {
  const { chat, backend, fetch } = await setup(true)
  const second = actionFixture('propose_task_update', 2)
  backend.actions.push(second)
  const pending: { resolve: (r: Response) => void; signal: AbortSignal | null | undefined }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      if (/\/actions\//.test(url))
        return new Promise<Response>((resolve) => pending.push({ resolve, signal: init.signal }))
      return fetch(url, init)
    }),
  )
  const recovery = chat.recoverDecision()
  const selection = chat.selectAction(second.id)
  expect(pending[0]?.signal?.aborted).toBe(true)
  pending[1]!.resolve(json({ data: second }))
  await selection
  pending[0]!.resolve(json({ data: actionFixture() }))
  await recovery
  expect(chat.selected.value?.id).toBe(second.id)
})
it('preserves an immutable review boundary: a changed preflight resets consent without posting', async () => {
  const { chat, backend } = await setup(true)
  backend.actions[0]!.preview.changes = { title: 'Changed server review' }
  chat.consent.value = { accept_partial: true }
  await chat.decide('confirm')
  expect(backend.aiRequests.some((r) => r.path.endsWith('/confirm'))).toBe(false)
  expect(chat.consent.value).toEqual({})
  expect(chat.decisionNotice.value).toContain('Огляд змінився')
})
it('keeps decisions disabled while a lost response cannot be reconciled, then permits explicit retry after GET', async () => {
  const { chat, backend, fetch } = await setup(true)
  // Model a mutation loss and an unavailable read separately, without committing.
  let preflight = true
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/confirm')) throw new TypeError('interrupted')
      if (/\/actions\//.test(url)) {
        if (preflight) {
          preflight = false
          return fetch(url, init)
        }
        return json({}, 503)
      }
      return fetch(url, init)
    }),
  )
  await chat.decide('confirm')
  expect(chat.uncertainDecision.value).toBe(true)
  await chat.decide('confirm')
  expect(backend.executions).toBe(0)
  vi.stubGlobal('fetch', fetch)
  await chat.recoverDecision()
  expect(chat.uncertainDecision.value).toBe(false)
  await chat.decide('confirm')
  expect(backend.executions).toBe(1)
})
it('uses GET action status after a send replay instead of the original pending snapshot', async () => {
  const { chat, backend, fetch } = await setup()
  backend.nextType = 'propose_task_create'
  let once = true
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const response = await fetch(url, init)
      if (once && init.method === 'POST' && url.endsWith('/messages')) {
        once = false
        throw new TypeError('lost')
      }
      return response
    }),
  )
  chat.draft.value = 'Create a task'
  await chat.send()
  const created = backend.actions[0]!
  backend.handle(
    `http://localhost:8000/api/ai/conversations/1/actions/${created.id}/confirm`,
    'POST',
  )
  await chat.send(true)
  expect(chat.selected.value?.status).toBe('executed')
  expect(chat.selected.value?.receipt).not.toBeNull()
  expect(backend.executions).toBe(1)
})
it('reconstructs an obsolete planning review from persisted failed-attempt metadata on reopen', async () => {
  const { chat, backend } = await setup()
  const action = actionFixture('propose_adaptive_replanning')
  backend.actions.push(action)
  const event = messageFixture(500, 'Planning action confirmation failed.')
  event.action_event = {
    action_id: action.id,
    status: 'failed',
    error_code: 'action_stale',
    receipt: null,
  }
  backend.messages.set(1, [event])
  await Promise.all([chat.history(), chat.loadActions()])
  expect(chat.selected.value?.status).toBe('pending')
  expect(chat.needsProposal.value).toBe(true)
})
