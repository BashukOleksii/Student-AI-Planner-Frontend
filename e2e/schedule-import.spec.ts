import { expect, test, type Page } from '@playwright/test'
import { scheduleBackend } from '../tests/helpers/scheduleBackend'
test.use({ timezoneId: 'UTC' })
async function setup(page: Page, options: { loseCommit?: number; staleCommit?: boolean } = {}) {
  const backend = scheduleBackend(),
    errors: string[] = [],
    uploads: { period: unknown; name: string }[] = []
  let commits = 0
  page.on('pageerror', (error) => errors.push(error.message))
  // Chromium's Network.getRequestPostData omits file bytes (protocol.d.ts).
  // Inspect the real browser FormData before forwarding to unchanged native fetch.
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (input, init) => {
      if (init?.body instanceof FormData) {
        const file = init.body.get('schedule_file')
        if (file instanceof File) {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const browser = window as Window & { f5UploadedFiles?: unknown[] }
          browser.f5UploadedFiles = [
            ...(browser.f5UploadedFiles ?? []),
            {
              period: init.body.get('academic_period_id'),
              name: file.name,
              bytes: bytes.length,
              magic: [...bytes.slice(0, 2)],
              fields: [...init.body.keys()],
            },
          ]
        }
      }
      return original(input, init)
    }
  })

  await page
    .context()
    .addCookies([{ name: 'XSRF-TOKEN', value: 'schedule%2Bcsrf%3D', url: 'http://localhost:4173' }])
  await page.route('http://localhost:8000/**', async (route) => {
    const req = route.request(),
      headers = {
        'Access-Control-Allow-Origin': 'http://localhost:4173',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    let body: Record<string, unknown> = {}
    if (req.headers()['content-type']?.startsWith('multipart/form-data')) {
      const buffer = req.postDataBuffer()!
      const form = await new Response(new Uint8Array(buffer), {
        headers: { 'Content-Type': req.headers()['content-type']! },
      }).formData()
      body = Object.fromEntries(form.entries())
      const file = form.get('schedule_file')
      expect(file).toBeInstanceOf(File)
      if (file instanceof File)
        uploads.push({ period: form.get('academic_period_id'), name: file.name })
    } else body = req.postDataJSON() ?? {}
    if (req.method() !== 'GET') expect(req.headers()['x-xsrf-token']).toBe('schedule+csrf=')
    if (req.url().endsWith('/commit')) {
      commits++
      if (options.staleCommit && commits === 1) backend.changedOnCommit = true
    }
    const result = backend.handle(req.url(), req.method(), body)
    if (options.loseCommit === commits && req.url().endsWith('/commit'))
      return route.abort('failed')
    return route.fulfill({
      status: result.status,
      ...(result.status === 204 ? {} : { json: result.body ?? {} }),
      headers,
    })
  })
  return {
    backend,
    errors,
    uploads,
    get commits() {
      return commits
    },
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}
async function confirmImport(page: Page) {
  await page.getByRole('button', { name: 'Переглянути підтвердження імпорту', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('checkbox')).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Підтвердити імпорт', exact: true })).toBeDisabled()
  await page.getByRole('dialog').getByRole('checkbox').focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('dialog').getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: 'Підтвердити імпорт', exact: true }).click()
}
test('session restore, effective schedule and complete manual Lesson lifecycle', async ({
  page,
}, info) => {
  const state = await setup(page)
  state.backend.signedIn = false
  await page.goto('/schedule')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Електронна пошта', { exact: true }).fill('olena@example.test')
  await page.getByLabel('Пароль', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Увійти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Розклад', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Розклад', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Додати заняття', exact: true }).click()
  await page.getByLabel('Предмет заняття *', { exact: true }).selectOption('7')
  await page.getByLabel('Початок заняття *', { exact: true }).fill('2026-11-02T15:00')
  await page.getByLabel('Завершення заняття *', { exact: true }).fill('2026-11-02T16:00')
  await page.getByRole('button', { name: 'Створити заняття', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Заняття №20', exact: true })).toBeVisible()
  expect(
    state.backend.requests.find((r) => r.path === '/api/lessons' && r.method === 'POST')?.body,
  ).toMatchObject({
    starts_at: '2026-11-02T13:00:00Z',
    ends_at: '2026-11-02T14:00:00Z',
    teacher_id: null,
    academic_period_id: null,
  })
  await page.getByRole('link', { name: 'Редагувати заняття', exact: true }).click()
  await page.getByLabel('Аудиторія заняття', { exact: true }).fill('401')
  await page.getByRole('button', { name: 'Зберегти заняття', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Заняття №20', exact: true })).toBeVisible()
  expect(state.backend.requests.find((r) => r.method === 'PATCH')?.body).toEqual({ room: '401' })
  await page.getByRole('button', { name: 'Скасувати заняття', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.backend.requests.some((r) => r.path === '/api/lessons/20/cancel')).toBe(false)
  await page.getByRole('button', { name: 'Скасувати заняття', exact: true }).click()
  await page.getByRole('button', { name: 'Підтвердити скасування', exact: true }).click()
  await expect(page.getByText('Скасоване', { exact: true })).toBeVisible()
  await page.goto('/schedule/lessons/9')
  await page.getByRole('link', { name: 'Замінити заняття', exact: true }).click()
  await page.getByLabel('Аудиторія заняття', { exact: true }).fill('502')
  await page.getByRole('button', { name: 'Створити заміну', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Заняття №21', exact: true })).toBeVisible()
  expect(state.backend.lessons.find((l) => l.id === 9)?.status).toBe('replaced')
  await page.getByRole('button', { name: 'Видалити заняття', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('відновить початкове')
  await page.getByRole('button', { name: 'Підтвердити видалення', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Заняття видалено', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Перевірити розклад', exact: true }).click()
  await expect(page.locator('a[href="/schedule/lessons/9"]')).toBeVisible()
  await expect(page.locator('a[href="/schedule/lessons/21"]')).toHaveCount(0)
  await expect(page.locator('a[href="/schedule/lessons/20"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('schedule-dark.png'), fullPage: true })
  expect(state.errors).toEqual([])
})
test('multipart workbook, exact-name corrections, persisted revalidation and explicit atomic import', async ({
  page,
}, info) => {
  const state = await setup(page)
  await page.goto('/schedule')
  await page.getByRole('link', { name: 'Імпорт Excel', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Який XLSX підтримується', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Навчальний період імпорту *', { exact: true }).selectOption('4')
  await page
    .getByLabel('Файл розкладу XLSX *', { exact: true })
    .setInputFiles('public/examples/schedule-example.xlsx')
  await page.getByRole('button', { name: 'Завантажити й перевірити', exact: true }).click()
  await expect(page).toHaveURL(/\/schedule\/imports\/41$/)
  await expect(page.getByText('Потребує виправлень', { exact: true })).toBeVisible()
  expect(state.uploads).toEqual([{ period: '4', name: 'schedule-example.xlsx' }])
  expect(
    await page.evaluate(() => (window as Window & { f5UploadedFiles?: unknown[] }).f5UploadedFiles),
  ).toEqual([
    {
      period: '4',
      name: 'schedule-example.xlsx',
      bytes: 16290,
      magic: [80, 75],
      fields: ['academic_period_id', 'schedule_file'],
    },
  ])
  expect(state.commits).toBe(0)
  await page.getByRole('link', { name: 'Виправити предмети', exact: true }).click()
  await page.getByRole('button', { name: 'Додати предмет', exact: true }).click()
  await page.getByLabel('Назва', { exact: true }).fill('Новий предмет')
  await page.getByRole('dialog').getByRole('button', { name: 'Створити', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page
    .getByRole('navigation', { name: 'Розділи навчального простору', exact: true })
    .getByRole('link', { name: 'Викладачі', exact: true })
    .click()
  await page.getByRole('button', { name: 'Додати викладача', exact: true }).click()
  await page.getByLabel('Ім’я викладача', { exact: true }).fill('Новий викладач')
  await page.getByRole('dialog').getByRole('button', { name: 'Створити', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('link', { name: 'Повернутися до імпорту №41 →', exact: true }).click()
  await page.getByRole('button', { name: 'Повторно перевірити', exact: true }).click()
  await expect(page.getByText('Перевірено — готовий огляд', { exact: true })).toBeVisible()
  await expect(page.getByText('Дублікат', { exact: true })).toBeVisible()
  await expect(page.getByText('Без змін', { exact: true })).toBeVisible()
  expect(state.commits).toBe(0)
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('import-preview.png'), fullPage: true })
  await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('import-preview-dark.png'), fullPage: true })
  await confirmImport(page)
  await expect(page.getByText('Імпорт застосовано', { exact: true })).toBeVisible()
  expect(state.commits).toBe(1)
  await page.reload()
  await expect(page.getByText('Імпорт застосовано', { exact: true })).toBeVisible()
  expect(state.commits).toBe(1)
  await page.getByRole('link', { name: 'Переглянути ефективний розклад', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Новий предмет', exact: true })).toBeVisible()
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
    await page.goto('/schedule/imports/41')
    await expect(
      page.getByRole('heading', { name: 'Огляд імпорту №41', exact: true }),
    ).toBeVisible()
    await noOverflow(page)
  }
  expect(state.errors).toEqual([])
})
test('changed preview needs a new review and lost commit is recovered through GET', async ({
  page,
}) => {
  const state = await setup(page, { staleCommit: true, loseCommit: 2 }),
    batch = state.backend.batches[0]!
  batch.status = 'validated'
  batch.invalid_rows = 0
  batch.valid_rows = 1
  Object.assign(batch.rows[0]!, {
    status: 'valid',
    operation: 'create',
    subject_id: 7,
    teacher_id: 8,
    validation_errors: [],
  })
  await page.goto('/schedule/imports/40')
  await confirmImport(page)
  await expect(page.getByText(/Попередньо переглянутий результат змінився/)).toBeVisible()
  await expect(page.getByText('Відновити видалене заняття', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.commits).toBe(1)
  await confirmImport(page)
  await expect(page.getByText(/За збереженим станом пакет уже застосовано/)).toBeVisible()
  expect(state.commits).toBe(2)
  await expect(
    page.getByRole('button', { name: 'Переглянути підтвердження імпорту', exact: true }),
  ).toHaveCount(0)
  await noOverflow(page)
  expect(state.errors).toEqual([])
})
