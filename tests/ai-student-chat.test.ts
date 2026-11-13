import { describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper, mount } from '@vue/test-utils'
import { aiApi } from '@/api/ai'
import { ApiError } from '@/api/client'
import { aiTimeline, occurrenceFailureFallback } from '@/utils/aiTimeline'
import { reviewSupported } from '@/utils/ai'
import { studentEffects } from '@/utils/aiEffects'
import AiNotice from '@/components/ai/AiNotice.vue'
import { actionFixture, aiBackend, messageFixture } from './helpers/aiBackend'
import { aiSemesterBackend } from './helpers/aiSemesterBackend'
import { renderApp } from './helpers/renderApp'
import type { SentAiTurn, TurnResult } from '@/types/ai'

const ready = 'Пропозицію підготовлено до підтвердження. Зміни ще не виконано.'
const notCreated = 'Пропозицію не створено. Зміни не виконано.'
async function click(wrapper: VueWrapper, label: string) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === label)!
    .trigger('click')
  await flushPromises()
}
async function send(wrapper: VueWrapper, content = 'Створи завдання') {
  await wrapper.get('#ai-content').setValue(content)
  await wrapper.get('.ai-composer').trigger('submit')
  await flushPromises()
}
function cleanCard(wrapper: VueWrapper) {
  const card = wrapper.get('.ai-action-review')
  expect(card.findAll('details, .tool-metadata, .ai-evidence-fields, code')).toHaveLength(0)
  for (const text of [
    'Технічні деталі',
    'call_id',
    'confirmation_required',
    'target_hash',
    'Server-reviewed',
    actionFixture().id,
  ])
    expect(card.text()).not.toContain(text)
}

