import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { planningBackend } from '../helpers/planningBackend'
import { renderApp } from '../helpers/renderApp'
const windowsPath = '/api/study-availability-windows'
const posts = (backend: ReturnType<typeof planningBackend>) =>
  backend.requests.filter((request) => request.path === windowsPath && request.method === 'POST')
async function submit(wrapper: VueWrapper) {
  await wrapper.get('.availability-setup form').trigger('submit')
  await flushPromises()
}
const windowFor = (day: number, starts_at = '08:00:00', ends_at = '22:00:00') => ({
  id: day + 100,
  day_of_week: day,
  starts_at,
  ends_at,
})
describe('Optional weekly availability setup', () => {
  it('pauses a partial failure and retries only absent days after a fresh server read', async () => {
    const backend = planningBackend()
    let reject = true
    const { wrapper } = await renderApp<{
      handle: typeof backend.handle
    }>('/planning/availability', {
      handle(url, method, body, headers) {
        if (
          new URL(url).pathname === windowsPath &&
          method === 'POST' &&
          body?.day_of_week === 2 &&
          reject
        ) {
          reject = false
          backend.failure = {
            path: /windows$/,
            method: 'POST',
            status: 422,
            fields: { starts_at: ['Перевірте інтервал вівторка.'] },
          }
        }
        return backend.handle(url, method, body, headers)
      },
    })
    await submit(wrapper)
    expect(backend.windows).toHaveLength(1)
    expect(posts(backend)).toHaveLength(2)
    expect(wrapper.text()).toContain('Частину графіка вже збережено')
    expect(wrapper.text()).toContain('час початку: перевірте введене значення.')
    expect(wrapper.text()).not.toContain('Перевірте інтервал вівторка.')
    expect(wrapper.text()).not.toContain('Вибраний графік доступності збережено')
    backend.windows = [...backend.windows, windowFor(3)]
    const before = backend.requests.length
    await submit(wrapper)
    expect(backend.requests[before]?.method).toBe('GET')
    expect(posts(backend).filter((request) => request.body.day_of_week === 1)).toHaveLength(1)
    expect(posts(backend).filter((request) => request.body.day_of_week === 3)).toHaveLength(0)
    expect(backend.windows).toHaveLength(7)
    expect(wrapper.text()).toContain('Підтверджено інтервалів: 7 із 7')
  })
  it('does not automatically replay a lost response or continue writing, and reconciles committed results on explicit retry', async () => {
    const backend = planningBackend()
    const { wrapper } = await renderApp('/planning/availability', backend)
    const realFetch = globalThis.fetch
    let loseResponse = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const response = await realFetch(url, init)
        if (
          url.endsWith(windowsPath) &&
          init.method === 'POST' &&
          loseResponse &&
          JSON.parse(String(init.body)).day_of_week === 2
        ) {
          loseResponse = false
          throw new TypeError('Response lost after commit')
        }
        return response
      }),
    )
    await submit(wrapper)
    await flushPromises()
    expect(posts(backend)).toHaveLength(2)
    expect(backend.windows).toHaveLength(2)
    expect(wrapper.text()).toContain('Автоматичного повтору немає')
    expect(wrapper.text()).not.toContain('Вибраний графік доступності збережено')
    await submit(wrapper)
    expect(posts(backend)).toHaveLength(7)
    expect(new Set(posts(backend).map((request) => request.body.day_of_week)).size).toBe(7)
    expect(backend.windows).toHaveLength(7)
  })
  it('blocks further POSTs when reconciliation cannot read the server, including on another explicit attempt', async () => {
    const backend = planningBackend()
    const { wrapper } = await renderApp('/planning/availability', backend)
    const realFetch = globalThis.fetch
    let wrote = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.endsWith(windowsPath) && init.method === 'GET' && wrote)
          throw new TypeError('Read unavailable')
        const response = await realFetch(url, init)
        if (url.endsWith(windowsPath) && init.method === 'POST') wrote = true
        return response
      }),
    )
    await submit(wrapper)
    expect(posts(backend)).toHaveLength(1)
    expect(wrapper.text()).toContain('Поточний стан сервера не вдалося перевірити')
    expect(wrapper.text()).not.toContain('Вибраний графік доступності збережено')
    await submit(wrapper)
    expect(posts(backend)).toHaveLength(1)
  })
})
