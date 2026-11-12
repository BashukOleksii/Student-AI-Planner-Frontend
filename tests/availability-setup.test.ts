import { describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { planningBackend } from './helpers/planningBackend'

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
  it('offers seven editable 08:00–22:00 days without any writes on opening', async () => {
    const backend = planningBackend()
    const { wrapper } = await renderApp('/planning/availability', backend)
    expect(wrapper.text()).toContain('Налаштуйте час для самостійного навчання')
    expect(wrapper.text()).toContain('Це необов’язкова пропозиція')
    expect(wrapper.text()).toContain('Europe/Kyiv')
    expect(wrapper.text()).toContain('користувацькі обмеження відсутні')
    for (let day = 1; day <= 7; day++) {
      expect((wrapper.get(`#setup-day-${day}`).element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.get(`#setup-start-${day}`).element as HTMLInputElement).value).toBe('08:00')
      expect((wrapper.get(`#setup-end-${day}`).element as HTMLInputElement).value).toBe('22:00')
    }
    expect(wrapper.find('.availability-week').exists()).toBe(false)
    expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
  })

  it('keeps existing windows and does not offer the initial draft', async () => {
    const backend = planningBackend()
    backend.windows = [windowFor(3, '17:30:00', '19:00:00')]
    const before = structuredClone(backend.windows)
    const { wrapper } = await renderApp('/planning/availability', backend)
    expect(wrapper.find('.availability-setup').exists()).toBe(false)
    expect(wrapper.text()).toContain('17:30 — 19:00')
    expect(backend.windows).toEqual(before)
    expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
  })

  it('creates only explicitly chosen days in order, reconciles each POST and leaves preferences unchanged', async () => {
    const backend = planningBackend()
    const preferences = structuredClone(backend.preferences)
    const { wrapper } = await renderApp('/planning/availability', backend)
    for (const day of [2, 4, 5, 6, 7]) await wrapper.get(`#setup-day-${day}`).setValue(false)
    await wrapper.get('#setup-start-1').setValue('09:15')
    await wrapper.get('#setup-end-1').setValue('21:30')
    expect(wrapper.get('.availability-summary').text()).toContain('Понеділок: 09:15–21:30')
    expect(posts(backend)).toHaveLength(0)
    await submit(wrapper)
    expect(posts(backend).map((request) => request.body)).toEqual([
      { day_of_week: 1, starts_at: '09:15:00', ends_at: '21:30:00' },
      { day_of_week: 3, starts_at: '08:00:00', ends_at: '22:00:00' },
    ])
    expect(
      backend.requests
        .filter((request) => request.path === windowsPath)
        .map((request) => request.method),
    ).toEqual(['GET', 'GET', 'POST', 'GET', 'POST', 'GET', 'GET'])
    expect(wrapper.text()).toContain('Підтверджено інтервалів: 2 із 2')
    expect(wrapper.text()).toContain('Вибраний графік доступності збережено')
    expect(backend.preferences).toEqual(preferences)
    expect(
      backend.requests
        .filter((request) => request.method !== 'GET')
        .every((request) => request.path === windowsPath),
    ).toBe(true)
  })

  it('pauses a partial failure and retries only absent days after a fresh server read', async () => {
    const backend = planningBackend()
    let reject = true
    const { wrapper } = await renderApp<{ handle: typeof backend.handle }>(
      '/planning/availability',
      {
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
      },
    )
    await submit(wrapper)
    expect(backend.windows).toHaveLength(1)
    expect(posts(backend)).toHaveLength(2)
    expect(wrapper.text()).toContain('Частину графіка вже збережено')
    expect(wrapper.text()).toContain('Перевірте інтервал вівторка.')
    expect(wrapper.text()).not.toContain('Вибраний графік доступності збережено')
    // Another tab completed Wednesday; the explicit retry must discover and skip it too.
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

  it('preserves a conflicting window added in another tab and stops without overwriting it', async () => {
    const backend = planningBackend()
    const { wrapper } = await renderApp('/planning/availability', backend)
    backend.windows = [windowFor(1, '09:00:00', '12:00:00')]
    await submit(wrapper)
    expect(posts(backend)).toHaveLength(0)
    expect(backend.windows).toEqual([windowFor(1, '09:00:00', '12:00:00')])
    expect(wrapper.text()).toContain('Наявний час не змінено')
  })

  it('validates the full draft before any POST, including no selected days', async () => {
    const backend = planningBackend()
    const { wrapper } = await renderApp('/planning/availability', backend)
    await wrapper.get('#setup-end-7').setValue('07:00')
    await submit(wrapper)
    expect(wrapper.text()).toContain('Неділя: Кінець має бути пізніше початку')
    expect(posts(backend)).toHaveLength(0)
    for (let day = 1; day <= 7; day++) await wrapper.get(`#setup-day-${day}`).setValue(false)
    await submit(wrapper)
    expect(wrapper.text()).toContain('Виберіть хоча б один день')
    expect(posts(backend)).toHaveLength(0)
  })

  it('stops the remaining writes if the page is left during a request', async () => {
    const backend = planningBackend()
    const { wrapper, router } = await renderApp('/planning/availability', backend)
    const realFetch = globalThis.fetch
    let resolvePost!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const response = await realFetch(url, init)
        if (url.endsWith(windowsPath) && init.method === 'POST')
          return new Promise<Response>((resolve) => {
            resolvePost = () => resolve(response)
          })
        return response
      }),
    )
    await wrapper.get('.availability-setup form').trigger('submit')
    await flushPromises()
    expect(posts(backend)).toHaveLength(1)
    await router.push('/planning/preview')
    await flushPromises()
    resolvePost(new Response())
    await flushPromises()
    expect(posts(backend)).toHaveLength(1)
  })

  it('can open a fresh plan preview after saving, without creating sessions', async () => {
    const backend = planningBackend()
    const { wrapper, router } = await renderApp('/planning/availability', backend)
    await submit(wrapper)
    expect(wrapper.get('.availability-plan-link').attributes('href')).toBe('/planning/preview')
    await router.push('/planning/preview')
    await flushPromises()
    expect(wrapper.text()).not.toContain(
      'Для автоматичного планування ще не визначено доступний час',
    )
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Створити огляд')!
      .trigger('click')
    await flushPromises()
    expect(
      backend.requests.some((request) => request.path === '/api/planning/study-plans/preview'),
    ).toBe(true)
    expect(backend.requests.some((request) => request.path.endsWith('/confirm'))).toBe(false)
    expect(backend.sessions).toEqual([])
  })
})

