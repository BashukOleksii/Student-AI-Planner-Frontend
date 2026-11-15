import { notificationsApi } from '@/api/notifications'
import ReminderForm from '@/components/reminders/ReminderForm.vue'
import type { Reminder } from '@/types/api'
import type { ReminderTarget } from '@/types/reminders'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { activityBackend, progressFixture } from '../helpers/activityBackend'
import { renderApp } from '../helpers/renderApp'
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
    props: {
      reminder,
      target,
      relativeAvailable: true,
      timezone: 'Europe/Kyiv',
      errors: {},
      busy: false,
    },
  })
}
describe('Reminder contracts and input boundaries', () => {
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
    expect(wrapper.text()).toContain('збережена історія')
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
})
describe('Calendar report validation and authoritative metrics', () => {
  it('shows all reports as sections with period metrics, without tabs, presets or lifetime detail', async () => {
    const backend = activityBackend()
    const { wrapper } = await renderApp('/statistics', backend)
    const metrics = Object.fromEntries(
      wrapper
        .findAll('[aria-label="Огляд прогресу за період"] .progress-metric')
        .map((row) => [row.get('dt').text(), row.get('dd').text()]),
    )
    expect(metrics).toEqual({
      'Ще заплановано': '30 хв',
      'Записаний фактичний час': '25 хв',
      'Завершені сесії': '2',
      'Пропущені сесії': '1',
      'Завершені завдання': '5',
      'Завершені підзавдання': '2',
    })
    expect(wrapper.findAll('.progress-page h2').map((title) => title.text())).toEqual([
      'Огляд прогресу',
      'Статистика за предметами',
      'Тренди',
      'Порівняння періодів',
    ])
    expect(
      wrapper.findAll(
        '.progress-page details, .progress-page table, .progress-page [role="tab"], .progress-page .section-nav',
      ),
    ).toHaveLength(0)
    for (const text of [
      'Останні сім днів',
      'Поточний тиждень',
      'Поточний стан роботи — за весь час',
      'Докладніше',
    ])
      expect(wrapper.text()).not.toContain(text)
    expect(wrapper.get('.unknown-time').text()).toContain('без записаного часу: 1')
    expect(backend.requests.filter((r) => r.path.startsWith('/api/statistics/'))).toHaveLength(3)
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  })
  it('paginates subjects without changing the full donut and resets after a period refresh', async () => {
    const backend = activityBackend(),
      report = progressFixture()
    report.subject_workload_in_period = Array.from({ length: 7 }, (_, i) => ({
      ...report.subject_workload_in_period[0]!,
      subject_id: i + 1,
      subject_name: `Предмет ${i + 1}`,
    }))
    backend.progressOverride = report
    const { wrapper } = await renderApp('/statistics', backend)
    expect(wrapper.findAll('.subject-workload')).toHaveLength(5)
    expect(wrapper.get('.donut-total strong').text()).toBe('420')
    await click(wrapper, 'Наступна')
    expect(wrapper.findAll('.subject-workload')).toHaveLength(2)
    expect(wrapper.get('.subject-workload h3').text()).toBe('Предмет 6')
    expect(wrapper.get('.donut-total strong').text()).toBe('420')
    await wrapper.get('.report-range-form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.subject-workload h3').text()).toBe('Предмет 1')
  })
})
describe('F6 mutation uncertainty and stale-read regressions', () => {
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
})
