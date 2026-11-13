import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { recoveryPresentationBackend } from './helpers/recoveryPresentationBackend'
import { planningCheckLabel } from '@/utils/recoveryPresentation'

describe('student recovery page', () => {
  it('keeps header, inbox and direct access after removing only the navigation tab', async () => {
    const backend = recoveryPresentationBackend()
    const { wrapper, router } = await renderApp('/planning', backend)
    expect(wrapper.find('.planning-nav a[href="/planning/suggestions"]').exists()).toBe(false)
    expect(wrapper.get('.planning-attention').attributes('href')).toBe('/planning/suggestions')
    await wrapper.get('.planning-attention').trigger('click')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Пропонуємо перенести'))
    expect(wrapper.text()).toContain('Період огляду: 2026-11-02 — 2026-11-08')
    await router.push('/inbox')
    expect(wrapper.find('a[href="/planning/suggestions"]').exists()).toBe(true)
    await router.push('/planning/suggestions/example')
    await flushPromises()
    expect(wrapper.text()).toContain('Пропозицію ще не збережено')
    expect(backend.writes).toEqual([])
  })
  it.each(['pending', 'failed', 'not_checked', 'clear', 'stale'] as const)(
    'distinguishes %s checks',
    (state) => {
      const check = recoveryPresentationBackend().check
      check.attention_count = 0
      if (state === 'pending') check.check_pending = true
      if (state === 'failed') check.check_failed = true
      if (state === 'not_checked') {
        check.check_state = 'not_checked'
        check.last_successful_check_at = null
      }
      if (state === 'stale') check.review_refresh_required = true
      const labels = {
        pending: 'Перевіряємо план',
        failed: 'Не вдалося перевірити',
        not_checked: 'План ще не перевірено',
        clear: 'Немає дій, які потребують уваги',
        stale: 'Попередній огляд застарів',
      }
      expect(planningCheckLabel(check, false, false)).toBe(labels[state])
    },
  )
  it('marks unverified reviews and keeps confirmation unavailable', async () => {
    const backend = recoveryPresentationBackend()
    backend.check.review_refresh_required = true
    const { wrapper } = await renderApp('/planning/suggestions/example', backend)
    expect(wrapper.text()).toContain('Попередній огляд застарів')
    expect(wrapper.text()).toContain('Актуальність цієї пропозиції не підтверджено')
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')!
        .attributes('disabled'),
    ).toBeDefined()
    expect(backend.writes).toEqual([])
  })
  it('presents plan creation as a recommendation', async () => {
    const backend = recoveryPresentationBackend()
    backend.suggestion.kind = 'create_plan'
    backend.suggestion.review = {
      version: 1,
      kind: 'create_plan',
      new_work_plan: { summary: {}, sessions: [] },
    }
    const { wrapper } = await renderApp('/planning/suggestions', backend)
    expect(wrapper.text()).toContain('Можна створити план')
    expect(wrapper.text()).toContain('Рекомендація:')
    expect(wrapper.text()).not.toContain('Не вдалося розмістити')
  })
})
