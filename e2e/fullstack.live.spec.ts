import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { resetLinkFromLog } from './support/logMail'
import { Temporal } from '@js-temporal/polyfill'

const backend = process.env.PLANNER_BACKEND_ROOT!
const run = process.env.PLANNER_SYSTEM_RUN!
const origin = 'http://localhost:18000'
const password = 'Synthetic-Student-927!'
const tomorrow = Temporal.Now.plainDateISO('Europe/Kyiv').add({ days: 1 })
const date = tomorrow.toString()
const end = tomorrow.add({ days: 5 }).toString()
const utc = (day: string, time: string) =>
  Temporal.ZonedDateTime.from(`${day}T${time}[Europe/Kyiv]`).toInstant().toString()
const cli = (...args: string[]) =>
  execFileSync('php', ['artisan', ...args], { cwd: backend, env: process.env, encoding: 'utf8' })
const fixture = (...args: string[]) =>
  JSON.parse(
    execFileSync('php', ['tests/Support/system-fixtures.php', ...args], {
      cwd: backend,
      env: process.env,
      encoding: 'utf8',
    }) || 'null',
  )
function passed(check: string) {
  const checks: string[] = JSON.parse(readFileSync('fullstack-results/checks.json', 'utf8'))
  checks.push(check)
  writeFileSync('fullstack-results/checks.json', JSON.stringify(checks, null, 2))
}
async function api(
  page: Page,
  path: string,
  method = 'GET',
  body?: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  const result = await page.evaluate(
    async ({ origin, path, method, body, extra }) => {
      const headers: Record<string, string> = { Accept: 'application/json', ...extra }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (method !== 'GET' && !('X-XSRF-TOKEN' in headers))
        headers['X-XSRF-TOKEN'] = decodeURIComponent(
          document.cookie
            .split('; ')
            .find((c) => c.startsWith('XSRF-TOKEN='))
            ?.slice(11) ?? '',
        )
      const r = await fetch(origin + path, {
        method,
        credentials: 'include',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: r.status, body: r.status === 204 ? null : await r.json() }
    },
    { origin, path, method, body, extra },
  )
  expect(
    result.status,
    `${method} ${path}: ${JSON.stringify(result.body?.message ?? 'Unexpected response')}`,
  ).toBe(status)
  return result.body
}
async function register(page: Page) {
  const email = `student-${randomUUID()}@example.test`
  await page.goto('/register')
  await page.getByLabel('Ім’я', { exact: true }).fill('Integration Student')
  await page.getByLabel('Електронна пошта', { exact: true }).fill(email)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByLabel('Повторіть пароль', { exact: true }).fill(password)
  const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/register'))
  await page.getByRole('button', { name: 'Створити обліковий запис', exact: true }).click()
  expect((await response).status()).toBe(201)
  await expect(page).toHaveURL('/')
  return { email, ...(await api(page, '/api/profile')).data }
}
async function context(page: Page, start = date, finish = end) {
  const institution = (
    await api(page, '/api/education-institutions', 'POST', { name: 'Synthetic University' }, 201)
  ).data.id
  const subject = (
    await api(
      page,
      '/api/subjects',
      'POST',
      { name: 'Synthetic Mathematics', education_institution_id: institution },
      201,
    )
  ).data.id
  const teacher = (
    await api(
      page,
      '/api/teachers',
      'POST',
      { name: 'Synthetic Teacher', education_institution_id: institution },
      201,
    )
  ).data.id
  const period = (
    await api(
      page,
      '/api/academic-periods',
      'POST',
      {
        education_institution_id: institution,
        name: 'Synthetic semester',
        starts_on: start,
        ends_on: finish,
      },
      201,
    )
  ).data.id
  return { institution, subject, teacher, period }
}
async function availability(page: Page) {
  await api(page, '/api/planning-preferences', 'PUT', {
    min_session_minutes: 30,
    max_session_minutes: 120,
    preferred_break_minutes: 15,
    max_daily_study_minutes: 240,
    max_weekly_study_minutes: 1200,
  })
  for (let day = 1; day <= 7; day++)
    await api(
      page,
      '/api/study-availability-windows',
      'POST',
      { day_of_week: day, starts_at: '09:00:00', ends_at: '18:00:00' },
      201,
    )
}
async function taskForm(page: Page, subject: number) {
  await page.goto('/tasks/new')
  await page.getByLabel('Назва завдання *', { exact: true }).fill('Integration coursework')
  await page.getByLabel('Предмет', { exact: true }).selectOption(String(subject))
  await page.getByLabel('Пріоритет', { exact: true }).selectOption('3')
  await page.getByLabel('Орієнтовна тривалість, хв', { exact: true }).fill('60')
  await page.getByLabel('Дедлайн', { exact: true }).fill(`${end}T18:00`)
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Створити завдання', exact: true }).click()
  const saved = await response
  expect(saved.status()).toBe(201)
  await expect(page).toHaveURL('/tasks')
  return (await saved.json()).data
}
async function tool(
  page: Page,
  conversation: number,
  name: string,
  args: Record<string, unknown> = {},
) {
  return api(
    page,
    `/api/ai/conversations/${conversation}/messages`,
    'POST',
    { content: `SYSTEM_TOOL ${JSON.stringify({ name, arguments: args })}` },
    200,
    { 'Idempotency-Key': randomUUID() },
  )
}

test('complete student browser workflow: cookies, academic conflict, confirmed recovery, Inbox, AI and persistence', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const student = await register(page)
  await page.reload()
  expect((await api(page, '/api/profile')).data.id).toBe(student.id)
  const preflight = await page.request.fetch(origin + '/api/profile', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:15173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'X-XSRF-TOKEN',
    },
  })
  expect(preflight.headers()['access-control-allow-origin']).toBe('http://localhost:15173')
  expect(preflight.headers()['access-control-allow-credentials']).toBe('true')
  const forbidden = await page.request.fetch(origin + '/api/profile', {
    method: 'OPTIONS',
    headers: { Origin: 'http://untrusted.example.test', 'Access-Control-Request-Method': 'GET' },
  })
  expect(forbidden.headers()['access-control-allow-origin']).not.toBe(
    'http://untrusted.example.test',
  )
  const cookies = await page.context().cookies()
  expect(cookies.find((c) => c.name === 'planner_system_session')?.httpOnly).toBe(true)
  expect(cookies.find((c) => c.name === 'XSRF-TOKEN')?.httpOnly).toBe(false)
  await api(page, '/api/tasks', 'POST', { title: 'Must not save' }, 419, {
    'X-XSRF-TOKEN': 'invalid',
  })
  expect((await api(page, '/api/tasks')).data).toHaveLength(0)
  passed(
    'Browser registration, CSRF initialization, session cookies, profile, protected refresh and invalid CSRF rejection',
  )
  const ctx = await context(page)
  const schedule = (
    await api(
      page,
      '/api/semester-schedules',
      'POST',
      {
        academic_period_id: ctx.period,
        group_name: 'Synthetic group',
        parity_anchor_on: tomorrow.subtract({ days: tomorrow.dayOfWeek - 1 }).toString(),
        first_week_parity: 'numerator',
      },
      201,
    )
  ).data.schedule.id
  const base = `/api/semester-schedules/${schedule}`
  const token = async () => (await api(page, base + '/management')).meta.schedule_token
  // Tomorrow may be Saturday/Sunday; use an explicit occurrence snapshot so the run is date independent.
  const lesson = {
    pair_number: 1,
    starts_at_local: '12:00:00',
    ends_at_local: '13:00:00',
    subject_id: ctx.subject,
    teacher_id: ctx.teacher,
    lesson_type: null,
  }
  await api(
    page,
    `${base}/weekly-rules`,
    'POST',
    { ...lesson, weekday: 1, week_pattern: 'all', schedule_token: await token() },
    201,
  )
  await api(page, `${base}/date-exceptions/${date}`, 'PUT', {
    schedule_token: await token(),
    mode: 'replace',
    lessons: [lesson],
  })
  await availability(page)
  const task = await taskForm(page, ctx.subject)
  expect(task.priority).toBe(3)
  expect(task.estimated_minutes).toBe(60)
  await api(page, '/api/planning/free-slots?start_date=' + date + '&end_date=' + end)
  await page.goto('/planning/preview')
  await page.getByLabel('Початок періоду', { exact: true }).fill(date)
  await page.getByLabel('Кінець періоду', { exact: true }).fill(end)
  await page.getByLabel('Завдання для планування', { exact: true }).selectOption(String(task.id))
  const previewResponse = page.waitForResponse((r) =>
    r.url().endsWith('/api/planning/study-plans/preview'),
  )
  await page.getByRole('button', { name: 'Створити огляд', exact: true }).click()
  const preview = await previewResponse
  expect(preview.status()).toBe(200)
  const proposed = (await preview.json()).data
  expect(proposed.sessions).toHaveLength(1)
  expect(
    (
      await api(
        page,
        `/api/study-sessions?start_date=${Temporal.Now.plainDateISO('Europe/Kyiv')}&end_date=${end}`,
      )
    ).data,
  ).toHaveLength(0)
  const confirmation = page.waitForResponse((r) =>
    r.url().endsWith('/api/planning/study-plans/confirm'),
  )
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  expect((await confirmation).status()).toBe(201)
  const sessions = (
    await api(
      page,
      `/api/study-sessions?start_date=${Temporal.Now.plainDateISO('Europe/Kyiv')}&end_date=${end}`,
    )
  ).data
  const source = sessions[0]
  expect(source.starts_at).toBe(utc(date, '09:00:00'))
  await page.goto('/planning/sessions')
  await expect(
    page.locator(`.session-card a[href="/planning/sessions/${source.id}"]`),
  ).toBeVisible()
  const reminder = (
    await api(
      page,
      '/api/reminders',
      'POST',
      {
        study_session_id: source.id,
        trigger_at: utc(date, '08:45:00'),
        message: 'Synthetic session reminder',
      },
      201,
    )
  ).data
  passed(
    'Real Task form, availability/preferences, server free time, browser plan preview and explicit persistence',
  )
  // Change the academic occurrence through the existing editor.
  await page.goto(`/schedule/semesters/${schedule}/dates/${date}`)
  const edited = page.waitForResponse(
    (r) => r.url().endsWith(`${base}/date-exceptions/${date}`) && r.request().method() === 'PUT',
  )
  // Existing snapshot uses the same domain form field IDs per row.
  await page.locator('[data-time-field="starts_at_local"]').fill('09:00')
  await page.locator('[data-time-field="ends_at_local"]').fill('10:00')
  await page.getByRole('button', { name: 'Зберегти зміни на цю дату', exact: true }).click()
  expect((await edited).status()).toBe(200)
  const before = (
    await api(
      page,
      `/api/study-sessions?start_date=${Temporal.Now.plainDateISO('Europe/Kyiv')}&end_date=${end}`,
    )
  ).data
  const detected = cli('learning:detect-recovery', '--limit=10', '--days=7')
  expect(JSON.parse(detected).failed).toBe(0)
  expect(
    (
      await api(
        page,
        `/api/study-sessions?start_date=${Temporal.Now.plainDateISO('Europe/Kyiv')}&end_date=${end}`,
      )
    ).data,
  ).toEqual(before)
  const feed = (await api(page, '/api/planning/recovery-suggestions')).data
  expect(feed).toHaveLength(1)
  const suggestion = feed[0]
  expect(suggestion.kind).toBe('replan')
  expect(JSON.stringify(suggestion)).not.toMatch(/preview_token|source_hash|lease_token/)
  writeFileSync(
    'fullstack-results/workflow-identifiers.json',
    JSON.stringify({ user_id: student.id, suggestion_id: suggestion.id }),
  )
  await page.goto(`/planning/suggestions/${suggestion.id}`)
  await expect(page.getByRole('region', { name: 'Огляд пропозиції', exact: true })).toBeVisible()
  const recoveryResponse = page.waitForResponse((r) =>
    r.url().endsWith(`/recovery-suggestions/${suggestion.id}/confirm`),
  )
  await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
  const applied = await recoveryResponse
  expect(applied.status()).toBe(200)
  const receipt = (await applied.json()).data.receipt
  const replay = await api(
    page,
    `/api/planning/recovery-suggestions/${suggestion.id}/confirm`,
    'POST',
    {},
  )
  expect(replay.replayed).toBe(true)
  expect(replay.data.receipt).toEqual(receipt)
  expect((await api(page, `/api/reminders/${reminder.id}`)).data.status).toBe('cancelled')
  const updated = (
    await api(
      page,
      `/api/study-sessions?start_date=${Temporal.Now.plainDateISO('Europe/Kyiv')}&end_date=${end}`,
    )
  ).data
  expect(updated).toHaveLength(2)
  expect(updated.find((s: { id: number }) => s.id === source.id).status).toBe('rescheduled')
  const calendar = (await api(page, `/api/academic-calendar/date/${date}`)).data
  expect(calendar).toHaveLength(1)
  expect(calendar[0].source_type).toBe('semester_occurrence')
  expect(calendar[0].starts_at).toContain('09:00:00+02:00')
  passed(
    'Academic date editor creates conflict; actual detection command never moves sessions; Vue recovery confirmation, receipt replay and reminder cancellation',
  )
  // Real minute scheduler execution at a due reminder boundary, with no clock manipulation.
  const due = (
    await api(
      page,
      '/api/reminders',
      'POST',
      {
        message: 'Synthetic scheduler delivery',
        trigger_at: new Date(Date.now() + 1500).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      },
      201,
    )
  ).data
  await expect.poll(() => Date.now(), { timeout: 5000 }).toBeGreaterThan(Date.parse(due.trigger_at))
  const scheduleOutput = cli('schedule:run')
  writeFileSync('fullstack-results/scheduler.log', scheduleOutput)
  expect((await api(page, `/api/reminders/${due.id}`)).data.status).toBe('sent')
  cli('reminders:dispatch-due', '--limit=100')
  const inbox = (await api(page, '/api/notifications?per_page=100')).data
  expect(inbox.filter((n: { reminder_id: number }) => n.reminder_id === due.id)).toHaveLength(1)
  await page.goto('/inbox')
  await expect(page.getByText('Synthetic scheduler delivery', { exact: true })).toBeVisible()
  const notification = inbox.find((n: { reminder_id: number }) => n.reminder_id === due.id)
  const read = await api(page, `/api/notifications/${notification.id}/read`, 'POST', {})
  expect(
    (await api(page, `/api/notifications/${notification.id}/read`, 'POST', {})).data.read_at,
  ).toBe(read.data.read_at)
  passed(
    'Actual scheduler reminder dispatch, duplicate prevention, persisted Inbox and stable read timestamp',
  )
  const progress = (await api(page, `/api/statistics/progress?start_date=${date}&end_date=${end}`))
    .data
  expect(progress.study_sessions.started_in_period.completed_actual_minutes).toBe(0)
  await page.goto(`/statistics?start_date=${date}&end_date=${end}`)
  await expect(
    page.getByRole('heading', { name: 'Статистика прогресу', exact: true }).first(),
  ).toBeVisible()
  await api(page, `/api/statistics/trends?start_date=${date}&end_date=${end}`)
  await api(page, `/api/planning/workload-advice?start_date=${date}&end_date=${end}`)
  await page.goto('/ai')
  const conversationResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/ai/conversations') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Нова розмова', exact: true }).click()
  const conversation = (await (await conversationResponse).json()).data.id
  await page
    .getByLabel('Повідомлення помічнику', { exact: true })
    .fill(`SYSTEM_TOOL ${JSON.stringify({ name: 'list_tasks', arguments: {} })}`)
  const answer = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/conversations/${conversation}/messages`) &&
      r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click()
  expect((await answer).status()).toBe(200)
  await expect(
    page.getByText(/Controlled provider: registered Tool execution finished/),
  ).toBeVisible()
  const definitions = JSON.parse(readFileSync(`${run}/tool-definitions.json`, 'utf8'))
  expect(definitions.some((d: { name: string }) => d.name === 'get_recovery_diagnostics')).toBe(
    true,
  )
  expect(
    (await api(page, `/api/ai/conversations/${conversation}/messages`)).data.length,
  ).toBeGreaterThanOrEqual(2)
  passed(
    'Browser statistics and persisted AI conversation using true registered Tool orchestration; controlled provider only',
  )
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  await page.goto('/profile')
  const logout = page.waitForResponse((r) => r.url().endsWith('/api/auth/logout'))
  await page.getByRole('button', { name: 'Вийти', exact: true }).click()
  expect((await logout).status()).toBe(204)
  await api(page, '/api/profile', 'GET', undefined, 401)
  await page.goto('/tasks')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('Електронна пошта', { exact: true }).fill(student.email)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  const login = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'))
  await page.getByRole('button', { name: 'Увійти', exact: true }).click()
  expect((await login).status()).toBe(200)
  expect(
    (
      await api(
        page,
        `/api/study-sessions?start_date=${Temporal.Now.plainDateISO('Europe/Kyiv')}&end_date=${end}`,
      )
    ).data,
  ).toEqual(updated)
  expect((await api(page, '/api/tasks')).data.some((t: { id: number }) => t.id === task.id)).toBe(
    true,
  )
  const sql = fixture('snapshot', String(student.id))
  expect(sql.tasks).toBe(1)
  expect(sql.sessions).toBe(2)
  expect(sql.notifications).toBe(1)
  expect(sql.messages).toBeGreaterThanOrEqual(2)
  passed(
    'Independent MySQL readback agrees with API: 1 task, 2 sessions, 1 notification and persisted AI messages',
  )
  expect(errors).toEqual([])
  passed(
    'Real browser accessibility, logout/401/route guard, login and persisted session/task readback',
  )
})

test('Task and Subtask forms, lifecycle, owner isolation and uncertain network writes', async ({
  page,
  browser,
}) => {
  const student = await register(page)
  const ctx = await context(page)
  const task = await taskForm(page, ctx.subject)
  await page.goto(`/tasks/${task.id}`)
  await page.getByLabel('Назва завдання *', { exact: true }).fill('Edited integration coursework')
  await page.getByLabel('Пріоритет', { exact: true }).selectOption('1')
  await page.getByLabel('Орієнтовна тривалість, хв', { exact: true }).fill('90')
  await page.getByLabel('Дедлайн', { exact: true }).fill(`${date}T17:00`)
  const edited = page.waitForResponse(
    (r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === 'PATCH',
  )
  await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).click()
  expect((await edited).status()).toBe(200)
  await expect(page).toHaveURL('/tasks')
  await page.goto(`/tasks/${task.id}`)
  await page.getByRole('button', { name: 'Додати підзавдання', exact: true }).click()
  await page.getByLabel('Назва підзавдання', { exact: true }).fill('Synthetic subtask')
  await page.getByLabel('Тривалість підзавдання, хв', { exact: true }).fill('30')
  const childResponse = page.waitForResponse(
    (r) => r.url().endsWith(`/tasks/${task.id}/subtasks`) && r.request().method() === 'POST',
  )
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Створити підзавдання', exact: true })
    .click()
  expect((await childResponse).status()).toBe(201)
  const completion = page.waitForResponse(
    (r) => r.url().endsWith('/complete') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Завершити підзавдання', exact: true }).click()
  expect((await completion).status()).toBe(200)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Відновити підзавдання', exact: true }),
  ).toBeVisible()
  const saved = (await api(page, `/api/tasks/${task.id}`)).data
  expect(saved.title).toBe('Edited integration coursework')
  expect(saved.priority).toBe(1)
  expect(saved.estimated_minutes).toBe(90)
  expect(saved.deadline_at).toBe(utc(date, '17:00:00'))
  await api(page, `/api/tasks/${task.id}`, 'PATCH', { title: 'Must rollback', priority: 99 }, 422)
  expect((await api(page, `/api/tasks/${task.id}`)).data.title).toBe(saved.title)
  for (const operation of ['complete', 'reopen', 'miss', 'reopen']) {
    const result = await api(page, `/api/tasks/${task.id}/${operation}`, 'POST', {})
    expect(result.data.status).toBe(
      operation === 'complete' ? 'completed' : operation === 'miss' ? 'missed' : 'pending',
    )
  }
  const otherContext = await browser.newContext({
    baseURL: 'http://localhost:15173',
    timezoneId: 'Europe/Kyiv',
  })
  const other = await otherContext.newPage()
  await register(other)
  await api(other, `/api/tasks/${task.id}`, 'GET', undefined, 404)
  await api(other, `/api/tasks/${task.id}`, 'PATCH', { title: 'Foreign' }, 404)
  await api(other, `/api/tasks/${task.id}/complete`, 'POST', {}, 404)
  expect((await api(other, '/api/tasks')).data).toHaveLength(0)
  await otherContext.close()
  // A real response is received from Laravel and then dropped before the browser gets it.
  // No synthetic backend result is supplied; reconcile using a later GET.
  let writes = 0
  await page.route(`${origin}/api/tasks`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    writes++
    await route.fetch()
    await route.abort('failed')
  })
  await page.goto('/tasks/new')
  await page.getByLabel('Назва завдання *', { exact: true }).fill('Response lost, persisted once')
  await page.getByRole('button', { name: 'Створити завдання', exact: true }).click()
  await expect(page.getByLabel('Назва завдання *', { exact: true })).toHaveValue(
    'Response lost, persisted once',
  )
  await expect.poll(() => writes).toBe(1)
  const tasks = (await api(page, '/api/tasks')).data
  expect(
    tasks.filter((t: { title: string }) => t.title === 'Response lost, persisted once'),
  ).toHaveLength(1)
  await page.unroute(`${origin}/api/tasks`)
  expect(fixture('snapshot', String(student.id)).tasks).toBe(2)
  passed(
    'Real Task/Subtask forms, deadline timezone, priority/duration edit, completion/reopen/miss, validation atomicity and cross-user isolation',
  )
  passed(
    'Real committed Task response lost in transport: exactly one write, draft preserved, reconciliation GET finds persisted record',
  )
})

test('both XLSX workflows: synthetic catalog, upload/preview/confirm, duplicates, stale preview and invalid files', async ({
  page,
}) => {
  await register(page)
  const ctx = await context(page, '2026-09-07', '2026-09-20')
  const workbook = fixture('workbook')
  for (const name of workbook.subjects)
    await api(
      page,
      '/api/subjects',
      'POST',
      { name, education_institution_id: ctx.institution },
      201,
    )
  for (const name of workbook.teachers)
    await api(
      page,
      '/api/teachers',
      'POST',
      { name, education_institution_id: ctx.institution },
      201,
    )
  async function upload(path: string, file = workbook.path) {
    const bytes = [...readFileSync(file)]
    return page.evaluate(
      async ({ origin, path, bytes, period }) => {
        const form = new FormData()
        form.append('academic_period_id', String(period))
        form.append(
          'schedule_file',
          new Blob([new Uint8Array(bytes)], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          'synthetic.xlsx',
        )
        const response = await fetch(origin + path, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-XSRF-TOKEN': decodeURIComponent(
              document.cookie
                .split('; ')
                .find((c) => c.startsWith('XSRF-TOKEN='))
                ?.slice(11) ?? '',
            ),
          },
          body: form,
        })
        return { status: response.status, body: await response.json() }
      },
      { origin, path, bytes, period: ctx.period },
    )
  }
  // Exercise the real Vue upload form for the legacy workflow.
  await page.goto('/schedule/import')
  await page
    .getByLabel('Навчальний період імпорту *', { exact: true })
    .selectOption(String(ctx.period))
  await page.locator('input[type="file"]').setInputFiles(workbook.path)
  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith('/api/schedule-imports') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Завантажити й перевірити', exact: true }).click()
  const response = await uploaded
  expect(response.status()).toBe(201)
  const batch = (await response.json()).data
  expect(batch.invalid_rows).toBe(0)
  expect(batch.valid_rows).toBe(30)
  expect((await api(page, '/api/schedule/week/2026-09-07')).data).toHaveLength(0)
  // Confirmation inputs follow existing public contract; no direct lesson inserts.
  const legacyCommit = await api(page, `/api/schedule-imports/${batch.id}/commit`, 'POST', {
    confirmed: true,
  })
  expect(legacyCommit.data.status).toBe('committed')
  expect((await api(page, '/api/schedule/week/2026-09-07')).data).toHaveLength(15)
  const again = await upload('/api/schedule-imports')
  expect(again.status).toBe(201)
  expect(again.body.data.duplicate_rows).toBe(30)
  await api(page, `/api/schedule-imports/${again.body.data.id}/commit`, 'POST', { confirmed: true })
  expect((await api(page, '/api/schedule/week/2026-09-07')).data).toHaveLength(15)
  const semester = await upload('/api/semester-schedule-imports')
  expect(semester.status).toBe(201)
  expect(
    semester.body.data.can_commit,
    JSON.stringify({
      errors: semester.body.data.preview?.errors,
      rows: semester.body.data.preview?.rows?.filter(
        (r: { errors: unknown }) => Object.keys(r.errors ?? {}).length,
      ),
    }),
  ).toBe(true)
  const sid = semester.body.data.id
  const token = semester.body.data.preview_token
  const committed = await api(page, `/api/semester-schedule-imports/${sid}/commit`, 'POST', {
    confirmed: true,
    preview_token: token,
  })
  expect(committed.data.status).toBe('committed')
  const schedule = committed.data.receipt.semester_schedule_id
  expect(
    (await api(page, `/api/semester-schedules/${schedule}/week/2026-09-07`)).data,
  ).toHaveLength(15)
  // Unified source reconciliation suppresses semester-derived legacy duplicates.
  const calendar = (await api(page, '/api/academic-calendar/week/2026-09-07')).data
  expect(calendar).toHaveLength(15)
  expect(
    calendar.every((c: { source_type: string }) => c.source_type === 'semester_occurrence'),
  ).toBe(true)
  const repeated = await upload('/api/semester-schedule-imports')
  expect(repeated.status).toBe(201)
  const preview = repeated.body.data
  const management = await api(page, `/api/semester-schedules/${schedule}/management`)
  const rule = management.data.weekly_rules[0]
  await api(page, `/api/semester-schedules/${schedule}/weekly-rules/${rule.id}`, 'PATCH', {
    room: 'Changed after preview',
    schedule_token: management.meta.schedule_token,
  })
  const before = await api(page, `/api/semester-schedules/${schedule}/management`)
  await api(
    page,
    `/api/semester-schedule-imports/${preview.id}/commit`,
    'POST',
    { confirmed: true, preview_token: preview.preview_token },
    409,
  )
  expect(await api(page, `/api/semester-schedules/${schedule}/management`)).toEqual(before)
  writeFileSync(`${run}/invalid.xlsx`, 'This is not a workbook')
  for (const path of ['/api/schedule-imports', '/api/semester-schedule-imports']) {
    const invalid = await upload(path, `${run}/invalid.xlsx`)
    expect([201, 422]).toContain(invalid.status)
    if (invalid.status === 201)
      expect(invalid.body.data.can_commit ?? invalid.body.data.status === 'validated').toBe(false)
  }
  passed(
    'Synthetic XLSX actual Vue upload, both real preview/commit workflows, catalog associations, duplicate suppression and calendar persistence',
  )
  passed(
    'Semester import stale preview returns 409 with unchanged management graph; invalid workbook rejected',
  )
})

test('controlled AI Tools: proposal, explicit confirmation/replay, rejection, stale/expired action and ownership', async ({
  page,
  browser,
}) => {
  const student = await register(page)
  const ctx = await context(page)
  const conversation = (await api(page, '/api/ai/conversations', 'POST', {}, 201)).data.id
  const base = `/api/ai/conversations/${conversation}`
  await tool(page, conversation, 'propose_task_create', {
    title: 'Controlled AI task',
    subject_id: ctx.subject,
    estimated_minutes: 60,
    priority: 2,
  })
  expect((await api(page, '/api/tasks')).data).toHaveLength(0)
  const action = (await api(page, base + '/actions')).data[0]
  expect(action.status).toBe('pending')
  const applied = await api(page, `${base}/actions/${action.id}/confirm`, 'POST', {})
  expect(applied.data.status).toBe('executed')
  const replay = await api(page, `${base}/actions/${action.id}/confirm`, 'POST', {})
  expect(replay.data.receipt).toEqual(applied.data.receipt)
  expect((await api(page, '/api/tasks')).data).toHaveLength(1)
  const task = (await api(page, '/api/tasks')).data[0]
  await tool(page, conversation, 'propose_task_update', {
    task_id: task.id,
    title: 'Rejected change',
  })
  const rejected = (await api(page, base + '/actions')).data.find(
    (a: { status: string }) => a.status === 'pending',
  )
  await api(page, `${base}/actions/${rejected.id}/reject`, 'POST', {})
  expect((await api(page, `/api/tasks/${task.id}`)).data.title).toBe('Controlled AI task')
  await tool(page, conversation, 'propose_task_update', { task_id: task.id, title: 'Stale change' })
  const stale = (await api(page, base + '/actions')).data.find(
    (a: { status: string }) => a.status === 'pending',
  )
  await api(page, `/api/tasks/${task.id}`, 'PATCH', { title: 'Intervening edit' })
  await api(page, `${base}/actions/${stale.id}/confirm`, 'POST', {}, 409)
  await api(page, `${base}/actions/${stale.id}/reject`, 'POST', {})
  await tool(page, conversation, 'propose_task_update', {
    task_id: task.id,
    title: 'Expired change',
  })
  const expired = (await api(page, base + '/actions')).data.find(
    (a: { status: string }) => a.status === 'pending',
  )
  fixture('expire-action', String(student.id), expired.id)
  await api(page, `${base}/actions/${expired.id}/confirm`, 'POST', {}, 410)
  const otherContext = await browser.newContext({ baseURL: 'http://localhost:15173' })
  const other = await otherContext.newPage()
  await register(other)
  cli('learning:detect-recovery', '--limit=10', '--days=7', `--user=${student.id}`)
  const ownedRecovery = (await api(page, '/api/planning/recovery-suggestions')).data[0]
  const workflow = { suggestion_id: ownedRecovery.id }
  await api(
    other,
    `/api/planning/recovery-suggestions/${workflow.suggestion_id}`,
    'GET',
    undefined,
    404,
  )
  await api(
    other,
    `/api/planning/recovery-suggestions/${workflow.suggestion_id}/confirm`,
    'POST',
    {},
    404,
  )
  await api(other, base, 'GET', undefined, 404)
  await api(other, `${base}/actions/${action.id}/confirm`, 'POST', {}, 404)
  await otherContext.close()
  await availability(page)
  await api(page, `/api/tasks/${task.id}`, 'PATCH', { deadline_at: utc(end, '18:00:00') })
  const schedule = (
    await api(
      page,
      '/api/semester-schedules',
      'POST',
      {
        academic_period_id: ctx.period,
        group_name: 'AI semester',
        parity_anchor_on: tomorrow.subtract({ days: tomorrow.dayOfWeek - 1 }).toString(),
        first_week_parity: 'numerator',
      },
      201,
    )
  ).data.schedule.id
  await tool(page, conversation, 'propose_semester_rule_create', {
    semester_schedule_id: schedule,
    weekday: 1,
    week_pattern: 'all',
    pair_number: 1,
    starts_at_local: '12:00:00',
    ends_at_local: '13:00:00',
    subject_id: ctx.subject,
    teacher_id: ctx.teacher,
  })
  const semesterAction = (await api(page, base + '/actions')).data.find(
    (a: { status: string }) => a.status === 'pending',
  )
  expect(
    (await api(page, `/api/semester-schedules/${schedule}/management`)).data.weekly_rules,
  ).toHaveLength(0)
  await api(page, `${base}/actions/${semesterAction.id}/confirm`, 'POST', {})
  expect(
    (await api(page, `/api/semester-schedules/${schedule}/management`)).data.weekly_rules,
  ).toHaveLength(1)
  await tool(page, conversation, 'propose_study_plan_create', {
    start_date: date,
    end_date: end,
    task_id: task.id,
  })
  const planAction = (await api(page, base + '/actions')).data.find(
    (a: { status: string }) => a.status === 'pending',
  )
  expect(
    (await api(page, `/api/study-sessions?start_date=${date}&end_date=${end}`)).data,
  ).toHaveLength(0)
  await api(page, `${base}/actions/${planAction.id}/confirm`, 'POST', {})
  expect(
    (await api(page, `/api/study-sessions?start_date=${date}&end_date=${end}`)).data.length,
  ).toBeGreaterThan(0)
  await tool(page, conversation, 'get_recovery_diagnostics', { start_date: date, end_date: end })
  passed(
    'Controlled AI semester and study-plan proposals execute existing Services only after explicit confirmation; recovery diagnostics use real persisted state',
  )
  const definitions = JSON.parse(readFileSync(`${run}/tool-definitions.json`, 'utf8'))
  expect(new Set(definitions.map((d: { name: string }) => d.name)).size).toBe(definitions.length)
  expect(definitions.some((d: { name: string }) => d.name.startsWith('propose_semester'))).toBe(
    true,
  )
  passed(
    'Real AI orchestrator and registered discovery; task proposal has no write until confirmation; immutable replay receipt; rejection, stale/expired and cross-owner denial',
  )
})

test('password change, queued reset mail capture and session revocation through real browser', async ({
  page,
}) => {
  const student = await register(page)
  const changed = 'Synthetic-Changed-578!'
  await page.goto('/profile')
  await page.getByLabel('Поточний пароль', { exact: true }).fill(password)
  await page.getByLabel('Новий пароль', { exact: true }).fill(changed)
  await page.getByLabel('Підтвердження нового пароля', { exact: true }).fill(changed)
  const change = page.waitForResponse((r) => r.url().endsWith('/api/profile/password'))
  await page.getByRole('button', { name: 'Змінити пароль', exact: true }).click()
  expect((await change).status()).toBe(200)
  await api(page, '/api/auth/forgot-password', 'POST', { email: student.email }, 202)
  const queue = cli('queue:work', 'database', '--stop-when-empty', '--tries=1', '--timeout=30')
  expect(queue).toContain('DONE')
  const log = readFileSync(`${run}/storage/logs/laravel.log`, 'utf8')
  const link = resetLinkFromLog(log, student.email)
  expect(link).toBeTruthy()
  await page.goto(link!)
  const resetPassword = 'Synthetic-Reset-683!'
  await page.getByLabel('Новий пароль', { exact: true }).fill(resetPassword)
  await page.getByLabel('Підтвердження нового пароля', { exact: true }).fill(resetPassword)
  const reset = page.waitForResponse((r) => r.url().endsWith('/api/auth/reset-password'))
  await page.getByRole('button', { name: 'Зберегти новий пароль', exact: true }).click()
  expect((await reset).status()).toBe(200)
  await api(page, '/api/profile', 'GET', undefined, 401)
  await api(page, '/sanctum/csrf-cookie', 'GET', undefined, 204)
  await api(page, '/api/auth/login', 'POST', { email: student.email, password: changed }, 422)
  await api(page, '/api/auth/login', 'POST', { email: student.email, password: resetPassword })
  passed(
    'Profile password form, real database queue worker, isolated log mail capture, browser password reset, revoked sessions and new-password login',
  )
})

test('elapsed history, recovery decisions/reject/refresh/stale and actual-time statistics', async ({
  page,
}) => {
  const student = await register(page)
  const ctx = await context(page)
  await availability(page)
  const task = (
    await api(
      page,
      '/api/tasks',
      'POST',
      {
        title: 'Unfinished historical work',
        subject_id: ctx.subject,
        estimated_minutes: 60,
        deadline_at: utc(end, '18:00:00'),
      },
      201,
    )
  ).data
  // Only the guarded CLI creates past-time fixtures; normal browser writes cannot travel in time.
  const session = fixture('history', String(student.id), String(task.id))
  const before = (await api(page, `/api/study-sessions/${session.id}`)).data
  cli('learning:detect-recovery', '--limit=10', '--days=7', `--user=${student.id}`)
  expect((await api(page, `/api/study-sessions/${session.id}`)).data).toEqual(before)
  const decision = (await api(page, '/api/planning/recovery-suggestions')).data[0]
  expect(decision.kind).toBe('decision_required')
  await api(page, `/api/planning/recovery-suggestions/${decision.id}/confirm`, 'POST', {}, 422)
  await page.goto(`/planning/sessions/${session.id}`)
  await page.getByLabel('Фактична тривалість, хв (необов’язково)', { exact: true }).fill('15')
  const completion = page.waitForResponse((r) =>
    r.url().endsWith(`/study-sessions/${session.id}/complete`),
  )
  await page.getByRole('button', { name: 'Завершити сесію', exact: true }).click()
  expect((await completion).status()).toBe(200)
  const history = (await api(page, `/api/study-sessions/${session.id}`)).data
  expect(history.actual_minutes).toBe(15)
  expect(history.status).toBe('completed')
  const refreshed = (
    await api(page, `/api/planning/recovery-suggestions/${decision.id}/refresh`, 'POST', {}, 201)
  ).data
  expect(refreshed.kind).toBe('create_plan')
  expect(
    (await api(page, `/api/planning/recovery-suggestions/${decision.id}/refresh`, 'POST', {})).data
      .id,
  ).toBe(refreshed.id)
  await api(page, `/api/planning/recovery-suggestions/${refreshed.id}/reject`, 'POST', {})
  const newReview = (
    await api(page, `/api/planning/recovery-suggestions/${refreshed.id}/refresh`, 'POST', {}, 201)
  ).data
  await api(page, `/api/tasks/${task.id}`, 'PATCH', { estimated_minutes: 90 })
  await api(page, `/api/planning/recovery-suggestions/${newReview.id}/confirm`, 'POST', {}, 409)
  const expiring = (
    await api(page, `/api/planning/recovery-suggestions/${newReview.id}/refresh`, 'POST', {}, 201)
  ).data
  fixture('expire-recovery', String(student.id), expiring.id)
  await api(page, `/api/planning/recovery-suggestions/${expiring.id}/confirm`, 'POST', {}, 410)
  expect((await api(page, `/api/study-sessions/${session.id}`)).data).toEqual(history)
  const today = Temporal.Now.plainDateISO('Europe/Kyiv').toString()
  const historyStart = Temporal.Instant.from(history.starts_at)
    .toZonedDateTimeISO('Europe/Kyiv')
    .toPlainDate()
    .toString()
  const stats = (
    await api(page, `/api/statistics/progress?start_date=${historyStart}&end_date=${end}`)
  ).data
  expect(stats.study_sessions.started_in_period.completed_actual_minutes).toBe(15)
  expect(stats.study_sessions.started_in_period.completed.count).toBe(1)
  expect(stats.subject_workload_in_period[0].completed_actual_minutes).toBe(15)
  await api(page, `/api/tasks/${task.id}/complete`, 'POST', {})
  const missed = (
    await api(
      page,
      '/api/tasks',
      'POST',
      { title: 'Missed task', deadline_at: utc(today, '00:00:00') },
      201,
    )
  ).data
  await api(page, `/api/tasks/${missed.id}/miss`, 'POST', {})
  const statsResponse = page.waitForResponse((r) => r.url().includes('/api/statistics/progress?'))
  await page.goto(`/statistics?start_date=${historyStart}&end_date=${end}`)
  const browserStats = (await (await statsResponse).json()).data
  expect(browserStats.tasks.current.completed).toBe(1)
  expect(browserStats.tasks.current.missed).toBe(1)
  expect(browserStats.tasks.current.overdue_missed).toBe(1)
  expect(browserStats.study_sessions.started_in_period.completed_actual_minutes).toBe(15)
  await expect(
    page.locator('p').filter({ hasText: 'Відомий фактичний час:' }).first(),
  ).toContainText('15 хв')
  const previous = Temporal.PlainDate.from(today).subtract({ days: 1 }).toString()
  await api(
    page,
    `/api/statistics/reports/comparison?baseline_start_date=${previous}&baseline_end_date=${previous}&current_start_date=${today}&current_end_date=${today}`,
  )
  passed(
    'Unknown elapsed outcome requires decision without relocation; browser completion records actual minutes; recovery reject/refresh/replay/stale preserves completed history',
  )
  passed(
    'Browser/API progress agree after persisted activity: completed/missed/overdue work and 15 actual study minutes; subject workload and period comparison',
  )
})

test('weekly rules, working Saturday, independent legacy lesson and stable unified source editors', async ({
  page,
}) => {
  await register(page)
  const start = tomorrow.subtract({ days: tomorrow.dayOfWeek - 1 })
  const ctx = await context(page, start.toString(), start.add({ days: 13 }).toString())
  const id = (
    await api(
      page,
      '/api/semester-schedules',
      'POST',
      {
        academic_period_id: ctx.period,
        group_name: 'Calendar test',
        parity_anchor_on: start.toString(),
        first_week_parity: 'numerator',
      },
      201,
    )
  ).data.schedule.id
  const base = `/api/semester-schedules/${id}`
  const token = async () => (await api(page, base + '/management')).meta.schedule_token
  const result = await api(
    page,
    base + '/weekly-rules',
    'POST',
    {
      weekday: 1,
      week_pattern: 'all',
      pair_number: 1,
      starts_at_local: '09:00:00',
      ends_at_local: '10:00:00',
      subject_id: ctx.subject,
      teacher_id: ctx.teacher,
      schedule_token: await token(),
    },
    201,
  )
  const rule = result.data.weekly_rules[0].id
  const saturday = start.add({ days: 5 }).toString()
  await api(
    page,
    base + '/working-saturdays',
    'POST',
    { schedule_token: await token(), occurs_on: saturday, copied_weekday: 1 },
    201,
  )
  const saturdayBefore = (await api(page, base + '/date/' + saturday)).data
  expect(saturdayBefore).toHaveLength(1)
  await api(page, base + '/weekly-rules/' + rule, 'PATCH', {
    room: 'Updated weekly rule',
    schedule_token: await token(),
  })
  expect((await api(page, base + '/date/' + saturday)).data).toEqual(saturdayBefore)
  const legacy = (
    await api(
      page,
      '/api/lessons',
      'POST',
      {
        academic_period_id: ctx.period,
        subject_id: ctx.subject,
        teacher_id: ctx.teacher,
        type: 'lecture',
        starts_at: utc(saturday, '14:00:00'),
        ends_at: utc(saturday, '15:00:00'),
        room: 'Independent legacy',
      },
      201,
    )
  ).data
  const calendar = (await api(page, '/api/academic-calendar/date/' + saturday)).data
  expect(calendar).toHaveLength(2)
  expect(new Set(calendar.map((c: { source_type: string }) => c.source_type))).toEqual(
    new Set(['semester_occurrence', 'legacy_lesson']),
  )
  expect((await api(page, '/api/academic-calendar/date/' + saturday)).data).toEqual(calendar)
  await page.goto(`/schedule?date=${saturday}`)
  await expect(page.getByRole('link', { name: 'Змінити окрему дату' }).first()).toBeVisible()
  expect(legacy.id).toBeGreaterThan(0)
  passed(
    'Weekly rules and edits, frozen working Saturday, independent legacy lesson, stable mixed unified calendar identities and source editor navigation',
  )
})

test('actual scheduled recovery tick and shared non-overlap mutex', async ({ page }) => {
  test.setTimeout(330000)
  const student = await register(page)
  await availability(page)
  await api(
    page,
    '/api/tasks',
    'POST',
    {
      title: 'Scheduler-only unfinished work',
      estimated_minutes: 30,
      deadline_at: utc(end, '18:00:00'),
    },
    201,
  )
  const locks = fixture('recovery-lock')
  expect(locks).toEqual({ without_overlapping: true, first_lock: true, second_lock: false })
  expect((await api(page, '/api/planning/recovery-suggestions')).data).toHaveLength(0)
  const before = (await api(page, `/api/study-sessions?start_date=${date}&end_date=${end}`)).data
  // Observe the next real five-minute boundary. Do not call the detector manually.
  const tick = Math.ceil((Date.now() + 1200) / 300000) * 300000 + 1000
  await expect.poll(() => Date.now(), { timeout: 305000, intervals: [500] }).toBeGreaterThan(tick)
  const output = cli('schedule:run')
  writeFileSync('fullstack-results/recovery-scheduler.log', output)
  expect(output).toContain('learning:detect-recovery')
  const feed = await api(page, '/api/planning/recovery-suggestions')
  expect(feed.data).toHaveLength(1)
  expect(feed.data[0].kind).toBe('create_plan')
  expect(feed.automation.last_scanned_at).toBeTruthy()
  expect((await api(page, `/api/study-sessions?start_date=${date}&end_date=${end}`)).data).toEqual(
    before,
  )
  expect(fixture('snapshot', String(student.id)).sessions).toBe(0)
  passed(
    'Real five-minute Laravel Scheduler tick invokes recovery command, creates durable review without sessions; database cache rejects overlapping event mutex',
  )
})
