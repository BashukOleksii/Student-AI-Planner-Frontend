import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { makeRouter, safeRedirect } from '@/router'
import { setAuthErrorHandler } from '@/api/client'
import { user, json } from './fixtures'
beforeEach(() => {
  setActivePinia(createPinia())
  setAuthErrorHandler((status) => useAuthStore().handleAuthError(status))
})
describe('session authentication', () => {
  it.each(['login', 'register'] as const)(
    '%s initializes CSRF, authenticates and verifies profile',
    async (action) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(json({ data: user }))
        .mockResolvedValueOnce(json({ data: user }))
      vi.stubGlobal('fetch', fetch)
      const auth = useAuthStore()
      if (action === 'login') await auth.login({ email: user.email, password: 'example-password' })
      else
        await auth.register({
          name: user.name,
          email: user.email,
          password: 'example-password',
          password_confirmation: 'example-password',
        })
      expect(auth.authenticated).toBe(true)
      expect(auth.user).toEqual(user)
      expect(
        fetch.mock.calls.map((c) => String(c[0]).replace(/^.*(?=\/(?:sanctum|api)\/)/, '')),
      ).toEqual(['/sanctum/csrf-cookie', `/api/auth/${action}`, '/api/profile'])
      expect(localStorage.length).toBe(0)
    },
  )
  it('restores a valid session with one shared bootstrap', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ data: user }))
    vi.stubGlobal('fetch', fetch)
    const auth = useAuthStore()
    await Promise.all([auth.initialize(), auth.initialize()])
    await auth.initialize()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(auth.user).toEqual(user)
    expect(auth.initialized).toBe(true)
  })
  it('restores unauthenticated state after 401 and allows intended route after login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(json({}, 401))),
    )
    const router = makeRouter(createMemoryHistory())
    await router.push('/tasks/3')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/tasks/3')
    const auth = useAuthStore()
    auth.user = { ...user }
    await router.push('/tasks')
    expect(router.currentRoute.value.path).toBe('/tasks')
    await router.push('/register')
    expect(router.currentRoute.value.path).toBe('/')
  })
  it('shows bootstrap network failures as errors, without assuming unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const auth = useAuthStore()
    await auth.initialize()
    expect(auth.initialized).toBe(false)
    expect(auth.bootstrapError).toBeTruthy()
  })
  it('handles invalid credentials and validation without authenticating', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(json({ errors: { email: ['Invalid credentials'] } }, 422)),
    )
    const auth = useAuthStore()
    await expect(auth.login({ email: user.email, password: 'wrong' })).rejects.toMatchObject({
      fields: { email: ['Invalid credentials'] },
    })
    expect(auth.user).toBeNull()
  })
  it('clears user after logout 204, and obtains fresh CSRF on next login', async () => {
    const auth = useAuthStore()
    auth.user = { ...user }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ data: user }))
      .mockResolvedValueOnce(json({ data: user }))
    vi.stubGlobal('fetch', fetch)
    await auth.logout()
    expect(auth.user).toBeNull()
    await auth.login({ email: user.email, password: 'password' })
    expect(fetch.mock.calls[1]?.[0]).toContain('/sanctum/csrf-cookie')
  })
  it('does not falsely clear a session on failed logout', async () => {
    const auth = useAuthStore()
    auth.user = { ...user }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 503)))
    await expect(auth.logout()).rejects.toMatchObject({ status: 503 })
    expect(auth.authenticated).toBe(true)
  })
  it('invalidates an expired session but preserves state on CSRF until verified', async () => {
    const auth = useAuthStore()
    auth.user = { ...user }
    auth.handleAuthError(419)
    expect(auth.user).toEqual(user)
    expect(auth.csrfFailure).toBe(true)
    auth.handleAuthError(401)
    expect(auth.user).toBeNull()
  })
  it('does not restore a stale bootstrap response after logout', async () => {
    let resolve: ((r: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((r) => {
            resolve = r
          }),
      ),
    )
    const auth = useAuthStore()
    const pending = auth.initialize()
    auth.clear()
    resolve?.(json({ data: user }))
    await pending
    expect(auth.user).toBeNull()
  })
  it('rejects external and protocol-relative redirect destinations', () => {
    for (const value of [
      'https://example.com',
      '//example.com',
      '/\\example.com',
      '/\t/example.com',
      '/\n/example.com',
      '/tasks\\evil',
      '/login',
      null,
    ])
      expect(safeRedirect(value)).toBe('/')
    expect(safeRedirect('/schedule')).toBe('/schedule')
  })
  it('does not restore a stale profile update after logout', async () => {
    let resolve: ((response: Response) => void) | undefined
    const fetch = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const auth = useAuthStore()
    auth.user = { ...user }
    const pending = auth.update({ name: 'Changed', email: user.email, timezone: user.timezone })
    auth.clear()
    resolve?.(json({ data: { ...user, name: 'Changed' } }))
    await pending
    expect(auth.user).toBeNull()
  })
})
