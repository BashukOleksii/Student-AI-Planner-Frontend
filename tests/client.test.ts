import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiBaseUrl,
  initializeCsrf,
  request,
  setAuthErrorHandler,
  xsrfToken,
} from '@/api/client'
import { page, task, json } from './fixtures'
beforeEach(() => setAuthErrorHandler(undefined))
describe('HTTP client', () => {
  it('uses configured origin, credentials, Accept and CSRF endpoint outside /api', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    await initializeCsrf()
    expect(fetch).toHaveBeenCalledWith(
      `${apiBaseUrl}/sanctum/csrf-cookie`,
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
    expect((fetch.mock.calls[0]?.[1] as RequestInit).headers).toBeInstanceOf(Headers)
    expect(new Headers(fetch.mock.calls[0]?.[1].headers).get('Accept')).toBe('application/json')
  })
  it('honors VITE_API_BASE_URL and strips trailing slash', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://planner.example.test/')
    vi.resetModules()
    const client = await import('@/api/client')
    expect(client.apiBaseUrl).toBe('https://planner.example.test')
    vi.resetModules()
  })
  it('decodes XSRF cookie and serializes JSON only for a body', async () => {
    document.cookie = 'XSRF-TOKEN=hello%2Bthere%3D'
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ data: task })))
    vi.stubGlobal('fetch', fetch)
    await request('/api/tasks', { method: 'POST', body: { title: 'Тест' } })
    const options: RequestInit = fetch.mock.calls[0]?.[1]
    expect(new Headers(options.headers).get('X-XSRF-TOKEN')).toBe('hello+there=')
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json')
    expect(options.body).toBe('{"title":"Тест"}')
    await request('/api/tasks')
    expect(new Headers(fetch.mock.calls[1]?.[1].headers).has('X-XSRF-TOKEN')).toBe(false)
  })
  it('handles missing and malformed cookies safely', () => {
    expect(xsrfToken()).toBe('')
    document.cookie = 'XSRF-TOKEN=%invalid'
    expect(xsrfToken()).toBe('')
  })
  it('returns undefined for successful 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(request('/api/tasks/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })
  it('preserves pagination links and meta', async () => {
    const body = page([task], 2, 4)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body)))
    await expect(request('/api/tasks?page=2')).resolves.toEqual(body)
  })
  it('exposes Laravel field errors without raw server details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          json({ message: 'private detail', errors: { title: ['Required'], invalid: 3 } }, 422),
        ),
    )
    await expect(request('/api/tasks', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 422,
      fields: { title: ['Required'] },
      message: 'Перевірте введені дані.',
    })
  })
  it.each([401, 419] as const)(
    'notifies authentication handler on %s and never retries a mutation',
    async (status) => {
      const handler = vi.fn()
      setAuthErrorHandler(handler)
      const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({}, status)))
      vi.stubGlobal('fetch', fetch)
      await expect(request('/api/tasks', { method: 'POST', body: {} })).rejects.toMatchObject({
        status,
      })
      expect(handler).toHaveBeenCalledWith(status)
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
  it.each([403, 404, 409, 410, 429, 500, 502, 503])(
    'handles %s without treating it as authentication failure',
    async (status) => {
      const handler = vi.fn()
      setAuthErrorHandler(handler)
      const fetch = vi.fn().mockResolvedValue(
        new Response('<html>private traceback</html>', {
          status,
          headers: { 'Retry-After': '30' },
        }),
      )
      vi.stubGlobal('fetch', fetch)
      await expect(request('/api/tasks', { method: 'PATCH', body: {} })).rejects.toMatchObject({
        status,
        retryAfter: '30',
      })
      expect(handler).not.toHaveBeenCalled()
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
  it('normalizes network failures without retrying', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetch)
    await expect(request('/api/tasks', { method: 'POST', body: {} })).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('supports cancellation and rejects invalid successful payloads', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'))
    vi.stubGlobal('fetch', fetch)
    controller.abort()
    await expect(request('/api/tasks', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    fetch.mockResolvedValue(new Response('not json'))
    await expect(request('/api/tasks')).rejects.toMatchObject({ status: 502 })
  })
})
