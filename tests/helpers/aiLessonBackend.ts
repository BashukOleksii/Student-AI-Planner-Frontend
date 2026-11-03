import { aiBackend, messageFixture } from './aiBackend'
import { lessonReceiptFixture, lessonSnapshot } from './aiLessonFixtures'
import type { MockReply } from './f2Backend'
import type { LessonSnapshot } from '@/types/ai'

// Composition adds only the Stage 11 wire/persisted Lesson projection to existing fixtures.
export function aiLessonBackend() {
  const ai = aiBackend()
  const lessons = new Map<number, LessonSnapshot>([[9, lessonSnapshot()]])
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = []
  let executions = 0
  function handle(
    url: string,
    method = 'GET',
    body: Record<string, unknown> = {},
    headers?: HeadersInit,
  ): MockReply {
    const path = new URL(url).pathname
    requests.push({ path, method, body })
    const decision = path.match(/\/actions\/([^/]+)\/(confirm|reject)$/)
    const action = ai.actions.find((row) => row.id === decision?.[1])
    if (action && action.type.startsWith('propose_lesson_') && method === 'POST') {
      if (Object.keys(body).length)
        return { status: 422, body: { errors: { body: ['Only an empty object is accepted.'] } } }
      if (action.status === 'expired')
        return { status: 410, body: { data: action, replayed: false } }
      if (action.status === 'rejected' && decision![2] === 'confirm')
        return { status: 409, body: { data: action, replayed: false } }
      if (action.status === 'executed' && decision![2] === 'reject')
        return { status: 409, body: { code: 'action_executed' } }
      const replayed = action.status === 'executed'
      if (action.status === 'pending') {
        if (decision![2] === 'confirm') {
          const receipt = lessonReceiptFixture(action)
          lessons.set(receipt.lesson.id, structuredClone(receipt.lesson))
          if (receipt.original) lessons.set(receipt.original.id, structuredClone(receipt.original))
          action.receipt = receipt
          action.status = 'executed'
          executions++
        } else action.status = 'rejected'
        action.state = action.status
        action.confirmation_required = false
        action.resolved_at = '2026-11-03T12:01:00.000000Z'
        const history = ai.messages.get(action.conversation_id)!
        const event = messageFixture(
          Math.max(0, ...history.map((row) => row.id)) + 1,
          'Рішення збережено сервером.',
        )
        event.action_event =
          action.status === 'executed'
            ? { action_id: action.id, status: 'executed', receipt: action.receipt! }
            : { action_id: action.id, status: 'rejected', receipt: null }
        history.push(event)
      }
      return { status: 200, body: { data: action, replayed } }
    }
    const detail = path.match(/^\/api\/lessons\/(\d+)$/)
    if (detail && method === 'GET') {
      const lesson = lessons.get(Number(detail[1]))
      return lesson ? { status: 200, body: { data: lesson } } : { status: 404 }
    }
    if (path.startsWith('/api/schedule/') && method === 'GET') {
      const date = /\d{4}-\d{2}-\d{2}$/.exec(path)?.[0] ?? '2026-11-12'
      return {
        status: 200,
        body: {
          data: [...lessons.values()]
            .filter((l) => l.status === 'active')
            .map((l) => ({ ...l, id: l.id! })),
          meta: { timezone: 'Europe/Kyiv', start_date: date, end_date: date },
        },
      }
    }
    return ai.handle(url, method, body, headers)
  }
  return {
    ai,
    lessons,
    requests,
    handle,
    get executions() {
      return executions
    },
  }
}
