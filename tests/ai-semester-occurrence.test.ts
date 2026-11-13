import { describe, it, expect, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { actionFixture, messageFixture } from './helpers/aiBackend'
import { aiSemesterBackend } from './helpers/aiSemesterBackend'
import {
  occurrencePreview,
  occurrenceType,
  semesterLesson,
  semesterReceipt,
} from './helpers/aiSemesterFixtures'
import { reviewSupported, supportsAction } from '@/utils/ai'
import { semesterOccurrenceAddition, savedSemesterOccurrence } from '@/utils/aiSemester'
import { aiTimeline, occurrenceFailureFallback } from '@/utils/aiTimeline'
import { aiApi } from '@/api/ai'
import type { PublicObject, SentAiTurn } from '@/types/ai'

async function click(wrapper: VueWrapper, label: string) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === label)!
    .trigger('click')
  await flushPromises()
}
async function send(wrapper: VueWrapper, content = 'Додай третю пару на робочу суботу') {
  await wrapper.get('#ai-content').setValue(content)
  await wrapper.get('.ai-composer').trigger('submit')
  await flushPromises()
}
function snapshots(p = occurrencePreview()) {
  const before = p.before as PublicObject,
    after = p.after as PublicObject
  return {
    p,
    before,
    after,
    oldRows: before.lessons as PublicObject[],
    newRows: after.lessons as PublicObject[],
  }
}
const reasons = [
  ['pair_number_taken', 'Цей номер пари вже зайнятий'],
  ['time_overlap', 'Обраний час перетинається з іншим заняттям'],
  ['date_cancelled', 'Цей день скасовано. Спочатку віднови або явно заміни його розклад'],
  [undefined, occurrenceFailureFallback],
  ['unexpected_conflict', occurrenceFailureFallback],
] as const

describe('semester occurrence review proof', () => {
  it('supports one added pair on a Saturday with another previously added pair', () => {
    const action = actionFixture(occurrenceType)
    expect(supportsAction(action)).toBe(true)
    expect(reviewSupported(action)).toBe(true)
    const { p, newRows } = snapshots(action.preview)
    expect(newRows.filter((row) => row.change_kind === 'added')).toHaveLength(2)
    expect(semesterOccurrenceAddition(p.before, p.after, 'Europe/Kyiv')?.lesson.pair_number).toBe(3)
  })
  it('matches existing pairs by displayed semantics even when base-day identities are replaced', () => {
    const { p, before, after, oldRows, newRows } = snapshots()
    before.kind = 'base'
    before.copied_weekday = null
    before.source_week_parity = null
    after.kind = 'replacement'
    after.copied_weekday = null
    after.source_week_parity = null
    for (const row of oldRows) row.occurrence_id = `semester:1:2026-11-14:rule:${row.pair_number}`
    for (const row of newRows)
      row.occurrence_id = `semester:1:2026-11-14:snapshot:new-${row.pair_number}`
    expect(semesterOccurrenceAddition(p.before, p.after, 'Europe/Kyiv')?.lesson.pair_number).toBe(3)
  })
  it('allows an empty base day and reordered unchanged rows', () => {
    const { p, before, after, newRows } = snapshots()
    before.kind = 'base'
    before.copied_weekday = null
    before.source_week_parity = null
    before.lessons = []
    after.kind = 'replacement'
    after.copied_weekday = null
    after.source_week_parity = null
    after.lessons = [newRows[2]!]
    expect(semesterOccurrenceAddition(p.before, p.after, 'Europe/Kyiv')).not.toBeNull()
    const reordered = snapshots()
    reordered.newRows.reverse()
    expect(
      semesterOccurrenceAddition(reordered.p.before, reordered.p.after, 'Europe/Kyiv'),
    ).not.toBeNull()
  })
  it.each([
    'date',
    'pair_number',
    'subject',
    'teacher',
    'starts_at',
    'ends_at',
    'room',
    'lesson_type',
    'pair_label',
    'missing',
    'duplicate',
    'two-additions',
    'metadata',
    'missing-room',
    'missing-teacher',
    'wrong-day',
    'overlap',
  ])('blocks an inconsistent or incomplete review (%s)', (field) => {
    const action = actionFixture(occurrenceType),
      { before, after, newRows } = snapshots(action.preview)
    if (field === 'overlap') newRows[2]!.starts_at = '2026-11-14T10:30:00+02:00'
    else if (field === 'date') after.date = '2026-11-15'
    else if (field === 'missing') after.lessons = newRows.slice(1)
    else if (field === 'duplicate') newRows[2]!.pair_number = 1
    else if (field === 'two-additions')
      newRows.push({ ...semesterLesson(4, '14:00:00', '15:00:00'), change_kind: 'added' })
    else if (field === 'metadata') after.copied_weekday = 5
    else if (field === 'missing-room') delete newRows[2]!.room
    else if (field === 'missing-teacher') delete newRows[2]!.teacher
    else if (field === 'wrong-day') newRows[2]!.starts_at = '2026-11-15T12:00:00+02:00'
    else if (field === 'subject') newRows[0]!.subject = { id: 1, name: 'Інший предмет' }
    else if (field === 'teacher') newRows[0]!.teacher = { id: 1, name: 'Інший викладач' }
    else if (field === 'starts_at' || field === 'ends_at')
      newRows[0]![field] = '2026-11-14T09:15:00+02:00'
    else if (field === 'pair_number') newRows[0]!.pair_number = 4
    else
      newRows[0]![field] =
        field === 'room' ? 'Інша аудиторія' : field === 'lesson_type' ? 'seminar' : 'Інша позначка'
    expect(before.date).toBe('2026-11-14')
    expect(reviewSupported(action)).toBe(false)
  })
  it('validates saved receipt and never interprets projected identities as saved links', () => {
    const action = actionFixture(occurrenceType)
    action.receipt = semesterReceipt(action)
    action.status = 'executed'
    action.confirmation_required = false
    action.state = 'executed'
    expect(savedSemesterOccurrence(action)?.lesson.pair_number).toBe(3)
    const after = action.receipt.after as PublicObject
    for (const row of after.lessons as PublicObject[]) row.occurrence_id = 'persisted-new-identity'
    expect(savedSemesterOccurrence(action)?.lesson.pair_number).toBe(3)
    action.receipt.action_id = 'foreign-action'
    expect(savedSemesterOccurrence(action)).toBeNull()
  })
})

