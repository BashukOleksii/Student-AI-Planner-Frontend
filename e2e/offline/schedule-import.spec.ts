import { expect, test, type Page } from '@playwright/test'
import { scheduleBackend } from '../../tests/helpers/scheduleBackend'

async function setup(page: Page) {
  const backend = scheduleBackend()
  await page.clock.setFixedTime(new Date('2026-11-02T06:00:00Z'))
  const academic = backend.base.base.academic
  academic.institutions.push({ id: 1, name: 'Мій університет' })
  const period = academic.periods[0]!
  if ('education_institution_id' in period) period.education_institution_id = 1
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'schedule%3Dcsrf', url: 'http://localhost:4173' }])
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.method() !== 'GET') expect(request.headers()['x-xsrf-token']).toBe('schedule=csrf')
    const response = backend.handle(request.url(), request.method(), request.postDataJSON() ?? {})
    return route.fulfill({
      status: response.status,
      headers,
      ...(response.status === 204 ? {} : { json: response.body ?? {} }),
    })
  })
  return { backend, errors }
}

test('dated Lesson creation and editing keep canonical UTC and an immutable period', async ({
  page,
}) => {
  const { backend, errors } = await setup(page)
  await page.goto('/schedule/lessons/new?date=2026-11-02')
  await page.locator('#lesson-subject').selectOption('7')
  await page.locator('#lesson-teacher').selectOption('8')
  await page.locator('#lesson-start').fill('11:00')
  await page.locator('#lesson-end').fill('12:00')
  await page.locator('#lesson-room').fill('402')
  await page.getByRole('button', { name: 'Створити заняття', exact: true }).click()
  await expect
    .poll(
      () => backend.requests.filter((r) => r.method === 'POST' && r.path === '/api/lessons').length,
    )
    .toBe(1)
  expect(
    backend.requests.find((r) => r.method === 'POST' && r.path === '/api/lessons')?.body,
  ).toEqual({
    subject_id: 7,
    teacher_id: 8,
    academic_period_id: 4,
    type: 'lecture',
    room: '402',
    starts_at: '2026-11-02T09:00:00Z',
    ends_at: '2026-11-02T10:00:00Z',
  })
  await page.goto('/schedule/lessons/9/edit')
  await page.locator('#lesson-room').fill('')
  await page.locator('#lesson-teacher').selectOption('')
  await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).click()
  await expect.poll(() => backend.requests.filter((r) => r.method === 'PATCH').length).toBe(1)
  expect(backend.requests.find((r) => r.method === 'PATCH')?.body).toEqual({
    room: null,
    teacher_id: null,
  })
  expect(backend.lessons[0]?.academic_period_id).toBe(4)
  expect(errors).toEqual([])
})

test('dated import history is read-only and preserves workbook provenance', async ({ page }) => {
  const { backend, errors } = await setup(page)
  await page.goto('/schedule/imports/40')
  await expect(page).toHaveURL('/schedule/import-history/40')
  await expect(
    page.getByRole('heading', { name: 'Історія імпорту занять', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('розклад.xlsx', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Підтвердити імпорт', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Повторно перевірити', exact: true })).toHaveCount(
    0,
  )
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.locator('.import-row')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.import-row')).toHaveCount(2)
  expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  expect(errors).toEqual([])
})

test('retired dated upload redirects to the calendar without a file or upload request', async ({
  page,
}) => {
  const { backend, errors } = await setup(page)
  await page.goto('/schedule/import')
  await expect(page).toHaveURL('/schedule/legacy')
  await expect(page.getByRole('heading', { name: 'Окремі заняття', exact: true })).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)
  expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  expect(errors).toEqual([])
})
