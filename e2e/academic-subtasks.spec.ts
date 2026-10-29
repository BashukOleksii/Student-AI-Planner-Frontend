import { expect, test, type Page } from '@playwright/test'
import { f2Backend } from '../tests/helpers/f2Backend'

async function setup(page: Page) {
  const backend = f2Backend()
  const errors: string[] = []
  const xsrf: (string | undefined)[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'f2%3Dcsrf', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (request.method() !== 'GET') xsrf.push(request.headers()['x-xsrf-token'])
    const result = backend.handle(request.url(), request.method(), request.postDataJSON() ?? {})
    await route.fulfill({
      status: result.status,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
      headers,
    })
  })
  return { backend, errors, xsrf }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}
async function section(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Розділи навчального простору' })
    .getByRole('link', { name, exact: true })
    .click()
}
async function save(page: Page, label = 'Створити') {
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('academic CRUD, dependency refusal and refreshed Task subject selector', async ({
  page,
}, testInfo) => {
  const { backend, errors, xsrf } = await setup(page)
  await page.goto('/academic')
  await page.getByRole('button', { name: 'Додати заклад', exact: true }).click()
  await expect(page.getByLabel('Назва', { exact: true })).toBeFocused()
  await page.getByLabel('Назва', { exact: true }).fill('Мій університет')
  await save(page)
  await section(page, 'Навчальні періоди')
  await page.getByRole('button', { name: 'Додати період', exact: true }).click()
  await page.getByLabel('Назва', { exact: true }).fill('Осінній семестр')
  await page
    .getByLabel('Навчальний заклад', { exact: true })
    .selectOption({ label: 'Мій університет' })
  await page.getByLabel('Початок періоду', { exact: true }).fill('2026-09-01')
  await page.getByLabel('Кінець періоду', { exact: true }).fill('2026-12-31')
  await noOverflow(page)
  await save(page)
  await section(page, 'Предмети')
  await page.getByRole('button', { name: 'Додати предмет', exact: true }).click()
  await page.getByLabel('Назва', { exact: true }).fill('Дискретна математика')
  await page
    .getByLabel('Навчальний заклад', { exact: true })
    .selectOption({ label: 'Мій університет' })
  await page.getByRole('checkbox', { name: 'Код не вказано' }).uncheck()
  await page.getByLabel('Код предмета', { exact: true }).fill('DM-1')
  await page.getByLabel('Колір предмета', { exact: true }).fill('#a1B2c3')
  await save(page)
  await page.getByRole('button', { name: 'Редагувати: Дискретна математика', exact: true }).click()
  await page.getByLabel('Назва', { exact: true }).fill('Математика')
  await save(page, 'Зберегти зміни')
  await expect(page.getByRole('heading', { name: 'Математика', exact: true })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('academic-light.png'), fullPage: true })
  await section(page, 'Викладачі')
  await page.getByRole('button', { name: 'Додати викладача', exact: true }).click()
  await page.getByLabel('Ім’я викладача', { exact: true }).fill('Ірина Коваль')
  await page
    .getByLabel('Навчальний заклад', { exact: true })
    .selectOption({ label: 'Мій університет' })
  await save(page)
  await page.getByRole('button', { name: 'Редагувати: Ірина Коваль', exact: true }).click()
  await page.getByLabel('Навчальний заклад', { exact: true }).selectOption('')
  await save(page, 'Зберегти зміни')
  await expect(page.getByText('Без закладу', { exact: true })).toBeVisible()
  await page.goto('/tasks/new')
  await expect(
    page
      .getByLabel('Предмет', { exact: true })
      .getByRole('option', { name: 'Математика', exact: true }),
  ).toHaveCount(1)
  await page.goto('/academic/periods')
  backend.failure = {
    method: 'DELETE',
    path: /academic-periods\/\d+$/,
    status: 422,
    fields: { academic_period: ['Період використовується в розкладі.'] },
  }
  await page.getByRole('button', { name: 'Видалити: Осінній семестр', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
  await expect(
    page.getByRole('dialog').getByText('Період використовується в розкладі.'),
  ).toBeVisible()
  expect(backend.requests.filter((r) => r.method === 'DELETE')).toHaveLength(1)
  await page.getByRole('button', { name: 'Скасувати', exact: true }).click()
  for (const [path, name] of [
    ['periods', 'Осінній семестр'],
    ['subjects', 'Математика'],
    ['teachers', 'Ірина Коваль'],
    ['institutions', 'Мій університет'],
  ]) {
    await page.goto(`/academic/${path}`)
    await page.getByRole('button', { name: `Видалити: ${name}`, exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Записів поки немає' })).toBeVisible()
  }
  expect(xsrf.every((token) => token === 'f2=csrf')).toBe(true)
  expect(errors).toEqual([])
})

test('nested subtask CRUD, progress, keyboard reordering and parent independence', async ({
  page,
}, testInfo) => {
  const { backend, errors } = await setup(page)
  await page.goto('/tasks/1')
  await expect(page.getByText('Прогрес ще не визначено')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  for (const title of ['Зібрати джерела', 'Написати чернетку']) {
    await page.getByRole('button', { name: 'Додати підзавдання', exact: true }).click()
    await page.getByLabel('Назва підзавдання', { exact: true }).fill(title)
    await page.getByLabel('Дедлайн підзавдання', { exact: true }).fill('2026-11-10T12:30')
    await save(page, 'Створити підзавдання')
  }
  await expect(page.getByText('Виконано 0 із 2', { exact: true })).toBeVisible()
  const move = page.getByRole('button', { name: 'Перемістити вниз: Зібрати джерела', exact: true })
  await move.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.subtask-row h3').first()).toHaveText('Написати чернетку')
  expect(backend.requests.find((r) => r.path.endsWith('/reorder'))?.body).toEqual({
    subtask_ids: [11, 10],
  })
  await page
    .locator('.subtask-row')
    .first()
    .getByRole('button', { name: 'Завершити підзавдання', exact: true })
    .click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '50')
  await page
    .locator('.subtask-row')
    .last()
    .getByRole('button', { name: 'Завершити підзавдання', exact: true })
    .click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '100')
  expect(backend.tasks[0]?.status).toBe('pending')
  await page
    .locator('.subtask-row')
    .first()
    .getByRole('button', { name: 'Відновити підзавдання', exact: true })
    .click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '50')
  await page
    .getByRole('button', { name: 'Редагувати підзавдання: Написати чернетку', exact: true })
    .click()
  await page.getByLabel('Назва підзавдання', { exact: true }).fill('Перевірити чернетку')
  await page.getByLabel('Дедлайн підзавдання', { exact: true }).fill('')
  await save(page, 'Зберегти підзавдання')
  expect(backend.requests.find((r) => r.method === 'PATCH')?.body).toEqual({
    title: 'Перевірити чернетку',
    deadline_at: null,
  })
  await page
    .getByRole('button', { name: 'Видалити підзавдання: Перевірити чернетку', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Видалити підзавдання: Перевірити чернетку', exact: true })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '100')
  await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('subtasks-dark.png'), fullPage: true })
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
    await page.goto('/academic/subjects')
    await expect(page.getByRole('heading', { name: 'Предмети', exact: true })).toBeVisible()
    await noOverflow(page)
    await page.goto('/tasks/1')
    await expect(page.getByRole('heading', { name: 'Підзавдання', exact: true })).toBeVisible()
    await noOverflow(page)
  }
  expect(errors).toEqual([])
})