describe('student AI message provenance', () => {
  it('keeps one Task card without a server bubble after POST, replay and reopening history', async () => {
    const backend = aiBackend()
    backend.addConversation()
    backend.nextType = 'propose_task_create'
    const { wrapper, router } = await renderApp('/ai/conversations/1', backend)
    await send(wrapper)
    expect(wrapper.findAll('.ai-action-review')).toHaveLength(1)
    expect(wrapper.findAll('.ai-assistant')).toHaveLength(0)
    cleanCard(wrapper)
    expect(backend.executions).toBe(0)
    const request = backend.aiRequests.find(
      (row) => row.method === 'POST' && row.path.endsWith('/messages'),
    )!
    const key = request.key!
    const replay = (await aiApi.send(1, 'Створи завдання', key)).data
    expect(replay.server_message).toEqual({
      kind: 'proposal_ready',
      action_id: backend.actions[0]!.id,
    })
    expect((await aiApi.messages(1)).data.at(-1)?.server_message).toEqual(replay.server_message)
    await router.push('/ai')
    await router.push('/ai/conversations/1')
    await flushPromises()
    expect(wrapper.findAll('.ai-action-review')).toHaveLength(1)
    expect(wrapper.findAll('.ai-assistant')).toHaveLength(0)
    cleanCard(wrapper)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.executions).toBe(1)
    expect(wrapper.findAll('.ai-event')).toHaveLength(0)
    expect(wrapper.get('.ai-receipt').text()).toContain('AI-created task')
    cleanCard(wrapper)
    expect(wrapper.text()).not.toContain(ready)
  })

  it('uses the POST marker if history is temporarily unavailable', async () => {
    const backend = aiBackend()
    backend.addConversation()
    backend.nextType = 'propose_task_create'
    const { wrapper } = await renderApp('/ai/conversations/1', backend)
    backend.failures.push({ method: 'GET', path: /messages$/, status: 503 })
    await send(wrapper)
    expect(wrapper.findAll('.ai-action-review')).toHaveLength(1)
    expect(wrapper.findAll('.ai-user')).toHaveLength(1)
    expect(wrapper.findAll('.ai-assistant')).toHaveLength(0)
  })

  it('shows a Ukrainian summary when the marked card is missing, not selected or belongs to another conversation', () => {
    const row = messageFixture(2, 'untrusted server summary')
    row.server_message = { kind: 'proposal_ready', action_id: actionFixture().id }
    expect(aiTimeline([row])[0]?.message.content).toBe(ready)
    expect(aiTimeline([row], [], actionFixture('propose_task_create', 2))[0]?.message.content).toBe(
      ready,
    )
    const turn: SentAiTurn = {
      userContent: 'Запит',
      result: {
        conversation_id: 1,
        user_message_id: 1,
        assistant_message_id: 2,
        content: row.content!,
        tools: [],
        server_message: row.server_message,
      },
    }
    expect(aiTimeline([row], [turn], { ...actionFixture(), conversation_id: 2 })).toHaveLength(2)
    expect(aiTimeline([row], [turn], actionFixture())).toHaveLength(1)
  })

  it.each([{ kind: 'future_kind' }, { kind: 'proposal_ready', action_id: 'broken' }, null])(
    'ignores unknown/malformed metadata %j through the API and keeps substantive tool-call text',
    async (marker) => {
      const backend = aiBackend()
      backend.addConversation()
      const call = {
        ...messageFixture(2, 'Please specify Linear Algebra, пані Smith.'),
        server_message: marker,
      }
      call.tool_calls = [{ call_id: 'call-meaningful', name: 'list_tasks' }]
      backend.messages.set(1, [
        messageFixture(1, 'Question', 'user'),
        call as unknown as ReturnType<typeof messageFixture>,
      ])
      const { wrapper } = await renderApp('/ai/conversations/1', backend)
      const rows = (await aiApi.messages(1)).data
      expect(rows[1]).not.toHaveProperty('server_message')
      expect(wrapper.get('.ai-timeline').text()).toContain(
        'Please specify Linear Algebra, пані Smith.',
      )
      expect(wrapper.get('.ai-timeline').text()).not.toContain('call-meaningful')
    },
  )

  it('localizes exact legacy summaries but only hides the verified POST-linked summary with a displayed card', () => {
    const content = 'Task action proposed. Confirmation is required; no task has changed.'
    const message = messageFixture(2, content)
    const action = actionFixture()
    expect(aiTimeline([message], [], action)[0]?.message.content).toBe(ready)
    expect(aiTimeline([messageFixture(3, ready)], [], action)[0]?.message.content).toBe(ready)
    const turn: SentAiTurn = {
      userContent: 'Запит',
      result: {
        conversation_id: 1,
        user_message_id: 1,
        assistant_message_id: 2,
        content,
        tools: [],
        action: { ...action, state: 'confirmation_required' },
      },
    }
    expect(aiTimeline([message], [turn], action).map((row) => row.message.role)).toEqual(['user'])
    expect(aiTimeline([messageFixture(3, `Цитата: ${content}`)])[0]?.message.content).toBe(
      `Цитата: ${content}`,
    )
    for (const domain of [
      'Subtask',
      'Reminder',
      'Planning',
      'Lesson',
      'Availability',
      'Semester',
    ]) {
      expect(
        aiTimeline([
          messageFixture(
            3,
            `${domain} action proposed. Confirmation is required; no business data has changed.`,
          ),
        ])[0]?.message.content,
      ).toBe(ready)
      expect(
        aiTimeline([
          messageFixture(
            3,
            `No ${domain.toLowerCase()} action was prepared. No business data has changed.`,
          ),
        ])[0]?.message.content,
      ).toBe(notCreated)
    }
  })

  it('does not infer a current status from the ready marker, and retains unmatched action events', () => {
    const action = actionFixture()
    const summary = messageFixture(2, ready)
    summary.server_message = { kind: 'proposal_ready', action_id: action.id }
    const event = messageFixture(3, 'Task action rejected. No task was changed.')
    event.action_event = { action_id: action.id, status: 'rejected', receipt: null }
    expect(aiTimeline([summary, event], [], action).map((row) => row.message.id)).toEqual([3])
    expect(aiTimeline([summary, event], [], { ...action, status: 'rejected' })).toEqual([])
    expect(action.status).toBe('pending')
  })
})

