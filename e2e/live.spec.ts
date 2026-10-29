import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { expect, test } from '@playwright/test'

// Opt-in real Laravel test. Frontend files are served from dist at the configured
// SPA origin. Requests to port 8000 are NEVER mocked or intercepted.
// Each run creates an isolated test account; no account-deletion API exists.
test('live F1 session and F2 academic, task, subtask and progress workflows', async ({
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
    const registrationResponse = await registration
    if (registrationResponse.status() === 500) {
      const payload: { message?: string } = await registrationResponse.json()
      if (payload.message?.includes("Unknown column 'timezone'")) {
        throw new Error(
          'BLOCKED — backend infrastructure: POST /api/auth/register returned 500, SQLSTATE[42S22], missing users.timezone. Existing backend migrations must be applied outside this frontend task. No account was created.',
        )
      }
    }
    expect(
      registrationResponse.status(),
      'Real POST /api/auth/register must establish an authenticated SPA session',
    ).toBe(201)
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
    const academicNames = {
      institutions: 'F2 test institution',
      periods: 'F2 test semester',
      subjects: 'F2 test subject',
      teachers: 'F2 test teacher',
    }
    for (const [kind, button] of [
      ['institutions', 'Додати заклад'],
      ['periods', 'Додати період'],
      ['subjects', 'Додати предмет'],
      ['teachers', 'Додати викладача'],
    ] as const) {
      await page.goto(`/academic/${kind}`)
      await page.getByRole('button', { name: button, exact: true }).click()
      await page
        .getByLabel(kind === 'teachers' ? 'Ім’я викладача' : 'Назва', { exact: true })
        .fill(academicNames[kind])
      if (kind !== 'institutions')
        await page
          .getByLabel('Навчальний заклад', { exact: true })
          .selectOption({ label: academicNames.institutions })
      if (kind === 'periods') {
        await page.getByLabel('Початок періоду', { exact: true }).fill('2026-09-01')
        await page.getByLabel('Кінець періоду', { exact: true }).fill('2026-12-31')
      }
      await page.getByRole('dialog').getByRole('button', { name: 'Створити', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(
        page.getByRole('heading', { name: academicNames[kind], exact: true }),
      ).toBeVisible()
    }
    await page.getByRole('link', { name: 'Огляд', exact: true }).filter({ visible: true }).click()
    await page.getByRole('link', { name: '+ Створити завдання', exact: true }).click()
    await page.getByLabel('Назва завдання *', { exact: true }).fill('F1: перевірка живого API')
    await page.getByLabel('Предмет', { exact: true }).selectOption({ label: 'F2 test subject' })
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
    await page.getByRole('link', { name: 'Редагувати', exact: true }).click()
    await expect(page.getByText('Прогрес ще не визначено')).toBeVisible()
    for (const title of ['F2 first step', 'F2 second step']) {
      await page.getByRole('button', { name: 'Додати підзавдання', exact: true }).click()
      await page.getByLabel('Назва підзавдання', { exact: true }).fill(title)
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Створити підзавдання', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Перемістити вниз: F2 first step', exact: true }).click()
    await expect(page.locator('.subtask-row h3').first()).toHaveText('F2 second step')
    await page
      .locator('.subtask-row')
      .first()
      .getByRole('button', { name: 'Завершити підзавдання', exact: true })
      .click()
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '50')
    await page
      .locator('.subtask-row')
      .first()
      .getByRole('button', { name: 'Відновити підзавдання', exact: true })
      .click()
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0')
    await page
      .getByRole('button', { name: 'Редагувати підзавдання: F2 second step', exact: true })
      .click()
    await page.getByLabel('Назва підзавдання', { exact: true }).fill('F2 updated step')
    await page.getByRole('button', { name: 'Зберегти підзавдання', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    for (const title of ['F2 updated step', 'F2 first step']) {
      await page
        .getByRole('button', { name: `Видалити підзавдання: ${title}`, exact: true })
        .click()
      await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await expect(page.getByText('Прогрес ще не визначено')).toBeVisible()
    await page.getByRole('link', { name: 'До завдань', exact: false }).click()
    await page.getByRole('button', { name: 'Завершити', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Відновити', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Відновити', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Завершити', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Видалити', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Завдань поки немає' })).toBeVisible()
    for (const kind of ['teachers', 'subjects', 'periods', 'institutions'] as const) {
      await page.goto(`/academic/${kind}`)
      await page
        .getByRole('button', { name: `Видалити: ${academicNames[kind]}`, exact: true })
        .click()
      await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
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
          for (const endpoint of [
            'teachers',
            'subjects',
            'academic-periods',
            'education-institutions',
          ]) {
            const listing = await fetch(`${origin}/api/${endpoint}`, {
              credentials: 'include',
              headers: { Accept: 'application/json' },
            })
            if (!listing.ok) throw new Error(`Live fixture cleanup could not list ${endpoint}`)
            const records: { data: { id: number }[] } = await listing.json()
            for (const record of records.data) {
              const removed = await fetch(`${origin}/api/${endpoint}/${record.id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: { Accept: 'application/json', 'X-XSRF-TOKEN': token },
              })
              if (!removed.ok) throw new Error(`Live fixture cleanup could not delete ${endpoint}`)
            }
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
