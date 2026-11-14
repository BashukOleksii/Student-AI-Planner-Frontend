import { test, expect, type Page } from '@playwright/test'
import {
  emailVerificationBackend,
  verificationPage,
  verificationPath,
} from '../tests/helpers/emailVerificationBackend'
import { user } from '../tests/fixtures'
import type { User } from '../src/types/api'

// Signed links stay out of trace artifacts; fixtures never send or receive actual mail.
test.use({ trace: 'off' })
async function setup(page: Page, account: User | null = { ...user }) {
  const backend = emailVerificationBackend(account),
    errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'verify%2Bcsrf%3D', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Expose-Headers': 'Retry-After',
      }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    expect(req.headers().referer).toBe('http://localhost:4173/')
    if (req.method() !== 'GET') expect(req.headers()['x-xsrf-token']).toBe('verify+csrf=')
    const result = backend.handle(req.url(), req.method(), req.postDataJSON() ?? {})
    return route.fulfill({
      status: result.status,
      headers: { ...headers, ...result.headers },
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
    })
  })
  return {
    backend,
    errors,
    confirms: () =>
      backend.requests.filter(
        (r) => r.method === 'POST' && r.target.startsWith('/api/profile/email/verify/'),
      ),
  }
}
async function noSensitiveText(page: Page) {
  const body = page.locator('body')
  for (const text of [
    verificationPath,
    'signature=',
    'PRIVATE_SERVICE_TEXT',
    'PRIVATE_SIGNATURE_ERROR',
    'PRIVATE_API_ERROR',
  ])
    await expect(body).not.toContainText(text)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('open link without session, sign in, reopen, then explicitly confirm and update profile', async ({
  page,
}) => {
  const state = await setup(page, null)
  await page.goto(verificationPage())
  await expect(
    page.getByText('Потрібно ввійти, щоб підтвердити email.', { exact: true }),
  ).toBeVisible()
  expect(state.confirms()).toHaveLength(0)
  await page.reload()
  await page.getByRole('button', { name: 'Увійти', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await page.getByLabel('Електронна пошта', { exact: true }).fill(user.email)
  await page.getByLabel('Пароль', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: 'Увійти', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Підтвердити email', exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/verify-email')
  expect(new URL(page.url()).searchParams.get('verification_path')).toBe(verificationPath)
  expect(state.confirms()).toHaveLength(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Підтвердити email', exact: true })).toBeVisible()
  expect(state.confirms()).toHaveLength(0)
  await noSensitiveText(page)
  await page.getByRole('button', { name: 'Підтвердити email', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Email підтверджено.')
  expect(state.confirms()).toEqual([{ target: verificationPath, method: 'POST', body: {} }])
  await page.getByRole('link', { name: 'До профілю', exact: true }).click()
  await expect(page.locator('.email-verification-status')).toContainText('Email підтверджено')
  await expect(
    page.getByRole('button', { name: 'Надіслати лист підтвердження', exact: true }),
  ).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('profile resets verification after an email change and requests a letter with an empty body', async ({
  page,
}) => {
  const state = await setup(page, { ...user, email_verified: true })
  await page.goto('/profile')
  const card = page.locator('.email-verification-status')
  await expect(card).toContainText('Email підтверджено')
  await page.getByLabel('Електронна пошта', { exact: true }).fill('new@example.test')
  await page.getByRole('button', { name: 'Зберегти профіль', exact: true }).click()
  await expect(card).toContainText('Email не підтверджено')
  await expect(card).toContainText('new@example.test')
  await card.getByRole('button', { name: 'Надіслати лист підтвердження', exact: true }).click()
  await expect(card).toContainText('Лист підтвердження запитано')
  expect(
    state.backend.requests.filter((r) => r.target.endsWith('/verification-notification')),
  ).toEqual([{ target: '/api/profile/email/verification-notification', method: 'POST', body: {} }])
  await noSensitiveText(page)
  expect(state.errors).toEqual([])
})

test('unsafe and malformed links never cause a POST', async ({ page }) => {
  const state = await setup(page)
  for (const path of [
    'https://evil.test' + verificationPath,
    '//evil.test' + verificationPath,
    '/api/tasks/1/complete',
    encodeURIComponent(verificationPath),
    verificationPath + '&next=/tasks',
    verificationPath + '&signature=other',
    verificationPath + '#fragment',
    verificationPath + '\n',
  ]) {
    await page.goto(verificationPage(path))
    await expect(page.locator('.verify-email-page')).toContainText(
      'Посилання недійсне або прострочене',
    )
    await expect(page.getByRole('button', { name: 'Підтвердити email', exact: true })).toHaveCount(
      0,
    )
  }
  expect(state.backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  await noSensitiveText(page)
})

test('a forbidden link offers the correct-account or new-letter actions without guessing the reason', async ({
  page,
}) => {
  const state = await setup(page)
  state.backend.failure = { status: 403, body: { message: 'PRIVATE_SIGNATURE_ERROR' } }
  await page.goto(verificationPage())
  await page.getByRole('button', { name: 'Підтвердити email', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Увійдіть у потрібний акаунт або запросіть новий лист із профілю',
  )
  await expect(page.getByRole('button', { name: 'Підтвердити email', exact: true })).toBeDisabled()
  await expect(
    page.getByRole('link', { name: 'Запросити новий лист із профілю', exact: true }),
  ).toBeVisible()
  await noSensitiveText(page)
  expect(state.backend.current?.email_verified).toBe(false)
  await page.getByRole('button', { name: 'Увійти в інший акаунт', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?redirect=/)
  expect(state.confirms()).toHaveLength(1)
})

for (const target of ['profile', 'confirm'] as const) {
  test(`Retry-After on ${target} disables repetition and never schedules a new request`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-11-14T12:00:00Z') })
    const state = await setup(page)
    state.backend.failure = {
      status: 429,
      headers: { 'Retry-After': '10' },
      body: { message: 'PRIVATE_API_ERROR' },
    }
    await page.goto(target === 'profile' ? '/profile' : verificationPage())
    const button = page.getByRole('button', {
      name: target === 'profile' ? 'Надіслати лист підтвердження' : 'Підтвердити email',
      exact: true,
    })
    await button.click()
    await expect(page.getByRole('alert')).toContainText('Забагато спроб.')
    await expect(button).toBeDisabled()
    await expect(page.getByText('Спробуйте через 10 с.', { exact: true })).toBeVisible()
    await page.clock.fastForward(11000)
    await expect(button).toBeEnabled()
    const writes = () =>
      state.backend.requests.filter(
        (r) => r.method === 'POST' && r.target.startsWith('/api/profile/email/'),
      )
    expect(writes()).toHaveLength(1)
    await noSensitiveText(page)
    await button.click()
    await expect(page.getByRole('status')).toContainText(
      target === 'profile' ? 'Лист підтвердження запитано' : 'Email підтверджено.',
    )
    expect(writes()).toHaveLength(2)
  })
}

test('temporary server failure stays unverified, exposes no API details and causes no automatic retry', async ({
  page,
}) => {
  const state = await setup(page)
  state.backend.failure = {
    status: 503,
    body: { message: 'PRIVATE_API_ERROR', errors: { signature: ['PRIVATE_SIGNATURE_ERROR'] } },
  }
  await page.goto(verificationPage())
  await page.getByRole('button', { name: 'Підтвердити email', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Сервіс тимчасово недоступний. Спробуйте пізніше.',
  )
  await noSensitiveText(page)
  expect(state.backend.current?.email_verified).toBe(false)
  expect(state.confirms()).toHaveLength(1)
})
