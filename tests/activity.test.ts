import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import {
  activityBackend,
  reminderFixture,
  notificationFixture,
  comparisonFixture,
} from './helpers/activityBackend'
import { renderApp } from './helpers/renderApp'
import { remindersApi } from '@/api/reminders'
import { notificationsApi } from '@/api/notifications'
import { statisticsApi } from '@/api/statistics'
import { signedOffset, validReminderRange, positiveContext } from '@/utils/reminders'
import { validateReportRange, validateComparison } from '@/utils/statistics'
import { receiptReminderId } from '@/utils/ai'
import ReminderForm from '@/components/reminders/ReminderForm.vue'
import type { Reminder } from '@/types/api'
import type { ReminderTarget } from '@/types/reminders'
import { json } from './fixtures'
const range = { start_date: '2026-10-01', end_date: '2026-10-31' }
async function click(wrapper: VueWrapper, label: string) {
  const root = wrapper.find('dialog').exists() ? wrapper.get('dialog') : wrapper
  await root
    .findAll('button')
    .find((b) => b.text() === label)!
    .trigger('click')
  await flushPromises()
}
function form(target: ReminderTarget | null = null, reminder?: Reminder) {
  return mount(ReminderForm, {
    props: { reminder, target, timezone: 'Europe/Kyiv', errors: {}, busy: false },
  })
}
describe('Reminder contracts and input boundaries', () => {
  it.each(['-32768', '0', '32767'])('accepts signed offset %s', (value) =>
    expect(signedOffset(value)).toBe(Number(value)),
  )
  it.each(['-32769', '32768', '1.5', '+1', '01', 'true', ''])(
    'rejects noncanonical offset %s',
    (value) => expect(() => signedOffset(value)).toThrow(),
  )
  it('validates paired UTC range and exact elapsed limit', () => {
    expect(() => validReminderRange(null, null)).not.toThrow()
    expect(() => validReminderRange('2026-01-01T00:00:00Z', null)).toThrow()
    expect(() => validReminderRange('2026-01-01T00:00:00Z', '2027-01-02T00:00:00Z')).not.toThrow()
    expect(() => validReminderRange('2026-01-01T00:00:00Z', '2027-01-02T00:00:01Z')).toThrow()
  })
  it.each(['1e3', '0', '-1', 'https://evil.test', '1x'])(
    'rejects unsafe target context %s',
    (value) => expect(positiveContext(value)).toBeNull(),
  )
  it('creates a meaningful general absolute reminder without relative fields', async () => {
    const wrapper = form()
    await wrapper.get('#reminder-message').setValue('Повторити матеріал')
    await wrapper.get('#reminder-trigger').setValue('2026-11-12T11:00:12')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('create')?.[0]?.[0]).toEqual({
      message: 'Повторити матеріал',
      trigger_at: '2026-11-12T09:00:12Z',
    })
  })
  it('rejects invisible general messages and excessive Unicode length', async () => {
    const wrapper = form()
    await wrapper.get('#reminder-message').setValue('\u200b\u00a0')
    await wrapper.get('#reminder-trigger').setValue('2026-11-12T11:00')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('змістовне')
    expect(wrapper.emitted('create')).toBeUndefined()
    await wrapper.get('#reminder-message').setValue('я'.repeat(501))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('500 символів')
  })
  it.each([
    ['task', 'task_id', 'task_deadline'],
    ['subtask', 'subtask_id', 'subtask_deadline'],
    ['session', 'study_session_id', 'session_start'],
  ] as const)(
    'creates relative %s with one target and compatible anchor',
    async (kind, key, anchor) => {
      const wrapper = form({ kind, id: 8 })
      await wrapper.get('#reminder-mode').setValue('relative')
      await wrapper.get('#reminder-offset').setValue('-32768')
      await wrapper.get('form').trigger('submit')
      expect(wrapper.emitted('create')?.[0]?.[0]).toEqual({
        [key]: 8,
        message: null,
        anchor,
        offset_minutes: -32768,
      })
      expect(wrapper.find('#reminder-trigger').exists()).toBe(false)
    },
  )
  it('permits a null message for targeted absolute reminders', async () => {
    const wrapper = form({ kind: 'task', id: 1 })
    await wrapper.get('#reminder-trigger').setValue('2026-11-12T11:00')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('create')?.[0]?.[0]).toEqual({
      task_id: 1,
      message: null,
      trigger_at: '2026-11-12T09:00:00Z',
    })
  })
  it.each(['2026-03-29T03:30:00', '2026-10-25T03:30:00'])(
    'rejects DST gap/fold input %s',
    async (value) => {
      const wrapper = form({ kind: 'task', id: 1 })
      await wrapper.get('#reminder-trigger').setValue(value)
      await wrapper.get('form').trigger('submit')
      expect(wrapper.text()).toContain('не існує або повторюється')
      expect(wrapper.emitted('create')).toBeUndefined()
    },
  )
  it('PATCH keeps unchanged UTC and emits only changed absolute fields', async () => {
    const reminder = { ...reminderFixture(), trigger_at: '2026-10-25T00:30:12Z' },
      wrapper = form(null, reminder)
    await wrapper.get('#reminder-message').setValue('Новий текст')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual({ message: 'Новий текст' })
    expect(wrapper.find('#reminder-mode').exists()).toBe(false)
  })
  it('PATCH relative accepts zero integer and nullable targeted text without trigger', async () => {
    const wrapper = form(null, {
      ...reminderFixture(),
      anchor: 'task_deadline',
      offset_minutes: -15,
    })
    await wrapper.get('#reminder-offset').setValue('0')
    await wrapper.get('#reminder-message').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual({ message: null, offset_minutes: 0 })
  })
  it('requires an actual editable change', async () => {
    const wrapper = form(null, reminderFixture())
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Змініть повідомлення')
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it('prevents disabled duplicate submission at the form boundary', async () => {
    const wrapper = form({ kind: 'task', id: 1 })
    await wrapper.setProps({ busy: true })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('create')).toBeUndefined()
  })
})
describe('Reminder/Inbox HTTP contracts', () => {
  it('preserves pagination, filters, JSON, cookie credentials and CSRF', async () => {
    document.cookie = 'XSRF-TOKEN=f6%2Bcsrf%3D'
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ data: reminderFixture() }),
    )
    vi.stubGlobal('fetch', fetch)
    await remindersApi.list({
      status: 'scheduled',
      trigger_from: '2026-11-01T00:00:00Z',
      trigger_to: '2026-11-30T00:00:00Z',
      page: 2,
      per_page: 100,
    })
    await remindersApi.create({
      task_id: 1,
      anchor: 'task_deadline',
      offset_minutes: -15,
      message: null,
    })
    await remindersApi.update(1, { offset_minutes: 0 })
    await remindersApi.cancel(1)
    expect(fetch.mock.calls[0]?.[0]).toContain('status=scheduled')
    expect(fetch.mock.calls[0]?.[0]).toContain('page=2')
    for (const [, init] of fetch.mock.calls) {
      expect(init?.credentials).toBe('include')
      if (init?.method !== 'GET')
        expect(new Headers(init?.headers).get('X-XSRF-TOKEN')).toBe('f6+csrf=')
    }
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).not.toHaveProperty('trigger_at')
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({ offset_minutes: 0 })
    expect(fetch.mock.calls[3]?.[0]).toMatch(/\/reminders\/1\/cancel$/)
  })
  it.each([401, 404, 409, 419, 422, 500])(
    'does not retry Reminder mutation status %s',
    async (status) => {
      const fetch = vi.fn(async () => json({ errors: { target: ['Unavailable.'] } }, status))
      vi.stubGlobal('fetch', fetch)
      await expect(remindersApi.cancel(1)).rejects.toMatchObject({ status })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
  it('uses canonical inbox filters and idempotent UUID read without business fields', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ data: notificationFixture() }),
    )
    vi.stubGlobal('fetch', fetch)
    await notificationsApi.list({ unread_only: 'true', page: 2, per_page: 100 })
    await notificationsApi.read(notificationFixture().id)
    expect(fetch.mock.calls[0]?.[0]).toContain('unread_only=true')
    expect(fetch.mock.calls[1]?.[0]).toContain(`${notificationFixture().id}/read`)
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(fetch.mock.calls[1]?.[1]?.body).toBeUndefined()
  })
  it('exposes receipt-provided reminder identity without interpreting prose', () => {
    expect(receiptReminderId({ reminder: { id: 42 } })).toBe(42)
    expect(receiptReminderId({ content: 'reminder 99' })).toBeNull()
    expect(receiptReminderId({ reminder: { id: '42' } })).toBeNull()
  })
})
describe('Reminders workspace', () => {
  it('lists actual statuses, applies filters and retains historical records', async () => {
    const backend = activityBackend(),
      { wrapper } = await renderApp('/reminders', backend)
    expect(wrapper.text()).toContain('Заплановане')
    expect(wrapper.text()).toContain('Надіслане')
    expect(wrapper.text()).toContain('Скасоване')
    await wrapper.get('#reminder-status').setValue('sent')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.findAll('.reminder-card')).toHaveLength(1)
    expect(backend.requests.at(-1)?.search).toContain('status=sent')
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  })
  it('paginates with server metadata without arbitrary ordering', async () => {
    const backend = activityBackend()
    for (let id = 4; id <= 23; id++) backend.reminders.push(reminderFixture(id))
    const { wrapper } = await renderApp('/reminders', backend)
    await click(wrapper, 'Наступна сторінка')
    expect(wrapper.findAll('.reminder-card')).toHaveLength(3)
    expect(backend.requests.at(-1)?.search).toContain('page=2')
    expect(backend.requests.at(-1)?.search).not.toContain('sort')
  })
  it('creates from an explicit owned Task context and opens persisted detail', async () => {
    const backend = activityBackend(),
      { wrapper, router } = await renderApp('/reminders/new?task_id=1', backend)
    expect(backend.requests.some((r) => r.path === '/api/tasks/1')).toBe(true)
    await wrapper.get('#reminder-trigger').setValue('2026-11-12T11:00')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/reminders/10'))
    expect(
      backend.requests.find((r) => r.method === 'POST' && r.path === '/api/reminders')?.body,
    ).toEqual({ task_id: 1, message: null, trigger_at: '2026-11-12T09:00:00Z' })
  })
  it('uses exact Subtask target and never submits both parent and child IDs', async () => {
    const backend = activityBackend(),
      { wrapper } = await renderApp('/reminders/new?task_id=1&subtask_id=4', backend)
    await wrapper.get('#reminder-mode').setValue('relative')
    await wrapper.get('#reminder-offset').setValue('-15')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(
      backend.requests.find((r) => r.method === 'POST' && r.path === '/api/reminders')?.body,
    ).toEqual({ subtask_id: 4, message: null, anchor: 'subtask_deadline', offset_minutes: -15 })
  })
  it('loads explicit StudySession outside the displayed range through its owned detail', async () => {
    const backend = activityBackend(),
      { wrapper } = await renderApp('/reminders/new?study_session_id=1', backend)
    expect(backend.requests.some((r) => r.path === '/api/study-sessions/1')).toBe(true)
    await wrapper.get('#reminder-mode').setValue('relative')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(
      backend.requests.find((r) => r.method === 'POST' && r.path === '/api/reminders')?.body,
    ).toMatchObject({ study_session_id: 1, anchor: 'session_start', offset_minutes: -15 })
  })
  it('does not trust an inaccessible URL target', async () => {
    const backend = activityBackend()
    backend.failure = { path: /tasks\/999$/, method: 'GET', status: 404 }
    const { wrapper } = await renderApp('/reminders/new?task_id=999', backend)
    expect(wrapper.text()).toContain('Запис недоступний')
    expect(wrapper.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(backend.requests.some((r) => r.path === '/api/reminders' && r.method === 'POST')).toBe(
      false,
    )
  })
  it('edits absolute message using only permitted PATCH fields', async () => {
    const backend = activityBackend(),
      { wrapper } = await renderApp('/reminders/1/edit', backend)
    await wrapper.get('#reminder-message').setValue('Оновлено')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.method === 'PATCH')?.body).toEqual({
      message: 'Оновлено',
    })
  })
  it('requires cancellation confirmation and refreshes immutable history', async () => {
    const backend = activityBackend(),
      { wrapper } = await renderApp('/reminders/1', backend)
    await click(wrapper, 'Скасувати нагадування')
    await click(wrapper, 'Залишити нагадування')
    expect(backend.requests.some((r) => r.path.endsWith('/cancel'))).toBe(false)
    await click(wrapper, 'Скасувати нагадування')
    await click(wrapper, 'Підтвердити скасування')
    expect(wrapper.text()).toContain('Скасоване')
    expect(wrapper.find('a[href="/reminders/1/edit"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('історичний')
  })
  it.each([2, 3])('renders %s reminder as read-only', async (id) => {
    const { wrapper } = await renderApp(`/reminders/${id}/edit`, activityBackend())
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('незмінною історією')
  })
  it('renders target validation safely without retry', async () => {
    const backend = activityBackend()
    backend.failure = {
      path: /reminders$/,
      method: 'POST',
      status: 422,
      fields: { target: ['The reminder target is unavailable.'] },
    }
    const { wrapper } = await renderApp('/reminders/new?task_id=1', backend)
    await wrapper.get('#reminder-trigger').setValue('2026-11-12T11:00')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('target is unavailable')
    expect(
      backend.requests.filter((r) => r.path === '/api/reminders' && r.method === 'POST'),
    ).toHaveLength(1)
  })
})
describe('Persisted notification inbox', () => {
  it('never marks visible items read or generates delivery', async () => {
    const backend = activityBackend(),
      { wrapper } = await renderApp('/inbox', backend)
    expect(wrapper.text()).toContain('Час повторити матеріал')
    expect(wrapper.text()).toContain('Інше безпечне сповіщення')
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(wrapper.findAll('button').some((b) => /видал|усі прочитан/i.test(b.text()))).toBe(false)
  })
  it('filters unread and explicitly persists server read timestamp', async () => {
    const backend = activityBackend(),
      { wrapper } = await renderApp('/inbox', backend)
    await click(wrapper, 'Непрочитані')
    expect(wrapper.findAll('.notification-card')).toHaveLength(1)
    await click(wrapper, 'Позначити прочитаним')
    expect(wrapper.text()).toContain('Сповіщень за цим фільтром немає')
    expect(wrapper.text()).toContain('Прочитано за серверним часом')
    expect(backend.requests.filter((r) => r.path.endsWith('/read'))).toHaveLength(1)
    const first = backend.notifications[0]!.read_at
    await notificationsApi.read(backend.notifications[0]!.id)
    expect(backend.notifications[0]!.read_at).toBe(first)
  })
  it('retains history and safe links when a target may be unavailable', async () => {
    const backend = activityBackend()
    backend.notifications[0]!.task_id = 999
    const { wrapper } = await renderApp('/inbox', backend)
    expect(wrapper.find('a[href="/tasks/999"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('історія нагадування чи сповіщення зберігається')
    expect(wrapper.find('.notification-card').exists()).toBe(true)
  })
  it('safely escapes messages and handles future generic types', async () => {
    const backend = activityBackend()
    backend.notifications[0]!.message = '<script>alert(1)</script>'
    backend.notifications[0]!.type = 'future_public_type'
    const { wrapper } = await renderApp('/inbox', backend)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
    expect(wrapper.text()).toContain('Сповіщення')
  })
  it('does not retry a failed read mutation or invent a local timestamp', async () => {
    const backend = activityBackend()
    backend.failure = { path: /\/read$/, method: 'POST', status: 503 }
    const { wrapper } = await renderApp('/inbox', backend)
    await click(wrapper, 'Позначити прочитаним')
    expect(backend.notifications[0]?.read_at).toBeNull()
    expect(backend.requests.filter((r) => r.path.endsWith('/read'))).toHaveLength(1)
    expect(wrapper.text()).toContain('Стан прочитання не підтверджено')
  })
})
describe('Calendar report validation and authoritative metrics', () => {
  it('accepts 31 nominal dates across DST and year 0001 labels', () => {
    expect(() => validateReportRange(range)).not.toThrow()
    expect(() =>
      validateReportRange({ start_date: '0001-01-01', end_date: '0001-01-31' }),
    ).not.toThrow()
  })
  it.each([
    ['2026-10-01', '2026-11-01'],
    ['2026-11-02', '2026-11-01'],
    ['2026-02-30', '2026-03-01'],
    ['', '2026-11-01'],
  ])('rejects invalid report range %s %s', (start_date, end_date) =>
    expect(() => validateReportRange({ start_date, end_date })).toThrow(),
  )
  it.each([
    [
      { start_date: '2026-10-01', end_date: '2026-10-07' },
      { start_date: '2026-10-07', end_date: '2026-10-13' },
    ],
    [
      { start_date: '2026-10-01', end_date: '2026-10-07' },
      { start_date: '2026-10-08', end_date: '2026-10-15' },
    ],
    [
      { start_date: '2026-10-10', end_date: '2026-10-16' },
      { start_date: '2026-10-01', end_date: '2026-10-07' },
    ],
  ])('rejects overlapping, unequal or reversed comparison', (baseline, current) =>
    expect(() => validateComparison(baseline, current)).toThrow(),
  )
  it('requests exact report fields without timezone/owner/pagination overrides', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ data: comparisonFixture() }),
    )
    vi.stubGlobal('fetch', fetch)
    await statisticsApi.progress(range)
    await statisticsApi.trends(range)
    await statisticsApi.comparison({
      baseline_start_date: '2026-09-01',
      baseline_end_date: '2026-09-07',
      current_start_date: '2026-10-01',
      current_end_date: '2026-10-07',
    })
    expect(fetch.mock.calls[0]?.[0]).toContain(
      '/api/statistics/progress?start_date=2026-10-01&end_date=2026-10-31',
    )
    expect(fetch.mock.calls[1]?.[0]).toContain('/api/statistics/trends?')
    const keys = [...new URL(fetch.mock.calls[2]![0]).searchParams.keys()]
    expect(keys).toEqual([
      'baseline_start_date',
      'baseline_end_date',
      'current_start_date',
      'current_end_date',
    ])
  })
  it('distinguishes lifetime current populations and period completions without combining work', async () => {
    const { wrapper } = await renderApp('/statistics', activityBackend())
    expect(wrapper.text()).toContain('Поточний стан роботи — за весь час')
    expect(wrapper.text()).toContain('не є станом на його кінець')
    expect(wrapper.text()).toContain('Завершення в обраному періоді')
    expect(wrapper.text()).toContain('Підзавдання')
    expect(wrapper.findAll('.chart-number').map((n) => n.text())).toContain('5')
    for (const label of ['Заплановано', 'Завершено', 'Пропущено', 'Перенесено', 'Скасовано'])
      expect(wrapper.text()).toContain(label)
    expect(wrapper.text()).toContain('25 хв')
    expect(wrapper.text()).toContain('Невідоме не дорівнює нулю')
  })
  it('retains zero-filled trend dates in server order with accessible tables and exact daily detail', async () => {
    const { wrapper } = await renderApp('/statistics/trends', activityBackend())
    const details = wrapper.findAll('details')
    expect(details).toHaveLength(7)
    expect(details[1]!.text()).toContain('завдань 0')
    expect(wrapper.findAll('.metric-chart table')).toHaveLength(4)
    expect(wrapper.findAll('.metric-chart table')[0]!.findAll('tbody tr')).toHaveLength(7)
    expect(wrapper.text()).toContain('початкового starts_at')
    expect(wrapper.text()).toContain('Невідоме не дорівнює нулю')
    expect(wrapper.find('table th[scope="row"]').exists()).toBe(true)
  })
  it('shows server signed deltas and factual directions with unknown-effort warning', async () => {
    const { wrapper } = await renderApp('/statistics/comparison', activityBackend())
    expect(wrapper.text()).toContain('-2')
    expect(wrapper.text()).toContain('-20')
    expect(wrapper.text()).toContain('+1')
    expect(wrapper.text()).toContain('Збільшилося')
    expect(wrapper.text()).toContain('Зменшилося')
    expect(wrapper.text()).toContain('Порівняння фактичної тривалості неповне')
    expect(wrapper.text()).toContain('не є різницею всіх навчальних зусиль')
    expect(wrapper.text()).not.toContain('Оцінка продуктивності:')
  })
  it.each(['/statistics', '/statistics/trends', '/statistics/comparison'])(
    'renders safe empty report %s',
    async (path) => {
      const backend = activityBackend()
      backend.emptyReports = true
      const { wrapper } = await renderApp(path, backend)
      expect(wrapper.findAll('.card').length).toBeGreaterThan(0)
      if (path !== '/statistics/comparison')
        expect(wrapper.text()).toContain('Активність ще не зафіксовано')
      else expect(wrapper.text()).toContain('Без змін')
    },
  )
  it('maps backend range field errors without exposing exception text', async () => {
    const backend = activityBackend()
    backend.failure = {
      path: /statistics\/progress$/,
      method: 'GET',
      status: 422,
      fields: { end_date: ['The selected range is invalid.'] },
    }
    const { wrapper } = await renderApp('/statistics', backend)
    expect(wrapper.text()).toContain('The selected range is invalid.')
    expect(wrapper.findAll('.metric-chart')).toHaveLength(0)
  })
})