const reasons = [
  ['pair_number_taken', 'Цей номер пари вже зайнятий'],
  ['time_overlap', 'Обраний час перетинається з іншим заняттям'],
  ['date_cancelled', 'Цей день скасовано. Спочатку віднови або явно заміни його розклад'],
  [undefined, occurrenceFailureFallback],
  ['unknown_reason', occurrenceFailureFallback],
] as const
it.each(reasons)(
  'replaces a marked failure summary with one reason %s after POST, replay, reopening and a later turn',
  async (reason, label) => {
    const source = aiSemesterBackend()
    source.ai.addConversation()
    source.failNext({ reason, content: notCreated })
    const backend = {
      handle: ((...args) => {
        const response = source.handle(...args)
        if (
          args[1] === 'POST' &&
          new URL(args[0]).pathname.endsWith('/messages') &&
          response.status === 200
        ) {
          const result = (response.body as { data: TurnResult }).data
          if (result.tools.some((tool) => !tool.ok)) {
            result.server_message = { kind: 'proposal_not_created' }
            source.ai.messages
              .get(result.conversation_id)!
              .find((row) => row.id === result.assistant_message_id)!.server_message =
              result.server_message
          }
        }
        return response
      }) satisfies typeof source.handle,
    }
    const { wrapper, router } = await renderApp('/ai/conversations/1', backend)
    await send(wrapper)
    expect(wrapper.findAll('.ai-assistant')).toHaveLength(1)
    expect(wrapper.findAll('.ai-occurrence-failure')).toHaveLength(1)
    expect(wrapper.get('.ai-occurrence-failure').text()).toBe(label)
    expect(wrapper.text()).not.toContain(notCreated)
    const firstId = wrapper.get('.ai-assistant').attributes('data-message-id')
    const request = source.ai.aiRequests.find(
      (row) => row.method === 'POST' && row.path.endsWith('/messages'),
    )!
    await aiApi.send(1, 'Створи завдання', request.key!)
    await router.push('/ai')
    await router.push('/ai/conversations/1')
    await flushPromises()
    expect(wrapper.findAll('.ai-occurrence-failure')).toHaveLength(1)
    expect(wrapper.get('.ai-assistant').attributes('data-message-id')).toBe(firstId)
    await send(wrapper, 'Звичайна відповідь після читання')
    expect(wrapper.findAll('.ai-occurrence-failure')).toHaveLength(1)
    expect(wrapper.get(`[data-message-id="${firstId}"]`).text()).toContain(label)
    expect(wrapper.text()).toContain('Here is your saved academic answer.')
    expect(wrapper.text()).not.toContain(notCreated)
  },
)

it('shows one generic marked failure without a tool or card, preserving the next answer', () => {
  const row = messageFixture(2, 'No raw service text')
  row.server_message = { kind: 'proposal_not_created' }
  const next = messageFixture(4, 'Meaningful answer')
  const rows = aiTimeline([
    messageFixture(1, 'Запит', 'user'),
    row,
    messageFixture(3, 'Інше', 'user'),
    next,
  ])
  expect(rows.find((entry) => entry.message.id === 2)?.message.content).toBe(notCreated)
  expect(rows.at(-1)?.message.content).toBe('Meaningful answer')
})

it('blocks corrupted/unknown reviews without exposing the raw payload and leaves rejection available', async () => {
  const backend = aiBackend()
  backend.addConversation()
  const action = actionFixture()
  action.preview = {
    action: action.type,
    confirmation_required: true,
    before: null,
    changes: { status: 'raw_status', secret_key: 'PRIVATE_REVIEW' },
    effects: ['PRIVATE_EFFECT'],
  }
  expect(reviewSupported(action)).toBe(false)
  backend.actions.push(action)
  const { wrapper } = await renderApp('/ai/conversations/1', backend)
  expect(wrapper.get('.ai-action-review').text()).toContain('Не вдалося перевірити огляд')
  cleanCard(wrapper)
  expect(wrapper.text()).not.toContain('PRIVATE_REVIEW')
  expect(wrapper.text()).not.toContain('PRIVATE_EFFECT')
  await click(wrapper, 'Підтвердити зміни')
  expect(backend.executions).toBe(0)
  await click(wrapper, 'Відхилити пропозицію')
  expect(backend.actions[0]?.status).toBe('rejected')
})

it('shows reviewed cancellation counts without session IDs or inferred counts', async () => {
  const backend = aiBackend()
  backend.addConversation()
  const action = actionFixture('propose_task_complete')
  action.preview.completion_review = { future_sessions_count: 3, message: 'PRIVATE_REVIEW_TEXT' }
  backend.actions.push(action)
  const { wrapper } = await renderApp('/ai/conversations/1', backend)
  expect(wrapper.text()).toContain('Майбутні сесії буде скасовано: 3')
  expect(wrapper.text()).not.toContain('PRIVATE_REVIEW_TEXT')
  cleanCard(wrapper)
})

