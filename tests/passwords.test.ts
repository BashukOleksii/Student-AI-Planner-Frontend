import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { passwordBackend } from './helpers/passwordBackend'
import { json, user } from './fixtures'
import { safeRedirect } from '@/router'
import { clearPasswordResetLink } from '@/utils/passwordResetLink'

const token = 'fixture-token+encoded/value='
const newPassword = ' new-password з пробілами '
const resetUrl = (email = user.email, resetToken = token) =>
  `/reset-password?${new URLSearchParams({ token: resetToken, email })}`

async function fillPasswords(wrapper: VueWrapper, prefix: string) {
  await wrapper.get(`#${prefix}-password`).setValue(newPassword)
  await wrapper.get(`#${prefix}-confirmation`).setValue(newPassword)
}
function passwordForm(wrapper: VueWrapper, prefix: string) {
  return wrapper.get(`#${prefix}-password`).element.closest('form')!
}
async function submitPasswords(wrapper: VueWrapper, prefix: string) {
  passwordForm(wrapper, prefix).dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  )
  await flushPromises()
}
afterEach(() => {
  clearPasswordResetLink()
  window.history.replaceState(null, '', '/')
})

describe('password management', () => {
  it('checks confirmation, shows incorrect current password, submits PATCH once and preserves the session', async () => {
    const { wrapper, backend, fetch, auth } = await renderApp('/profile', passwordBackend(user))
    document.cookie = 'XSRF-TOKEN=password%2Bcsrf%3D'
    await wrapper.get('#current-password').setValue('wrong-password')
    await fillPasswords(wrapper, 'change')
    await wrapper.get('#change-confirmation').setValue('different-password')
    await submitPasswords(wrapper, 'change')
    expect(wrapper.text()).toContain('Паролі не збігаються.')
    expect(backend.requests.some((r) => r.path === '/api/profile/password')).toBe(false)
    await wrapper.get('#change-confirmation').setValue(newPassword)
    await submitPasswords(wrapper, 'change')
    expect(wrapper.get('#current-password').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Поточний пароль неправильний.')
    await wrapper.get('#current-password').setValue('old-password')
    let resolve: (response: Response) => void = () => {}
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r
        }),
    )
    passwordForm(wrapper, 'change').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    )
    await flushPromises()
    expect(wrapper.get('#change-password').element.closest('fieldset')?.disabled).toBe(true)
    await submitPasswords(wrapper, 'change')
    const writes = fetch.mock.calls.filter(([url]) => url.endsWith('/api/profile/password'))
    expect(writes).toHaveLength(2) // One rejected request, one pending request; no duplicate.
    const init = writes[1]![1]!
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({
      current_password: 'old-password',
      password: newPassword,
      password_confirmation: newPassword,
    })
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe('password+csrf=')
    expect(init.credentials).toBe('include')
    resolve(json({ message: 'Password changed successfully.' }))
    await flushPromises()
    expect(wrapper.text()).toContain('Пароль змінено.')
    expect(auth.user).toEqual(user)
    for (const selector of ['#current-password', '#change-password', '#change-confirmation'])
      expect((wrapper.get(selector).element as HTMLInputElement).value).toBe('')
    expect(JSON.stringify(auth.$state)).not.toContain(newPassword)
    expect(localStorage.getItem('password')).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('requests recovery with fresh CSRF and gives the same generic acknowledgement for any email', async () => {
    for (const email of [user.email, 'unknown@example.test']) {
      const { wrapper, backend } = await renderApp('/login', passwordBackend())
      await wrapper.get('a[href="/forgot-password"]').trigger('click')
      await vi.waitFor(() => expect(wrapper.find('#recovery-email').exists()).toBe(true))
      await wrapper.get('#recovery-email').setValue(email)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(backend.requests.slice(-2)).toEqual([
        { path: '/sanctum/csrf-cookie', method: 'GET', body: {} },
        { path: '/api/auth/forgot-password', method: 'POST', body: { email } },
      ])
      expect(wrapper.get('[role="status"]').text()).toBe(
        'Якщо обліковий запис із такою адресою існує, інструкцію з відновлення буде надіслано.',
      )
      expect(wrapper.find('form').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('cleans a direct reset URL before bootstrap, resets the signed-in account and clears only its stale auth state', async () => {
    window.history.replaceState({ unsafe: resetUrl() }, '', resetUrl())
    const { wrapper, router, fetch, auth, backend } = await renderApp(
      '/reset-password',
      passwordBackend(user),
    )
    expect(window.location.search).toBe('')
    expect(JSON.stringify(window.history.state)).not.toContain(token)
    expect(router.currentRoute.value.fullPath).toBe('/reset-password')
    expect((wrapper.get('#reset-email').element as HTMLInputElement).value).toBe(user.email)
    expect(wrapper.html()).not.toContain(token)
    expect(JSON.stringify(auth.$state)).not.toContain(token)
    await fillPasswords(wrapper, 'reset')
    await submitPasswords(wrapper, 'reset')
    expect(backend.requests.slice(-2)).toEqual([
      { path: '/sanctum/csrf-cookie', method: 'GET', body: {} },
      {
        path: '/api/auth/reset-password',
        method: 'POST',
        body: {
          email: user.email,
          token,
          password: newPassword,
          password_confirmation: newPassword,
        },
      },
    ])
    expect(wrapper.text()).toContain('Пароль скинуто. Увійдіть із новим паролем.')
    expect(auth.user).toBeNull()
    expect(wrapper.find('input').exists()).toBe(false)
    for (const [url, init] of fetch.mock.calls) {
      expect(url).not.toContain(token)
      expect(init?.referrer).toBe(`${window.location.origin}/`)
      expect(init?.referrerPolicy).toBe('origin')
    }
    expect(JSON.stringify(auth.$state)).not.toContain(newPassword)
    expect(JSON.stringify(localStorage)).not.toContain(token)
    expect(sessionStorage.length).toBe(0)
    await wrapper.get('a[href="/login"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(safeRedirect(resetUrl())).toBe('/')
  })

  it('allows an authenticated reset through the router and preserves an unrelated signed-in account', async () => {
    const otherEmail = 'another@example.test'
    const { wrapper, router, auth } = await renderApp(resetUrl(otherEmail), passwordBackend(user))
    expect(router.currentRoute.value.fullPath).toBe('/reset-password')
    await fillPasswords(wrapper, 'reset')
    await submitPasswords(wrapper, 'reset')
    expect(auth.user).toEqual(user)
    expect(wrapper.text()).toContain('Сеанс іншого облікового запису залишився активним.')
    await router.push('/login?redirect=/profile')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('handles invalid, expired or used tokens without exposing token errors or retaining passwords', async () => {
    const { wrapper, router, auth } = await renderApp(
      resetUrl(user.email, 'expired-token'),
      passwordBackend(),
    )
    await fillPasswords(wrapper, 'reset')
    await submitPasswords(wrapper, 'reset')
    expect(wrapper.text()).toContain('Посилання недійсне, неповне або термін його дії минув.')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('expired-token')
    expect(auth.authenticated).toBe(false)
    await wrapper.get('a[href="/forgot-password"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/forgot-password')
    await router.push(resetUrl())
    await flushPromises()
    await fillPasswords(wrapper, 'reset')
    await router.push(resetUrl('fresh@example.test'))
    await flushPromises()
    expect((wrapper.get('#reset-email').element as HTMLInputElement).value).toBe(
      'fresh@example.test',
    )
    expect((wrapper.get('#reset-password').element as HTMLInputElement).value).toBe('')
  })

  it('rejects missing or duplicate query values without making a reset mutation', async () => {
    const { wrapper, backend, router } = await renderApp(
      '/reset-password?token=one&token=two&email=student@example.test',
      passwordBackend(),
    )
    expect(router.currentRoute.value.fullPath).toBe('/reset-password')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Посилання недійсне, неповне')
    expect(backend.requests.some((r) => r.path === '/api/auth/reset-password')).toBe(false)
    wrapper.unmount()
    const missing = await renderApp('/reset-password', passwordBackend())
    expect(missing.wrapper.find('form').exists()).toBe(false)
  })

  it('reports an uncertain reset result without retries, success or unnecessary logout', async () => {
    const { wrapper, auth, fetch } = await renderApp(
      resetUrl('another@example.test'),
      passwordBackend(user),
    )
    await fillPasswords(wrapper, 'reset')
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
    fetch.mockRejectedValueOnce(new TypeError('private request detail'))
    await submitPasswords(wrapper, 'reset')
    expect(wrapper.text()).toContain('Пароль міг змінитися.')
    expect(wrapper.text()).not.toContain('private request detail')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(auth.user).toEqual(user)
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith('/api/auth/reset-password')),
    ).toHaveLength(1)
  })

  it('preserves existing CSRF session recovery and never replays a password change', async () => {
    const backend = passwordBackend(user)
    const { wrapper, auth } = await renderApp('/profile', backend)
    backend.failure = { status: 419 }
    await wrapper.get('#current-password').setValue('old-password')
    await fillPasswords(wrapper, 'change')
    await submitPasswords(wrapper, 'change')
    expect(auth.csrfFailure).toBe(true)
    expect(auth.user).toEqual(user)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Відновити сеанс')!
      .trigger('click')
    await flushPromises()
    expect(auth.csrfFailure).toBe(false)
    expect(backend.requests.filter((r) => r.path === '/api/profile/password')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Пароль змінено.')
  })
})
