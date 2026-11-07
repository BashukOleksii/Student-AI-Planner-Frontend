import { expect, test } from '@playwright/test'
import { passwordBackend } from '../tests/helpers/passwordBackend'
import { user } from '../tests/fixtures'

test('recover access, use the email link, reset the password and sign in', async ({ page }) => {
  const backend = passwordBackend()
  const token = 'fixture-token+encoded/value='
  const password = ' new-browser-password '
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    expect(request.headers().referer).toBe('http://localhost:4173/')
    if (request.url().endsWith('/sanctum/csrf-cookie'))
      return route.fulfill({
        status: 204,
        headers: {
          ...headers,
          'Set-Cookie': 'XSRF-TOKEN=password%2Bcsrf%3D; Path=/; SameSite=Lax',
        },
      })
    if (request.method() !== 'GET') expect(request.headers()['x-xsrf-token']).toBe('password+csrf=')
    const result = backend.handle(request.url(), request.method(), request.postDataJSON() ?? {})
    await route.fulfill({ status: result.status, json: result.body ?? {}, headers })
  })
  await page.goto('/login')
  await page.getByRole('link', { name: 'Забули пароль?' }).click()
  await page.getByLabel('Електронна пошта', { exact: true }).fill(user.email)
  await page.getByRole('button', { name: 'Надіслати інструкцію' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Якщо обліковий запис із такою адресою існує, інструкцію з відновлення буде надіслано.',
  )
  // Simulate opening a server-generated email link; no SMTP or real outgoing email.
  await page.goto(`/reset-password?${new URLSearchParams({ token, email: user.email })}`)
  await expect(page).toHaveURL('http://localhost:4173/reset-password')
  await expect(page.getByLabel('Електронна пошта', { exact: true })).toHaveValue(user.email)
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(token)
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('token=')
  expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer')
  await page.getByLabel('Новий пароль', { exact: true }).fill(password)
  await page.getByLabel('Підтвердження нового пароля', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Зберегти новий пароль' }).click()
  await expect(page.getByRole('status')).toHaveText('Пароль скинуто. Увійдіть із новим паролем.')
  expect(backend.requests.find((r) => r.path === '/api/auth/reset-password')?.body).toEqual({
    email: user.email,
    token,
    password,
    password_confirmation: password,
  })
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain(token)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Повернутися до входу' }).click()
  await expect(page).toHaveURL('http://localhost:4173/login')
  // Exercise the ordinary protected-route redirect before signing back in.
  await page.goto('/profile')
  await page.getByLabel('Електронна пошта', { exact: true }).fill(user.email)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Увійти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Налаштування', exact: true })).toBeVisible()
  expect(backend.requests.find((r) => r.path === '/api/auth/login')?.body).toEqual({
    email: user.email,
    password,
  })
  expect(errors).toEqual([])
})
