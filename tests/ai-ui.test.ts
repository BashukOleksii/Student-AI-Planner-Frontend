import { describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { actionFixture, aiBackend, messageFixture } from './helpers/aiBackend'
import { json } from './fixtures'
import AiActionReview from '@/components/ai/AiActionReview.vue'
import { readIntent, saveIntent } from '@/utils/aiIntent'
import type { ActionType } from '@/types/ai'

function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((b) => b.text() === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
async function click(wrapper: VueWrapper, text: string) {
  await button(wrapper, text).trigger('click')
  await flushPromises()
}
async function send(wrapper: VueWrapper, content = 'Моє запитання') {
  await wrapper.get('#ai-content').setValue(content)
  await wrapper.get('.ai-composer').trigger('submit')
  await flushPromises()
}
async function conversation() {
  const backend = aiBackend()
  backend.addConversation()
  return { ...(await renderApp('/ai/conversations/1', backend)), backend }
}
async function proposal(type: ActionType = 'propose_task_create') {
  const backend = aiBackend()
  backend.addConversation()
  backend.actions.push(actionFixture(type))
  return { ...(await renderApp('/ai/conversations/1', backend)), backend }
}
describe('AI conversation workspace', () => {
  it('does not navigate back when an old create response arrives after leaving the page', async () => {
    const backend = aiBackend()
    const { wrapper, router, fetch } = await renderApp('/ai', backend)
    let resolve: ((response: Response) => void) | undefined
    let signal: AbortSignal | null | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit = {}) => {
        if (url.endsWith('/api/ai/conversations') && init.method === 'POST') {
          signal = init.signal
          return new Promise<Response>((done) => {
            resolve = done
          })
        }
        return fetch(url, init)
      }),
    )
    await button(wrapper, 'Нова розмова').trigger('click')
    await router.push('/profile')
    await flushPromises()
    expect(signal?.aborted).toBe(true)
    resolve!(json({ data: backend.addConversation() }, 201))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/profile')
  })
  it('shows empty state, creates a conversation and sends a persisted read-only answer', async () => {
    const backend = aiBackend()
    const { wrapper, router } = await renderApp('/ai', backend)
    expect(wrapper.text()).toContain('Розмов поки немає')
    await click(wrapper, 'Нова розмова')
    expect(router.currentRoute.value.path).toBe('/ai/conversations/1')
    expect(wrapper.text()).toContain('У цій розмові ще немає повідомлень')
    await send(wrapper, '  Які мої завдання?  ')
    expect(wrapper.findAll('.ai-user')).toHaveLength(1)
    expect(wrapper.text()).toContain('Here is your saved academic answer.')
    expect(wrapper.text()).toContain('Сервер повідомив про успішне виконання інструмента.')
    expect(
      backend.aiRequests.filter((r) => r.method === 'POST' && r.path.endsWith('/messages'))[0]
        ?.body,
    ).toEqual({ content: '  Які мої завдання?  ' })
    expect(backend.executions).toBe(0)
  })
  it('pages conversations and selects another saved conversation', async () => {
    const backend = aiBackend()
    for (let i = 0; i < 21; i++) backend.addConversation()
    const { wrapper, router } = await renderApp('/ai', backend)
    await click(wrapper, 'Наступні розмови')
    await wrapper.get('.ai-conversation-list a[href="/ai/conversations/1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/ai/conversations/1')
    expect(wrapper.find('.ai-chat').exists()).toBe(true)
  })
  it('starts with the latest snapshot page, prepends older IDs and refreshes without duplicates', async () => {
    const backend = aiBackend()
    backend.addConversation()
    backend.messages.set(
      1,
      Array.from({ length: 25 }, (_, i) => messageFixture(i + 1, `history-${i + 1}`)),
    )
    const { wrapper } = await renderApp('/ai/conversations/1', backend)
    expect(wrapper.findAll('.ai-message')).toHaveLength(5)
    backend.messages.get(1)!.push(messageFixture(26, 'newer-message'))
    await click(wrapper, 'Завантажити старіші повідомлення')
    expect(wrapper.findAll('.ai-message')).toHaveLength(25)
    expect(wrapper.text()).not.toContain('newer-message')
    expect(backend.aiRequests.filter((r) => r.path.endsWith('/messages')).at(-1)?.url).toContain(
      'through_id=25',
    )
    await click(wrapper, 'Оновити історію')
    expect(wrapper.findAll('.ai-message')).toHaveLength(6)
    expect(wrapper.text()).toContain('newer-message')
  })
  it('renders failed Tools, truncated text and an attempted action event without pretending execution', async () => {
    const { backend, wrapper } = await conversation()
    backend.nextType = 'failed-tool'
    await send(wrapper)
    expect(wrapper.text()).toContain('Інструмент не виконав запит.')
    expect(wrapper.text()).toContain('not_found')
    const event = messageFixture(999, 'Attempt failed')
    event.content_truncated = true
    event.tool_calls_truncated = true
    event.action_event = {
      action_id: actionFixture().id,
      status: 'failed',
      error_code: 'action_stale',
      receipt: null,
    }
    backend.messages.get(1)!.push(event)
    await click(wrapper, 'Оновити історію')
    expect(wrapper.text()).toContain('це не кінцевий стан пропозиції')
    expect(wrapper.text()).toContain('Сервер скоротив довгий історичний текст')
    expect(wrapper.text()).toContain('Сервер скоротив список історичних викликів')
  })
  it('renders untrusted HTML as text and never exposes foreign/unavailable conversation data', async () => {
    const backend = aiBackend()
    backend.addConversation()
    backend.messages.set(1, [messageFixture(1, '<img src=x onerror="window.PWNED=true">')])
    const { wrapper, router } = await renderApp('/ai/conversations/1', backend)
    expect(wrapper.find('.ai-timeline img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x')
    await router.push('/ai/conversations/999')
    await flushPromises()
    expect(wrapper.find('.ai-chat').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('window.PWNED')
  })
  it('disables duplicate sends and keeps the page responsive during the completed-response wait', async () => {
    const { wrapper, fetch } = await conversation()
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const delayed = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.endsWith('/messages') && init.method === 'POST') await gate
      return fetch(url, init)
    })
    vi.stubGlobal('fetch', delayed)
    await wrapper.get('#ai-content').setValue('Wait')
    const form = wrapper.get('.ai-composer')
    await form.trigger('submit')
    await form.trigger('submit')
    expect(wrapper.text()).toContain('Очікуємо завершення запиту')
    expect(delayed.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1)
    expect(readIntent(1, 1)?.content).toBe('Wait')
    release!()
    await flushPromises()
    expect(wrapper.findAll('.ai-user')).toHaveLength(1)
  })
  it('recovers a lost completed send with the exact key/text and no duplicate transcript', async () => {
    const { wrapper, backend, fetch } = await conversation()
    let lose = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const result = await fetch(url, init)
        if (lose && url.endsWith('/messages') && init.method === 'POST') {
          lose = false
          throw new TypeError('connection lost after commit')
        }
        return result
      }),
    )
    await send(wrapper, ' Exact request ')
    expect(wrapper.text()).toContain('Є незавершений або непідтверджений запит')
    const pending = readIntent(1, 1)
    expect(pending?.content).toBe(' Exact request ')
    await click(wrapper, 'Оновити історію')
    expect(wrapper.findAll('.ai-user')).toHaveLength(1)
    await click(wrapper, 'Повторити цей запит')
    const sends = backend.aiRequests.filter(
      (r) => r.method === 'POST' && r.path.endsWith('/messages'),
    )
    expect(sends).toHaveLength(2)
    expect(sends[0]?.key).toBe(sends[1]?.key)
    expect(sends[1]?.body).toEqual(sends[0]?.body)
    expect(wrapper.findAll('.ai-user')).toHaveLength(1)
    expect(readIntent(1, 1)).toBeNull()
  })
  it('restores an unresolved intent on remount without automatically spending an AI request', async () => {
    const backend = aiBackend()
    backend.addConversation()
    const pending = {
      ownerId: 1,
      conversationId: 1,
      key: crypto.randomUUID(),
      content: 'Restored intent',
      createdAt: Date.now(),
    }
    saveIntent(pending)
    const { wrapper } = await renderApp('/ai/conversations/1', backend)
    expect(wrapper.text()).toContain('Restored intent')
    expect(backend.aiRequests.some((r) => r.method === 'POST')).toBe(false)
    await click(wrapper, 'Повторити цей запит')
    expect(backend.aiRequests.find((r) => r.method === 'POST')?.key).toBe(pending.key)
  })
  it('creates a new key only after an explicit edit-as-new decision', async () => {
    const { backend, wrapper } = await conversation()
    backend.failures.push({
      method: 'POST',
      path: /messages$/,
      status: 502,
      code: 'provider_error',
    })
    await send(wrapper, 'Original')
    const first = backend.aiRequests.find((r) => r.method === 'POST')!
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await click(wrapper, 'Редагувати як новий запит')
    await send(wrapper, 'Changed')
    const last = backend.aiRequests.filter((r) => r.method === 'POST').at(-1)!
    expect(last.key).not.toBe(first.key)
    expect(last.body).toEqual({ content: 'Changed' })
  })
  it.each([
    [409, 'conversation_busy'],
    [409, 'turn_expired'],
    [429, null],
    [502, 'provider_error'],
    [503, 'ai_unavailable'],
  ] as const)(
    'preserves intent after %s %s and retries only on user request',
    async (status, code) => {
      const { backend, wrapper } = await conversation()
      backend.failures.push({ method: 'POST', path: /messages$/, status, code: code ?? undefined })
      await send(wrapper)
      expect(backend.aiRequests.filter((r) => r.method === 'POST')).toHaveLength(1)
      expect(readIntent(1, 1)).not.toBeNull()
      await click(wrapper, 'Повторити цей запит')
      expect(backend.aiRequests.filter((r) => r.method === 'POST')).toHaveLength(2)
    },
  )
  it('recovers a 419 session without replaying the intent, and clears local AI copies on logout', async () => {
    const { backend, wrapper } = await conversation()
    backend.failures.push({ method: 'POST', path: /messages$/, status: 419 })
    await send(wrapper)
    expect(button(wrapper, 'Повторити цей запит').attributes('disabled')).toBeDefined()
    await click(wrapper, 'Відновити сеанс')
    expect(
      backend.aiRequests.filter((r) => r.method === 'POST' && r.path.endsWith('/messages')),
    ).toHaveLength(1)
    await click(wrapper, 'Вийти з облікового запису')
    expect(readIntent(1, 1)).toBeNull()
  })
})
describe('explicit AI action lifecycle', () => {
  it('shows an unknown public review safely and permits rejection but never confirmation', async () => {
    const backend = aiBackend()
    backend.addConversation()
    backend.actions.push({
      ...actionFixture(),
      type: 'future_action',
      preview: {
        description: 'Unknown public review',
        details: { value: 'Keep the entire review' },
      },
    })
    const { wrapper } = await renderApp('/ai/conversations/1', backend)
    expect(wrapper.text()).toContain('Keep the entire review')
    expect(button(wrapper, 'Підтвердити зміни').attributes('disabled')).toBeDefined()
    await click(wrapper, 'Відхилити пропозицію')
    expect(backend.executions).toBe(0)
  })
  it('never executes a proposal or conversational yes, then confirms with an empty object and refreshes domain reads', async () => {
    const { backend, wrapper } = await proposal()
    expect(wrapper.findComponent(AiActionReview).props('action').status).toBe('pending')
    expect(backend.executions).toBe(0)
    await send(wrapper, 'так')
    expect(backend.executions).toBe(0)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.executions).toBe(1)
    expect(
      backend.aiRequests.filter((r) => r.method !== 'GET' && !r.path.startsWith('/api/ai/')),
    ).toEqual([])
    expect(backend.aiRequests.find((r) => r.path.endsWith('/confirm'))?.body).toEqual({})
    expect(wrapper.text()).toContain('Квитанція виконання')
    expect(wrapper.find('a[href="/tasks/70"]').exists()).toBe(true)
    expect(backend.aiRequests.some((r) => r.path === '/api/tasks/70' && r.method === 'GET')).toBe(
      true,
    )
  })
  it('rejects a pending proposal without any domain execution', async () => {
    const { backend, wrapper } = await proposal()
    await click(wrapper, 'Відхилити пропозицію')
    expect(backend.executions).toBe(0)
    expect(wrapper.findComponent(AiActionReview).props('action').status).toBe('rejected')
    expect(backend.aiRequests.find((r) => r.path.endsWith('/reject'))?.body).toEqual({})
    expect(wrapper.find('.ai-receipt').exists()).toBe(false)
  })
  it('recovers a lost confirmation response using GET and never automatically posts twice', async () => {
    const { backend, wrapper, fetch } = await proposal()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const result = await fetch(url, init)
        if (url.endsWith('/confirm')) throw new TypeError('lost after commit')
        return result
      }),
    )
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.executions).toBe(1)
    expect(backend.aiRequests.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(1)
    expect(wrapper.text()).toContain('сервер підтвердив виконання')
    expect(wrapper.text()).toContain('Квитанція виконання')
    expect(wrapper.findAll('.ai-event')).toHaveLength(1)
  })
  it('handles a concurrent committed confirmation replay as one durable result', async () => {
    const { backend, wrapper, fetch } = await proposal()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const response = await fetch(url, init)
        if (url.endsWith(`/actions/${actionFixture().id}`) && (init.method ?? 'GET') === 'GET') {
          backend.handle(
            `http://localhost:8000/api/ai/conversations/1/actions/${actionFixture().id}/confirm`,
            'POST',
          )
        }
        return response
      }),
    )
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.executions).toBe(1)
    expect(wrapper.text()).toContain('Повторних змін немає')
    expect(wrapper.findAll('.ai-event')).toHaveLength(1)
  })
  it('prevents duplicate confirmation while the request is pending', async () => {
    const { backend, wrapper, fetch } = await proposal()
    let release: (() => void) | undefined
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
    const confirm = button(wrapper, 'Підтвердити зміни')
    await confirm.trigger('click')
    await flushPromises()
    await confirm.trigger('click')
    expect(posts).toBe(1)
    expect(confirm.attributes('disabled')).toBeDefined()
    release!()
    await flushPromises()
    expect(backend.executions).toBe(1)
  })
  it.each(['action_stale', 'action_conflict', 'action_token_invalid', 'action_validation_failed'])(
    'keeps a failed %s attempt pending but requires a fresh proposal',
    async (code) => {
      const { backend, wrapper } = await proposal('propose_adaptive_replanning')
      for (const checkbox of wrapper.findAll('.ai-consent input')) await checkbox.setValue(true)
      backend.failures.push({
        method: 'POST',
        path: /confirm$/,
        status: code.startsWith('action_token') || code === 'action_validation_failed' ? 422 : 409,
        code,
      })
      await click(wrapper, 'Підтвердити зміни')
      expect(wrapper.findComponent(AiActionReview).props('action').status).toBe('pending')
      expect(button(wrapper, 'Підтвердити зміни').attributes('disabled')).toBeDefined()
      await click(wrapper, 'Оновити дії')
      expect(button(wrapper, 'Підтвердити зміни').attributes('disabled')).toBeDefined()
      expect(backend.executions).toBe(0)
    },
  )
  it('uses server expiration to remove decision controls without inventing a fifth action status', async () => {
    const { backend, wrapper, fetch } = await proposal()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.endsWith('/confirm')) {
          Object.assign(backend.actions[0]!, {
            status: 'expired',
            state: 'expired',
            confirmation_required: false,
          })
          return json({ code: 'action_expired' }, 410)
        }
        return fetch(url, init)
      }),
    )
    await click(wrapper, 'Підтвердити зміни')
    expect(wrapper.findComponent(AiActionReview).props('action').status).toBe('expired')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Підтвердити зміни')).toBe(false)
  })
  it('preserves an executed receipt when refreshing related domain data fails', async () => {
    const { backend, wrapper } = await proposal()
    backend.failures.push({ method: 'GET', path: /tasks\/70$/, status: 503 })
    await click(wrapper, 'Підтвердити зміни')
    expect(wrapper.text()).toContain('Дію виконано, але пов’язані дані не вдалося оновити')
    expect(wrapper.text()).toContain('Квитанція виконання')
    await click(wrapper, 'Оновити пов’язані дані')
    expect(wrapper.text()).not.toContain('Дію виконано, але пов’язані дані не вдалося оновити')
    expect(backend.executions).toBe(1)
  })
  it('renders both destructive consent requirements independently and only sends deliberate booleans', async () => {
    const { backend, wrapper } = await proposal('propose_adaptive_replanning')
    const checkboxes = wrapper.findAll('.ai-consent input')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes.every((input) => !(input.element as HTMLInputElement).checked)).toBe(true)
    expect(wrapper.text()).toContain('Сесії, що звільняються / скасовуються')
    expect(wrapper.text()).toContain('Неперенесена тривалість, с')
    expect(wrapper.text()).toContain('no_replacement_capacity')
    expect(button(wrapper, 'Підтвердити зміни').attributes('disabled')).toBeDefined()
    await checkboxes[0]!.setValue(true)
    expect(button(wrapper, 'Підтвердити зміни').attributes('disabled')).toBeDefined()
    await checkboxes[1]!.setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.aiRequests.find((r) => r.path.endsWith('/confirm'))?.body).toEqual({
      accept_partial: true,
      accept_unplaced_cancellation: true,
    })
    expect(
      backend.aiRequests.some(
        (r) =>
          r.path === '/api/study-sessions' &&
          new URL(r.url).searchParams.get('start_date') === '2026-11-12',
      ),
    ).toBe(true)
  })
  it('preserves the review on missing-consent 422 and allows an explicit corrected decision', async () => {
    const { backend, wrapper } = await proposal('propose_study_plan_create')
    await wrapper.get('.ai-consent input').setValue(true)
    backend.failures.push({
      method: 'POST',
      path: /confirm$/,
      status: 422,
      fields: { accept_partial: ['Explicit consent is required.'] },
    })
    await click(wrapper, 'Підтвердити зміни')
    expect(wrapper.findComponent(AiActionReview).props('action').status).toBe('pending')
    expect(backend.executions).toBe(0)
    expect(wrapper.text()).toContain('Explicit consent is required.')
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.executions).toBe(1)
  })
  it.each([
    'propose_task_create',
    'propose_task_update',
    'propose_task_complete',
    'propose_task_reopen',
    'propose_subtask_create',
    'propose_subtask_update',
    'propose_subtask_complete',
    'propose_subtask_reopen',
    'propose_reminder_create',
    'propose_reminder_update',
    'propose_reminder_cancel',
    'propose_session_reschedule',
  ] as const)('renders %s review and receipt without unrelated consent flags', async (type) => {
    const { backend, wrapper } = await proposal(type)
    if (type === 'propose_session_reschedule')
      expect(wrapper.text()).toContain('Здійсненність інтервалу ще не гарантована')
    if (type === 'propose_reminder_create')
      expect(wrapper.text()).toContain('Час спрацювання (сервер)')
    if (type === 'propose_subtask_create') expect(wrapper.text()).toContain('Батьківське завдання')
    expect(wrapper.findAll('.ai-consent input')).toHaveLength(0)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.aiRequests.find((r) => r.path.endsWith('/confirm'))?.body).toEqual({})
    expect(wrapper.text()).toContain('Квитанція виконання')
  })
})
