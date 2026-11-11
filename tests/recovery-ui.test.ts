import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { f2Backend } from './helpers/f2Backend'
function backend(kind = 'replan') {
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
      adaptive_replanning: { session_results: [], summary: { unplaced_sessions: 1 } },
    },
    receipt: null,
    expires_at: '2099-11-02T12:00:00Z',
  }
  return {
    writes,
    handle(url: string, method = 'GET', body = {}) {
      const path = new URL(url).pathname
      if (path.includes('recovery-suggestions')) {
        if (method !== 'GET') {
          writes.push(path)
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
