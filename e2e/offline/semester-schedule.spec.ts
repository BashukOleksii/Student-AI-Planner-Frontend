import { expect, test, type Locator, type Page } from '@playwright/test'
import type { OccurrenceResponse } from '../../src/types/semesterSchedule'
import {
  academicPeriod,
  importPath,
  math,
  missingSubject,
  monday,
  revision,
  saturday,
  semesterBackend,
  semesterPath,
} from '../../tests/helpers/semesterBackend'
const view = '/schedule/semesters/1'
const api = `${semesterPath}/1`
const review = '/schedule/semester-imports/41'
const commit = `${importPath}/41/commit`
const book = 'public/examples/schedule-example.xlsx'
const button = (page: Page | Locator, name: string) =>
  page.getByRole('button', { name, exact: true })
const link = (page: Page | Locator, name: string) => page.getByRole('link', { name, exact: true })
const field = (page: Page | Locator, label: string) => page.getByLabel(label, { exact: true })
async function setup(page: Page, options?: Parameters<typeof semesterBackend>[0]) {
  const backend = semesterBackend(options)
  backend.legacy.base.base.academic.periods = backend.legacy.base.base.academic.periods.filter(
    (period) => period.id === academicPeriod.id,
  )
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-11-02T08:00:00Z'))
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'semester%3Dcsrf', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    }
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.url() === 'http://localhost:8000/sanctum/csrf-cookie')
      return route.fulfill({ status: 204, headers })
    if (method !== 'GET') expect(request.headers()['x-xsrf-token']).toBe('semester=csrf')
    const contentType = request.headers()['content-type']
    let body: Record<string, unknown> = {}
    if (contentType?.startsWith('multipart/form-data')) {
      const multipart = await new Response(new Uint8Array(request.postDataBuffer()!), {
        headers: { 'Content-Type': contentType },
      }).formData()
      body = Object.fromEntries(multipart)
    } else if (request.postData()) {
      body = request.postDataJSON()
    }
    if (new URL(request.url()).pathname.startsWith('/api/academic-calendar/')) {
      const segments = new URL(request.url()).pathname.split('/')
      const day = segments.at(-1) === 'today' ? monday : segments.at(-1)!
      const mode = segments.includes('week') ? 'week' : 'date'
      const response = backend.handle(`http://localhost:8000${api}/${mode}/${day}`, 'GET')
        .body as OccurrenceResponse
      return route.fulfill({
        headers,
        json: {
          data: response.data.map((lesson) => ({
            ...lesson,
            id: lesson.occurrence_id,
            source_identity: lesson.occurrence_id,
            source_type: 'semester_occurrence',
            semester_schedule_id: 1,
            lesson_id: null,
            type: lesson.lesson_type,
          })),
          meta: {
            ...response.meta,
            truncated: false,
            total: response.data.length,
            returned: response.data.length,
            limit: 100,
          },
        },
      })
    }
    const result = backend.handle(request.url(), method, body)
    return route.fulfill({
      status: result.status,
      headers,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
    })
  })
  return { backend, pageErrors }
}
async function confirmDelete(page: Page, title: string, confirmLabel = 'Видалити') {
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  await expect(button(dialog, 'Скасувати')).toBeFocused()
  await button(dialog, confirmLabel).click()
}
async function consent(page: Page) {
  await button(page, 'Переглянути підтвердження імпорту').click()
  const dialog = page.getByRole('dialog', { name: 'Підтвердити семестровий імпорт?' })
  const check = dialog.getByRole('checkbox')
  await expect(check).not.toBeChecked()
  await expect(button(dialog, 'Підтвердити імпорт')).toBeDisabled()
  await check.focus()
  await page.keyboard.press('Space')
  await expect(check).toBeChecked()
  await button(dialog, 'Підтвердити імпорт').click()
}
test('current semester is selected only when unambiguous and legacy lessons stay separate', async ({
  page,
}) => {
  const { backend, pageErrors } = await setup(page, { savedDays: true })
  backend.overlaps = true
  await page.goto('/schedule/semester-calendar')
  await expect(page.getByText('Потрібно уточнити поточний розклад', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Редагувати розклад', exact: true })).toHaveCount(0)
  backend.overlaps = false
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Осінь 2026 · ПІ-231', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.schedule-day-card')).toHaveCount(5)
  await expect(page.locator('main')).toContainText(math.name)
  await expect(page.locator('a[href="/schedule/lessons/9"]')).toHaveCount(0)
  await page.goto('/schedule/legacy')
  await expect(page.getByRole('heading', { name: 'Окремі заняття', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/schedule/lessons/9"]')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('weekly editor saves a minimal change and preserves every unrelated rule', async ({
  page,
}) => {
  const { backend, pageErrors } = await setup(page)
  const before = structuredClone(backend.data.weekly_rules)
  await page.goto(`${view}/rules/11`)
  await page.locator('input[maxlength="100"]').first().fill('Новий кабінет')
  await button(page, 'Зберегти').click()
  await expect(page).toHaveURL(/\/schedule\/semester-calendar/)
  expect(backend.requests.filter((r) => r.method === 'PATCH')).toEqual([
    {
      path: `${api}/weekly-rules/11`,
      method: 'PATCH',
      body: { room: 'Новий кабінет', schedule_token: revision(1) },
    },
  ])
  expect(backend.data.weekly_rules[0]).toEqual({
    ...before[0],
    room: 'Новий кабінет',
    is_manually_managed: true,
  })
  expect(backend.data.weekly_rules.slice(1)).toEqual(before.slice(1))
  await expect(page.locator('main')).toContainText('Новий кабінет')
  expect(pageErrors).toEqual([])
})

test('one-date changes preserve other pairs and restoring removes only the snapshot', async ({
  page,
}) => {
  const { backend, pageErrors } = await setup(page)
  const before = structuredClone(backend.data.weekly_rules)
  await page.goto(`${view}/dates/${monday}`)
  await field(page.getByRole('group', { name: 'Пара 1', exact: true }), 'Аудиторія').fill(
    'Одноденна',
  )
  await button(page, 'Зберегти зміни на цю дату').click()
  await expect(page).toHaveURL(new RegExp(`/schedule\\?date=${monday}$`))
  expect(backend.requests.find((r) => r.method === 'PUT')?.body).toEqual({
    mode: 'copy_base',
    changes: [{ weekly_lesson_rule_id: 11, room: 'Одноденна' }],
    lessons: [],
    schedule_token: revision(1),
  })
  expect(backend.data.date_exceptions[0]?.lessons).toHaveLength(2)
  expect(backend.data.date_exceptions[0]?.lessons[0]?.room).toBe('Одноденна')
  expect(backend.data.weekly_rules).toEqual(before)
  await page.goto(`${view}/dates/${monday}`)
  await button(page, 'Відновити щотижневий розклад').click()
  await button(page.getByRole('dialog'), 'Відновити розклад').click()
  await expect(
    page.getByText('Заміна видалена. Діє поточний щотижневий розклад.', { exact: true }),
  ).toBeVisible()
  expect(backend.data.date_exceptions).toEqual([])
  expect(backend.data.weekly_rules).toEqual(before)
  expect(pageErrors).toEqual([])
})

test('saved working Saturday edits its snapshot identities without changing weekly rules', async ({
  page,
}) => {
  const { backend, pageErrors } = await setup(page, { savedDays: true })
  const before = structuredClone(backend.data.weekly_rules)
  const saved = backend.data.date_exceptions.find((item) => item.occurs_on === saturday)!
  const ids = saved.lessons.map((item) => item.id)
  await page.goto(`${view}/dates/${saturday}`)
  await expect(page.locator('.scope-notice')).toContainText('Робоча субота')
  await field(page.getByRole('group', { name: 'Пара 1', exact: true }), 'Аудиторія').fill(
    'Лише субота',
  )
  await button(page, 'Зберегти зміни на цю дату').click()
  await expect(page).toHaveURL(new RegExp(`/schedule\\?date=${saturday}$`))
  const write = backend.requests.find((r) => r.method === 'PUT')?.body
  expect(write).toMatchObject({
    mode: 'replace',
    lessons: [{ id: ids[0], room: 'Лише субота' }],
    schedule_token: revision(1),
  })
  expect(backend.data.weekly_rules).toEqual(before)
  expect(pageErrors).toEqual([])
})

test('XLSX review shows impact, catalog correction and renewed consent after stale preview', async ({
  page,
}) => {
  const { backend } = await setup(page, { savedDays: true })
  backend.staleCommit = true
  await page.goto('/schedule/semester-import')
  await expect(page.getByText(academicPeriod.name, { exact: true })).toBeVisible()
  await expect(button(page, 'Завантажити для перегляду')).toBeDisabled()
  await field(page, 'Файл розкладу (.xlsx)').setInputFiles(book)
  await button(page, 'Завантажити для перегляду').click()
  await expect(page).toHaveURL(new RegExp(review + '$'))
  const upload = backend.requests.find((r) => r.path === importPath && r.method === 'POST')!.body
  expect(upload).toMatchObject({ academic_period_id: String(academicPeriod.id) })
  expect(Object.keys(upload).sort()).toEqual(['academic_period_id', 'schedule_file'])
  expect(upload.schedule_file).toMatchObject({ name: 'schedule-example.xlsx' })
  await expect(page.getByText('No owned subject exactly matches this imported name.')).toHaveCount(
    0,
  )
  await expect(page.locator('.import-row').first()).toContainText(missingSubject)
  await expect(page.getByText('Це щотижневе правило буде видалено.')).toBeVisible()
  await expect(page.getByText(/заняття на цю дату залишиться в розкладі/)).toBeVisible()
  await expect(page.getByRole('listitem').filter({ has: link(page, saturday) })).toContainText(
    'Робоча субота',
  )
  await page.locator('.import-row details summary').first().click()
  await expect(page.getByText('Джерело Excel', { exact: true }).first()).toBeVisible()
  await expect(button(page, 'Переглянути підтвердження імпорту')).toHaveCount(0)
  await link(page, 'Виправити предмети').click()
  await button(page, 'Додати предмет').click()
  await page.getByRole('dialog').getByLabel(/Назва/).fill(missingSubject)
  await button(page.getByRole('dialog'), 'Створити').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await link(page, 'Повернутися до перевірки імпорту →').click()
  await button(page, 'Повторно перевірити').click()
  await expect(
    page.getByText('Повторну перевірку завершено. Перегляньте актуальні операції.'),
  ).toBeVisible()
  expect(backend.requests.find((r) => r.path.endsWith('/revalidate'))?.body).toEqual({})
  for (const text of [
    'Створення',
    'Оновлення',
    'Видалення',
    'Без змін',
    'Збереження захищеного правила',
    'Дублікати у файлі',
  ])
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible()
  const token = backend.batch.preview_token
  await consent(page)
  await expect(
    page.getByText('Огляд змінився. Перегляньте поточні операції та підтвердьте їх окремо.'),
  ).toBeVisible()
  expect(backend.requests.filter((r) => r.path === commit).map((r) => r.body)).toEqual([
    { confirmed: true, preview_token: token },
  ])
  const nextToken = backend.batch.preview_token
  await consent(page)
  await expect(page).toHaveURL(/\/schedule\/semester-calendar(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Розклад успішно імпортовано' })).toBeVisible()
  expect(backend.requests.filter((r) => r.path === commit).map((r) => r.body)).toEqual([
    { confirmed: true, preview_token: token },
    { confirmed: true, preview_token: nextToken },
  ])
  await page.goto(review)
  await expect(page.getByRole('heading', { name: 'Розклад успішно імпортовано' })).toBeVisible()
  expect(backend.requests.filter((r) => r.path === commit)).toHaveLength(2)
})
test('lost commit response uses GET recovery and the existing receipt', async ({ page }) => {
  const { backend } = await setup(page, { readyImport: true, savedDays: true })
  backend.loseCommit = true
  await page.goto(review)
  await consent(page)
  await expect(
    page.getByRole('alert').filter({ hasText: 'Результат запиту невідомий.' }),
  ).toBeVisible()
  await expect(button(page, 'Переглянути підтвердження імпорту')).toBeDisabled()
  await button(page, 'Перевірити стан пакета').click()
  await expect(page.getByRole('heading', { name: 'Розклад успішно імпортовано' })).toBeVisible()
  expect(backend.batch.receipt?.semester_schedule_id).toBe(1)
  await page.goto('/schedule/semester-calendar')
  await expect(page).toHaveURL(/\/schedule\/semester-calendar(?:\?|$)/)
  expect(backend.requests.filter((r) => r.path === commit)).toHaveLength(1)
})