describe.each(reasons)('failure reason %s', (reason, label) => {
  it.each(['post-and-history', 'post-only', 'history'] as const)(
    'renders exactly once through %s and stays in its original turn',
    async (mode) => {
      const backend = aiSemesterBackend()
      backend.ai.addConversation()
      const { wrapper, router } = await renderApp('/ai/conversations/1', backend)
      backend.failNext({ reason, ...(mode === 'post-only' ? { historyReason: null } : {}) })
      await send(wrapper)
      const turn = backend.ai.messages.get(1)!.at(-1)!
      if (mode === 'history') {
        await router.push('/ai')
        await router.push('/ai/conversations/1')
        await flushPromises()
      }
      const failures = wrapper.findAll('.ai-occurrence-failure')
      expect(failures).toHaveLength(1)
      expect(failures[0]!.text()).toBe(label)
      expect(wrapper.get(`[data-message-id="${turn.id}"]`).text()).toContain(label)
      expect(wrapper.text()).toContain('Уточни, будь ласка, яку дату ти маєш на увазі.')
      expect(wrapper.get('.ai-timeline').text()).not.toContain(occurrenceType)
      expect(wrapper.get('.ai-timeline').text()).not.toContain('invalid_arguments')
      await send(wrapper, 'Що в розкладі завтра?')
      expect(wrapper.findAll('.ai-occurrence-failure')).toHaveLength(1)
      expect(wrapper.get(`[data-message-id="${turn.id}"]`).text()).toContain(label)
      expect(wrapper.get('.ai-timeline').text()).toContain('Here is your saved academic answer.')
      expect(wrapper.findAll('.ai-tool')).toHaveLength(0)
    },
  )
})

it('keeps meaningful assistant tool-call text and action results while hiding service rows', () => {
  const user = messageFixture(1, 'Запит', 'user'),
    call = messageFixture(2, 'Уточни потрібний предмет.')
  call.tool_calls = [{ call_id: 'private-call', name: 'search_academic_catalog' }]
  const tool = messageFixture(3, '', 'tool')
  tool.tool_result = {
    call_id: 'private-call',
    name: 'search_academic_catalog',
    ok: true,
    error_code: null,
  }
  const answer = messageFixture(4, 'У суботу дві пари.')
  const event = messageFixture(5, '')
  event.action_event = { action_id: actionFixture().id, status: 'rejected', receipt: null }
  expect(aiTimeline([user, call, tool, answer, event]).map(({ message }) => message.id)).toEqual([
    1, 2, 4, 5,
  ])
})
it('deduplicates persisted POST and GET by IDs, including reused call IDs in later turns', () => {
  const backend = aiSemesterBackend()
  backend.ai.addConversation()
  const failed = {
    call_id: 'reused',
    name: occurrenceType,
    ok: false,
    error_code: 'invalid_arguments',
    error_reason: 'time_overlap',
  }
  const first: SentAiTurn = {
    userContent: 'Однаковий запит',
    result: {
      conversation_id: 1,
      user_message_id: 1,
      assistant_message_id: 4,
      content: 'Перша відповідь',
      tools: [failed],
    },
  }
  const second: SentAiTurn = {
    userContent: 'Однаковий запит',
    result: {
      conversation_id: 1,
      user_message_id: 5,
      assistant_message_id: 8,
      content: 'Друга відповідь',
      tools: [{ ...failed, ok: true, error_code: null }],
    },
  }
  const tool = messageFixture(3, '', 'tool')
  tool.tool_result = failed
  const rows = aiTimeline(
    [messageFixture(1, 'Однаковий запит', 'user'), tool, messageFixture(4, 'Перша відповідь')],
    [first, second],
  )
  expect(rows.filter((row) => row.failure)).toHaveLength(1)
  expect(rows.find((row) => row.failure)?.message.id).toBe(4)
  expect(rows.filter((row) => row.message.id === 4)).toHaveLength(1)
})
it('reads compact POST type from preview.type and preserves error_reason in the API adapter', async () => {
  const backend = aiSemesterBackend()
  backend.ai.addConversation()
  await renderApp('/ai/conversations/1', backend)
  backend.ai.nextType = occurrenceType
  const result = await aiApi.send(1, 'Додай третю пару', crypto.randomUUID())
  expect(result.data.action?.type).toBe(occurrenceType)
  backend.failNext({ reason: 'date_cancelled' })
  const failure = await aiApi.send(1, 'Інша дата', crypto.randomUUID())
  expect(failure.data.tools[0]!.error_reason).toBe('date_cancelled')
  const history = await aiApi.messages(1)
  expect(history.data.find((row) => row.tool_result?.error_reason)?.tool_result?.error_reason).toBe(
    'date_cancelled',
  )
})

