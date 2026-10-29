import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { expect, test } from '@playwright/test'

// Opt-in real Laravel test. Frontend files are served from dist at the configured
// SPA origin. Requests to port 8000 are NEVER mocked or intercepted.
// Each run creates an isolated test account; no account-deletion API exists.
test('live Sanctum registration, restoration, dashboard, task CRUD, profile and logout', async ({
  page,
}, testInfo) => {
  // Chromium requires loopback permission for a document supplied by routing.
  // This leaves Laravel CORS, CSRF and session checks fully enabled.
  await page
    .context()
    .grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' })
  const bundle = resolve('dist')
  await page.route('http://localhost:5173/**', async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname)
    const candidate = resolve(bundle, `.${pathname}`)
    const file =
      candidate.startsWith(`${bundle}${sep}`) && extname(pathname)
        ? candidate
        : resolve(bundle, 'index.html')
    expect((await stat(file)).isFile()).toBe(true)
    await route.fulfill({ path: file })
  })
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  const identity = `f1-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`
  const password = `F1!${randomUUID()}`
  let registered = false
  try {
    await page.goto('/register')
    await expect(page.getByLabel('Ім’я', { exact: true })).toBeVisible()
    await page.getByLabel('Ім’я', { exact: true }).fill('Перевірка F1')
    await page.getByLabel('Електронна пошта', { exact: true }).fill(identity)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByLabel('Повторіть пароль', { exact: true }).fill(password)
    const registration = page.waitForResponse(
      (r) => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Створити обліковий запис', exact: true }).click()
    expect((await registration).status()).toBe(201)
    registered = true
    await expect(page.getByRole('heading', { name: 'Вітаємо, Перевірка F1!' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Сьогодні немає занять' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Немає відкритих завдань' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Вітаємо, Перевірка F1!' })).toBeVisible()

    await page
      .getByRole('link', { name: 'Налаштування', exact: true })
      .filter({ visible: true })
      .click()
    await page.getByLabel('Часовий пояс', { exact: true }).fill('Europe/Kyiv')
    await page.getByRole('button', { name: 'Зберегти профіль' }).click()
    await expect(page.getByRole('status')).toHaveText('Профіль збережено.')
    await page.getByRole('link', { name: 'Огляд', exact: true }).filter({ visible: true }).click()
    await page.getByRole('link', { name: '+ Створити завдання', exact: true }).click()
    await page.getByLabel('Назва завдання *', { exact: true }).fill('F1: перевірка живого API')
    await page.getByLabel('Дедлайн', { exact: true }).fill('2026-11-12T12:30')
    const creation = page.waitForResponse(
      (r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Створити завдання', exact: true }).click()
    const created = await creation
    expect(created.status()).toBe(201)
    expect(await created.json()).toMatchObject({
      data: {
        title: 'F1: перевірка живого API',
        deadline_at: '2026-11-12T10:30:00Z',
        priority: 2,
        status: 'pending',
      },
    })
    await expect(page.getByRole('link', { name: 'F1: перевірка живого API' })).toBeVisible()
    await page.getByRole('link', { name: 'Редагувати', exact: true }).click()
    await page.getByLabel('Назва завдання *', { exact: true }).fill('F1: оновлене завдання')
    await page.getByLabel('Пріоритет', { exact: true }).selectOption('3')
    await page.getByLabel('Дедлайн', { exact: true }).fill('')
    const update = page.waitForResponse(
      (r) => /\/api\/tasks\/\d+$/.test(r.url()) && r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Зберегти зміни' }).click()
    expect(await (await update).json()).toMatchObject({
      data: { title: 'F1: оновлене завдання', deadline_at: null, priority: 3 },
    })
    await expect(page.getByRole('link', { name: 'F1: оновлене завдання' })).toBeVisible()
    await page.getByRole('button', { name: 'Завершити', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Відновити', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Відновити', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Завершити', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Видалити', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Завдань поки немає' })).toBeVisible()
    await page.getByRole('link', { name: 'Розклад', exact: true }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { name: 'Розклад', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Занять немає' })).toBeVisible()
    const week = page.waitForResponse((r) => r.url().includes('/api/schedule/week/'))
    await page.getByRole('button', { name: 'Тиждень', exact: true }).click()
    expect((await week).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Занять немає' })).toHaveCount(7)
    await page.screenshot({ path: testInfo.outputPath('live-schedule.png'), fullPage: true })
    await page
      .getByRole('link', { name: 'Налаштування', exact: true })
      .filter({ visible: true })
      .click()
    await page.getByRole('button', { name: 'Вийти', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Увійти до простору' })).toBeVisible()
    await page.getByLabel('Електронна пошта', { exact: true }).fill(identity)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Увійти', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Вітаємо, Перевірка F1!' })).toBeVisible()
    await page
      .getByRole('link', { name: 'Налаштування', exact: true })
      .filter({ visible: true })
      .click()
    await page.getByRole('button', { name: 'Вийти', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Увійти до простору' })).toBeVisible()
    expect(failures).toEqual([])
  } finally {
    if (registered) {
      // Best-effort cleanup is scoped to this newly registered owner only.
      await page
        .evaluate(async () => {
          const origin = 'http://localhost:8000'
          const response = await fetch(`${origin}/api/tasks`, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })
          if (response.status === 401) return
          if (!response.ok) throw new Error('Live test cleanup could not list test tasks')
          const body: { data: { id: number }[] } = await response.json()
          const token = decodeURIComponent(
            document.cookie
              .split('; ')
              .find((c) => c.startsWith('XSRF-TOKEN='))
              ?.slice(11) ?? '',
          )
          for (const task of body.data) {
            const removed = await fetch(`${origin}/api/tasks/${task.id}`, {
              method: 'DELETE',
              credentials: 'include',
              headers: { Accept: 'application/json', 'X-XSRF-TOKEN': token },
            })
            if (!removed.ok) throw new Error('Live test cleanup could not remove a test task')
          }
          await fetch(`${origin}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json', 'X-XSRF-TOKEN': token },
          })
        })
        .catch((error) => {
          throw new Error(`Live test cleanup failed: ${String(error)}`)
        })
    }
  }
})
