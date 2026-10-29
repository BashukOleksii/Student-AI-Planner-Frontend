import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import {
  scheduleBackend,
  lessonDetailFixture,
  importBatchFixture,
  importRowFixture,
} from './helpers/scheduleBackend'
import { lessonsApi } from '@/api/lessons'
import { scheduleImportsApi, ImportPreviewChanged, parseImportBatch } from '@/api/scheduleImports'
import { request, ApiError, setAuthErrorHandler } from '@/api/client'
import LessonForm from '@/components/schedule/LessonForm.vue'
import ImportRowCard from '@/components/schedule/ImportRowCard.vue'
import { validateScheduleFile, importReturnId } from '@/utils/scheduleImport'
import { json } from './fixtures'
import type { LessonInput } from '@/types/lessons'
const input: LessonInput = {
  subject_id: 7,
  teacher_id: null,
  academic_period_id: null,
  type: 'lecture',
  room: null,
  starts_at: '2026-11-02T07:00:00Z',
  ends_at: '2026-11-02T08:20:00Z',
}
const xlsx = () =>
  new File(['PKmock workbook bytes'], 'розклад.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
async function click(wrapper: VueWrapper, label: string) {
  const root = wrapper.find('dialog').exists() ? wrapper.get('dialog') : wrapper
  await root
    .findAll('button')
    .find((b) => b.text() === label)!
    .trigger('click')
  await flushPromises()
}
async function readyImport() {
  const backend = scheduleBackend()
  backend.batches[0]!.status = 'validated'
  backend.batches[0]!.invalid_rows = 0
  backend.batches[0]!.valid_rows = 1
  Object.assign(backend.batches[0]!.rows[0]!, {
    subject_id: 7,
    teacher_id: 8,
    status: 'valid',
    operation: 'create',
    validation_errors: [],
  })
  const app = await renderApp('/schedule/imports/40', backend)
  return { ...app, backend }
}
async function decide(wrapper: VueWrapper) {
  await click(wrapper, 'Переглянути підтвердження імпорту')
  await wrapper.get('dialog input[type="checkbox"]').setValue(true)
  await click(wrapper, 'Підтвердити імпорт')
}
describe('Lesson API and shared transport', () => {
  it.each([
    ['create', 'POST', '/api/lessons'],
    ['get', 'GET', '/api/lessons/9'],
    ['update', 'PATCH', '/api/lessons/9'],
    ['cancel', 'POST', '/api/lessons/9/cancel'],
    ['replacement', 'POST', '/api/lessons/9/replacement'],
    ['remove', 'DELETE', '/api/lessons/9'],
  ] as const)('%s uses the actual nested contract', async (action, method, path) => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      action === 'remove'
        ? new Response(null, { status: 204 })
        : json({ data: lessonDetailFixture() }),
    )
    vi.stubGlobal('fetch', fetch)
    const response =
      action === 'create'
        ? await lessonsApi.create(input)
        : action === 'update'
          ? await lessonsApi.update(9, { room: null })
          : action === 'replacement'
            ? await lessonsApi.replacement(9, input)
            : await lessonsApi[action](9)
    expect(response).toEqual(action === 'remove' ? undefined : { data: lessonDetailFixture() })
    const init = fetch.mock.calls[0]!
    expect(init[0]).toContain(path)
    expect(init[1]?.method).toBe(method)
    if (action === 'update') expect(JSON.parse(String(init[1]?.body))).toEqual({ room: null })
  })
  it('uploads actual FormData with credentials and decoded CSRF without Content-Type', async () => {
    document.cookie = 'XSRF-TOKEN=form%2Bcsrf%3D'
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ data: importBatchFixture() }, 201),
    )
    vi.stubGlobal('fetch', fetch)
    const file = xlsx(),
      response = await scheduleImportsApi.upload(4, file),
      [url, init] = fetch.mock.calls[0]!
    expect(url).toContain('/api/schedule-imports')
    expect(init?.credentials).toBe('include')
    expect(new Headers(init?.headers).get('X-XSRF-TOKEN')).toBe('form+csrf=')
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json')
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('academic_period_id')).toBe('4')
    expect(form.get('schedule_file')).toBe(file)
    expect([...form.keys()]).toEqual(['academic_period_id', 'schedule_file'])
    expect(response.data.rows).toHaveLength(2)
  })
  it.each([401, 419, 422, 500])(
    'keeps multipart %s failures safe without retry',
    async (status) => {
      setAuthErrorHandler(undefined)
      const fetch = vi.fn(async () =>
        json(
          { errors: { schedule_file: ['Файл відхилено.'] }, message: 'private SQL path' },
          status,
        ),
      )
      vi.stubGlobal('fetch', fetch)
      await expect(scheduleImportsApi.upload(4, xlsx())).rejects.toMatchObject({ status })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
  it('keeps existing JSON behavior and does not expose arbitrary error bodies', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ message: 'SQL /srv/private', data: { secret: 'no' } }, 503),
    )
    vi.stubGlobal('fetch', fetch)
    await expect(
      request('/api/tasks', { method: 'POST', body: { title: 'test' } }),
    ).rejects.toMatchObject({ status: 503, conflictData: undefined })
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Content-Type')).toBe(
      'application/json',
    )
  })
  it('narrows the full 409 resource into a typed refreshed preview', async () => {
    const batch = importBatchFixture()
    batch.status = 'validated'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ data: batch, message: 'The import preview changed.' }, 409)),
    )
    await expect(scheduleImportsApi.commit(40)).rejects.toBeInstanceOf(ImportPreviewChanged)
    await expect(scheduleImportsApi.commit(40)).rejects.toMatchObject({ batch })
  })
  it('rejects foreign IDs or malformed 409 payloads instead of exposing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ data: { ...importBatchFixture(900), original_filename: 'foreign.xlsx' } }, 409),
      ),
    )
    await expect(scheduleImportsApi.commit(40)).rejects.toMatchObject({ status: 502 })
    expect(() => parseImportBatch({ ...importBatchFixture(), rows: { data: [] } })).toThrow(
      ApiError,
    )
  })
  it.each(['get', 'revalidate', 'commit'] as const)(
    'preserves %s envelopes without business arguments',
    async (action) => {
      const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
        json({ data: importBatchFixture() }),
      )
      vi.stubGlobal('fetch', fetch)
      await scheduleImportsApi[action](40)
      expect(fetch.mock.calls[0]?.[0]).toMatch(
        new RegExp(`/api/schedule-imports/40${action === 'get' ? '' : `/${action}`}$`),
      )
      expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
    },
  )
})
describe('Lesson form and calendar behavior', () => {
  function form(lesson = lessonDetailFixture(), timezone = 'Europe/Kyiv') {
    return mount(LessonForm, {
      props: {
        lesson,
        timezone,
        subjects: [],
        teachers: [],
        periods: [],
        errors: {},
        busy: false,
        submitLabel: 'Зберегти',
      },
    })
  }
  it('preserves unrelated UTC values, including an ambiguous repeated local hour', async () => {
    const lesson = {
      ...lessonDetailFixture(),
      starts_at: '2026-10-25T00:30:12Z',
      ends_at: '2026-10-25T01:30:12Z',
    }
    const wrapper = form(lesson)
    await wrapper.get('#lesson-room').setValue('402')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      ...input,
      teacher_id: 8,
      academic_period_id: 4,
      room: '402',
      starts_at: lesson.starts_at,
      ends_at: lesson.ends_at,
    })
  })
  it.each([
    ['Europe/Kyiv', '2026-11-02T09:00:15', '2026-11-02T07:00:15Z'],
    ['America/New_York', '2026-11-02T09:00:15', '2026-11-02T14:00:15Z'],
  ])('converts %s local input to canonical UTC', async (zone, local, utc) => {
    const wrapper = form(lessonDetailFixture(), zone)
    await wrapper.get('#lesson-start').setValue(local)
    await wrapper.get('#lesson-end').setValue(local.replace('09:00:15', '10:00:15'))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ starts_at: utc })
  })
  it.each(['2026-03-29T03:30:00', '2026-10-25T03:30:00'])(
    'rejects changed DST gap/fold input %s',
    async (value) => {
      const wrapper = form()
      await wrapper.get('#lesson-start').setValue(value)
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('submit')).toBeUndefined()
      expect(wrapper.text()).toContain('не існує або повторюється')
    },
  )
  it('supports exactly seven Lesson types and explicit nullable associations', async () => {
    const wrapper = form()
    expect(wrapper.findAll('#lesson-type option')).toHaveLength(7)
    await wrapper.get('#lesson-teacher').setValue('')
    await wrapper.get('#lesson-period').setValue('')
    await wrapper.get('#lesson-room').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      teacher_id: null,
      academic_period_id: null,
      room: null,
    })
  })
})
describe('Manual Lesson workspace', () => {
  it('creates from owned catalogs then loads actual detail and Schedule', async () => {
    const backend = scheduleBackend(),
      { wrapper, router } = await renderApp('/schedule/lessons/new', backend)
    await wrapper.get('#lesson-subject').setValue('7')
    await wrapper.get('#lesson-start').setValue('2026-11-02T15:00:10')
    await wrapper.get('#lesson-end').setValue('2026-11-02T16:00:10')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/schedule/lessons/20'))
    expect(
      backend.requests.find((r) => r.path === '/api/lessons' && r.method === 'POST')?.body,
    ).toEqual({ ...input, starts_at: '2026-11-02T13:00:10Z', ends_at: '2026-11-02T14:00:10Z' })
    expect(wrapper.text()).toContain('Активне')
    expect(backend.requests.some((r) => r.path.startsWith('/api/schedule/date/'))).toBe(true)
  })
  it('PATCH sends only changed fields and clears nullable values', async () => {
    const backend = scheduleBackend(),
      { wrapper } = await renderApp('/schedule/lessons/9/edit', backend)
    await wrapper.get('#lesson-room').setValue('')
    await wrapper.get('#lesson-teacher').setValue('')
    await wrapper.get('#lesson-period').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      room: null,
      teacher_id: null,
      academic_period_id: null,
    })
  })
  it('shows schedule/lifecycle validation without mutating visible state', async () => {
    const backend = scheduleBackend()
    backend.failure = {
      method: 'POST',
      path: /cancel$/,
      status: 422,
      fields: { status: ['Only an active lesson can be cancelled.'] },
    }
    const { wrapper } = await renderApp('/schedule/lessons/9', backend)
    await click(wrapper, 'Скасувати заняття')
    await click(wrapper, 'Підтвердити скасування')
    expect(wrapper.text()).toContain('Only an active lesson')
    expect(backend.lessons[0]?.status).toBe('active')
    expect(backend.requests.filter((r) => r.path.endsWith('/cancel'))).toHaveLength(1)
  })
  it('requires cancellation confirmation and excludes cancelled effective Lessons', async () => {
    const backend = scheduleBackend(),
      { wrapper, router } = await renderApp('/schedule/lessons/9', backend)
    await click(wrapper, 'Скасувати заняття')
    await click(wrapper, 'Залишити без змін')
    expect(backend.requests.some((r) => r.path.endsWith('/cancel'))).toBe(false)
    await click(wrapper, 'Скасувати заняття')
    await click(wrapper, 'Підтвердити скасування')
    expect(wrapper.text()).toContain('Скасоване')
    await router.push('/schedule')
    await flushPromises()
    expect(wrapper.find('a[href="/schedule/lessons/9"]').exists()).toBe(false)
  })
  it('creates replacements through the original endpoint and restores original after confirmed deletion', async () => {
    const backend = scheduleBackend(),
      { wrapper, router } = await renderApp('/schedule/lessons/9/replacement', backend)
    await wrapper.get('#lesson-room').setValue('502')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.path.endsWith('/replacement'))?.method).toBe('POST')
    expect(backend.lessons[0]?.status).toBe('replaced')
    expect(wrapper.text()).toContain('Початкове заняття №9')
    await click(wrapper, 'Видалити заняття')
    expect(wrapper.get('dialog').text()).toContain('відновить початкове')
    await click(wrapper, 'Підтвердити видалення')
    expect(wrapper.text()).toContain('Заняття видалено')
    expect(backend.lessons[0]?.status).toBe('active')
    expect(backend.deleted.has(20)).toBe(true)
    await router.push('/schedule')
    await flushPromises()
    expect(wrapper.find('a[href="/schedule/lessons/9"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/schedule/lessons/20"]').exists()).toBe(false)
  })
  it('blocks deletion and replacement chains for a current replaced original', async () => {
    const backend = scheduleBackend()
    backend.lessons[0]!.replacement_id = 10
    backend.lessons[0]!.status = 'replaced'
    const { wrapper } = await renderApp('/schedule/lessons/9', backend)
    expect(wrapper.find('a[href="/schedule/lessons/9/replacement"]').exists()).toBe(false)
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Видалити заняття')
        ?.attributes('disabled'),
    ).toBeDefined()
  })
  it('returns a safe missing detail state, never an unbounded index', async () => {
    const backend = scheduleBackend(),
      { wrapper } = await renderApp('/schedule/lessons/999', backend)
    expect(wrapper.text()).toContain('Запис недоступний')
    expect(backend.requests.some((r) => r.path === '/api/lessons')).toBe(false)
  })
})
describe('Import file and persisted preview', () => {
  it.each([
    ['file.xls', 1, 'розширення'],
    ['empty.xlsx', 0, 'порожній'],
    ['big.xlsx', 5120 * 1024 + 1, '5 MiB'],
  ])('validates %s before upload', (name, size, message) => {
    const file = new File([new Uint8Array(Number(size))], String(name))
    expect(validateScheduleFile(file, 4)).toContain(message)
  })
  it('accepts the size boundary and does not trust client MIME alone', () => {
    expect(
      validateScheduleFile(
        new File([new Uint8Array(5120 * 1024)], 'example.XLSX', { type: 'text/plain' }),
        4,
      ),
    ).toBe('')
    expect(validateScheduleFile(xlsx(), null)).toContain('період')
    expect(validateScheduleFile(null, 4)).toContain('Оберіть XLSX')
  })
  it('uploads and navigates to persisted preview without committing', async () => {
    const backend = scheduleBackend(),
      { wrapper, router } = await renderApp('/schedule/import', backend)
    await wrapper.get('#import-period').setValue('4')
    const file = xlsx()
    Object.defineProperty(wrapper.get('#schedule-file').element, 'files', {
      value: [file],
      configurable: true,
    })
    await wrapper.get('#schedule-file').trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/schedule/imports/41'))
    expect(backend.requests.find((r) => r.path === '/api/schedule-imports')?.body).toEqual({
      academic_period_id: '4',
      schedule_file: file,
    })
    expect(wrapper.text()).toContain('Потребує виправлень')
    expect(backend.requests.some((r) => r.path.endsWith('/commit'))).toBe(false)
  })
  it('handles failed processing returned as HTTP 201 without claiming validation', async () => {
    const backend = scheduleBackend()
    backend.uploadFailed = true
    const { wrapper } = await renderApp('/schedule/import', backend)
    await wrapper.get('#import-period').setValue('4')
    Object.defineProperty(wrapper.get('#schedule-file').element, 'files', {
      value: [xlsx()],
      configurable: true,
    })
    await wrapper.get('#schedule-file').trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Unsupported workbook structure'))
    expect(wrapper.text()).toContain('Обробка файлу не вдалася')
    expect(
      wrapper.findAll('button').some((b) => b.text() === 'Переглянути підтвердження імпорту'),
    ).toBe(false)
  })
  it.each(['create', 'update', 'restore', 'preserve', 'noop'] as const)(
    'preserves public row operation %s and provenance',
    (operation) => {
      const row = { ...importRowFixture(), operation }
      const batch = parseImportBatch({ ...importBatchFixture(), rows: [row] })
      expect(batch.rows[0]).toEqual(row)
      expect(batch.rows[0]?.source?.rows).toEqual([4, 5])
      expect(batch.rows[0]?.workbook_source?.worksheet).toBe('Розклад')
    },
  )
  it('renders invalid, duplicate and ambiguous-reference messages, provenance and source timestamps', async () => {
    const backend = scheduleBackend()
    backend.batches[0]!.rows[0]!.validation_errors = {
      subject_name: ['Missing Subject'],
      teacher_name: ['Multiple owned teachers exactly match this imported name.'],
    }
    const { wrapper } = await renderApp('/schedule/imports/40', backend)
    expect(wrapper.text()).toContain('Missing Subject')
    expect(wrapper.text()).toContain('Multiple owned teachers')
    expect(wrapper.text()).toContain('Дублікат')
    expect(wrapper.text()).toContain('Без змін')
    expect(wrapper.text()).toContain('C4:F5')
    expect(wrapper.text()).toContain('2026-11-02T09:00:00Z')
    expect(
      wrapper.findAll('button').some((b) => b.text() === 'Переглянути підтвердження імпорту'),
    ).toBe(false)
  })
  it('escapes workbook/user-authored text without interpreting HTML', () => {
    const wrapper = mount(ImportRowCard, {
      props: {
        row: { ...importRowFixture(), subject_name: '<img src=x onerror=alert(1)>' },
        timezone: 'Europe/Kyiv',
      },
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x')
  })
  it('keeps the known Batch ID through academic corrections without persisting previews', async () => {
    const backend = scheduleBackend(),
      { wrapper, router } = await renderApp('/academic/subjects?import_batch=40', backend)
    expect(wrapper.find('a[href="/schedule/imports/40"]').exists()).toBe(true)
    await wrapper.get('.section-nav a[href="/academic/teachers?import_batch=40"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.import_batch).toBe('40')
    expect(wrapper.find('a[href="/schedule/imports/40"]').exists()).toBe(true)
    expect(sessionStorage.length).toBe(0)
  })
  it.each(['//evil.example', '40x', '0', '-1', '1e3'])(
    'rejects malformed contextual batch ID %s',
    (value) => expect(importReturnId(value)).toBeNull(),
  )
})
describe('Import revalidation and explicit commit', () => {
  it('resolves corrected catalogs through explicit revalidation, replaces counters and never auto-commits', async () => {
    const backend = scheduleBackend(),
      { wrapper } = await renderApp('/schedule/imports/40', backend)
    backend.academic.subjects.push({
      id: 11,
      name: 'Новий предмет',
      education_institution_id: null,
      code: null,
      color: null,
    })
    backend.academic.teachers.push({
      id: 12,
      name: 'Новий викладач',
      education_institution_id: null,
    })
    await click(wrapper, 'Повторно перевірити')
    expect(wrapper.text()).toContain('Перевірено — готовий огляд')
    expect(wrapper.text()).not.toContain('No owned subject exactly matches')
    expect(backend.requests.filter((r) => r.path.endsWith('/revalidate'))).toHaveLength(1)
    expect(backend.requests.some((r) => r.path.endsWith('/commit'))).toBe(false)
    expect(backend.lessons).toHaveLength(2)
  })
  it.each(['failed', 'committed', 'cancelled'] as const)(
    'does not offer revalidation for %s',
    async (status) => {
      const backend = scheduleBackend()
      backend.batches[0]!.status = status
      const { wrapper } = await renderApp('/schedule/imports/40', backend)
      expect(wrapper.findAll('button').some((b) => b.text() === 'Повторно перевірити')).toBe(false)
    },
  )
  it('requires independent review and explicit confirmation before sending no-business-body commit', async () => {
    const { wrapper, backend } = await readyImport()
    await click(wrapper, 'Переглянути підтвердження імпорту')
    expect((wrapper.get('dialog input').element as HTMLInputElement).checked).toBe(false)
    expect(
      wrapper
        .findAll('dialog button')
        .find((b) => b.text() === 'Підтвердити імпорт')
        ?.attributes('disabled'),
    ).toBeDefined()
    await click(wrapper, 'Повернутися до огляду')
    expect(backend.requests.some((r) => r.path.endsWith('/commit'))).toBe(false)
    await decide(wrapper)
    expect(wrapper.text()).toContain('Імпорт застосовано')
    expect(backend.requests.find((r) => r.path.endsWith('/commit'))?.body).toEqual({})
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(1)
    expect(backend.requests.some((r) => r.path.startsWith('/api/schedule/date/'))).toBe(true)
  })
  it('replaces a changed-preview 409, resets consent and requires a new decision', async () => {
    const { wrapper, backend } = await readyImport()
    backend.changedOnCommit = true
    await decide(wrapper)
    expect(wrapper.text()).toContain('Попередньо переглянутий результат змінився')
    expect(wrapper.text()).toContain('Відновити видалене заняття')
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(1)
    await click(wrapper, 'Переглянути підтвердження імпорту')
    expect((wrapper.get('dialog input').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('dialog input').setValue(true)
    await click(wrapper, 'Підтвердити імпорт')
    expect(wrapper.text()).toContain('Імпорт застосовано')
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(2)
  })
  it('recovers an already-committed lost response with GET and no mutation replay', async () => {
    const { wrapper, backend } = await readyImport()
    const original = globalThis.fetch
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/commit')) {
          calls++
          await original(url, init)
          throw new TypeError('lost')
        }
        return original(url, init)
      }),
    )
    await decide(wrapper)
    expect(calls).toBe(1)
    expect(wrapper.text()).toContain('За збереженим станом пакет уже застосовано')
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(1)
    expect(
      wrapper.findAll('button').some((b) => b.text() === 'Переглянути підтвердження імпорту'),
    ).toBe(false)
  })
  it('recovers a not-delivered commit through GET and demands deliberate further action', async () => {
    const { wrapper, backend } = await readyImport()
    const original = globalThis.fetch
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith('/commit')) {
          calls++
          return Promise.reject(new TypeError('offline'))
        }
        return original(url, init)
      }),
    )
    await decide(wrapper)
    expect(calls).toBe(1)
    expect(wrapper.text()).toContain('Актуальний пакет отримано')
    expect(backend.batches[0]?.status).toBe('validated')
    expect(wrapper.find('dialog').exists()).toBe(false)
  })
  it('opens committed history without another mutation', async () => {
    const { wrapper, backend, router } = await readyImport()
    await decide(wrapper)
    const writes = backend.requests.filter((r) => r.method !== 'GET').length
    await router.push('/schedule')
    await flushPromises()
    await router.push('/schedule/imports/40')
    await flushPromises()
    expect(wrapper.text()).toContain('Імпорт застосовано')
    expect(backend.requests.filter((r) => r.method !== 'GET')).toHaveLength(writes)
  })
  it('supports an empty validated preview without inventing Lessons', async () => {
    const backend = scheduleBackend()
    backend.batches[0] = {
      ...importBatchFixture(),
      status: 'validated',
      total_rows: 0,
      valid_rows: 0,
      invalid_rows: 0,
      duplicate_rows: 0,
      rows: [],
    }
    const { wrapper } = await renderApp('/schedule/imports/40', backend)
    expect(wrapper.text()).toContain('Появ у цьому пакеті немає')
    await decide(wrapper)
    expect(wrapper.text()).toContain('Імпорт застосовано')
    expect(backend.lessons).toHaveLength(2)
  })
  it('renders missing/foreign batch as unavailable with no row leakage', async () => {
    const backend = scheduleBackend(),
      { wrapper } = await renderApp('/schedule/imports/999', backend)
    expect(wrapper.text()).toContain('Запис недоступний')
    expect(wrapper.find('.import-row').exists()).toBe(false)
  })
})

