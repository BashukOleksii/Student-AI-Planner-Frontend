import { describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { emailVerificationApi } from '@/api/emailVerification'
import {
  validVerificationPath,
  verificationPathFromLink,
  verificationRetrySeconds,
} from '@/utils/emailVerification'
import { renderApp } from './helpers/renderApp'
import {
  emailVerificationBackend,
  verificationPage,
  verificationPath,
} from './helpers/emailVerificationBackend'
import { user, json } from './fixtures'

async function click(wrapper: VueWrapper, text: string) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === text)!
    .trigger('click')
  await flushPromises()
}
const invalidPaths = [
  '',
  'https://evil.test' + verificationPath,
  '//evil.test' + verificationPath,
  '/api/profile/email/verify/1/' + 'a'.repeat(40),
  verificationPath + '&redirect=https://evil.test',
  verificationPath + '#fragment',
  verificationPath.replace('/verify/1/', '/verify/../'),
  verificationPath.replace('/verify/1/', '/verify/%31/'),
  verificationPath.replace('/verify/1/', '/verify/1\\/'),
  verificationPath.replace('expires=2000000000', 'expires=invalid'),
  verificationPath.replace('signature=' + 'b'.repeat(64), 'signature=short'),
  verificationPath.replace('/api/profile/email/verify/', '/api/tasks/'),
  verificationPath.replace('?', '?expires=1&'),
  encodeURIComponent(verificationPath),
  verificationPath + '\n',
]

describe('email verification path boundary', () => {
  it('decodes the outer wrapper exactly once and retains the original nested query order', async () => {
    const reordered = `/api/profile/email/verify/1/${'a'.repeat(40)}?signature=${'b'.repeat(64)}&expires=02000000000`
    expect(verificationPathFromLink(verificationPage(reordered))).toBe(reordered)
    const get = vi.spyOn(URLSearchParams.prototype, 'get')
    expect(verificationPathFromLink(verificationPage())).toBe(verificationPath)
    expect(get).toHaveBeenCalledTimes(1)
    get.mockRestore()
    expect(
      verificationPathFromLink(
        verificationPage() + '&verification_path=' + encodeURIComponent(verificationPath),
      ),
    ).toBeNull()
    expect(verificationPathFromLink('/verify-email')).toBeNull()
  })
  it.each(invalidPaths)(
    'rejects an unsafe/malformed target before any request: %s',
    async (path) => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      expect(validVerificationPath(path)).toBe(false)
      expect(verificationPathFromLink(verificationPage(path))).toBeNull()
      await expect(emailVerificationApi.confirm(path)).rejects.toMatchObject({ status: 400 })
      expect(fetch).not.toHaveBeenCalled()
    },
  )
  it('posts the exact opaque path once with an empty body, cookies and CSRF, without a second /api', async () => {
    const path = verificationPath.replace(
      '?expires=2000000000&signature=' + 'b'.repeat(64),
      '?signature=' + 'b'.repeat(64) + '&expires=02000000000',
    )
    document.cookie = 'XSRF-TOKEN=verify%2Bcsrf%3D'
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(json({ data: { ...user, email_verified: true } })))
    vi.stubGlobal('fetch', fetch)
    await emailVerificationApi.confirm(path)
    const [target, options] = fetch.mock.calls[0]!
    expect(target).toBe('http://localhost:8000' + path)
    expect(target).not.toContain('/api/api/')
    expect(options).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: '{}',
      referrer: window.location.origin + '/',
    })
    expect(new Headers(options.headers).get('X-XSRF-TOKEN')).toBe('verify+csrf=')
    expect(fetch).toHaveBeenCalledTimes(1)
    await emailVerificationApi.send()
    expect(fetch.mock.calls[1]![0]).toBe(
      'http://localhost:8000/api/profile/email/verification-notification',
    )
    expect(fetch.mock.calls[1]![1].body).toBe('{}')
  })
  it('rejects an incomplete success response rather than setting a verified account locally', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: { ...user } })))
    await expect(emailVerificationApi.confirm(verificationPath)).rejects.toMatchObject({
      status: 502,
    })
  })
  it('interprets seconds and HTTP dates for Retry-After without displaying raw text', () => {
    const now = Date.parse('2026-11-14T12:00:00Z')
    expect(verificationRetrySeconds('60', now)).toBe(60)
    expect(verificationRetrySeconds('Sat, 14 Nov 2026 12:01:00 GMT', now)).toBe(60)
    expect(verificationRetrySeconds('Sat, 14 Nov 2026 11:01:00 GMT', now)).toBe(0)
    expect(verificationRetrySeconds('PRIVATE_HEADER', now)).toBe(0)
    expect(verificationRetrySeconds(null, now)).toBe(0)
  })
})

