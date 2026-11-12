import { expect, test, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  academicPeriod,
  importPath,
  math,
  missingSubject,
  monday,
  physics,
  revision,
  saturday,
  semesterBackend,
  semesterPath,
  tuesday,
} from '../tests/helpers/semesterBackend'

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

test('owned semester selection, server week bounds and separate legacy source', async ({
  page,
}) => {
  const { backend, pageErrors } = await setup(page, { savedDays: true })
  backend.overlaps = true
  await page.goto(`/schedule/semester-calendar?date=${tuesday}&view=week`)
  await expect(page.getByText('Оберіть семестр, щоб побачити заняття')).toBeVisible()
  await field(page, 'Навчальний період і група').selectOption('2')
  await expect(page.getByRole('heading', { name: 'Осінь 2026 · ПІ-232' })).toBeVisible()
  await expect(page.locator('.schedule-days .card')).toHaveCount(7)
  await field(page, 'Навчальний період і група').selectOption('1')
  await expect(page.getByRole('heading', { name: 'Осінь 2026 · ПІ-231' })).toBeVisible()
  await expect(
    page.getByText('Державний університет · 2026-11-02 — 2026-11-29', { exact: true }),
  ).toBeVisible()
  const days = page.locator('.schedule-days .card')
  await expect(days.first().getByRole('heading', { level: 2 })).toHaveText(/пн.*2 листопада/i)
  await expect(days.last().getByRole('heading', { level: 2 })).toHaveText(/нд.*8 листопада/i)
  await expect(days.nth(1)).toContainText('Пара 4')
  await expect(days.nth(1)).toContainText('Чисельник')
  await expect(days.nth(1)).toContainText(math.name)
  await expect(days.nth(1)).toContainText('08:30')
  await expect(days.nth(2)).toContainText('Заміна на дату')
  await expect(days.nth(5)).toContainText('Робоча субота')
  await expect(link(days.nth(1), 'Змінити пару на весь семестр')).toHaveAttribute(
    'href',
    `${view}/rules/13`,
  )
  await expect(link(days.nth(2), 'Редагувати весь день')).toHaveAttribute(
    'href',
    `${view}/dates/2026-11-04`,
  )
  await expect(page.locator('a[href^="/schedule/lessons/"]')).toHaveCount(0)
  await button(page, 'Наступний період').click()
  await expect(days.nth(1)).toContainText('Знаменник')
  await expect(days.nth(1)).toContainText(physics.name)
  await expect(days.nth(5)).not.toContainText('Робоча субота')
  await button(page, 'День').click()
  await expect(days).toHaveCount(1)
  await field(page, 'Дата розкладу').fill('2026-12-01')
  await expect(page.getByText('Поза межами семестру', { exact: true })).toBeVisible()
  await button(page, 'Сьогодні').click()
  await expect(days.first()).toContainText(math.name)
  expect(backend.requests.some((r) => /^\/api\/(planning|ai\/|schedule\/)/.test(r.path))).toBe(
    false,
  )
  await link(page, 'Окремі заняття').click()
  await expect(page.getByRole('heading', { name: 'Окремі заняття', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/schedule/lessons/9"]')).toBeVisible()
  await expect(link(page, 'Імпорт датованих занять')).toHaveAttribute('href', '/schedule/import')
  expect(pageErrors).toEqual([])
})

test('manual creation, recurring rule lifecycle, validation and explicit slot release', async ({
  page,
}) => {
  const { backend } = await setup(page, { empty: true })
  await page.goto('/schedule/semester-calendar')
  await expect(page.getByText('Семестрових розкладів ще немає')).toBeVisible()
  await link(page, 'Створити семестр').click()
  await field(page, 'Навчальний період').selectOption(String(academicPeriod.id))
  await field(page, 'Група').fill('ПІ-999')
  await field(page, 'Понеділок відліку').fill(monday)
  await expect(field(page, 'Парність тижня відліку')).toHaveValue('')
  await field(page, 'Парність тижня відліку').selectOption('numerator')
  await button(page, 'Створити семестр').click()
  await expect(page).toHaveURL(new RegExp(view + '$'))
  expect(
    backend.requests.find((r) => r.path === semesterPath && r.method === 'POST')?.body,
  ).toEqual({
    academic_period_id: academicPeriod.id,
    group_name: 'ПІ-999',
    parity_anchor_on: monday,
    first_week_parity: 'numerator',
  })

  await link(page, 'Налаштування семестру').click()
  await field(page, 'Група').fill('ПІ-998')
  await field(page, 'Парність тижня відліку').selectOption('denominator')
  await button(page, 'Зберегти налаштування').click()
  await expect(page.getByText('Налаштування збережено.')).toBeVisible()
  expect(backend.requests.find((r) => r.path === api && r.method === 'PATCH')?.body).toEqual({
    group_name: 'ПІ-998',
    first_week_parity: 'denominator',
    schedule_token: revision(2),
  })
  await link(page, '← Керування семестром').click()
  await link(page, 'Додати пару').click()
  await field(page, 'День тижня').selectOption('2')
  await field(page, 'Повторення').selectOption('denominator')
  await field(page, 'Номер пари').fill('4')
  await page.getByText('Позначення номера пари', { exact: true }).click()
  await expect(page.getByText(/Автоматичне позначення: 7-8/)).toBeVisible()
  await field(page, 'Початок').fill('08:30:15')
  await field(page, 'Кінець').fill('09:50:00')
  await field(page, 'Предмет').selectOption(String(math.id))
  await field(page, 'Викладач').selectOption('23')
  backend.fail(`${api}/weekly-rules`, 'POST', {
    status: 422,
    body: {
      message: 'The given data was invalid.',
      errors: { starts_at_local: ['The start time is invalid.'] },
    },
  })
  await button(page, 'Зберегти пару').click()
  await expect(field(page, 'Початок')).toHaveAttribute('aria-invalid', 'true')
  await expect(field(page, 'Початок')).toHaveAccessibleDescription(/The start time is invalid\./)
  await field(page, 'Початок').fill('08:30:00')
  await button(page, 'Зберегти пару').click()
  await expect(page).toHaveURL(new RegExp(view + '$'))
  expect(
    backend.requests.filter((r) => r.path === `${api}/weekly-rules` && r.method === 'POST').at(-1)
      ?.body,
  ).toMatchObject({
    weekday: 2,
    week_pattern: 'denominator',
    pair_number: 4,
    pair_label: '7-8',
    starts_at_local: '08:30:00',
    teacher_id: 23,
    schedule_token: revision(3),
  })
  await button(page, 'Видалити семестр').click()
  await confirmDelete(page, 'Видалити семестр?')
  await expect(
    page.getByText(/A schedule with semester import history cannot be deleted/),
  ).toBeVisible()
  await link(page, 'Семестрова математика · пара 4').click()
  await field(page, 'Аудиторія').fill('401')
  await button(page, 'Зберегти пару').click()
  await expect(page.getByText('Щотижневу пару збережено.')).toBeVisible()
  await button(page, 'Видалити щотижневу пару').click()
  await confirmDelete(page, 'Видалити щотижневу пару?')
  await expect(page.getByText('Вівторок · пара 4 · Знаменник', { exact: true })).toBeVisible()
  await button(page, 'Зняти захист').click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(
    backend.requests.some((r) => r.path.includes('suppressed-slots/') && r.method === 'DELETE'),
  ).toBe(false)
  await button(page, 'Зняти захист').click()
  await confirmDelete(page, 'Дозволити знову додати цю пару?', 'Зняти захист')
  await expect(
    page.getByText('Немає видалених пар, захищених від повторного імпорту.'),
  ).toBeVisible()
  expect(backend.data.weekly_rules).toHaveLength(0)
  expect(backend.requests.find((r) => r.path === `${api}/suppressed-slots/70`)?.body).toEqual({
    confirmed: true,
    schedule_token: revision(6),
  })
})

test('copy-base changes one pair and keeps others, then cancels and restores the whole day', async ({
  page,
}) => {
  const { backend } = await setup(page)
  const path = `${api}/date-exceptions/${monday}`
  await page.goto(`${view}/dates/${monday}`)
  const pair = page.getByRole('group', { name: `Пара 1 · ${math.name}`, exact: true })
  await field(pair, 'Аудиторія').fill('Одноденна')
  page.once('dialog', (dialog) => dialog.dismiss())
  await link(page, 'Переглянути день').click()
  await expect(page).toHaveURL(new RegExp(`/dates/${monday}$`))
  await expect(field(pair, 'Аудиторія')).toHaveValue('Одноденна')
  await button(page, 'Додати пару').click()
  const extra = page.getByRole('group', { name: 'Додаткова пара 1' })
  await field(extra, 'Номер пари').fill('3')
  await field(extra, 'Предмет').selectOption(String(math.id))
  await field(extra, 'Викладач').selectOption('23')
  await field(extra, 'Початок').fill('12:00:00')
  await field(extra, 'Кінець').fill('13:00:00')
  await button(page, 'Зберегти зміни на цю дату').click()
  await expect(page.getByText('Розклад на цю дату збережено.', { exact: true })).toBeVisible()
  expect(backend.requests.find((r) => r.path === path && r.method === 'PUT')?.body).toMatchObject({
    mode: 'copy_base',
    changes: [{ weekly_lesson_rule_id: 11, room: 'Одноденна' }],
    lessons: [{ pair_number: 3, starts_at_local: '12:00:00', ends_at_local: '13:00:00' }],
    schedule_token: revision(1),
  })
  expect(backend.data.date_exceptions[0]?.lessons.map((item) => item.pair_number)).toEqual([
    1, 2, 3,
  ])
  const kept = backend.data.date_exceptions[0]!.lessons[1]!
  await button(page, 'Прибрати з розкладу цієї дати').first().click()
  await button(page, 'Зберегти зміни на цю дату').click()
  await expect(page.getByText('Розклад на цю дату збережено.', { exact: true })).toBeVisible()
  expect(
    backend.requests.filter((r) => r.path === path && r.method === 'PUT').at(-1)?.body,
  ).toMatchObject({
    mode: 'replace',
    lessons: [{ id: kept.id, pair_number: 2 }, { pair_number: 3 }],
    schedule_token: revision(2),
  })
  await button(page, 'Скасувати всі пари на цю дату').click()
  await button(page.getByRole('dialog'), 'Підтвердити скасування дня').click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Усі пари на цю дату скасовано.' }),
  ).toBeVisible()
  expect(
    backend.requests.filter((r) => r.path === path && r.method === 'PUT').at(-1)?.body,
  ).toEqual({
    mode: 'replace',
    lessons: [],
    schedule_token: revision(3),
  })
  await button(page, 'Відновити щотижневий розклад').click()
  await confirmDelete(page, 'Відновити щотижневий розклад?', 'Відновити розклад')
  await expect(page.getByText('Заміна видалена. Діє поточний щотижневий розклад.')).toBeVisible()
  await link(page, 'Переглянути день').click()
  await expect(page.locator('.schedule-days .lesson')).toHaveCount(2)
  expect(backend.requests.find((r) => r.path === path && r.method === 'DELETE')?.body).toEqual({
    confirmed: true,
    schedule_token: revision(4),
  })
})

test('working Saturday copies selected weekday rules and edits its saved lesson IDs', async ({
  page,
}) => {
  const { backend } = await setup(page, { savedDays: true })
  await page.goto(view)
  await field(page, 'Дата суботи').fill('2026-11-14')
  await field(page, 'Скопіювати день').selectOption('1')
  await field(page, 'Парність тижня').selectOption('numerator')
  await expect(page.getByText('Джерело копії · Понеділок · Чисельник')).toBeVisible()
  const choices = page.getByRole('group', { name: 'Пари для копіювання' }).getByRole('checkbox')
  await choices.nth(0).check()
  await choices.nth(1).check()
  await button(page, 'Створити робочу суботу').click()
  await expect(page.getByRole('heading', { name: 'Редагувати робочу суботу' })).toBeVisible()
  expect(backend.requests.find((r) => r.path === `${api}/working-saturdays`)?.body).toEqual({
    occurs_on: '2026-11-14',
    copied_weekday: 1,
    source_week_parity: 'numerator',
    selected_weekly_rule_ids: [11, 12],
    schedule_token: revision(1),
  })
  const newSaturday = backend.data.date_exceptions.find((item) => item.occurs_on === '2026-11-14')!
  const ids = newSaturday.lessons.map((item) => item.id)
  const pair = page.getByRole('group', { name: 'Збережена пара 1' })
  await field(pair, 'Аудиторія').fill('Лише субота')
  await button(page, 'Зберегти зміни на цю дату').click()
  await expect(page.getByText('Розклад на цю дату збережено.', { exact: true })).toBeVisible()
  const write = backend.requests.find((r) => r.method === 'PUT')?.body
  expect(write).toMatchObject({
    mode: 'replace',
    schedule_token: revision(2),
    lessons: [{ id: ids[0], room: 'Лише субота' }, { id: ids[1] }],
  })
  expect(backend.data.weekly_rules[0]?.room).toBe('301')
  expect(
    backend.data.date_exceptions.find((item) => item.occurs_on === saturday)?.lessons[0]?.room,
  ).toBe('Суботня')
  await link(page, 'Переглянути день').click()
  await expect(page.locator('.schedule-days')).toContainText('Лише субота')
  await expect(page.locator('.schedule-days')).toContainText('Робоча субота')
})

test('XLSX review shows impact, catalog correction and renewed consent after stale preview', async ({
  page,
}) => {
  const { backend } = await setup(page, { savedDays: true })
  backend.staleCommit = true
  await page.goto('/schedule/semester-import')
  await field(page, 'Навчальний період').selectOption(String(academicPeriod.id))
  await expect(button(page, 'Завантажити для перегляду')).toBeDisabled()
  await field(page, 'Файл розкладу (.xlsx)').setInputFiles(book)
  await button(page, 'Завантажити для перегляду').click()
  await expect(page).toHaveURL(new RegExp(review + '$'))
  const upload = backend.requests.find((r) => r.path === importPath && r.method === 'POST')!.body
  expect(upload).toMatchObject({ academic_period_id: String(academicPeriod.id) })
  expect(Object.keys(upload).sort()).toEqual(['academic_period_id', 'schedule_file'])
  expect(upload.schedule_file).toMatchObject({ name: 'schedule-example.xlsx' })
  await expect(page.getByText('No owned subject exactly matches this imported name.')).toBeVisible()
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
  await expect(page).toHaveURL(
    /\/schedule\/semester-calendar\?semester=1&date=2026-11-02&view=week&receipt=41$/,
  )
  await expect(page.getByRole('heading', { name: 'Розклад успішно імпортовано' })).toBeVisible()
  expect(backend.requests.filter((r) => r.path === commit).map((r) => r.body)).toEqual([
    { confirmed: true, preview_token: token },
    { confirmed: true, preview_token: nextToken },
  ])
  await link(page, 'Відкрити пакет імпорту').click()
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
  await link(page, 'До імпортованого семестру').click()
  await expect(page).toHaveURL(/receipt=41$/)
  expect(backend.requests.filter((r) => r.path === commit)).toHaveLength(1)
})

test('timetable, date editor and import confirmation fit narrow screens and pass axe', async ({
  page,
}) => {
  await setup(page, { savedDays: true, readyImport: true })
  await page.setViewportSize({ width: 320, height: 850 })
  async function audit() {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        result.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([])
    }
  }
  await page.goto(`/schedule/semester-calendar?semester=1&date=${tuesday}&view=week`)
  await expect(page.locator('.schedule-days .card')).toHaveCount(7)
  await audit()
  await page.goto(`${view}/dates/${saturday}`)
  await expect(field(page, 'Аудиторія')).toHaveValue('Суботня')
  await audit()
  await page.goto(review)
  await button(page, 'Переглянути підтвердження імпорту').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(button(dialog, 'Закрити діалог')).toBeFocused()
  await audit()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(button(page, 'Переглянути підтвердження імпорту')).toBeFocused()
})
