import { randomUUID } from 'node:crypto'
import { stat, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { Temporal } from '@js-temporal/polyfill'
import type { Resource, User, Task, Subtask, TaskProgress, Schedule } from '../src/types/api'

// Fixture setup/security probes also run in the browser, with real CORS and cookies.
// This helper is deliberately independent of the application client for assertions.
async function browserApi<T>(
  page: Page,
  path: string,
  method = 'GET',
  body?: unknown,
  csrf = true,
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, method, body, csrf }) => {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (csrf && method !== 'GET')
        headers['X-XSRF-TOKEN'] = decodeURIComponent(
          document.cookie
            .split('; ')
            .find((c) => c.startsWith('XSRF-TOKEN='))
            ?.slice(11) ?? '',
        )
      const result = await fetch(`http://localhost:8000${path}`, {
        method,
        credentials: 'include',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: result.status, body: result.status === 204 ? null : await result.json() }
    },
    { path, method, body, csrf },
  )
}

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
  const requests: { method: string; path: string; status: number }[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('requestfailed', (request) => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED'))
      failures.push(
        `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
      )
  })
  page.on('console', (message) => {
    // Expected HTTP validation/authentication probes are asserted separately below.
    if (
      message.type() === 'error' &&
      !/Failed to load resource:.*status of (401|404|419|422)/.test(message.text())
    )
      failures.push(message.text())
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.origin === 'http://localhost:8000')
      requests.push({
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
      })
  })
  const identity = `f1-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`
  const updatedIdentity = identity.replace('@', '-updated@')
  const password = `F1!${randomUUID()}`
  let registered = false
  let ownerId: number | undefined
  let lessonId: number | undefined
  let lessonHistory = false
  let historySubjectId: number | undefined
  let taskId: number | undefined
  const academicIds: Record<string, number> = {}
  const date = Temporal.Now.plainDateISO('Europe/Kyiv').toString()
  const utc = (day: string, clock: string) =>
    Temporal.PlainDateTime.from(`${day}T${clock}`)
      .toZonedDateTime('Europe/Kyiv', { disambiguation: 'reject' })
      .toInstant()
      .toString({ smallestUnit: 'second' })
  try {
    await page.goto('/tasks')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await page.goto('/register')
    await expect(page.getByLabel('Ім’я', { exact: true })).toBeVisible()
    await page.getByLabel('Ім’я', { exact: true }).fill('Перевірка F1')
    await page.getByLabel('Електронна пошта', { exact: true }).fill(identity)
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    await page.getByLabel('Повторіть пароль', { exact: true }).fill(password)
    await page.getByLabel('Часовий пояс', { exact: true }).fill('Europe/Kyiv')
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
    expect(await registrationResponse.request().headerValue('x-xsrf-token')).toBeTruthy()
    registered = true
    const account: Resource<User> = await registrationResponse.json()
    ownerId = account.data.id
    expect(Object.keys(account.data).sort()).toEqual(['email', 'id', 'name', 'timezone'])
    expect(account.data).toMatchObject({
      name: 'Перевірка F1',
      email: identity,
      timezone: 'Europe/Kyiv',
    })
    expect((await browserApi<Resource<User>>(page, '/api/profile')).body).toEqual(account)
    const cookies = await page.context().cookies('http://localhost:8000')
    expect(cookies.some((cookie) => cookie.httpOnly)).toBe(true)
    expect(cookies.some((cookie) => cookie.name === 'XSRF-TOKEN')).toBe(true)
    await expect(page.getByRole('heading', { name: 'Вітаємо, Перевірка F1!' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Сьогодні немає занять' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Немає відкритих завдань' })).toBeVisible()
    await expect(page.getByText('Статистики ще немає.', { exact: false })).toBeVisible()
    expect(
      (await browserApi(page, '/api/tasks', 'POST', { title: 'Must not be created' }, false))
        .status,
    ).toBe(419)
    expect((await browserApi<Resource<Task[]>>(page, '/api/tasks')).body.data).toEqual([])
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Вітаємо, Перевірка F1!' })).toBeVisible()

    await page
      .getByRole('link', { name: 'Налаштування', exact: true })
      .filter({ visible: true })
      .click()
    await page.getByLabel('Часовий пояс', { exact: true }).fill('Invalid/Timezone')
    const invalidProfile = page.waitForResponse(
      (r) => r.url().endsWith('/api/profile') && r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Зберегти профіль' }).click()
    expect((await invalidProfile).status()).toBe(422)
    await expect(page.getByLabel('Часовий пояс', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await page.getByLabel('Ім’я', { exact: true }).fill('Перевірка F1–F2')
    await page.getByLabel('Електронна пошта', { exact: true }).fill(updatedIdentity)
    // Browser context is UTC; persisted profile timezone is intentionally different.
    await page.getByLabel('Часовий пояс', { exact: true }).fill('America/New_York')
    await page.getByRole('button', { name: 'Зберегти профіль' }).click()
    await expect(page.getByRole('status')).toHaveText('Профіль збережено.')
    await page.reload()
    await expect(page.getByLabel('Ім’я', { exact: true })).toHaveValue('Перевірка F1–F2')
    await expect(page.getByLabel('Електронна пошта', { exact: true })).toHaveValue(updatedIdentity)
    await expect(page.getByLabel('Часовий пояс', { exact: true })).toHaveValue('America/New_York')
    await page.getByLabel('Часовий пояс', { exact: true }).fill('Europe/Kyiv')
    await page.getByRole('button', { name: 'Зберегти профіль' }).click()
    await expect(page.getByRole('status')).toHaveText('Профіль збережено.')
    await page.getByRole('button', { name: 'Темна', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'Світла', exact: true }).click()
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
      if (kind === 'subjects') {
        await page.getByLabel('Код не вказано', { exact: true }).uncheck()
        await page.getByLabel('Код предмета', { exact: true }).fill('F2-101')
        await page.getByLabel('Колір предмета', { exact: true }).fill('#aB12Cd')
      }
      const endpoint =
        kind === 'institutions'
          ? 'education-institutions'
          : kind === 'periods'
            ? 'academic-periods'
            : kind
      const creation = page.waitForResponse(
        (r) => r.url().endsWith(`/api/${endpoint}`) && r.request().method() === 'POST',
      )
      await page.getByRole('dialog').getByRole('button', { name: 'Створити', exact: true }).click()
      const created = await creation
      expect(created.status()).toBe(201)
      const resource: Resource<{ id: number }> = await created.json()
      academicIds[kind] = resource.data.id
      if (kind === 'subjects')
        expect(resource.data).toMatchObject({ code: 'F2-101', color: '#aB12Cd' })
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(
        page.getByRole('heading', { name: academicNames[kind], exact: true }),
      ).toBeVisible()
      // Editing exercises the detail endpoint and nullable parent associations.
      await page
        .getByRole('button', { name: `Редагувати: ${academicNames[kind]}`, exact: true })
        .click()
      await expect(
        page.getByLabel(kind === 'teachers' ? 'Ім’я викладача' : 'Назва', { exact: true }),
      ).toHaveValue(academicNames[kind])
      academicNames[kind] += ' updated'
      await page
        .getByLabel(kind === 'teachers' ? 'Ім’я викладача' : 'Назва', { exact: true })
        .fill(academicNames[kind])
      if (kind === 'teachers')
        await page.getByLabel('Навчальний заклад', { exact: true }).selectOption('')
      if (kind === 'periods') {
        await page.getByLabel('Кінець періоду', { exact: true }).fill('2026-08-31')
        await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).click()
        await expect(page.getByText('Кінець періоду має бути не раніше початку.')).toBeVisible()
        await page.getByLabel('Кінець періоду', { exact: true }).fill('2027-01-31')
      }
      const edit = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/${endpoint}/${resource.data.id}`) &&
          r.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).click()
      expect((await edit).status()).toBe(200)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(
        page.getByRole('heading', { name: academicNames[kind], exact: true }),
      ).toBeVisible()
      const saved = await browserApi<Resource<Record<string, unknown>>>(
        page,
        `/api/${endpoint}/${resource.data.id}`,
      )
      expect(saved.body.data.name).toBe(academicNames[kind])
      if (kind !== 'institutions')
        expect(saved.body.data.education_institution_id).toBe(
          kind === 'teachers' ? null : academicIds.institutions,
        )

      // Real duplicate-name validation; teachers deliberately permit identical names.
      if (kind !== 'teachers') {
        await page.getByRole('button', { name: button, exact: true }).click()
        await page.getByLabel('Назва', { exact: true }).fill(academicNames[kind])
        if (kind === 'periods') {
          await page.getByLabel('Початок періоду', { exact: true }).fill('2026-09-01')
          await page.getByLabel('Кінець періоду', { exact: true }).fill('2027-01-31')
        }
        const duplicate = page.waitForResponse(
          (r) => r.url().endsWith(`/api/${endpoint}`) && r.request().method() === 'POST',
        )
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Створити', exact: true })
          .click()
        expect((await duplicate).status()).toBe(422)
        await expect(page.getByLabel('Назва', { exact: true })).toHaveAttribute(
          'aria-invalid',
          'true',
        )
        page.once('dialog', (dialog) => dialog.accept())
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Скасувати', exact: true })
          .click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
      }
    }
    await page.getByRole('link', { name: 'Огляд', exact: true }).filter({ visible: true }).click()
    await page.getByRole('link', { name: '+ Створити завдання', exact: true }).click()
    await page.getByLabel('Назва завдання *', { exact: true }).fill('F1: перевірка живого API')
    await page
      .getByLabel('Предмет', { exact: true })
      .selectOption({ label: academicNames.subjects })
    await page.getByLabel('Опис', { exact: true }).fill('Real Laravel fixture')
    await page.getByLabel('Орієнтовна тривалість, хв', { exact: true }).fill('45')
    await page.getByLabel('Дедлайн', { exact: true }).fill('2026-11-12T12:30')
    const creation = page.waitForResponse(
      (r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Створити завдання', exact: true }).click()
    const created = await creation
    expect(created.status()).toBe(201)
    const createdTask: Resource<Task> = await created.json()
    taskId = createdTask.data.id
    expect(createdTask).toMatchObject({
      data: {
        title: 'F1: перевірка живого API',
        deadline_at: '2026-11-12T10:30:00Z',
        priority: 2,
        status: 'pending',
        subject_id: academicIds.subjects,
        description: 'Real Laravel fixture',
        estimated_minutes: 45,
      },
    })
    await expect(page.getByRole('link', { name: 'F1: перевірка живого API' })).toBeVisible()
    await page.getByRole('link', { name: 'Редагувати', exact: true }).click()
    await page.getByLabel('Назва завдання *', { exact: true }).fill('F1: оновлене завдання')
    await page.getByLabel('Пріоритет', { exact: true }).selectOption('3')
    await page.getByLabel('Дедлайн', { exact: true }).fill('')
    await page.getByLabel('Опис', { exact: true }).fill('')
    await page.getByLabel('Орієнтовна тривалість, хв', { exact: true }).fill('')
    await page.getByLabel('Предмет', { exact: true }).selectOption('')
    const update = page.waitForResponse(
      (r) => /\/api\/tasks\/\d+$/.test(r.url()) && r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Зберегти зміни' }).click()
    expect(await (await update).json()).toMatchObject({
      data: {
        title: 'F1: оновлене завдання',
        deadline_at: null,
        priority: 3,
        description: null,
        estimated_minutes: null,
        subject_id: null,
      },
    })
    await expect(page.getByRole('link', { name: 'F1: оновлене завдання' })).toBeVisible()
    await page.getByRole('link', { name: 'Редагувати', exact: true }).click()
    await expect(page.getByLabel('Дедлайн', { exact: true })).toHaveValue('')
    await page.getByLabel('Дедлайн', { exact: true }).fill('2026-11-12T12:30')
    await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).click()
    await expect(page.getByRole('link', { name: 'F1: оновлене завдання' })).toBeVisible()
    await page.getByRole('link', { name: 'Редагувати', exact: true }).click()
    await expect(page.getByText('Прогрес ще не визначено')).toBeVisible()
    const childIds: number[] = []
    for (const title of ['F2 first step', 'F2 second step']) {
      await page.getByRole('button', { name: 'Додати підзавдання', exact: true }).click()
      await page.getByLabel('Назва підзавдання', { exact: true }).fill(title)
      if (title === 'F2 first step') {
        await page.getByLabel('Дедлайн підзавдання', { exact: true }).fill('2026-11-13T12:30')
        const invalidDeadline = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/tasks/${taskId}/subtasks`) && r.request().method() === 'POST',
        )
        await page.getByRole('button', { name: 'Створити підзавдання', exact: true }).click()
        expect((await invalidDeadline).status()).toBe(422)
        await expect(page.getByLabel('Дедлайн підзавдання', { exact: true })).toHaveAttribute(
          'aria-invalid',
          'true',
        )
      }
      await page.getByLabel('Дедлайн підзавдання', { exact: true }).fill('2026-11-11T12:30')
      const childCreation = page.waitForResponse(
        (r) => r.url().endsWith(`/api/tasks/${taskId}/subtasks`) && r.request().method() === 'POST',
      )
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Створити підзавдання', exact: true })
        .click()
      const childResponse = await childCreation
      expect(childResponse.status()).toBe(201)
      const child: Resource<Subtask> = await childResponse.json()
      childIds.push(child.data.id)
      expect(child.data).toMatchObject({
        task_id: taskId,
        deadline_at: '2026-11-11T10:30:00Z',
        status: 'pending',
      })
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
    const reorder = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/tasks/${taskId}/subtasks/reorder`) &&
        r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Перемістити вниз: F2 first step', exact: true }).click()
    const reordered = await reorder
    expect(reordered.status()).toBe(200)
    expect(reordered.request().postDataJSON()).toEqual({ subtask_ids: [...childIds].reverse() })
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
    // Completing the parent must leave both children pending.
    expect((await browserApi(page, `/api/tasks/${taskId}/complete`, 'POST')).status).toBe(200)
    expect(
      (await browserApi<Resource<Subtask[]>>(page, `/api/tasks/${taskId}/subtasks`)).body.data.map(
        (child) => child.status,
      ),
    ).toEqual(['pending', 'pending'])
    expect((await browserApi(page, `/api/tasks/${taskId}/reopen`, 'POST')).status).toBe(200)
    // A child cannot be accessed beneath another task, even with the same owner.
    const other = await browserApi<Resource<Task>>(page, '/api/tasks', 'POST', {
      title: 'Nested scope probe',
    })
    expect(other.status).toBe(201)
    expect(
      (await browserApi(page, `/api/tasks/${other.body.data.id}/subtasks/${childIds[0]}`)).status,
    ).toBe(404)
    expect((await browserApi(page, `/api/tasks/${other.body.data.id}`, 'DELETE')).status).toBe(204)
    await page
      .getByRole('button', { name: 'Редагувати підзавдання: F2 second step', exact: true })
      .click()
    await page.getByLabel('Назва підзавдання', { exact: true }).fill('F2 updated step')
    const childEdit = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/tasks/${taskId}/subtasks/${childIds[1]}`) &&
        r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Зберегти підзавдання', exact: true }).click()
    const editedChild = await childEdit
    expect(editedChild.status()).toBe(200)
    expect((await editedChild.json()).data.deadline_at).toBe('2026-11-11T10:30:00Z')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    for (const title of ['F2 updated step', 'F2 first step']) {
      await page
        .locator('.subtask-row')
        .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
        .getByRole('button', { name: 'Завершити підзавдання', exact: true })
        .click()
      await expect(page.getByRole('progressbar')).toHaveAttribute(
        'value',
        title === 'F2 first step' ? '100' : '50',
      )
    }
    expect((await browserApi<Resource<Task>>(page, `/api/tasks/${taskId}`)).body.data.status).toBe(
      'pending',
    )
    expect(
      (await browserApi<Resource<TaskProgress>>(page, `/api/tasks/${taskId}/progress`)).body.data,
    ).toEqual({ task_id: taskId, total_subtasks: 2, completed_subtasks: 2, progress_percent: 100 })
    await page
      .getByRole('button', { name: 'Видалити підзавдання: F2 updated step', exact: true })
      .click()
    await page.getByRole('dialog').getByRole('button', { name: 'Скасувати', exact: true }).click()
    await expect(page.locator('.subtask-row')).toHaveCount(2)
    for (const title of ['F2 updated step', 'F2 first step']) {
      await page
        .getByRole('button', { name: `Видалити підзавдання: ${title}`, exact: true })
        .click()
      await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await expect(page.getByText('Прогрес ще не визначено')).toBeVisible()
    expect(
      (await browserApi<Resource<TaskProgress>>(page, `/api/tasks/${taskId}/progress`)).body.data,
    ).toEqual({ task_id: taskId, total_subtasks: 0, completed_subtasks: 0, progress_percent: null })

    // Arrange one real lesson using the existing API (lesson CRUD is not a new UI).
    // Its separate subject is retained because the backend preserves lesson history.
    const historySubject = await browserApi<Resource<{ id: number }>>(
      page,
      '/api/subjects',
      'POST',
      { name: 'Live schedule history fixture' },
    )
    expect(historySubject.status).toBe(201)
    historySubjectId = historySubject.body.data.id
    const lesson = await browserApi<Resource<{ id: number }>>(page, '/api/lessons', 'POST', {
      subject_id: historySubjectId,
      teacher_id: academicIds.teachers,
      academic_period_id: academicIds.periods,
      type: 'lecture',
      room: 'F1–F2 204',
      starts_at: utc(date, '10:00:00'),
      ends_at: utc(date, '11:30:00'),
    })
    expect(lesson.status).toBe(201)
    lessonId = lesson.body.data.id
    lessonHistory = true
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Вітаємо, Перевірка F1–F2!' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Live schedule history fixture', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'F1: оновлене завдання', exact: true }),
    ).toBeVisible()
    const statistics = await browserApi<
      Resource<{ tasks: { current: { pending: number } }; timezone: string }>
    >(page, `/api/statistics/progress?start_date=${date}&end_date=${date}`)
    expect(statistics.status).toBe(200)
    expect(statistics.body.data).toMatchObject({
      timezone: 'Europe/Kyiv',
      tasks: { current: { pending: 1 } },
    })
    const schedule = await browserApi<Schedule>(page, '/api/schedule/today')
    expect(schedule.status).toBe(200)
    expect(schedule.body.meta).toEqual({
      timezone: 'Europe/Kyiv',
      start_date: date,
      end_date: date,
    })
    expect(schedule.body.data[0]).toMatchObject({
      id: lessonId,
      subject: { id: historySubjectId },
      teacher: { id: academicIds.teachers },
      room: 'F1–F2 204',
    })
    await page.goto('/schedule')
    await expect(page.locator('.lesson-time time')).toHaveText('10:00')
    await expect(page.locator('.lesson-time span')).toHaveText('11:30')
    await expect(page.getByText('F2 test teacher updated', { exact: false })).toBeVisible()
    const nextDay = Temporal.PlainDate.from(date).add({ days: 1 }).toString()
    const dayRead = page.waitForResponse((r) => r.url().endsWith(`/api/schedule/date/${nextDay}`))
    await page.getByRole('button', { name: 'Наступний період', exact: true }).click()
    expect((await dayRead).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Занять немає' })).toBeVisible()
    await page.getByRole('button', { name: 'Попередній період', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Live schedule history fixture', exact: true }),
    ).toBeVisible()
    const weekRead = page.waitForResponse((r) => r.url().includes('/api/schedule/week/'))
    await page.getByRole('button', { name: 'Тиждень', exact: true }).click()
    expect((await weekRead).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Занять немає' })).toHaveCount(6)
    await page.screenshot({
      path: testInfo.outputPath('live-populated-schedule.png'),
      fullPage: true,
    })
    await page.goto('/profile')
    await page.getByLabel('Часовий пояс', { exact: true }).fill('America/New_York')
    await page.getByRole('button', { name: 'Зберегти профіль' }).click()
    await expect(page.getByRole('status')).toHaveText('Профіль збережено.')
    await page.goto(`/tasks/${taskId}`)
    await expect(page.getByLabel('Дедлайн', { exact: true })).toHaveValue('2026-11-12T05:30')
    // Editing only the title preserves the same UTC instant in a different zone.
    await page.getByLabel('Назва завдання *', { exact: true }).fill('F1: timezone preservation')
    const preserved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/tasks/${taskId}`) && r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).click()
    expect((await preserved).request().postDataJSON()).not.toHaveProperty('deadline_at')
    await expect(
      page.getByRole('link', { name: 'F1: timezone preservation', exact: true }),
    ).toBeVisible()
    expect(
      (await browserApi<Resource<Task>>(page, `/api/tasks/${taskId}`)).body.data.deadline_at,
    ).toBe('2026-11-12T10:30:00Z')
    await page.goto('/profile')
    await page.getByLabel('Часовий пояс', { exact: true }).fill('Europe/Kyiv')
    await page.getByRole('button', { name: 'Зберегти профіль' }).click()
    await expect(page.getByRole('status')).toHaveText('Профіль збережено.')
    await page.goto(`/academic/periods`)
    await page
      .getByRole('button', { name: `Видалити: ${academicNames.periods}`, exact: true })
      .click()
    const refused = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/academic-periods/${academicIds.periods}`) &&
        r.request().method() === 'DELETE',
    )
    await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
    expect((await refused).status()).toBe(422)
    await expect(page.getByRole('dialog').getByRole('alert').first()).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Скасувати', exact: true }).click()
    // Detach the period before soft-deleting the fixture, preserving backend rules.
    expect(
      (await browserApi(page, `/api/lessons/${lessonId}`, 'PATCH', { academic_period_id: null }))
        .status,
    ).toBe(200)
    expect((await browserApi(page, `/api/lessons/${lessonId}`, 'DELETE')).status).toBe(204)
    lessonId = undefined
    const subjectRefusal = await browserApi(page, `/api/subjects/${historySubjectId}`, 'DELETE')
    expect(subjectRefusal.status).toBe(422)
    await page.goto(`/tasks/${taskId}`)
    await page.getByRole('link', { name: 'До завдань', exact: false }).click()
    await page.getByRole('button', { name: 'Завершити', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Відновити', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Відновити', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Завершити', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Видалити', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Видалити', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Завдань поки немає' })).toBeVisible()
    taskId = undefined
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
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      await expect(
        page.getByRole('link', { name: 'Завдання', exact: true }).filter({ visible: true }),
      ).toBeVisible()
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page
      .getByRole('link', { name: 'Налаштування', exact: true })
      .filter({ visible: true })
      .click()
    await page.getByRole('button', { name: 'Вийти', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Увійти до простору' })).toBeVisible()
    expect((await browserApi(page, '/api/profile')).status).toBe(401)
    await page.goto('/academic/subjects')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    await page.getByLabel('Електронна пошта', { exact: true }).fill(updatedIdentity)
    await page.getByLabel('Пароль', { exact: true }).fill('wrong-password')
    const invalidLogin = page.waitForResponse(
      (r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Увійти', exact: true }).click()
    expect((await invalidLogin).status()).toBe(422)
    await expect(page.getByRole('alert').first()).toBeVisible()
    await page.getByLabel('Пароль', { exact: true }).fill(password)
    const login = page.waitForResponse(
      (r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Увійти', exact: true }).click()
    expect((await login).status()).toBe(200)
    await expect(page).toHaveURL(/\/academic\/subjects$/)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Вітаємо, Перевірка F1–F2!' })).toBeVisible()
    await page
      .getByRole('link', { name: 'Налаштування', exact: true })
      .filter({ visible: true })
      .click()
    await page.getByRole('button', { name: 'Вийти', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Увійти до простору' })).toBeVisible()
    expect((await browserApi(page, '/api/profile')).status).toBe(401)
    expect(
      requests.some((request) => request.path === '/sanctum/csrf-cookie' && request.status === 204),
    ).toBe(true)
    expect(requests.filter((request) => request.status === 419)).toHaveLength(1)
    expect(requests.filter((request) => request.status === 404)).toHaveLength(1)
    expect(requests.filter((request) => request.status === 422)).toHaveLength(8)
    expect(
      requests.filter(
        (request) =>
          request.status >= 400 &&
          (request.status === 401
            ? request.path !== '/api/profile'
            : ![404, 419, 422].includes(request.status)),
      ),
    ).toEqual([])
    expect(failures).toEqual([])
  } finally {
    // Never clean another owner, and never use database access or hard deletion.
    try {
      if (registered) {
        const profile = await browserApi<Resource<User>>(page, '/api/profile')
        if (profile.status !== 401) {
          expect(profile.status).toBe(200)
          expect(profile.body.data.id).toBe(ownerId)
          if (lessonId !== undefined) {
            expect(
              (
                await browserApi(page, `/api/lessons/${lessonId}`, 'PATCH', {
                  academic_period_id: null,
                })
              ).status,
            ).toBe(200)
            expect((await browserApi(page, `/api/lessons/${lessonId}`, 'DELETE')).status).toBe(204)
          }
          for (const endpoint of [
            'tasks',
            'teachers',
            'subjects',
            'academic-periods',
            'education-institutions',
          ]) {
            const listing = await browserApi<Resource<{ id: number }[]>>(page, `/api/${endpoint}`)
            expect(listing.status).toBe(200)
            for (const record of listing.body.data) {
              if (endpoint === 'subjects' && lessonHistory && record.id === historySubjectId)
                continue
              expect(
                (await browserApi(page, `/api/${endpoint}/${record.id}`, 'DELETE')).status,
              ).toBe(204)
            }
          }
          expect((await browserApi(page, '/api/auth/logout', 'POST')).status).toBe(204)
        }
      }
    } finally {
      // No passwords, request bodies, session cookies or CSRF values in this audit.
      const audit = testInfo.outputPath('real-api-requests.json')
      await writeFile(audit, JSON.stringify(requests, null, 2))
      await testInfo.attach('real-api-requests', { path: audit, contentType: 'application/json' })
      const retained = testInfo.outputPath('retained-test-data.json')
      await writeFile(
        retained,
        JSON.stringify({
          ownerId,
          historySubjectId: lessonHistory ? historySubjectId : null,
          softDeletedLessonHistory: lessonHistory,
        }),
      )
      await testInfo.attach('retained-test-data', {
        path: retained,
        contentType: 'application/json',
      })
    }
  }
})
