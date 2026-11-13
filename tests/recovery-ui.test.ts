import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { f2Backend } from './helpers/f2Backend'
function backend(kind = 'replan', remainder = 1200, confirmable = false) {
  const base = f2Backend()
  const writes: string[] = []
  const suggestion = {
    id: 'review',
    kind,
    status: 'pending',
    actionable: kind === 'replan',
    confirmation_required: kind === 'replan',
    requires_lifecycle_decision: kind === 'decision_required',
    period: { start_date: '2026-11-02', end_date: '2026-11-08', timezone: 'Europe/Kyiv' },
    required_confirmation_fields: ['accept_partial', 'accept_unplaced_cancellation'],
    review: {
      version: 1,
      kind,
      adaptive_replanning: {
        session_results: [],
        summary: { unplaced_sessions: 1, untransferred_seconds: remainder },
      },
    },
    receipt: null as Record<string, unknown> | null,
    expires_at: '2099-11-02T12:00:00Z',
  }
  return {
    writes,
    suggestion,
    handle(url: string, method = 'GET', body = {}) {
      const path = new URL(url).pathname
      if (path.includes('recovery-suggestions')) {
        if (method !== 'GET') {
          writes.push(path)
          if (confirmable && path.endsWith('/confirm')) {
            suggestion.status = 'applied'
            suggestion.receipt = { result: { summary: { not_transferred_seconds: remainder } } }
            return { status: 200, body: { data: suggestion, replayed: false } }
          }
          return { status: 409, body: { code: 'suggestion_stale' } }
        }
        return {
          status: 200,
          body: path.endsWith('/review')
            ? { data: suggestion }
            : {
                data: [suggestion],
                meta: { current_page: 1, last_page: 1 },
                automation: { last_scanned_at: null },
              },
        }
      }
      return base.handle(url, method, body)
    },
  }
}
describe('recovery review consent and reconciliation', () => {
  it('requires both consents, then blocks stale writes until an explicit read', async () => {
    const mock = backend()
    const { wrapper } = await renderApp('/planning/suggestions', mock)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Переглянути')!
      .trigger('click')
    await flushPromises()
    const confirm = () => wrapper.findAll('button').find((b) => b.text() === 'Підтвердити зміни')!
    expect(confirm().attributes('disabled')).toBeDefined()
    await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(true)
    expect(confirm().attributes('disabled')).toBeDefined()
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true)
    expect(confirm().attributes('disabled')).toBeUndefined()
    await confirm().trigger('click')
    await flushPromises()
    expect(mock.writes).toHaveLength(1)
    expect(confirm().attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Перевірте поточний стан')
  })
  for (const kind of ['decision_required', 'warning'])
    it(`cannot confirm ${kind}`, async () => {
      const mock = backend(kind)
      const { wrapper } = await renderApp('/planning/suggestions', mock)
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Переглянути')!
        .trigger('click')
      await flushPromises()
      for (const checkbox of wrapper.findAll('input[type="checkbox"]'))
        await checkbox.setValue(true)
      expect(
        wrapper
          .findAll('button')
          .find((b) => b.text() === 'Підтвердити зміни')!
          .attributes('disabled'),
      ).toBeDefined()
      expect(mock.writes).toEqual([])
    })
})

describe('replanning period and remaining work', () => {
  it.each([1200, 0])(
    'shows API period before confirmation and in saved history (%s seconds)',
    async (remainder) => {
      const mock = backend('replan', remainder, true)
      const { wrapper, router } = await renderApp('/planning/suggestions/review', mock)
      const period = 'Період перепланування: 2026-11-02 — 2026-11-08 (Europe/Kyiv)'
      const explanation = remainder
        ? 'У цьому періоді не знайдено нового часу для 20 хв роботи'
        : 'Увесь час, який потрібно було перенести, розміщено'
      expect(wrapper.text()).toContain(period)
      expect(wrapper.text()).toContain(explanation)
      const detail = wrapper.get('[aria-label="Огляд пропозиції"]')
      expect(detail.text().indexOf(period)).toBeLessThan(detail.text().indexOf('Підтвердити зміни'))
      const link = wrapper.findAll('a').find((a) => a.text() === 'Перепланувати за інший період')!
      expect(link.attributes('href')).toBe(
        '/planning/replanning?start_date=2026-11-02&end_date=2026-11-08',
      )
      for (const checkbox of wrapper.findAll('input[type="checkbox"]'))
        await checkbox.setValue(true)
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')!
        .trigger('click')
      await flushPromises()
      expect(wrapper.text().split(period)).toHaveLength(3)
      expect(wrapper.text().split(explanation)).toHaveLength(3)
      await router.push('/planning/suggestions?status=all')
      await router.push('/planning/suggestions/review?status=all')
      await flushPromises()
      expect(wrapper.text()).toContain('Збережений результат')
      expect(wrapper.text().split(period)).toHaveLength(3)
      expect(wrapper.text().split(explanation)).toHaveLength(3)
    },
  )
})