it('renders exactly one new pair and only the saved result after confirmation and reopening', async () => {
  const backend = aiSemesterBackend()
  backend.ai.addConversation()
  backend.ai.nextType = occurrenceType
  const { wrapper, router } = await renderApp('/ai/conversations/1', backend)
  await send(wrapper)
  const card = wrapper.get('.ai-action-review')
  expect(card.findAll('.ai-semester-occurrence-create')).toHaveLength(1)
  expect(card.text()).toContain('Пара №3')
  expect(card.text()).toContain('Фізика')
  expect(card.text()).toContain('Олена Коваль')
  expect(card.text()).toContain('12:00 — 13:00 · Europe/Kyiv')
  expect(card.text()).toContain('Ауд. 301')
  expect(card.text()).not.toContain('Предмет 1')
  expect(card.find('.review-comparison').exists()).toBe(false)
  expect(
    card
      .findAll('a')
      .some((link) => /snapshot|occurrence|lessons\//.test(link.attributes('href') ?? '')),
  ).toBe(false)
  expect(backend.ai.executions).toBe(0)
  await click(wrapper, 'Підтвердити зміни')
  expect(backend.ai.executions).toBe(1)
  expect(wrapper.findAll('.ai-semester-occurrence-create')).toHaveLength(1)
  expect(wrapper.get('.ai-receipt').text()).toContain('Пара №3')
  expect(wrapper.findAll('button').some((button) => button.text() === 'Підтвердити зміни')).toBe(
    false,
  )
  await router.push('/ai')
  await router.push('/ai/conversations/1')
  await flushPromises()
  await click(wrapper, 'Переглянути пропозицію')
  expect(wrapper.findAll('.ai-action-review')).toHaveLength(1)
  expect(wrapper.get('.ai-receipt').text()).toContain('Пара №3')
  expect(wrapper.findAll('button').some((button) => button.text() === 'Підтвердити зміни')).toBe(
    false,
  )
})
it('disables confirmation for a contradictory review while leaving rejection available', async () => {
  const backend = aiSemesterBackend()
  backend.ai.addConversation()
  const action = actionFixture(occurrenceType)
  snapshots(action.preview).newRows[0]!.room = 'Інша аудиторія'
  backend.ai.actions.push(action)
  const { wrapper } = await renderApp('/ai/conversations/1', backend)
  expect(
    wrapper
      .findAll('button')
      .find((button) => button.text() === 'Підтвердити зміни')!
      .attributes('disabled'),
  ).toBeDefined()
  await click(wrapper, 'Підтвердити зміни')
  expect(backend.ai.executions).toBe(0)
  await click(wrapper, 'Відхилити пропозицію')
  expect(backend.ai.actions[0]!.status).toBe('rejected')
})
it('does not repeat an uncertain semester write and offers status verification', async () => {
  const backend = aiSemesterBackend()
  backend.ai.addConversation()
  backend.ai.nextType = occurrenceType
  const { wrapper, fetch } = await renderApp('/ai/conversations/1', backend)
  await send(wrapper)
  let lost = false,
    confirms = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/confirm')) {
        confirms++
        lost = true
        throw new TypeError('Lost response')
      }
      if (lost && /\/actions\/[^/?]+$/.test(new URL(url).pathname))
        throw new TypeError('Cannot read state')
      return fetch(url, init)
    }),
  )
  await click(wrapper, 'Підтвердити зміни')
  expect(confirms).toBe(1)
  expect(wrapper.text()).toContain('Перевірити стан дії')
  await click(wrapper, 'Підтвердити зміни')
  expect(confirms).toBe(1)
  expect(wrapper.find('.ai-receipt').exists()).toBe(false)
})