describe('Schedule import recovery and concurrency regressions', () => {
  it('replaces a previously valid preview with newly invalid server rows', async () => {
    const { wrapper, backend } = await readyImport(),
      original = globalThis.fetch
    const changed = {
      ...importBatchFixture(),
      status: 'uploaded' as const,
      invalid_rows: 2,
      duplicate_rows: 0,
      rows: importBatchFixture().rows.map((row) => ({
        ...row,
        status: 'invalid' as const,
        operation: null,
        validation_errors: { schedule: ['A new manual Lesson conflicts.'] },
      })),
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.endsWith('/revalidate')
          ? Promise.resolve(json({ data: changed }))
          : original(url, init),
      ),
    )
    await click(wrapper, 'Повторно перевірити')
    expect(wrapper.text()).toContain('A new manual Lesson conflicts.')
    expect(wrapper.text()).toContain('Потребує виправлень')
    expect(
      wrapper.findAll('button').some((b) => b.text() === 'Переглянути підтвердження імпорту'),
    ).toBe(false)
    expect(backend.requests.some((r) => r.path.endsWith('/commit'))).toBe(false)
  })
  it('blocks confirmation when changed-preview 409 becomes invalid', async () => {
    const { wrapper } = await readyImport(),
      original = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.endsWith('/commit')
          ? Promise.resolve(json({ data: importBatchFixture() }, 409))
          : original(url, init),
      ),
    )
    await decide(wrapper)
    expect(wrapper.text()).toContain('Попередньо переглянутий результат змінився')
    expect(
      wrapper.findAll('button').some((b) => b.text() === 'Переглянути підтвердження імпорту'),
    ).toBe(false)
  })
  it('prevents duplicate confirmations while the first commit is unresolved', async () => {
    const { wrapper, backend } = await readyImport(),
      original = globalThis.fetch
    let release!: () => void,
      writes = 0
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/commit')) {
          writes++
          await wait
        }
        return original(url, init)
      }),
    )
    await click(wrapper, 'Переглянути підтвердження імпорту')
    await wrapper.get('dialog input').setValue(true)
    const button = wrapper.findAll('dialog button').find((b) => b.text() === 'Підтвердити імпорт')!
    await button.trigger('click')
    await button.trigger('click')
    expect(writes).toBe(1)
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.get('dialog input').attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(backend.requests.filter((r) => r.path.endsWith('/commit'))).toHaveLength(1)
  })
  it('keeps old snapshot visibly uncertain when recovery GET also fails', async () => {
    const { wrapper } = await readyImport(),
      original = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.endsWith('/commit') || url.endsWith('/schedule-imports/40')
          ? Promise.reject(new TypeError('offline'))
          : original(url, init),
      ),
    )
    await decide(wrapper)
    expect(wrapper.text()).toContain('Стан операції невідомий')
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Переглянути підтвердження імпорту')
        ?.attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).not.toContain('Імпорт застосовано')
  })
  it('retrieves repeated committed history without another Lesson mutation', async () => {
    const { backend } = await readyImport()
    await scheduleImportsApi.commit(40)
    const count = backend.lessons.length
    const repeated = await scheduleImportsApi.commit(40)
    expect(repeated.data.status).toBe('committed')
    expect(backend.lessons).toHaveLength(count)
  })
  it('safely renders invalid stored UTC metadata without changing its raw value', () => {
    const wrapper = mount(ImportRowCard, {
      props: {
        row: {
          ...importRowFixture(),
          status: 'invalid',
          operation: null,
          starts_at_utc: '2026-02-30T09:00:00Z',
          validation_errors: { preview_integrity: ['Invalid stored occurrence.'] },
        },
        timezone: 'Europe/Kyiv',
      },
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.text()).toContain('Некоректна UTC-мітка')
    expect(wrapper.text()).toContain('2026-02-30T09:00:00Z')
    expect(wrapper.text()).toContain('Invalid stored occurrence.')
  })
  it('does not re-upload after an uncertain upload response', async () => {
    const backend = scheduleBackend(),
      { wrapper } = await renderApp('/schedule/import', backend),
      original = globalThis.fetch
    let uploads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith('/schedule-imports') && init?.method === 'POST') {
          uploads++
          return Promise.reject(new TypeError('lost'))
        }
        return original(url, init)
      }),
    )
    await wrapper.get('#import-period').setValue('4')
    Object.defineProperty(wrapper.get('#schedule-file').element, 'files', {
      value: [xlsx()],
      configurable: true,
    })
    await wrapper.get('#schedule-file').trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(uploads).toBe(1)
    expect(wrapper.text()).toContain('Пакет міг бути збережений')
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Завантажити й перевірити')
        ?.attributes('disabled'),
    ).toBeDefined()
  })
  it('reports upload field errors and allows correcting a definite validation failure', async () => {
    const backend = scheduleBackend()
    backend.failure = {
      method: 'POST',
      path: /schedule-imports$/,
      status: 422,
      fields: { schedule_file: ['The schedule file must be a file of type: xlsx.'] },
    }
    const { wrapper } = await renderApp('/schedule/import', backend)
    await wrapper.get('#import-period').setValue('4')
    Object.defineProperty(wrapper.get('#schedule-file').element, 'files', {
      value: [xlsx()],
      configurable: true,
    })
    await wrapper.get('#schedule-file').trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#schedule-file').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('file of type: xlsx')
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Завантажити й перевірити')
        ?.attributes('disabled'),
    ).toBeUndefined()
  })
  it('reports association and schedule errors against the existing Lesson form', async () => {
    const backend = scheduleBackend()
    backend.failure = {
      method: 'PATCH',
      path: /lessons\/9$/,
      status: 422,
      fields: {
        subject_id: ['The selected association is invalid.'],
        schedule: ['This lesson overlaps an existing active lesson.'],
      },
    }
    const { wrapper } = await renderApp('/schedule/lessons/9/edit', backend)
    await wrapper.get('#lesson-room').setValue('999')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#lesson-subject').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('overlaps an existing active lesson')
    expect(wrapper.get<HTMLInputElement>('#lesson-room').element.value).toBe('999')
    expect(backend.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1)
  })
})

describe('Replacement restoration across local dates', () => {
  it('refreshes both affected days and returns to the restored original calendar date', async () => {
    const backend = scheduleBackend()
    backend.lessons[0]!.status = 'replaced'
    backend.lessons[0]!.replacement_id = 20
    backend.lessons.push({
      ...lessonDetailFixture(20),
      starts_at: '2026-11-03T07:00:00Z',
      ends_at: '2026-11-03T08:20:00Z',
      replaces_lesson_id: 9,
    })
    const { wrapper } = await renderApp('/schedule/lessons/20', backend)
    await click(wrapper, 'Видалити заняття')
    await click(wrapper, 'Підтвердити видалення')
    expect(backend.requests.some((r) => r.path === '/api/schedule/date/2026-11-03')).toBe(true)
    expect(backend.requests.some((r) => r.path === '/api/schedule/date/2026-11-02')).toBe(true)
    expect(wrapper.find('a[href="/schedule?date=2026-11-02"]').exists()).toBe(true)
  })
})