describe('Missing availability explanations', () => {
  it.each(['/planning', '/planning/preview', '/planning/free-time'])(
    'shows the setup link only for a verified empty list on %s',
    async (path) => {
      const backend = planningBackend()
      const { wrapper } = await renderApp(path, backend)
      expect(wrapper.text()).toContain('Для автоматичного планування ще не визначено доступний час')
      expect(wrapper.find('aside a[href="/planning/availability"]').exists()).toBe(true)
      expect(posts(backend)).toHaveLength(0)
    },
  )

  it.each(['/planning', '/planning/preview', '/planning/free-time'])(
    'does not call configured but occupied time unconfigured on %s',
    async (path) => {
      const backend = planningBackend()
      backend.windows = [windowFor(1)]
      const { wrapper } = await renderApp<{ handle: typeof backend.handle }>(path, {
        handle(url, method, body, headers) {
          const response = backend.handle(url, method, body, headers)
          if (new URL(url).pathname === '/api/planning/free-slots')
            return {
              ...response,
              body: {
                ...(typeof response.body === 'object' && response.body ? response.body : {}),
                data: [],
              },
            }
          return response
        },
      })
      expect(wrapper.text()).not.toContain(
        'Для автоматичного планування ще не визначено доступний час',
      )
      if (path.endsWith('free-time'))
        expect(wrapper.text()).toContain('Інтервали доступності задані')
    },
  )

  it('does not label an unavailable availability read as an empty list', async () => {
    const backend = planningBackend()
    backend.failure = { path: /study-availability-windows$/, method: 'GET', status: 503 }
    const { wrapper } = await renderApp('/planning/free-time', backend)
    expect(wrapper.text()).not.toContain(
      'Для автоматичного планування ще не визначено доступний час',
    )
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})