describe('voluntary email confirmation UI', () => {
  it.each([true, false])(
    'shows server verification %s in profile and sends no email until requested',
    async (verified) => {
      const backend = emailVerificationBackend({ ...user, email_verified: verified })
      const { wrapper } = await renderApp('/profile', backend)
      const card = wrapper.get('.email-verification-status')
      expect(card.text()).toContain(verified ? 'Email підтверджено' : 'Email не підтверджено')
      expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
      expect(card.find('button').exists()).toBe(!verified)
      if (!verified) {
        await click(wrapper, 'Надіслати лист підтвердження')
        expect(
          backend.requests.find((r) => r.target.endsWith('/verification-notification'))?.body,
        ).toEqual({})
        expect(wrapper.text()).toContain('Лист підтвердження запитано')
        expect(wrapper.text()).not.toContain('PRIVATE_SERVICE_TEXT')
      }
    },
  )
  it('uses the updated profile response when an email changes, preserving the flag for name-only changes', async () => {
    const backend = emailVerificationBackend({ ...user, email_verified: true })
    const { wrapper, auth } = await renderApp('/profile', backend)
    await wrapper.get('#profile-name').setValue('Інше ім’я')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(auth.user?.email_verified).toBe(true)
    await wrapper.get('#profile-email').setValue('new@example.test')
    expect(wrapper.get('.email-verification-status').text()).toContain(user.email)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(auth.user?.email_verified).toBe(false)
    expect(wrapper.get('.email-verification-status').text()).toContain('Email не підтверджено')
    expect(wrapper.get('.email-verification-status').text()).toContain('new@example.test')
    await click(wrapper, 'Надіслати лист підтвердження')
    expect(
      backend.requests.filter((r) => r.target.endsWith('/verification-notification'))[0]?.body,
    ).toEqual({})
  })
  it('clears an old mail-request notice and blocks sending to an unsaved email', async () => {
    const backend = emailVerificationBackend()
    const { wrapper } = await renderApp('/profile', backend)
    await click(wrapper, 'Надіслати лист підтвердження')
    await wrapper.get('#profile-email').setValue('other@example.test')
    await click(wrapper, 'Надіслати лист підтвердження')
    expect(
      backend.requests.filter((r) => r.target.endsWith('/verification-notification')),
    ).toHaveLength(1)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Лист підтвердження запитано')
  })
  it('requires login, returns safely, and verifies only on an explicit click', async () => {
    const backend = emailVerificationBackend(null)
    const { wrapper, router, auth } = await renderApp(verificationPage(), backend)
    expect(wrapper.text()).toContain('Потрібно ввійти')
    expect(wrapper.get('.verify-email-page').text()).not.toContain(verificationPath)
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
    await click(wrapper, 'Увійти')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.query.redirect).toBe(verificationPage())
    await wrapper.get('#email').setValue(user.email)
    await wrapper.get('#password').setValue('fixture-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/verify-email'))
    expect(verificationPathFromLink(router.currentRoute.value.fullPath)).toBe(verificationPath)
    expect(
      backend.requests.filter((r) => r.target.startsWith('/api/profile/email/verify/')),
    ).toHaveLength(0)
    expect(auth.user?.email_verified).toBe(false)
    await click(wrapper, 'Підтвердити email')
    expect(auth.user?.email_verified).toBe(true)
    expect(wrapper.get('.verify-email-page').text()).toContain('Email підтверджено.')
    expect(wrapper.get('.verify-email-page').text()).not.toContain('PRIVATE_SERVICE_TEXT')
    const write = backend.requests.find((r) => r.target.startsWith('/api/profile/email/verify/'))!
    expect(write).toMatchObject({ target: verificationPath, method: 'POST', body: {} })
    await router.push('/profile')
    await flushPromises()
    expect(wrapper.get('.email-verification-status').text()).toContain('Email підтверджено')
  })
  it('does not confirm on reopening or navigating between two links on the same route', async () => {
    const backend = emailVerificationBackend()
    const { wrapper, router } = await renderApp(verificationPage(), backend)
    await router.push('/profile')
    await router.push(verificationPage())
    await flushPromises()
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
    await router.push(verificationPage('https://evil.test/path'))
    await flushPromises()
    expect(wrapper.get('.verify-email-page').text()).toContain('Посилання недійсне')
    expect(wrapper.get('.verify-email-page').find('button').exists()).toBe(false)
    await router.push(verificationPage())
    await flushPromises()
    expect(wrapper.findAll('button').some((button) => button.text() === 'Підтвердити email')).toBe(
      true,
    )
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  })
  it.each([403, 503, 500])(
    'shows a short safe %s message and leaves the account unverified',
    async (status) => {
      const backend = emailVerificationBackend()
      const { wrapper, auth } = await renderApp(verificationPage(), backend)
      backend.failure = {
        status,
        body: { message: 'PRIVATE_DIAGNOSTIC', errors: { signature: ['PRIVATE_FIELD'] } },
      }
      await click(wrapper, 'Підтвердити email')
      expect(auth.user?.email_verified).toBe(false)
      expect(wrapper.text()).toContain(
        status === 403
          ? 'Увійдіть у потрібний акаунт або запросіть новий лист'
          : 'Сервіс тимчасово недоступний',
      )
      expect(wrapper.text()).not.toMatch(/PRIVATE_DIAGNOSTIC|PRIVATE_FIELD/)
      expect(
        backend.requests.filter((r) => r.target.startsWith('/api/profile/email/verify/')),
      ).toHaveLength(1)
      if (status === 403) {
        expect(
          wrapper
            .findAll('button')
            .find((button) => button.text() === 'Підтвердити email')!
            .attributes('disabled'),
        ).toBeDefined()
        await click(wrapper, 'Увійти в інший акаунт')
        expect(backend.requests.filter((r) => r.target === '/api/auth/logout')).toHaveLength(1)
      }
    },
  )
  it.each(['/profile', verificationPage()])(
    'honors Retry-After and never automatically retries: %s',
    async (page) => {
      const backend = emailVerificationBackend()
      const { wrapper, fetch } = await renderApp(page, backend)
      const label = page === '/profile' ? 'Надіслати лист підтвердження' : 'Підтвердити email'
      let writes = 0
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (init?.method === 'POST' && url.includes('/api/profile/email/')) {
            writes++
            return new Response(JSON.stringify({ message: 'PRIVATE_ERROR' }), {
              status: 429,
              headers: { 'Retry-After': '2' },
            })
          }
          return fetch(url, init)
        }),
      )
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
      try {
        await click(wrapper, label)
        expect(wrapper.text()).toContain('Забагато спроб.')
        expect(wrapper.text()).toContain('Спробуйте через 2 с.')
        expect(wrapper.text()).not.toContain('PRIVATE_ERROR')
        await click(wrapper, label)
        expect(writes).toBe(1)
        await vi.advanceTimersByTimeAsync(3000)
        await flushPromises()
        expect(wrapper.text()).not.toContain('Спробуйте через')
        expect(
          wrapper
            .findAll('button')
            .find((button) => button.text() === label)!
            .attributes('disabled'),
        ).toBeUndefined()
        expect(writes).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it('restores CSRF explicitly after 419 and still requires another confirmation click', async () => {
    const backend = emailVerificationBackend()
    const { wrapper, auth } = await renderApp(verificationPage(), backend)
    backend.failure = { status: 419 }
    await click(wrapper, 'Підтвердити email')
    expect(auth.csrfFailure).toBe(true)
    await click(wrapper, 'Відновити сеанс')
    expect(auth.csrfFailure).toBe(false)
    expect(
      backend.requests.filter((r) => r.target.startsWith('/api/profile/email/verify/')),
    ).toHaveLength(1)
    await click(wrapper, 'Підтвердити email')
    expect(auth.user?.email_verified).toBe(true)
  })
  it('does not resurrect an account if confirmation returns after logout', async () => {
    const backend = emailVerificationBackend()
    const { auth, fetch } = await renderApp(verificationPage(), backend)
    let resolve!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.includes('/api/profile/email/verify/')
          ? new Promise<Response>((done) => {
              resolve = done
            })
          : fetch(url, init),
      ),
    )
    const pending = auth.confirmEmail(verificationPath)
    auth.clear()
    resolve(json({ data: { ...user, email_verified: true } }))
    expect(await pending).toBe(false)
    expect(auth.user).toBeNull()
  })
})

