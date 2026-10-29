import { expect, test, type Page } from '@playwright/test'
import type { Task } from '../src/types/api'
import { user, task, lesson, progress, page as taskPage } from '../tests/fixtures'
async function mockBackend(browserPage: Page) {
  let signedIn = false
  let profile = { ...user }
  let tasks: Task[] = []
  const writes: {
    path: string
    method: string
    body: Record<string, unknown>
    xsrf: string | undefined
  }[] = []
  await browserPage.route('http://localhost:8000/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const headers = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-XSRF-TOKEN',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    }
    const reply = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/sanctum/csrf-cookie')
      return route.fulfill({
        status: 204,
        headers: { ...headers, 'Set-Cookie': 'XSRF-TOKEN=browser%3Dcsrf; Path=/; SameSite=Lax' },
      })
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
    if (method !== 'GET')
      writes.push({ path, method, body, xsrf: request.headers()['x-xsrf-token'] })
    if (path === '/api/auth/login' || path === '/api/auth/register') {
      signedIn = true
      return reply({ data: profile })
    }
    if (!signedIn) return reply({}, 401)
    if (path === '/api/auth/logout') {
      signedIn = false
      return route.fulfill({ status: 204, headers })
    }
    if (path === '/api/profile') {
      if (method === 'PATCH') profile = { ...profile, ...body }
      return reply({ data: profile })
    }
    if (path === '/api/subjects') return reply({ data: [] })
    if (path.startsWith('/api/schedule/'))
      return reply({
        data: [lesson],
        meta: { timezone: profile.timezone, start_date: '2026-10-29', end_date: '2026-10-29' },
      })
    if (path === '/api/statistics/progress') return reply({ data: progress })
    if (path === '/api/tasks') {
      if (method === 'POST') {
        const created = { ...task, ...body, id: 2 } as Task
        tasks.push(created)
        return reply({ data: created }, 201)
      }
      const status = url.searchParams.get('status')
      return reply(taskPage(status ? tasks.filter((t) => t.status === status) : tasks))
    }
    const found = tasks[0]
    if (path.startsWith('/api/tasks/') && found) {
      if (method === 'DELETE') {
        tasks = []
        return route.fulfill({ status: 204, headers })
      }
      if (method === 'PATCH') tasks[0] = { ...found, ...body }
      if (path.endsWith('/complete')) tasks[0] = { ...found, status: 'completed' }
      if (path.endsWith('/reopen')) tasks[0] = { ...found, status: 'pending' }
      return reply({ data: tasks[0] })
    }
    throw new Error(`Unmocked endpoint ${method} ${path}`)
  })
  return writes
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}
test('cookie login, reload, schedule, task CRUD, profile, theme and logout', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const writes = await mockBackend(page)
  await page.goto('/schedule')
  await expect(page.getByRole('heading', { name: 'Увійти до простору' })).toBeVisible()
  await page.getByLabel('Електронна пошта', { exact: true }).fill(user.email)
  await page.getByLabel('Пароль', { exact: true }).fill('example-password')
  await page.getByRole('button', { name: 'Увійти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Розклад', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Архітектура ПЗ' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Розклад', exact: true })).toBeVisible()
  await noOverflow(page)
  await page.getByRole('button', { name: 'Тиждень', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Тиждень', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('link', { name: 'Огляд', exact: true }).filter({ visible: true }).click()
  await expect(page.getByRole('heading', { name: 'Вітаємо, Олена!' })).toBeVisible()
  await noOverflow(page)
  await expect(page.locator('.skip-link')).not.toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('dashboard-light.png'), fullPage: true })
  await page.getByRole('link', { name: '+ Створити завдання', exact: true }).click()
  await page.getByLabel('Назва завдання *', { exact: true }).fill('Підготувати презентацію')
  await page.getByLabel('Дедлайн', { exact: true }).fill('2026-11-12T12:30')
  await page.getByRole('button', { name: 'Створити завдання', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Підготувати презентацію' })).toBeVisible()
  await noOverflow(page)
  expect(writes.find((w) => w.path === '/api/tasks' && w.method === 'POST')).toMatchObject({
    xsrf: 'browser=csrf',
    body: { deadline_at: '2026-11-12T10:30:00Z' },
  })
  await page.getByRole('link', { name: 'Редагувати', exact: true }).click()
  await page.getByLabel('Назва завдання *', { exact: true }).fill('Оновлена презентація')
  await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Оновлена презентація' })).toBeVisible()
  await page.getByRole('button', { name: 'Завершити', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Відновити', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Відновити', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Завершити', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Видалити', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Скасувати', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Видалити', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Завдань поки немає' })).toBeVisible()
  await page
    .getByRole('link', { name: 'Налаштування', exact: true })
    .filter({ visible: true })
    .click()
  await page.getByLabel('Ім’я', { exact: true }).fill('Марія')
  await page.getByLabel('Часовий пояс', { exact: true }).fill('America/New_York')
  await page.getByRole('button', { name: 'Зберегти профіль' }).click()
  await expect(page.getByRole('status')).toHaveText('Профіль збережено.')
  await page.getByRole('button', { name: 'Темна', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await noOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('profile-dark.png'), fullPage: true })
  await page.getByRole('button', { name: 'Вийти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Увійти до простору' })).toBeVisible()
  await expect(page.locator('.sidebar')).toHaveCount(0)
  expect(errors).toEqual([])
})
test('registration opens the authenticated application', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/register')
  await page.getByLabel('Ім’я', { exact: true }).fill('Олена')
  await page.getByLabel('Електронна пошта', { exact: true }).fill(user.email)
  await page.getByLabel('Пароль', { exact: true }).fill('example-password')
  await page.getByLabel('Повторіть пароль', { exact: true }).fill('example-password')
  await page.getByRole('button', { name: 'Створити обліковий запис', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вітаємо, Олена!' })).toBeVisible()
  await noOverflow(page)
})

test('core pages fit compact and intermediate widths, and week shortcut works', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto('/login')
  await page.getByLabel('Електронна пошта', { exact: true }).fill(user.email)
  await page.getByLabel('Пароль', { exact: true }).fill('example-password')
  await page.getByRole('button', { name: 'Увійти', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Вітаємо, Олена!' })).toBeVisible()
  await page.getByRole('link', { name: 'Переглянути тиждень' }).click()
  await expect(page.getByRole('button', { name: 'Тиждень', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/schedule', '/tasks', '/tasks/new', '/profile']) {
      await page.goto(path)
      await expect(page.locator('#main-content h1')).toBeVisible()
      await noOverflow(page)
      await expect(page.locator('.skip-link')).not.toBeInViewport()
    }
  }
})