it('hides unknown API text/codes/fields, retains an uncertain decision and performs no automatic repeat write', async () => {
  const backend = aiBackend()
  backend.addConversation()
  backend.actions.push(actionFixture())
  const { wrapper, fetch } = await renderApp('/ai/conversations/1', backend)
  let written = false,
    writes = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/confirm')) {
        writes++
        written = true
        throw new ApiError(500, { private_field: ['PRIVATE_ERROR'] }, null, 'internal_unknown_code')
      }
      if (written && /\/actions\/[^/?]+$/.test(new URL(url).pathname))
        throw new Error('PRIVATE_NETWORK')
      return fetch(url, init)
    }),
  )
  await click(wrapper, 'Підтвердити зміни')
  expect(wrapper.text()).toContain('Результат підтвердження ще не відомий')
  for (const text of ['PRIVATE_ERROR', 'PRIVATE_NETWORK', 'internal_unknown_code'])
    expect(wrapper.text()).not.toContain(text)
  expect(wrapper.find('.ai-receipt').exists()).toBe(false)
  await click(wrapper, 'Підтвердити зміни')
  expect(writes).toBe(1)
  written = false
  await click(wrapper, 'Перевірити стан дії')
  expect(writes).toBe(1)
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === 'Підтвердити зміни')!
      .attributes('disabled'),
  ).toBeUndefined()
})

it('does not display raw API field messages even with an unknown error', () => {
  const wrapper = mount(AiNotice, {
    props: { error: new ApiError(422, { arbitrary: ['PRIVATE_RAW'] }, null, 'UNKNOWN') },
  })
  expect(wrapper.text()).toContain('Перевірте введені дані')
  expect(wrapper.text()).not.toContain('PRIVATE_RAW')
  expect(wrapper.text()).not.toContain('UNKNOWN')
})

it.each(['unknown_effect', 'bad_timestamp', 'undisclosed_field', 'bad_completion_count'])(
  'does not confirm a known Task type with %s',
  (damage) => {
    const action = actionFixture()
    if (damage === 'unknown_effect') action.preview.effects = ['UNRECOGNIZED_EFFECT']
    if (damage === 'bad_timestamp')
      (action.preview.changes as Record<string, string>).deadline_at = 'INVALID_DATE'
    if (damage === 'undisclosed_field')
      (action.preview.changes as Record<string, string>).future_flag = 'PRIVATE'
    if (damage === 'bad_completion_count')
      action.preview.completion_review = { future_sessions_count: 'three' }
    expect(reviewSupported(action)).toBe(false)
  },
)
it.each(['summary', 'sessions', 'work_results', 'warnings'])(
  'blocks a damaged plan %s without bypassing its separate consent',
  (field) => {
    const action = actionFixture('propose_study_plan_create')
    ;(action.preview.review as Record<string, string>)[field] = 'BROKEN_REVIEW'
    expect(reviewSupported(action)).toBe(false)
  },
)
it('suppresses a stale attempt only when the displayed card already requires a new review', () => {
  const action = actionFixture()
  const event = messageFixture(
    3,
    'Planning action confirmation failed. No business data was changed.',
  )
  event.action_event = {
    action_id: action.id,
    status: 'failed',
    error_code: 'action_stale',
    receipt: null,
  }
  expect(aiTimeline([event], [], action)).toHaveLength(1)
  expect(aiTimeline([event], [], action, true)).toHaveLength(0)
  expect(aiTimeline([event], [], null, true)).toHaveLength(1)
})
it('discloses current Ukrainian effects and reviewed completion counts, never arbitrary effect text', () => {
  const action = actionFixture('propose_task_complete')
  const description =
    'Після підтвердження завдання буде завершено, а залежні заплановані нагадування та майбутні заплановані сесії — скасовано. Стани підзавдань та історія сесій збережуться.'
  const message =
    'Для цієї роботи заплановано ще 2 майбутні сесії. Після завершення їх буде скасовано'
  action.preview.completion_review = { future_sessions_count: 2, message }
  action.preview.effects = [description, message]
  expect(reviewSupported(action)).toBe(true)
  expect(studentEffects(action.preview.effects)).toEqual([description])
  expect(studentEffects(['PRIVATE_EFFECT', { status: 'raw_status' }])).toEqual([])
})

it.each(['missing_time', 'unknown_status', 'undisclosed_field'])(
  'blocks an unreadable reminder %s',
  (damage) => {
    const action = actionFixture('propose_reminder_create')
    const changes = action.preview.changes as Record<string, string>
    if (damage === 'missing_time') changes.trigger_at = 'INVALID_DATE'
    if (damage === 'unknown_status') changes.status = 'UNKNOWN_STATUS'
    if (damage === 'undisclosed_field') changes.future_flag = 'PRIVATE'
    expect(reviewSupported(action)).toBe(false)
  },
)
