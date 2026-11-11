import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from './helpers/renderApp'
import { parseManagement, managementState, parseSemesterImport } from '@/api/semesterPayloads'
import { semesterScheduleImportsApi } from '@/api/semesterScheduleImports'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import { today } from '@/utils/dates'
import { calendarDate, displayDates } from '@/utils/semesterSchedule'
import {
  importFixture,
  importPath,
  monday,
  revision,
  semesterBackend,
  semesterPath,
  weekly,
} from './helpers/semesterBackend'

const ruleRoute = '/schedule/semesters/1/rules/11'
const rulePath = `${semesterPath}/1/weekly-rules/11`
const importRoute = '/schedule/semester-imports/41'
const commitPath = `${importPath}/41/commit`
const mounted: VueWrapper[] = []
async function open(path: string, backend = semesterBackend()) {
  const result = await renderApp<ReturnType<typeof semesterBackend>>(path, backend)
  mounted.push(result.wrapper)
  return { ...result, backend }
}
async function click(wrapper: VueWrapper, label: string) {
  const target = wrapper.findAll('button').find((item) => item.text() === label)
  expect(target, label).toBeDefined()
  await target!.trigger('click')
  await flushPromises()
}
async function commit(wrapper: VueWrapper) {
  await click(wrapper, 'Переглянути підтвердження імпорту')
  await wrapper.get('dialog input[type="checkbox"]').setValue(true)
  await click(wrapper, 'Підтвердити імпорт')
}
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

describe('Stage 5 Laravel response contracts', () => {
  it('keeps strict four-digit dates and ends the display range at the server boundary', () => {
    expect(calendarDate('0001-01-01')).toBe(true)
    expect(calendarDate('0000-01-01')).toBe(false)
    expect(calendarDate('2026-02-30')).toBe(false)
    expect(displayDates('9999-12-31', '9999-12-31')).toEqual(['9999-12-31'])
  })

  it('narrows the management resource and verifies its schedule identity and token', () => {
    const { response } = semesterBackend({ savedDays: true })
    expect(parseManagement(response, managementState, 1)).toEqual(response)
    expect(() =>
      parseManagement(
        { ...response, meta: { ...response.meta, schedule_token: 'wrong' } },
        managementState,
        1,
      ),
    ).toThrow()
    expect(() => parseManagement(response, managementState, 2)).toThrow()
    expect(() =>
      parseManagement(
        { ...response, data: { ...response.data, weekly_rules: [{ ...weekly, teacher: {} }] } },
        managementState,
        1,
      ),
    ).toThrow()
  })

  it('accepts both empty validation bag shapes and Stage 3 historical impact', () => {
    const preview = importFixture()
    preview.preview.errors = {}
    preview.preview.rows[0]!.errors = []
    delete preview.preview.impact!.suppressed_slots
    expect(parseSemesterImport(preview, 41)).toEqual(preview)
    expect(parseSemesterImport(preview, 40)).toBeNull()
    expect(parseSemesterImport({ ...preview, preview_token: 'old-token' })).toBeNull()
    expect(
      parseSemesterImport({ ...preview, preview: { ...preview.preview, operations: [{}] } }),
    ).toBeNull()
    expect(
      parseSemesterImport({
        ...preview,
        status: 'failed',
        can_commit: false,
        preview: {
          rows: [],
          operations: [],
          counts: [],
          errors: { file: ['Workbook not supported.'] },
        },
      }),
    ).toMatchObject({ status: 'failed' })
    expect(parseSemesterImport({ ...preview, status: 'committed', can_commit: false })).toBeNull()
  })

  it('sends exact confirmation fields and can read the same durable receipt from a same-token replay', async () => {
    const { backend } = await open(importRoute, semesterBackend({ readyImport: true }))
    const token = backend.batch.preview_token
    const applied = await semesterScheduleImportsApi.commit(41, token, true)
    const replayed = await semesterScheduleImportsApi.commit(41, token, true)
    expect(replayed.receipt).toEqual(applied.receipt)
    expect(replayed.committed_at).toBe(applied.committed_at)
    expect(
      backend.requests.filter((item) => item.path === commitPath).map((item) => item.body),
    ).toEqual([
      { confirmed: true, preview_token: token },
      { confirmed: true, preview_token: token },
    ])
  })

  it('preserves explicit room clears and uses strict JSON booleans for DELETE', async () => {
    const { backend } = await open(ruleRoute)
    const result = await semesterSchedulesApi.updateRule(1, 11, backend.token, {
      room: null,
    })
    await semesterSchedulesApi.removeRule(1, 11, result.meta.schedule_token, true)
    expect(backend.requests.find((item) => item.method === 'PATCH')?.body).toEqual({
      room: null,
      schedule_token: revision(1),
    })
    expect(backend.requests.find((item) => item.method === 'DELETE')?.body).toEqual({
      confirmed: true,
      schedule_token: revision(2),
    })
  })
})

