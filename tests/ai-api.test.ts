import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiApi } from '@/api/ai'
import { ApiError, request, setAuthErrorHandler } from '@/api/client'
import { actionFixture, aiBackend, aiPage, messageFixture } from './helpers/aiBackend'
import { actionTypes } from '@/types/ai'
import { consentFields, reviewSupported, validMessage } from '@/utils/ai'
import { clearAiIntents, readIntent, saveIntent } from '@/utils/aiIntent'
import { json } from './fixtures'

beforeEach(() => setAuthErrorHandler(undefined))
function setup() {
  const backend = aiBackend()
  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const result = backend.handle(
      url,
      options.method,
      options.body ? JSON.parse(String(options.body)) : {},
      options.headers,
    )
    return result.status === 204
      ? new Response(null, { status: 204 })
      : json(result.body, result.status)
  })
  vi.stubGlobal('fetch', fetch)
  return { backend, fetch }
}
describe('AI REST contracts', () => {
  it('creates, selects and pages conversations with credentials and no invented fields', async () => {
    const { backend, fetch } = setup()
    for (let i = 0; i < 21; i++) backend.addConversation()
    document.cookie = 'XSRF-TOKEN=csrf%2B%3D'
    const created = await aiApi.create()
    expect(created.data.id).toBe(22)
    const sent = fetch.mock.calls[0]![1]!
    expect(sent.credentials).toBe('include')
    expect(new Headers(sent.headers).get('X-XSRF-TOKEN')).toBe('csrf+=')
    expect(sent.body).toBe('{}')
    expect((await aiApi.conversation(22)).data).toEqual(created.data)
    const first = await aiApi.conversations()
    expect(first.meta.total).toBe(22)
    expect(first.links.next).toContain('page=2')
    const second = await aiApi.conversations(first.links.next)
    expect(second.data).toHaveLength(2)
  })
  it('follows chronological snapshot links, including a zero through_id', async () => {
    const { backend } = setup()
    backend.addConversation()
    backend.messages.set(
      1,
      Array.from({ length: 21 }, (_, i) => messageFixture(i + 1, `message ${i + 1}`)),
    )
    const first = await aiApi.messages(1)
    backend.messages.get(1)!.push(messageFixture(22, 'new message'))
    const last = await aiApi.messages(1, first.links.last)
    expect(last.data.map((row) => row.id)).toEqual([21])
    expect(last.links.prev).toContain('through_id=21')
    expect(
      (await aiApi.messages(1, '/api/ai/conversations/1/messages?page=1&per_page=20&through_id=0'))
        .data,
    ).toEqual([])
    expect((await aiApi.messages(1)).meta.total).toBe(22)
  })
  it('sends the exact content and UUID header, replays the same key and rejects changed content', async () => {
    const { backend, fetch } = setup()
    backend.addConversation()
    const key = crypto.randomUUID(),
      content = '  Які завдання?\nЗбережіть пробіли.  '
    const first = await aiApi.send(1, content, key)
    const second = await aiApi.send(1, content, key)
    expect(second).toEqual(first)
    expect(backend.messages.get(1)).toHaveLength(4)
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('Idempotency-Key')).toBe(key)
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).has('Authorization')).toBe(false)
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({ content })
    await expect(aiApi.send(1, 'different', key)).rejects.toMatchObject({
      status: 409,
      code: 'idempotency_conflict',
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('lists current actions, confirms, preserves receipts on replay and rejects without unsupported fields', async () => {
    const { backend } = setup()
    backend.addConversation()
    backend.actions.push(actionFixture())
    expect((await aiApi.actions(1)).data[0]?.status).toBe('pending')
    expect((await aiApi.action(1, actionFixture().id)).data.status).toBe('pending')
    const first = await aiApi.decide(1, actionFixture().id, 'confirm')
    expect(first.data.receipt).toMatchObject({ task: { id: 70 }, action_id: actionFixture().id })
    expect((await aiApi.decide(1, actionFixture().id, 'confirm')).replayed).toBe(true)
    expect(backend.executions).toBe(1)
    backend.actions.push(actionFixture('propose_task_update', 2))
    expect(
      (
        await aiApi.decide(1, actionFixture('propose_task_update', 2).id, 'reject', {
          accept_partial: true,
        })
      ).data.status,
    ).toBe('rejected')
    expect(
      backend.aiRequests
        .filter((r) => r.path.endsWith('/confirm') || r.path.endsWith('/reject'))
        .every((r) => JSON.stringify(r.body) === '{}'),
    ).toBe(true)
  })
  it.each(actionTypes)('supports the complete public review for %s', (type) => {
    expect(reviewSupported(actionFixture(type))).toBe(true)
  })
  it('narrows public Tool/event data and excludes protected fields and unsafe pagination origins', async () => {
    const { fetch } = setup()
    const resource = actionFixture('propose_study_plan_create')
    fetch.mockResolvedValueOnce(
      json({
        data: {
          ...resource,
          preview: {
            ...resource.preview,
            preview_token: 'DO NOT DISPLAY',
            arguments: { title: 'private' },
            extra_public: 'Visible',
          },
        },
      }),
    )
    const parsed = (await aiApi.action(1, resource.id)).data
    expect(parsed.preview.extra_public).toBe('Visible')
    expect(parsed.preview).not.toHaveProperty('preview_token')
    expect(parsed.preview).not.toHaveProperty('arguments')
    await expect(
      aiApi.messages(1, 'https://foreign.test/api/ai/conversations/1/messages?page=2'),
    ).rejects.toBeInstanceOf(ApiError)
    await expect(
      aiApi.actions(1, 'http://localhost:8000/api/ai/conversations/2/actions?page=2'),
    ).rejects.toBeInstanceOf(ApiError)
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValueOnce(
      json(
        aiPage(
          [{ ...messageFixture(1, 'Hidden'), role: 'system' }],
          '/api/ai/conversations/1/messages',
        ),
      ),
    )
    await expect(aiApi.messages(1)).rejects.toMatchObject({ status: 502 })
  })
  it('blocks incomplete/unknown reviews and unsupported consent instead of guessing', () => {
    const resource = actionFixture()
    expect(reviewSupported({ ...resource, type: 'unknown' })).toBe(false)
    expect(reviewSupported({ ...resource, preview: {} })).toBe(false)
    expect(
      reviewSupported({
        ...resource,
        preview: { ...resource.preview, required_consent: ['accept_partial'] },
      }),
    ).toBe(false)
    expect(consentFields(actionFixture('propose_adaptive_replanning'))).toEqual([
      'accept_partial',
      'accept_unplaced_cancellation',
    ])
  })
  it.each([
    [409, 'conversation_busy'],
    [409, 'turn_expired'],
    [409, 'action_conflict'],
    [409, 'action_executed'],
    [410, 'action_expired'],
    [422, 'action_token_invalid'],
    [422, 'multiple_actions'],
    [422, 'execution_limit_reached'],
    [429, null],
    [502, 'provider_error'],
    [502, 'invalid_provider_response'],
    [503, 'ai_unavailable'],
    [500, 'persistence_error'],
  ] as const)(
    'retains status/code/retry after %s %s without automatic mutation retry',
    async (status, code) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code, message: 'private diagnostic' }), {
          status,
          headers: { 'Retry-After': '60' },
        }),
      )
      vi.stubGlobal('fetch', fetch)
      await expect(
        request('/api/ai/conversations/1/messages', {
          method: 'POST',
          body: { content: 'Hello' },
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ status, code, retryAfter: '60' })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
})
describe('unresolved intent and input', () => {
  it('keeps exact text/key scoped to owner and conversation until resolved or explicitly cleared', () => {
    const pending = {
      ownerId: 1,
      conversationId: 2,
      key: crypto.randomUUID(),
      content: ' Exact\ntext ',
      createdAt: Date.now(),
    }
    expect(saveIntent(pending)).toBe(true)
    expect(readIntent(1, 2)).toEqual(pending)
    expect(readIntent(2, 2)).toBeNull()
    expect(localStorage.length).toBe(0)
    clearAiIntents()
    expect(readIntent(1, 2)).toBeNull()
    saveIntent({ ...pending, createdAt: Date.now() - 86400001 })
    expect(readIntent(1, 2)?.key).toBe(pending.key)
  })
  it('validates Unicode characters without trimming or counting surrogate pairs twice', () => {
    expect(validMessage('😀'.repeat(4000))).toBe(true)
    expect(validMessage('😀'.repeat(4001))).toBe(false)
    for (const value of ['', ' \n\u200b', '\u0000abc', '\ud800'])
      expect(validMessage(value)).toBe(false)
    expect(validMessage('  Вітаю\n')).toBe(true)
  })
})
