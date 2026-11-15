import { verificationPathFromLink } from '@/utils/emailVerification'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { json, user } from '../fixtures'
import {
  emailVerificationBackend,
  verificationPage,
  verificationPath,
} from '../helpers/emailVerificationBackend'
import { renderApp } from '../helpers/renderApp'
async function click(wrapper: VueWrapper, text: string) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === text)!
    .trigger('click')
  await flushPromises()
}
describe('voluntary email confirmation UI', () => {
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
    await router.push('/profile/security')
    await flushPromises()
    expect(wrapper.get('.email-verification-status').text()).toContain('Email підтверджено')
  })
  it.each(['/profile/security', verificationPage()])(
    'honors Retry-After and never automatically retries: %s',
    async (page) => {
      const backend = emailVerificationBackend()
      const { wrapper, fetch } = await renderApp(page, backend)
      const label =
        page === '/profile/security' ? 'Надіслати лист підтвердження' : 'Підтвердити email'
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
