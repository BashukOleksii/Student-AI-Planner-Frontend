import { expect, test } from '@playwright/test'
import { serveLiveFrontend, liveApi } from './support/liveBrowser'
import { privateAuthPath } from './support/liveSafety'
import type { Resource, User } from '../src/types/api'
const paths = [
  '/api/profile',
  '/api/planning-preferences',
  '/api/study-availability-windows',
  '/api/planning/free-slots?start_date=2026-10-01&end_date=2026-10-07',
  '/api/study-sessions?start_date=2026-10-01&end_date=2026-10-07',
  '/api/reminders',
  '/api/notifications?unread_only=true',
  '/api/statistics/progress?start_date=2026-10-01&end_date=2026-10-07',
  '/api/statistics/trends?start_date=2026-10-01&end_date=2026-10-07',
  '/api/statistics/reports/comparison?baseline_start_date=2026-10-01&baseline_end_date=2026-10-07&current_start_date=2026-10-08&current_end_date=2026-10-14',
]
test('real browser CORS, CSRF cookie and protected read boundaries', async ({ page }) => {
  await serveLiveFrontend(page)
  await page.goto('/planning')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  const csrf = await liveApi(page, '/sanctum/csrf-cookie')
  expect(csrf.status).toBe(204)
  const cookies = await page.context().cookies()
  expect(cookies.some((c) => c.name === 'XSRF-TOKEN')).toBe(true)
  expect(cookies.some((c) => c.httpOnly)).toBe(true)
  for (const path of paths) expect((await liveApi(page, path)).status, path).toBe(401)
})
test('authorized existing session reads F4–F6 resources without domain mutations', async ({
  browser,
}) => {
  test.skip(
    !process.env.F7_READ_STORAGE_STATE || !process.env.F7_READ_USER_ID,
    'BLOCKED: no operator-provided authorized read session/identity.',
  )
  const context = await browser.newContext({
      storageState: privateAuthPath(process.env.F7_READ_STORAGE_STATE!),
      timezoneId: 'UTC',
    }),
    page = await context.newPage()
  try {
    await serveLiveFrontend(page)
    await page.goto('/')
    const profile = await liveApi<Resource<User>>(page, '/api/profile')
    expect(profile.status).toBe(200)
    expect(profile.data.data.id).toBe(Number(process.env.F7_READ_USER_ID))
    for (const path of paths) {
      const response = await liveApi<{ data: unknown }>(page, path)
      expect(response.status, path).toBe(200)
      expect(response.data).toHaveProperty('data')
    }
    await page.reload()
    await expect(page).not.toHaveURL(/\/login/)
  } finally {
    await context.close()
  }
})