describe('F6 mutation uncertainty and stale-read regressions', () => {
  it('blocks duplicate creates while pending and never repeats an uncertain creation', async () => {
    const { wrapper, backend } = await renderApp('/reminders/new?task_id=1', activityBackend())
    const original = globalThis.fetch
    let release!: () => void,
      sends = 0
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/reminders') && init?.method === 'POST') {
          sends++
          await held
          throw new TypeError('Lost response')
        }
        return original(url, init)
      }),
    )
    await wrapper.get('#reminder-trigger').setValue('2026-11-12T11:00')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(sends).toBe(1)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(wrapper.text()).toContain('Результат збереження невідомий')
    await wrapper.get('form').trigger('submit')
    expect(sends).toBe(1)
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  })
  it('recovers a lost cancellation through GET without a second cancellation', async () => {
    const { wrapper, backend } = await renderApp('/reminders/1', activityBackend())
    const original = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const response = await original(url, init)
        if (url.endsWith('/cancel')) throw new TypeError('Lost response')
        return response
      }),
    )
    await click(wrapper, 'Скасувати нагадування')
    await click(wrapper, 'Підтвердити скасування')
    expect(wrapper.text()).toContain('Скасоване')
    expect(wrapper.text()).toContain('автоматичного повтору скасування не було')
    expect(backend.requests.filter((r) => r.path.endsWith('/cancel'))).toHaveLength(1)
    expect(backend.requests.at(-1)).toMatchObject({ path: '/api/reminders/1', method: 'GET' })
  })
  it('disables duplicate explicit mark-read while pending', async () => {
    const backend = activityBackend(),
      { wrapper } = await renderApp('/inbox', backend),
      original = globalThis.fetch
    let release!: () => void,
      reads = 0
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/read')) {
          reads++
          await held
        }
        return original(url, init)
      }),
    )
    const button = wrapper.findAll('button').find((b) => b.text() === 'Позначити прочитаним')!
    await button.trigger('click')
    await button.trigger('click')
    expect(button.attributes('disabled')).toBeDefined()
    expect(reads).toBe(1)
    release()
    await flushPromises()
    expect(backend.notifications[0]?.read_at).toBe('2026-10-30T12:00:00Z')
  })
  it('aborts stale target details when switching selection and ignores late response', async () => {
    const { wrapper } = await renderApp('/reminders/new?task_id=1', activityBackend()),
      original = globalThis.fetch
    let signal: AbortSignal | undefined, release!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith('/tasks/2')) {
          signal = init?.signal ?? undefined
          return new Promise<Response>((resolve) => {
            release = resolve
          })
        }
        return original(url, init)
      }),
    )
    // A paginated selector may contain a Task whose detail is still loading.
    const select = wrapper.get('#reminder-task')
    const option = document.createElement('option')
    option.value = '2'
    option.text = 'Інше завдання'
    select.element.appendChild(option)
    await select.setValue('2')
    await flushPromises()
    expect(signal?.aborted).toBe(false)
    await wrapper.get('#reminder-target-kind').setValue('general')
    expect(signal?.aborted).toBe(true)
    release(json({ data: { id: 2, title: 'Stale task' } }))
    await flushPromises()
    expect(wrapper.find('#reminder-task').exists()).toBe(false)
    expect(
      wrapper.get('#reminder-mode option[value="relative"]').attributes('disabled'),
    ).toBeDefined()
  })
  it('paginates inbox independently and retains unread filter', async () => {
    const backend = activityBackend()
    for (let i = 3; i <= 24; i++)
      backend.notifications.push({
        ...notificationFixture(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`),
      })
    const { wrapper } = await renderApp('/inbox', backend)
    await click(wrapper, 'Непрочитані')
    await click(wrapper, 'Наступна сторінка')
    expect(wrapper.findAll('.notification-card')).toHaveLength(3)
    expect(backend.requests.at(-1)?.search).toContain('unread_only=true&page=2')
  })
  it('shows backend report field validation then retries only a safe GET', async () => {
    const backend = activityBackend()
    backend.failure = {
      path: /statistics\/trends$/,
      method: 'GET',
      status: 422,
      fields: { start_date: ['Invalid reporting dates.'] },
    }
    const { wrapper } = await renderApp('/statistics/trends', backend)
    expect(wrapper.text()).toContain('Invalid reporting dates.')
    await click(wrapper, 'Повторити читання звіту')
    expect(wrapper.findAll('.daily-report')).toHaveLength(7)
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  })
  it('prevents invalid comparison and overlong report queries before transport', async () => {
    const backend = activityBackend(),
      { wrapper, router } = await renderApp('/statistics', backend)
    await wrapper.findAll('input[type="date"]')[0]!.setValue('2026-10-01')
    await wrapper.findAll('input[type="date"]')[1]!.setValue('2026-11-01')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('від 1 до 31')
    expect(backend.requests.filter((r) => r.path === '/api/statistics/progress')).toHaveLength(1)
    await router.push('/statistics/comparison')
    await flushPromises()
    const inputs = wrapper.findAll('input[type="date"]')
    for (const [index, date] of ['2026-10-01', '2026-10-07', '2026-10-07', '2026-10-13'].entries())
      await inputs[index]!.setValue(date)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Базовий період має завершитися')
    expect(backend.requests.filter((r) => r.path.endsWith('/comparison'))).toHaveLength(1)
  })
})
