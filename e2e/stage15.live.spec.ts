import { expect, test, type Page } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { authorizeLive, dispatchAllowed, privateAuthPath } from './support/liveSafety'
import { liveApi, serveLiveFrontend } from './support/liveBrowser'
import type { Page as ApiPage, Reminder, Resource, StudySession, User } from '../src/types/api'
import type { InboxNotification } from '../src/types/reminders'
import type { RecoveryPreview, PersistedPlan } from '../src/types/planning'

// Additional delivery checks are opt-in even when the general system grant exists.
const authorization = authorizeLive('system')
const enabled = process.env.STAGE15_LIVE_ACCEPTANCE === '1'
const accountPath = process.env.STAGE15_ACCOUNT_FILE
const fixturePath = process.env.STAGE15_RECOVERY_FIXTURES
function account(): { id: number; email: string; password: string } {
  return JSON.parse(readFileSync(privateAuthPath(accountPath!), 'utf8'))
}
function evidence(check: string, values: Record<string, number | boolean>) {
  appendFileSync(
    privateAuthPath(process.env.STAGE15_EVIDENCE_FILE!),
    JSON.stringify({ check, ...values }) + '\n',
  )
}
async function login(page: Page) {
  const credentials = account()
  expect(credentials.id === authorization.grant.user_id).toBe(true)
  await serveLiveFrontend(page)
  await page.goto('/login')
  // Each test starts without a saved session; credentials are never test attachments.
  await page.getByLabel('Електронна пошта', { exact: true }).fill(credentials.email)
  await page.getByLabel('Пароль', { exact: true }).fill(credentials.password)
  const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'))
  await page.getByRole('button', { name: 'Увійти', exact: true }).click()
  expect((await response).status()).toBe(200)
  const owner = await liveApi<Resource<User>>(page, '/api/profile')
  expect(owner.status).toBe(200)
  expect(owner.data.data.id).toBe(credentials.id)
}
test.describe('Stage 15 isolated acceptance', () => {
  test.setTimeout(180000)
  test.use({ storageState: { cookies: [], origins: [] } })
  test.beforeEach(() => {
    test.skip(!enabled, 'Stage 15 delivery checks require explicit opt-in and private fixtures.')
    expect(authorization.grant.database_disposable).toBe(true)
    expect(accountPath && fixturePath && process.env.STAGE15_EVIDENCE_FILE).toBeTruthy()
  })

  test('recovery preview preserves history and confirms remaining work once', async ({ page }) => {
    await login(page)
    const fixtures: {
      task_id: number
      start_date: string
      end_date: string
      sessions: { id: number; status: string }[]
    } = JSON.parse(readFileSync(privateAuthPath(fixturePath!), 'utf8'))
    const history = async () => {
      const statuses = []
      for (const session of fixtures.sessions) {
        const result = await liveApi<Resource<StudySession>>(
          page,
          `/api/study-sessions/${session.id}`,
        )
        expect(result.status).toBe(200)
        statuses.push({ id: result.data.data.id, status: result.data.data.status })
      }
      return statuses
    }
    expect(await history()).toEqual(fixtures.sessions)
    await page.goto('/planning/recovery')
    await page.getByLabel('Початок періоду', { exact: true }).fill(fixtures.start_date)
    await page.getByLabel('Кінець періоду', { exact: true }).fill(fixtures.end_date)
    await page
      .getByLabel('Завдання для планування', { exact: true })
      .selectOption(String(fixtures.task_id))
    const response = page.waitForResponse((r) => r.url().endsWith('/api/planning/recovery/preview'))
    await page
      .getByRole('button', { name: 'Знайти час для невиконаної роботи', exact: true })
      .click()
    const previewResponse = await response
    expect(previewResponse.status()).toBe(200)
    const preview: Resource<RecoveryPreview> = await previewResponse.json()
    const recovery = preview.data.recovery
    expect(recovery.summary.missed_session_count).toBe(1)
    expect(recovery.summary.past_planned_session_count).toBe(1)
    expect(recovery.summary.requires_lifecycle_decision).toBe(true)
    expect(await history()).toEqual(fixtures.sessions)
    const plan = preview.data.study_plan
    expect(plan.sessions.length).toBeGreaterThan(0)
    // 90 estimated - 15 completed actual - 30 reserved = at most 45 new minutes.
    expect(plan.summary.allocated_seconds).toBeGreaterThan(0)
    expect(plan.summary.allocated_seconds).toBeLessThanOrEqual(45 * 60)
    expect(plan.sessions.every((s) => Date.parse(s.starts_at) > Date.now())).toBe(true)
    const partial = page.getByLabel('Приймаю частковий результат і неперенесену тривалість', {
      exact: true,
    })
    if (await partial.count()) await partial.check()
    const confirmed = page.waitForResponse((r) =>
      r.url().endsWith('/api/planning/study-plans/confirm'),
    )
    await page.getByRole('button', { name: 'Підтвердити зміни', exact: true }).click()
    const confirmation = await confirmed
    expect(confirmation.status()).toBe(201)
    const saved: Resource<PersistedPlan> = await confirmation.json()
    expect(saved.data.sessions.length).toBe(plan.sessions.length)
    const replay = await liveApi(page, '/api/planning/study-plans/confirm', 'POST', {
      preview_token: plan.preview_token,
      accept_partial: true,
    })
    expect(replay.status).toBe(409)
    expect(await history()).toEqual(fixtures.sessions)
    evidence('recovery', {
      preview_status: 200,
      confirmation_status: 201,
      replay_status: replay.status,
      new_sessions: saved.data.sessions.length,
      allocated_seconds: plan.summary.allocated_seconds,
      history_unchanged: true,
    })
  })

  test('scheduler delivers one Inbox item and preserves read state across another tick', async ({
    page,
  }) => {
    expect(dispatchAllowed(authorization.grant, process.env.F7_LIVE_ALLOW_DISPATCH)).toBe(true)
    await login(page)
    const created = await liveApi<Resource<Reminder>>(page, '/api/reminders', 'POST', {
      message: 'Stage 15 isolated scheduler delivery',
      trigger_at: new Date(Date.now() + 5000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    })
    expect(created.status).toBe(201)
    const id = created.data.data.id
    expect(created.data.data.status).toBe('scheduled')
    await expect
      .poll(
        async () =>
          (await liveApi<Resource<Reminder>>(page, `/api/reminders/${id}`)).data.data.status,
        { timeout: 75000, intervals: [1000] },
      )
      .toBe('sent')
    const matching = async () => {
      const result = await liveApi<ApiPage<InboxNotification>>(
        page,
        '/api/notifications?per_page=100',
      )
      expect(result.status).toBe(200)
      expect(result.data.meta.last_page).toBe(1)
      return result.data.data.filter((n) => n.reminder_id === id)
    }
    const delivered = await matching()
    expect(delivered.length).toBe(1)
    expect(delivered[0]!.read_at).toBeNull()
    const read = await liveApi<Resource<InboxNotification>>(
      page,
      `/api/notifications/${delivered[0]!.id}/read`,
      'POST',
    )
    expect(read.status).toBe(200)
    expect(read.data.data.read_at !== null).toBe(true)
    // Observe the next real scheduler tick, without running a second dispatcher.
    const nextMinute = Math.floor(Date.now() / 60000) * 60000 + 62000
    await expect
      .poll(() => Date.now(), { timeout: 65000, intervals: [1000] })
      .toBeGreaterThan(nextMinute)
    const persisted = await matching()
    expect(persisted.length).toBe(1)
    expect(persisted[0]!.read_at).toBe(read.data.data.read_at)
    evidence('scheduler', {
      initially_scheduled: true,
      sent: true,
      notifications: 1,
      read: true,
      duplicate_after_next_tick: false,
    })
  })

  test('Mailpit password recovery rejects the old password and accepts the new one', async ({
    page,
    request,
  }) => {
    const credentials = account()
    // Search only the unique synthetic recipient; never enumerate retained messages.
    const messages = async () => {
      const result = await request.get('http://localhost:8025/api/v1/search', {
        params: { query: `to:${credentials.email}` },
      })
      expect(result.status()).toBe(200)
      const data: { messages: { ID: string }[] } = await result.json()
      return data.messages
    }
    const before = new Set((await messages()).map((m) => m.ID))
    await serveLiveFrontend(page)
    await page.goto('/forgot-password')
    await page.getByLabel('Електронна пошта', { exact: true }).fill(credentials.email)
    const accepted = page.waitForResponse((r) => r.url().endsWith('/api/auth/forgot-password'))
    await page.getByRole('button', { name: 'Надіслати інструкцію', exact: true }).click()
    expect((await accepted).status()).toBe(202)
    await expect
      .poll(async () => (await messages()).filter((m) => !before.has(m.ID)).length, {
        timeout: 30000,
      })
      .toBe(1)
    const message = (await messages()).find((m) => !before.has(m.ID))!
    const content = await request.get(`http://localhost:8025/api/v1/message/${message.ID}`)
    expect(content.status()).toBe(200)
    const mail: { HTML: string; Text: string } = await content.json()
    const hrefs = [...mail.HTML.matchAll(/href="([^"]+)"/g)].map((m) =>
      m[1]!.replaceAll('&amp;', '&'),
    )
    const resetLink = hrefs.find((link) => {
      try {
        const url = new URL(link)
        return url.origin === 'http://localhost:5173' && url.pathname === '/reset-password'
      } catch {
        return false
      }
    })
    // Boolean assertions and wrapped navigation keep link/token out of failure output.
    expect(Boolean(resetLink)).toBe(true)
    try {
      await page.goto(resetLink!)
    } catch {
      throw new Error('Reset-link navigation failed; sensitive URL suppressed.')
    }
    await expect(page).toHaveURL('http://localhost:5173/reset-password')
    const nextPassword = `Stage15!${randomBytes(20).toString('hex')}`
    await page.getByLabel('Новий пароль', { exact: true }).fill(nextPassword)
    await page.getByLabel('Підтвердження нового пароля', { exact: true }).fill(nextPassword)
    const reset = page.waitForResponse((r) => r.url().endsWith('/api/auth/reset-password'))
    await page.getByRole('button', { name: 'Зберегти новий пароль', exact: true }).click()
    expect((await reset).status()).toBe(200)
    await expect(page.getByRole('status')).toHaveText('Пароль скинуто. Увійдіть із новим паролем.')
    await page.goto('/login')
    await page.getByLabel('Електронна пошта', { exact: true }).fill(credentials.email)
    await page.getByLabel('Пароль', { exact: true }).fill(credentials.password)
    const oldLogin = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'))
    await page.getByRole('button', { name: 'Увійти', exact: true }).click()
    expect((await oldLogin).status()).toBe(422)
    credentials.password = nextPassword
    writeFileSync(privateAuthPath(accountPath!), JSON.stringify(credentials), { mode: 0o600 })
    await page.getByLabel('Пароль', { exact: true }).fill(nextPassword)
    const newLogin = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'))
    await page.getByRole('button', { name: 'Увійти', exact: true }).click()
    expect((await newLogin).status()).toBe(200)
    const owner = await liveApi<Resource<User>>(page, '/api/profile')
    expect(owner.status).toBe(200)
    expect(owner.data.data.id).toBe(credentials.id)
    await page.context().storageState({ path: privateAuthPath(authorization.grant.storage_state) })
    evidence('password_recovery', {
      accepted_status: 202,
      received_new_mail: true,
      reset_status: 200,
      old_password_status: 422,
      new_password_status: 200,
      profile_owner_matches: true,
    })
  })
})
