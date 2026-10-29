import { expect, test, type Page } from '@playwright/test'
import { planningBackend, sessionFixture } from '../tests/helpers/planningBackend'
async function setup(page: Page, loseResponse = false) {
  const backend = planningBackend(),
    errors: string[] = []
  let confirmations = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'plan%2Bcsrf%3D', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (req.method() !== 'GET') expect(req.headers()['x-xsrf-token']).toBe('plan+csrf=')
    const result = backend.handle(req.url(), req.method(), req.postDataJSON() ?? {})
    if (req.url().endsWith('/confirm')) {
      confirmations++
      if (loseResponse) return route.abort('failed')
    }
    await route.fulfill({
      status: result.status,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
      headers,
    })
  })
  return {
    backend,
    errors,
    get confirmations() {
      return confirmations
    },
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}
async function period(page: Page) {
  await page.getByLabel('Початок періоду', { exact: true }).fill('2026-11-02')
  await page.getByLabel('Кінець періоду', { exact: true }).fill('2026-11-08')
}
test('complete planning journey: preferences, availability, slots, partial plan, sessions and adaptive consent', async ({
  page,
}, testInfo) => {
  const state = await setup(page)
  await page.goto('/planning/preferences')
  await expect(
    page.getByRole('heading', { name: 'Вподобання навчання', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Денний ліміт, хв', { exact: true }).fill('120')
  await page.getByLabel('Тижневий ліміт, хв', { exact: true }).fill('600')
  await page.getByRole('button', { name: 'Зберегти вподобання', exact: true }).click()
  await expect(page.getByText('Вподобання збережено.', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Доступність', exact: true })
    .click()
  await page.getByRole('button', { name: 'Додати інтервал', exact: true }).click()
  await page.getByLabel('Початок інтервалу', { exact: true }).fill('09:00:00')
  await page.getByLabel('Кінець інтервалу', { exact: true }).fill('24:00:00')
  await page.getByRole('button', { name: 'Зберегти інтервал', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.backend.windows[0]).toMatchObject({
    day_of_week: 1,
    starts_at: '09:00:00',
    ends_at: '24:00:00',
  })
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Вільний час', exact: true })
    .click()
  await period(page)
  await page.getByLabel('Мінімальна тривалість, хв', { exact: true }).fill('30')
  await page.getByRole('button', { name: 'Знайти вільний час', exact: true }).click()
  await expect(page.getByText('60 хв', { exact: true })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Новий план', exact: true })
    .click()
  await period(page)
  await page.getByLabel('Завдання для планування', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Пропозиція — ще не збережено', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  expect(state.confirmations).toBe(0)
  expect(await page.content()).not.toContain('opaquePlanToken')
  await noOverflow(page)
  await page
    .getByLabel('Приймаю частковий результат і неперенесену тривалість', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Збережений результат', exact: true }),
  ).toBeVisible()
  expect(state.confirmations).toBe(1)
  await page.getByRole('link', { name: 'Сесія №21', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Навчальна сесія №21', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Перенести сесію', exact: true }).click()
  await page.getByLabel('Новий початок', { exact: true }).fill('2026-11-03T11:00')
  await page.getByLabel('Нове завершення', { exact: true }).fill('2026-11-03T11:15')
  await page.getByRole('button', { name: 'Переглянути наслідки', exact: true }).click()
  await expect(page.getByText(/Це негайна операція/)).toBeVisible()
  await page.getByRole('button', { name: 'Підтвердити перенесення', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Фактичний результат перенесення', exact: true }),
  ).toBeVisible()
  expect(state.backend.requests.find((r) => r.path.endsWith('/reschedule'))?.body).toEqual({
    starts_at: '2026-11-03T09:00:00Z',
    ends_at: '2026-11-03T09:15:00Z',
  })
  await page
    .getByRole('navigation', { name: 'Планування навчання', exact: true })
    .getByRole('link', { name: 'Перепланування', exact: true })
    .click()
  await period(page)
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
  const partial = page.getByLabel('Приймаю частковий результат і неперенесену тривалість', {
      exact: true,
    }),
    cancellation = page.getByLabel(
      'Дозволяю скасувати початкові сесії без заміни та їхні заплановані нагадування',
      { exact: true },
    )
  await expect(partial).not.toBeChecked()
  await expect(cancellation).not.toBeChecked()
  await partial.check()
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  await cancellation.check()
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('adaptive-review.png'), fullPage: true })
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Збережений результат', exact: true }),
  ).toBeVisible()
  expect(
    state.backend.requests.find((r) => r.path === '/api/planning/replanning/confirm')?.body,
  ).toEqual({
    preview_token: 'opaqueReplanToken==',
    accept_partial: true,
    accept_unplaced_cancellation: true,
  })
  await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Вітаємо/ })).toBeVisible()
  await noOverflow(page)
  await page.goto('/schedule')
  await page.getByRole('link', { name: 'Планування навчання', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Планування навчання', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Обговорити з AI', exact: true }).click()
  await expect(page).toHaveURL(/\/ai$/)
  expect(state.errors).toEqual([])
})
test('lost direct confirmation is inspected without automatic replay; historical lifecycle remains explicit', async ({
  page,
}) => {
  const state = await setup(page, true)
  state.backend.sessions = [sessionFixture(1)]
  await page.goto('/planning/preview')
  await period(page)
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
  await page
    .getByLabel('Приймаю частковий результат і неперенесену тривалість', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  await expect(page.getByText(/Результат підтвердження не встановлено/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Підтвердити зміни', exact: true })).toBeDisabled()
  expect(state.confirmations).toBe(1)
  expect(state.backend.sessions).toHaveLength(2)
  await page.getByRole('link', { name: 'Перевірити поточні сесії', exact: true }).click()
  await page.getByRole('link', { name: 'Сесія №1', exact: true }).click()
  await page.getByLabel('Фактична тривалість, хв (необов’язково)', { exact: true }).fill('25')
  await page.getByRole('button', { name: 'Завершити сесію', exact: true }).click()
  await expect(page.getByText('Завершено', { exact: true })).toBeVisible()
  await expect(page.getByText(/Повторне відкриття/)).toBeVisible()
  expect(state.backend.sessions[0]?.actual_minutes).toBe(25)
  await noOverflow(page)
  expect(state.errors).toEqual([])
})
