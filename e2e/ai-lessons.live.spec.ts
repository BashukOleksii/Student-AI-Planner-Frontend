import { expect, test, type Page } from '@playwright/test'
import { appendFileSync, writeFileSync } from 'node:fs'
import { Temporal } from '@js-temporal/polyfill'
import {
  authorizeAiLessonLive,
  inspectLessonRows,
  validateAiLessonLiveGrant,
} from './support/aiLessonLiveSafety'
import { serveLiveFrontend, liveApi } from './support/liveBrowser'
import { lessonPreview, lessonReceipt } from '../src/utils/aiLesson'
import type { AiAction, LessonActionType, LessonReceipt } from '../src/types/ai'
import type { Resource, User, Subject, Schedule } from '../src/types/api'
import type { LessonDetail } from '../src/types/lessons'

// Opt-in only. The non-network Laravel test provider is an external prerequisite,
// not a frontend HTTP mock. Normal offline CI never collects this file.
const authorization = authorizeAiLessonLive()
test('authorized Vue → Laravel → LessonService → MySQL Lesson lifecycle', async ({
  page,
  browser,
}, testInfo) => {
  const { grant, identity, backendRoot } = authorization
  const ledger = `.auth/stage11-lessons-${Date.now()}.jsonl`
  writeFileSync(
    ledger,
    JSON.stringify({
      at: new Date().toISOString(),
      database: identity.database,
      environment: identity.environment,
      owner_id: grant.user_id,
    }) + '\n',
    { mode: 0o600, flag: 'wx' },
  )
  testInfo.annotations.push({ type: 'private-fixture-ledger', description: ledger })
  const record = (action: AiAction) =>
    appendFileSync(
      ledger,
      JSON.stringify({
        at: new Date().toISOString(),
        action_id: action.id,
        conversation_id: action.conversation_id,
        status: action.status,
        lesson_id:
          action.receipt?.lesson &&
          typeof action.receipt.lesson === 'object' &&
          !Array.isArray(action.receipt.lesson)
            ? action.receipt.lesson.id
            : null,
      }) + '\n',
    )
  const rows = () => inspectLessonRows(backendRoot, grant)
  const reauthorize = () => validateAiLessonLiveGrant(grant, identity)
  await serveLiveFrontend(page)
  await page.goto('/ai')
  const profile = await liveApi<Resource<User>>(page, '/api/profile')
  expect(profile.status).toBe(200)
  expect(profile.data.data.id).toBe(grant.user_id)
  const subjects = await liveApi<Resource<Subject[]>>(page, '/api/subjects')
  expect(subjects.status).toBe(200)
  expect(subjects.data.data.some((s) => s.id === grant.subject_id)).toBe(true)
  const initial = rows()
  expect(initial.lessons).toEqual([]) // Never reuse populated/retained accounts.
  reauthorize()
  const conversationResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/ai/conversations') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Нова розмова', exact: true }).click()
  const conversationResult = await conversationResponse
  expect(conversationResult.status()).toBe(201)
  const conversationId: number = (await conversationResult.json()).data.id
  const conversationPath = `/ai/conversations/${conversationId}`
  const actionPath = (action: AiAction) =>
    `/api/ai/conversations/${conversationId}/actions/${action.id}`
  const review = page.locator('.ai-action-review')
  async function propose(type: LessonActionType, args: Record<string, unknown>) {
    reauthorize()
    const before = rows()
    await page.goto(conversationPath)
    // ScriptedLlmProvider v1 must return this allowlisted proposal through the
    // real AgentOrchestrator. It may never persist pending actions itself.
    await page
      .getByLabel('Повідомлення помічнику', { exact: true })
      .fill(`STAGE11_ACCEPTANCE_V1 ${JSON.stringify({ tool: type, arguments: args })}`)
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/conversations/${conversationId}/messages`) &&
        r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click()
    const result = await response
    expect(result.status()).toBe(200)
    expect(result.request().headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i)
    const id: string = (await result.json()).data.action.id
    const detail = await liveApi<Resource<AiAction>>(
      page,
      `/api/ai/conversations/${conversationId}/actions/${id}`,
    )
    expect(detail.status).toBe(200)
    const action = detail.data.data
    record(action)
    expect(action.type).toBe(type)
    expect(action.status).toBe('pending')
    expect(lessonPreview(action.preview, type)).not.toBeNull()
    await expect(review).toHaveAttribute('data-action-id', id)
    await expect(
      review.getByRole('button', { name: 'Підтвердити зміни', exact: true }),
    ).toBeEnabled()
    await expect(review).toContainText(profile.data.data.timezone)
    expect(rows()).toEqual(before) // Proposal + GET + browser rendering do not write Lessons.
    return action
  }
  async function decide(action: AiAction, operation: 'confirm' | 'reject', status = 200) {
    reauthorize()
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `${actionPath(action)}/${operation}` &&
        r.request().method() === 'POST',
    )
    const button = review.getByRole('button', {
      name: operation === 'confirm' ? 'Підтвердити зміни' : 'Відхилити пропозицію',
      exact: true,
    })
    await button.focus()
    await page.keyboard.press('Enter')
    const result = await response
    expect(result.request().postDataJSON()).toEqual({})
    expect(result.status()).toBe(status)
    const body = await result.json()
    if (body.data) record(body.data)
    return body as { data: AiAction; replayed: boolean; code?: string }
  }
  async function persisted(action: AiAction, receipt: LessonReceipt) {
    const detail = await liveApi<Resource<LessonDetail>>(page, `/api/lessons/${receipt.lesson.id}`)
    expect(detail.status).toBe(200)
    for (const key of [
      'id',
      'subject_id',
      'teacher_id',
      'academic_period_id',
      'type',
      'room',
      'starts_at',
      'ends_at',
      'status',
      'replaces_lesson_id',
      'replacement_id',
    ] as const)
      expect(detail.data.data[key]).toEqual(receipt.lesson[key])
    const raw = rows().lessons.find((l) => l.id === receipt.lesson.id)!
    expect(raw).toBeDefined()
    expect(raw.deleted_at).toBeNull()
    expect(raw.status).toBe(receipt.lesson.status)
    expect(raw.room).toBe(receipt.lesson.room)
    expect(raw.starts_at.replace(' ', 'T') + 'Z').toBe(receipt.lesson.starts_at)
    expect(raw.ends_at.replace(' ', 'T') + 'Z').toBe(receipt.lesson.ends_at)
    await expect(
      review.getByRole('heading', { name: 'Квитанція виконання', exact: true }),
    ).toBeVisible()
    const link = review.getByRole('link', {
      name: `Відкрити заняття №${receipt.lesson.id}`,
      exact: true,
    })
    await expect(link).toHaveAttribute('href', `/schedule/lessons/${receipt.lesson.id}`)
    await link.click()
    await expect(
      page.getByRole('heading', { name: `Заняття №${receipt.lesson.id}`, exact: true }),
    ).toBeVisible()
    await page.goto(conversationPath)
    const row = page.locator(`.ai-action-list li[data-action-id="${action.id}"]`)
    await row.getByRole('button', { name: 'Переглянути пропозицію', exact: true }).click()
    await expect(review).toHaveAttribute('data-action-id', action.id)
    expect(rows().study_sessions).toEqual(initial.study_sessions)
  }
  async function execute(action: AiAction) {
    const result = await decide(action, 'confirm')
    expect(result.data.status).toBe('executed')
    expect(result.replayed).toBe(false)
    const receipt = lessonReceipt(result.data.receipt, action.type, action.id)
    expect(receipt).not.toBeNull()
    await persisted(action, receipt!)
    return receipt!
  }
  const date = Temporal.Now.plainDateISO('UTC').add({ days: 14 })
  const input = {
    subject_id: grant.subject_id,
    teacher_id: null,
    academic_period_id: null,
    type: 'lecture',
    room: 'Stage11 demo',
    starts_at: `${date}T07:00:00Z`,
    ends_at: `${date}T08:00:00Z`,
  }
  const create = await propose('propose_lesson_create', input)
  const created = await execute(create)
  const snapshot = rows()
  reauthorize()
  const replay = await liveApi<{ data: AiAction; replayed: boolean }>(
    page,
    `${actionPath(create)}/confirm`,
    'POST',
    {},
  )
  expect(replay.status).toBe(200)
  expect(replay.data.replayed).toBe(true)
  expect(replay.data.data.receipt).toEqual(created)
  expect(rows()).toEqual(snapshot) // Actual MySQL row identity/count/state unchanged.
  const update = await propose('propose_lesson_update', {
    lesson_id: created.lesson.id,
    room: 'Stage11 updated',
    starts_at: `${date.add({ days: 1 })}T07:00:00Z`,
    ends_at: `${date.add({ days: 1 })}T08:00:00Z`,
  })
  expect(update.preview.before).toEqual(created.lesson)
  const updated = await execute(update)
  const localInstant = (day: Temporal.PlainDate, clock: string) =>
    day
      .toPlainDateTime(clock)
      .toZonedDateTime(profile.data.data.timezone, { disambiguation: 'reject' })
      .toInstant()
      .toString({ smallestUnit: 'second' })
  const replacement = await propose('propose_lesson_replacement', {
    ...input,
    lesson_id: created.lesson.id,
    starts_at: localInstant(date.add({ days: 2 }), '22:30'),
    ends_at: localInstant(date.add({ days: 3 }), '00:30'),
  })
  expect(replacement.preview.before).toEqual(updated.lesson)
  const replaced = await execute(replacement)
  expect(replaced.original?.id).toBe(created.lesson.id)
  expect(replaced.original?.replacement_id).toBe(replaced.lesson.id)
  expect(rows().lessons.find((l) => l.id === created.lesson.id)?.status).toBe('replaced')
  const original = await liveApi<Resource<LessonDetail>>(page, `/api/lessons/${created.lesson.id}`)
  expect(original.status).toBe(200)
  expect(original.data.data.replacement_id).toBe(replaced.lesson.id)
  await expect(
    review.getByRole('link', { name: `Початкове заняття №${created.lesson.id}`, exact: true }),
  ).toHaveAttribute('href', `/schedule/lessons/${created.lesson.id}`)
  for (const instant of [
    created.lesson.starts_at,
    updated.lesson.starts_at,
    replaced.lesson.starts_at,
    replaced.lesson.ends_at,
  ]) {
    const localDate = Temporal.Instant.from(instant)
      .toZonedDateTimeISO(profile.data.data.timezone)
      .toPlainDate()
      .toString()
    const schedule = await liveApi<Schedule>(page, `/api/schedule/date/${localDate}`)
    expect(schedule.status).toBe(200)
    expect(schedule.data.data.some((l) => l.id === created.lesson.id)).toBe(false)
    if (instant === replaced.lesson.starts_at || instant === replaced.lesson.ends_at)
      expect(schedule.data.data.some((l) => l.id === replaced.lesson.id)).toBe(true)
    await page.goto(`/schedule/legacy?date=${localDate}`)
    await expect(page.locator('.schedule-days .lesson')).toHaveCount(schedule.data.data.length)
  }
  await page.goto(conversationPath)
  const cancel = await propose('propose_lesson_cancel', { lesson_id: replaced.lesson.id })
  const cancelled = await execute(cancel)
  expect(cancelled.lesson.status).toBe('cancelled')
  expect(cancelled.lesson.replaces_lesson_id).toBe(created.lesson.id)
  expect(rows().lessons.find((l) => l.id === created.lesson.id)?.status).toBe('replaced')
  const cancelledDate = Temporal.Instant.from(cancelled.lesson.starts_at)
    .toZonedDateTimeISO(profile.data.data.timezone)
    .toPlainDate()
    .toString()
  const cancelledSchedule = await liveApi<Schedule>(page, `/api/schedule/date/${cancelledDate}`)
  expect(cancelledSchedule.status).toBe(200)
  expect(cancelledSchedule.data.data.some((l) => l.id === replaced.lesson.id)).toBe(false)
  const rejected = await propose('propose_lesson_create', {
    ...input,
    starts_at: `${date.add({ days: 4 })}T07:00:00Z`,
    ends_at: `${date.add({ days: 4 })}T08:00:00Z`,
  })
  const beforeReject = rows()
  expect((await decide(rejected, 'reject')).data.status).toBe('rejected')
  await expect(review).toContainText('Пропозицію відхилено')
  expect(rows()).toEqual(beforeReject)
  const stale = await propose('propose_lesson_update', {
    lesson_id: created.lesson.id,
    room: 'Stale candidate',
  })
  reauthorize()
  // One deliberate normal REST edit makes the reviewed snapshot stale. No SQL
  // tampering, backdated expiry or manually inserted pending-action rows.
  expect(
    (
      await liveApi(page, `/api/lessons/${created.lesson.id}`, 'PATCH', {
        room: 'External owned edit',
      })
    ).status,
  ).toBe(200)
  const beforeStale = rows()
  expect((await decide(stale, 'confirm', 409)).code).toBe('action_stale')
  await expect(review).toContainText('action_stale')
  await expect(
    review.getByRole('button', { name: 'Підтвердити зміни', exact: true }),
  ).toBeDisabled()
  expect(rows()).toEqual(beforeStale)
  const staleDetail = await liveApi<Resource<AiAction>>(page, actionPath(stale))
  expect(staleDetail.data.data.status).toBe('pending')
  if (authorization.secondStorageState) {
    const context = await browser.newContext({ storageState: authorization.secondStorageState })
    try {
      const other = await context.newPage()
      await serveLiveFrontend(other)
      await other.goto('/')
      expect((await liveApi<Resource<User>>(other, '/api/profile')).data.data.id).toBe(
        grant.second_user_id,
      )
      expect((await liveApi(other, actionPath(stale))).status).toBe(404)
      reauthorize()
      expect((await liveApi(other, `${actionPath(stale)}/confirm`, 'POST', {})).status).toBe(404)
      expect((await liveApi(other, `/api/lessons/${created.lesson.id}`)).status).toBe(404)
      expect(rows()).toEqual(beforeStale)
    } finally {
      await context.close()
    }
  } else
    testInfo.annotations.push({
      type: 'NOT RUN',
      description:
        'Second disposable user/storage state not granted; ownership isolation remains deterministic evidence only.',
    })
  await decide(stale, 'reject')
  expect(rows().study_sessions).toEqual(initial.study_sessions)
})