it('does not overwrite an updated email with a late verification response', async () => {
  const backend = emailVerificationBackend()
  const { auth, fetch } = await renderApp(verificationPage(), backend)
  let resolve!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      url.includes('/api/profile/email/verify/')
        ? new Promise<Response>((done) => {
            resolve = done
          })
        : fetch(url, init),
    ),
  )
  const pending = auth.confirmEmail(verificationPath)
  await auth.update({ name: user.name, email: 'new@example.test', timezone: user.timezone })
  resolve(json({ data: { ...user, email_verified: true } }))
  expect(await pending).toBe(false)
  expect(auth.user?.email).toBe('new@example.test')
  expect(auth.user?.email_verified).toBe(false)
})
it('blocks repeated confirmation clicks while a write is pending', async () => {
  const backend = emailVerificationBackend()
  const { wrapper, fetch, auth } = await renderApp(verificationPage(), backend)
  let resolve!: (response: Response) => void,
    writes = 0
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/profile/email/verify/')) {
        writes++
        return new Promise<Response>((done) => {
          resolve = done
        })
      }
      return fetch(url, init)
    }),
  )
  await click(wrapper, 'Підтвердити email')
  await click(wrapper, 'Підтвердити email')
  expect(writes).toBe(1)
  expect(auth.user?.email_verified).toBe(false)
  resolve(json({ data: { ...user, email_verified: true } }))
  await flushPromises()
  expect(auth.user?.email_verified).toBe(true)
})
