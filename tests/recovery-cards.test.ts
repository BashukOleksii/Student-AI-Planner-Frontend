import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { recoveryCardsBackend } from './helpers/recoveryCardsBackend'

describe('recovery suggestion cards', () => {
  it.each([1, 5])(
    'renders %s separate cards beneath their groups without footer or single-page controls',
    async (count) => {
      const backend = recoveryCardsBackend(count)
      const { wrapper, router } = await renderApp('/planning/suggestions', backend)
      expect(wrapper.findAll('.suggestion-card.card')).toHaveLength(count)
      expect(wrapper.findAll('.suggestion-group')).toHaveLength(Math.min(count, 4))
      for (const card of wrapper.findAll('.suggestion-card')) {
        expect(card.text()).toContain('Очікує рішення')
        expect(card.text()).toContain('2026-11-02 — 2026-11-08')
        expect(card.findAll('button')).toHaveLength(1)
      }
      expect(wrapper.find('.list-row').exists()).toBe(false)
      expect(wrapper.find('.suggestion-pagination').exists()).toBe(false)
      expect(wrapper.text()).not.toMatch(
        /Діагностика за період|Створити план вручну|Відновлення окремої роботи/,
      )
      expect(wrapper.find('form').exists()).toBe(false)
      await wrapper.get('.suggestion-card button').trigger('click')
      await vi.waitFor(() =>
        expect(router.currentRoute.value.path).toBe('/planning/suggestions/card-0'),
      )
      await flushPromises()
      expect(wrapper.find('[aria-label="Огляд пропозиції"]').exists()).toBe(true)
      expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
      expect(backend.requests.some((request) => request.path.includes('/diagnostics'))).toBe(false)
    },
  )
  it('keeps the history filter and server page navigation when multiple pages exist', async () => {
    const backend = recoveryCardsBackend(2, 2)
    const { wrapper } = await renderApp('/planning/suggestions', backend)
    expect(wrapper.get('.suggestion-pagination button').attributes('disabled')).toBeDefined()
    await wrapper.findAll('.suggestion-pagination button')[1]!.trigger('click')
    await flushPromises()
    expect(backend.requests.some((request) => request.search.includes('page=2'))).toBe(true)
    expect(
      wrapper.findAll('.suggestion-pagination button')[1]!.attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('#recovery-status').setValue('all')
    await flushPromises()
    expect(backend.requests.at(-1)?.search).toContain('status=all')
    expect(backend.requests.at(-1)?.search).toContain('page=1')
  })
  it('opens one inline detail, switches cards and collapses without writing', async () => {
    const backend = recoveryCardsBackend(2)
    const initialStatuses = backend.suggestions.map((item) => item.status)
    const { wrapper, router } = await renderApp('/planning/suggestions', backend)
    const toggle = (id: number) => wrapper.get(`#suggestion-toggle-card-${id}`)
    expect(wrapper.findAll('[aria-label="Огляд пропозиції"]')).toHaveLength(0)
    expect(toggle(0).attributes('aria-expanded')).toBe('false')
    await toggle(0).trigger('click')
    await vi.waitFor(() =>
      expect(
        wrapper.findAll('.suggestion-card')[0]!.find('[aria-label="Огляд пропозиції"]').exists(),
      ).toBe(true),
    )
    expect(toggle(0).text()).toBe('Згорнути')
    expect(toggle(0).attributes('aria-expanded')).toBe('true')
    await toggle(1).trigger('click')
    await vi.waitFor(() => expect(toggle(1).text()).toBe('Згорнути'))
    await flushPromises()
    expect(toggle(0).text()).toBe('Переглянути')
    expect(wrapper.findAll('[aria-label="Огляд пропозиції"]')).toHaveLength(1)
    expect(
      wrapper.findAll('.suggestion-card')[1]!.find('[aria-label="Огляд пропозиції"]').exists(),
    ).toBe(true)
    await toggle(1).trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/planning/suggestions'))
    await flushPromises()
    expect(wrapper.find('[aria-label="Огляд пропозиції"]').exists()).toBe(false)
    expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
    expect(backend.suggestions.map((item) => item.status)).toEqual(initialStatuses)
  })

  it('opens a direct off-page review and preserves history filter and page on collapse', async () => {
    const backend = recoveryCardsBackend(2, 2)
    const direct = backend.suggestions.shift()!
    const mock = {
      handle(url: string, method = 'GET', body = {}) {
        if (new URL(url).pathname.endsWith('/card-0') && method === 'GET')
          return { status: 200, body: { data: direct } }
        return backend.handle(url, method, body)
      },
    }
    const { wrapper, router } = await renderApp(
      '/planning/suggestions/card-0?status=all&page=2',
      mock,
    )
    expect(wrapper.get<HTMLSelectElement>('#recovery-status').element.value).toBe('all')
    expect(wrapper.get('.suggestion-pagination').text()).toContain('2 / 2')
    expect(wrapper.get('#suggestion-toggle-card-0').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.suggestion-card .suggestion-details').exists()).toBe(true)
    await wrapper.get('#suggestion-toggle-card-0').trigger('click')
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe('/planning/suggestions?status=all&page=2'),
    )
    await flushPromises()
    expect(wrapper.get<HTMLSelectElement>('#recovery-status').element.value).toBe('all')
    expect(wrapper.get('.suggestion-pagination').text()).toContain('2 / 2')
    expect(wrapper.find('.suggestion-details').exists()).toBe(false)
    expect(wrapper.find('#suggestion-toggle-card-0').exists()).toBe(false)
    expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
  })
})