describe('Semester schedule integration', () => {
  it('loads an empty owned list and keeps an explicit legacy entry point', async () => {
    const { wrapper, backend } = await open(
      '/schedule/semester-calendar',
      semesterBackend({ empty: true }),
    )
    expect(wrapper.text()).toContain('Семестрових розкладів ще немає')
    expect(wrapper.find('a[href^="/schedule/legacy"]').exists()).toBe(true)
    expect(
      backend.requests
        .filter((item) => item.path.startsWith(semesterPath))
        .map((item) => item.path),
    ).toEqual([semesterPath])
    expect(
      backend.requests.some((item) => /^\/api\/(schedule\/|planning|ai\/)/.test(item.path)),
    ).toBe(false)
  })

  it('keeps explicit semester selection in the dedicated management calendar', async () => {
    const backend = semesterBackend()
    backend.overlaps = true
    const { wrapper } = await open(`/schedule/semester-calendar?date=${monday}`, backend)
    expect(wrapper.text()).toContain('Оберіть семестр, щоб побачити заняття')
    await wrapper.get('select').setValue(1)
    await flushPromises()
    expect(wrapper.text()).toContain('Семестрова математика')
    expect(wrapper.find('a[href^="/schedule/lessons/"]').exists()).toBe(false)
    expect(backend.requests.some((item) => item.path.startsWith('/api/schedule/'))).toBe(false)
  })

  it('keeps the weekly draft across a stale write and requires explicit reconciliation', async () => {
    const { wrapper, backend } = await open(ruleRoute)
    await wrapper.get('input[maxlength="100"]').setValue('Новий кабінет')
    backend.data.weekly_rules[0]!.room = 'Поточний кабінет'
    backend.data.weekly_rules[0]!.pair_label = 'Виправлена позначка'
    backend.change()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Сервер виявив конфлікт')
    expect(backend.requests.filter((item) => item.method === 'PATCH')).toHaveLength(1)
    await click(wrapper, 'Завантажити актуальний стан')
    expect(wrapper.text()).toContain('Поточний кабінет')
    expect((wrapper.get('input[maxlength="100"]').element as HTMLInputElement).value).toBe(
      'Новий кабінет',
    )
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
    await click(wrapper, 'Я звірив поточний стан')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const writes = backend.requests.filter((item) => item.method === 'PATCH')
    expect(writes.map((item) => item.body)).toEqual([
      { room: 'Новий кабінет', schedule_token: revision(1) },
      { room: 'Новий кабінет', schedule_token: revision(2) },
    ])
    expect(backend.data.weekly_rules[0]?.pair_label).toBe('Виправлена позначка')
  })

  it('holds mutations after an uncertain failure and displays the new state after a GET', async () => {
    const { wrapper, backend } = await open(ruleRoute)
    await wrapper.get('input[maxlength="100"]').setValue('401')
    backend.fail(rulePath, 'PATCH', { status: 503, body: { message: 'SQL trace never shown' } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Результат запиту невідомий')
    expect(wrapper.text()).not.toContain('SQL trace')
    expect(backend.requests.filter((item) => item.method === 'PATCH')).toHaveLength(1)
    await click(wrapper, 'Завантажити актуальний стан')
    expect(wrapper.text()).toContain('Ваша чернетка збережена')
    expect(backend.requests.filter((item) => item.method === 'PATCH')).toHaveLength(1)
  })

  it('reports a network failure without sending a second PATCH', async () => {
    const { wrapper, fetch } = await open(ruleRoute)
    await wrapper.get('input[maxlength="100"]').setValue('401')
    fetch.mockRejectedValueOnce(new TypeError('disconnected'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Результат запиту невідомий')
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1)
  })

  it('cancels one selected base rule and leaves its untouched neighbour in place', async () => {
    const { wrapper, backend } = await open(`/schedule/semesters/1/dates/${monday}`)
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((item) => item.method === 'PUT')?.body).toEqual({
      mode: 'copy_base',
      changes: [{ weekly_lesson_rule_id: 11, cancelled: true }],
      lessons: [],
      schedule_token: revision(1),
    })
    expect(backend.data.date_exceptions[0]?.lessons.map((item) => item.pair_number)).toEqual([2])
  })

  it('shows suppressed import rows and global errors without allowing confirmation or releasing slots', async () => {
    const backend = semesterBackend()
    const row = backend.batch.preview.rows[0]!
    row.operation = 'suppressed'
    row.suppressed_slot_ids = [70]
    row.errors = {
      suppressed_slot: ['Release its suppression explicitly before importing it again.'],
    }
    backend.batch.preview.errors = { schedule: ['The projected schedule has conflicting rules.'] }
    backend.batch.preview.impact!.suppressed_slots = [
      {
        id: 70,
        weekday: row.weekday,
        pair_number: row.pair_number,
        week_pattern: row.week_pattern,
      },
    ]
    const { wrapper } = await open(importRoute, backend)
    expect(wrapper.text()).toContain(
      'Release its suppression explicitly before importing it again.',
    )
    expect(wrapper.text()).toContain('The projected schedule has conflicting rules.')
    expect(wrapper.text()).toContain('Захищений видалений слот')
    expect(wrapper.text()).not.toContain('Переглянути підтвердження імпорту')
    expect(backend.requests.every((item) => item.method === 'GET')).toBe(true)
  })

  it('restores Sanctum after 419 without replaying a mutation and redirects after 401', async () => {
    const { wrapper, backend, router } = await open(ruleRoute)
    await wrapper.get('input[maxlength="100"]').setValue('401')
    backend.fail(rulePath, 'PATCH', { status: 419, body: { message: 'CSRF token mismatch.' } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await click(wrapper, 'Відновити сеанс')
    expect(backend.requests.some((item) => item.path === '/sanctum/csrf-cookie')).toBe(true)
    expect(backend.requests.filter((item) => item.method === 'PATCH')).toHaveLength(1)
    backend.signedIn = false
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.query.redirect).toBe(ruleRoute)
  })

  it('shows 404 for an unavailable schedule', async () => {
    const { wrapper } = await open('/schedule?semester=400')
    expect(wrapper.text()).toContain('Запис недоступний або вже видалений')
  })

  it('rejects malformed 409 data and recovers the saved preview with a GET', async () => {
    const { wrapper, backend } = await open(importRoute, semesterBackend({ readyImport: true }))
    backend.malformedConflict = true
    await commit(wrapper)
    expect(wrapper.text()).toContain('Отримано конфлікт стану пакета')
    expect(wrapper.text()).not.toContain('ПІ-231 оновлений огляд')
    await click(wrapper, 'Перевірити стан пакета')
    expect(wrapper.text()).toContain('ПІ-231 оновлений огляд')
    expect(backend.requests.filter((item) => item.path === commitPath)).toHaveLength(1)
    await click(wrapper, 'Переглянути підтвердження імпорту')
    expect((wrapper.get('dialog input[type="checkbox"]').element as HTMLInputElement).checked).toBe(
      false,
    )
  })

  it('keeps a failed recovery blocked and shows a receipt from a later GET without replaying', async () => {
    const { wrapper, backend } = await open(importRoute, semesterBackend({ readyImport: true }))
    backend.loseCommit = true
    await commit(wrapper)
    expect(wrapper.text()).toContain('Результат запиту невідомий')
    backend.failRecovery = true
    await click(wrapper, 'Перевірити стан пакета')
    expect(wrapper.text()).toContain('Результат запиту невідомий')
    expect(wrapper.find('button[disabled]').exists()).toBe(true)
    backend.failRecovery = false
    await click(wrapper, 'Перевірити стан пакета')
    expect(wrapper.text()).toContain('Збережена квитанція імпорту')
    expect(backend.requests.filter((item) => item.path === commitPath)).toHaveLength(1)
  })
})
