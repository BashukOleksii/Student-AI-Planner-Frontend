import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { planningBackend, sessionFixture } from './helpers/planningBackend'
import {
  canonicalWallTime,
  nullableMinutes,
  validateRange,
  exactDateTime,
  reviewValue,
} from '@/utils/planning'
import { planningApi } from '@/api/planning'
import { studySessionsApi } from '@/api/studySessions'
import { json } from './fixtures'
import type { VueWrapper } from '@vue/test-utils'
async function click(wrapper: VueWrapper, text: string) {
  await (wrapper.find('dialog').exists() ? wrapper.get('dialog') : wrapper)
    .findAll('button')
    .find((b) => b.text() === text)!
    .trigger('click')
  await flushPromises()
}
async function review(path = '/planning/preview', backend = planningBackend()) {
  const app = await renderApp(path, backend)
  await click(app.wrapper, 'Створити огляд')
  return app
}
describe('Planning input and timezone contracts', () => {
  it.each(['', '0', '-1', '1.5', '01', '65536', 'true'])(
    'validates optional integer %s',
    (value) => {
      if (value === '') expect(nullableMinutes(value)).toBeNull()
      else expect(() => nullableMinutes(value)).toThrow()
    },
  )
  it('accepts exact bounds and a 31-date period across DST', () => {
    expect(nullableMinutes('65535')).toBe(65535)
    expect(() => validateRange({ start_date: '2026-10-01', end_date: '2026-10-31' })).not.toThrow()
  })
  it.each([
    ['2026-10-01', '2026-11-01'],
    ['2026-11-02', '2026-11-01'],
    ['2026-02-30', '2026-03-01'],
    ['2026-1-01', '2026-01-01'],
  ])('rejects invalid range %s %s', (start_date, end_date) => {
    expect(() => validateRange({ start_date, end_date })).toThrow()
  })
  it('preserves recurring wall time and permits 24:00 only as end', () => {
    expect(canonicalWallTime('09:15')).toBe('09:15:00')
    expect(canonicalWallTime('24:00:00', true)).toBe('24:00:00')
    expect(() => canonicalWallTime('24:00:00')).toThrow()
    expect(() => canonicalWallTime('24:00:01', true)).toThrow()
  })
  it('shows repeated local times with distinct UTC offsets and exact seconds', () => {
    const a = exactDateTime('2026-10-25T00:30:10Z', 'Europe/Kyiv'),
      b = exactDateTime('2026-10-25T01:30:10Z', 'Europe/Kyiv')
    expect(a).not.toBe(b)
    expect(a).toContain(':10')
  })
  it('strips protected tokens at every display depth and escapes text through Vue', () => {
    expect(
      reviewValue({
        preview_token: 'secret',
        nested: { preview_token: 'secret', text: '<script>bad</script>' },
      }),
    ).toEqual({ nested: { text: '<script>bad</script>' } })
  })
})
describe('Preferences and availability', () => {
  it('loads all-null preferences, sends all five numeric keys and clears them', async () => {
    const backend = planningBackend()
    const { wrapper } = await renderApp('/planning/preferences', backend)
    expect(wrapper.findAll('input').every((input) => input.element.value === '')).toBe(true)
    await wrapper.get('#max_daily_study_minutes').setValue('120')
    await wrapper.get('#max_weekly_study_minutes').setValue('600')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.method === 'PUT')?.body).toEqual({
      max_daily_study_minutes: 120,
      max_weekly_study_minutes: 600,
      preferred_break_minutes: null,
      min_session_minutes: null,
      max_session_minutes: null,
    })
    await wrapper.get('#max_daily_study_minutes').setValue('')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.preferences.max_daily_study_minutes).toBeNull()
    expect(wrapper.text()).toContain('Вподобання збережено')
  })
  it.each([
    ['min_session_minutes', 'max_session_minutes', 'Максимальна сесія'],
    ['max_daily_study_minutes', 'max_weekly_study_minutes', 'Тижневий ліміт'],
  ])('rejects inconsistent %s and %s', async (a, b, message) => {
    const backend = planningBackend()
    const { wrapper } = await renderApp('/planning/preferences', backend)
    await wrapper.get(`#${a}`).setValue('60')
    await wrapper.get(`#${b}`).setValue('30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain(message)
    expect(backend.requests.some((r) => r.method === 'PUT')).toBe(false)
  })
  it('renders field-level backend errors without hiding values', async () => {
    const backend = planningBackend()
    backend.failure = {
      method: 'PUT',
      path: /planning-preferences$/,
      status: 422,
      fields: { max_daily_study_minutes: ['Значення не дозволено.'] },
    }
    const { wrapper } = await renderApp('/planning/preferences', backend)
    await wrapper.get('#max_daily_study_minutes').setValue('60')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#max_daily_study_minutes').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Значення не дозволено.')
  })
  it('creates Sunday local availability through midnight, edits and confirms deletion', async () => {
    const backend = planningBackend()
    const { wrapper } = await renderApp('/planning/availability', backend)
    await click(wrapper, 'Додати інтервал')
    await wrapper.get('#availability-day').setValue('7')
    await wrapper.get('#availability-start').setValue('22:00:00')
    await wrapper.get('#availability-end').setValue('24:00:00')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(backend.requests.find((r) => r.method === 'POST')?.body).toEqual({
      day_of_week: 7,
      starts_at: '22:00:00',
      ends_at: '24:00:00',
    })
    expect(wrapper.text()).toContain('Неділя')
    await wrapper.get('[aria-label="Редагувати інтервал 20"]').trigger('click')
    await wrapper.get('#availability-start').setValue('21:30:00')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(backend.windows[0]?.starts_at).toBe('21:30:00')
    await wrapper.get('[aria-label="Видалити інтервал 20"]').trigger('click')
    await click(wrapper, 'Скасувати')
    expect(backend.requests.some((r) => r.method === 'DELETE')).toBe(false)
    await wrapper.get('[aria-label="Видалити інтервал 20"]').trigger('click')
    await click(wrapper, 'Видалити')
    expect(backend.windows).toEqual([])
    expect(wrapper.text()).toContain('Інтервал видалено')
  })
  it('rejects overnight and displays authoritative overlap refusal without retry', async () => {
    const backend = planningBackend(),
      { wrapper } = await renderApp('/planning/availability', backend)
    await click(wrapper, 'Додати інтервал')
    await wrapper.get('#availability-start').setValue('23:00:00')
    await wrapper.get('#availability-end').setValue('01:00:00')
    await wrapper.get('dialog form').trigger('submit')
    expect(wrapper.text()).toContain('двох днів')
    expect(backend.requests.some((r) => r.method === 'POST')).toBe(false)
    await wrapper.get('#availability-end').setValue('24:00:00')
    backend.failure = {
      method: 'POST',
      path: /windows$/,
      status: 422,
      fields: { starts_at: ['Інтервали перетинаються.'] },
    }
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Інтервали перетинаються.')
    expect(wrapper.find('dialog').exists()).toBe(true)
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(1)
  })
})
describe('Free slots and direct plan confirmations', () => {
  it('queries bounded local dates, omits blank minimum and renders empty and real slots', async () => {
    const backend = planningBackend(),
      { wrapper } = await renderApp('/planning/free-time', backend)
    expect(wrapper.text()).toContain('Вільних інтервалів немає')
    expect(backend.requests.at(-1)?.search).not.toContain('min_slot_minutes')
    backend.windows = [{ id: 1, day_of_week: 1, starts_at: '09:00:00', ends_at: '10:00:00' }]
    await wrapper.get('#slot-min').setValue('30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.at(-1)?.search).toContain('min_slot_minutes=30')
    expect(wrapper.text()).toContain('60 хв')
    expect(wrapper.text()).toContain('не гарантує')
  })
  it('requires deliberate partial consent, hides token and shows persisted sessions', async () => {
    const { wrapper, backend } = await review()
    expect(wrapper.text()).toContain('Нерозміщена тривалість')
    expect(wrapper.text()).toContain('missing_estimate')
    expect(wrapper.text()).not.toContain('opaquePlanToken')
    expect(
      wrapper
        .findAll('input[type="checkbox"]')
        .every((i) => !(i.element as HTMLInputElement).checked),
    ).toBe(true)
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')
        ?.attributes('disabled'),
    ).toBeDefined()
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.requests.find((r) => r.path.endsWith('/confirm'))?.body).toEqual({
      preview_token: 'opaquePlanToken==',
      accept_partial: true,
    })
    expect(wrapper.text()).toContain('Збережений результат')
    expect(wrapper.find('a[href="/planning/sessions/20"]').exists()).toBe(true)
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.getItem('preview_token')).toBeNull()
  })
  it('sends selected parent/child numeric IDs and resets child on parent change', async () => {
    const backend = planningBackend()
    backend.base.children = [
      {
        id: 4,
        task_id: 1,
        title: 'Дослідження',
        description: null,
        deadline_at: null,
        estimated_minutes: 30,
        position: 1,
        status: 'pending',
        completed_at: null,
      },
    ]
    const { wrapper } = await renderApp('/planning/preview', backend)
    await wrapper.get('#scope-task').setValue('1')
    await flushPromises()
    await wrapper.get('#scope-subtask').setValue('4')
    await click(wrapper, 'Створити огляд')
    expect(backend.requests.find((r) => r.path.endsWith('/preview'))?.body).toMatchObject({
      task_id: 1,
      subtask_id: 4,
    })
    await wrapper.get('#scope-task').setValue('')
    await flushPromises()
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
  })
  it('does not offer confirmation for an empty plan', async () => {
    const backend = planningBackend()
    backend.plan.sessions = []
    const { wrapper } = await review('/planning/preview', backend)
    expect(wrapper.text()).toContain('Немає змін для підтвердження')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Підтвердити зміни')).toBe(false)
  })
  it.each([409, 422, 419])('invalidates %s failed confirmation without replay', async (status) => {
    const backend = planningBackend(),
      { wrapper } = await review('/planning/preview', backend)
    backend.failure = {
      method: 'POST',
      path: /confirm$/,
      status,
      fields: { preview_token: ['Огляд недійсний.'] },
    }
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.requests.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(1)
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')
        ?.attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).not.toContain('Збережений результат')
  })
  it('keeps consent validation recoverable with unchanged review', async () => {
    const backend = planningBackend(),
      { wrapper } = await review('/planning/preview', backend)
    backend.failure = {
      method: 'POST',
      path: /confirm$/,
      status: 422,
      fields: { accept_partial: ['Потрібна явна згода.'] },
    }
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(wrapper.text()).toContain('Потрібна явна згода.')
    expect(wrapper.text()).toContain('Пропозиція — ще не збережено')
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')
        ?.attributes('disabled'),
    ).toBeUndefined()
  })
  it('reconciles a lost response with GET but never automatically retries confirmation', async () => {
    const { wrapper, backend } = await review()
    const realFetch = globalThis.fetch
    let confirms = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        if (url.endsWith('/confirm')) {
          confirms++
          throw new TypeError('offline')
        }
        return realFetch(url, init)
      }),
    )
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(confirms).toBe(1)
    expect(wrapper.text()).toContain('Результат підтвердження не встановлено')
    expect(wrapper.text()).toContain('Поточні сесії перевірено')
    expect(backend.requests.some((r) => r.path === '/api/study-sessions')).toBe(true)
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')
        ?.attributes('disabled'),
    ).toBeDefined()
  })
})
describe('Adaptive review and independent acceptance', () => {
  it('renders every classification and cancellation, requires two independent unchecked flags', async () => {
    const { wrapper, backend } = await review('/planning/replanning')
    expect(wrapper.text()).toContain('Зберегти без змін')
    expect(wrapper.text()).toContain('Неможливо перепланувати')
    expect(wrapper.text()).toContain('5400')
    expect(wrapper.text()).toContain('без перенесення')
    const flags = wrapper.findAll('input[type="checkbox"]')
    expect(flags).toHaveLength(2)
    expect(flags.every((f) => !(f.element as HTMLInputElement).checked)).toBe(true)
    await flags[0]!.setValue(true)
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')
        ?.attributes('disabled'),
    ).toBeDefined()
    await flags[1]!.setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.requests.find((r) => r.path.endsWith('/confirm'))?.body).toEqual({
      preview_token: 'opaqueReplanToken==',
      accept_partial: true,
      accept_unplaced_cancellation: true,
    })
    expect(wrapper.text()).toContain('Збережений результат')
    expect(wrapper.text()).toContain('Скасовано сесій без нового місця')
  })
  it('preserves valid-only sources and offers no meaningless confirmation', async () => {
    const backend = planningBackend()
    backend.replan.summary.affected_sessions = 0
    backend.replan.summary.no_changes_needed = true
    const { wrapper } = await review('/planning/replanning', backend)
    expect(wrapper.text()).toContain('Немає змін для підтвердження')
  })
  it.each([409, 422])('blocks stale/expired adaptive token %s', async (status) => {
    const backend = planningBackend(),
      { wrapper } = await review('/planning/replanning', backend)
    backend.failure = { method: 'POST', path: /confirm$/, status }
    for (const input of wrapper.findAll('input[type="checkbox"]')) await input.setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.requests.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Збережений результат')
  })
})
describe('Session lifecycle and history', () => {
  it.each([
    ['Завершити сесію', 'complete', 'completed'],
    ['Позначити пропущеною', 'miss', 'missed'],
  ])('records %s and refreshes historical state', async (label, endpoint, status) => {
    const backend = planningBackend()
    backend.sessions = [sessionFixture()]
    const { wrapper } = await renderApp('/planning/sessions/1', backend)
    if (endpoint === 'complete') await wrapper.get('#actual-minutes').setValue('45')
    await click(wrapper, label)
    expect(backend.requests.find((r) => r.path.endsWith(`/${endpoint}`))?.body).toEqual(
      endpoint === 'complete' ? { actual_minutes: 45 } : {},
    )
    expect(backend.sessions[0]?.status).toBe(status)
    expect(wrapper.text()).toContain('Повторне відкриття')
    expect(wrapper.find('#actual-minutes').exists()).toBe(false)
  })
  it('omits actual duration when blank', async () => {
    const backend = planningBackend()
    backend.sessions = [sessionFixture()]
    const { wrapper } = await renderApp('/planning/sessions/1', backend)
    await click(wrapper, 'Завершити сесію')
    expect(backend.requests.find((r) => r.path.endsWith('/complete'))?.body).toEqual({})
  })
  it('requires cancellation confirmation and preserves cancelled history', async () => {
    const backend = planningBackend()
    backend.sessions = [sessionFixture()]
    const { wrapper } = await renderApp('/planning/sessions/1', backend)
    await click(wrapper, 'Скасувати сесію')
    await click(wrapper, 'Залишити сесію')
    expect(backend.requests.some((r) => r.path.endsWith('/cancel'))).toBe(false)
    await click(wrapper, 'Скасувати сесію')
    await click(wrapper, 'Підтвердити скасування')
    expect(backend.sessions[0]?.status).toBe('cancelled')
    expect(wrapper.text()).toContain('Скасовано')
  })
  it('reviews immediate rescheduling and sends canonical UTC in profile timezone', async () => {
    const backend = planningBackend()
    backend.sessions = [sessionFixture()]
    const { wrapper } = await renderApp('/planning/sessions/1', backend)
    await click(wrapper, 'Перенести сесію')
    await wrapper.get('#session-start').setValue('2026-11-03T11:00:00')
    await wrapper.get('#session-end').setValue('2026-11-03T11:15:00')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('негайна операція')
    await click(wrapper, 'Підтвердити перенесення')
    expect(backend.requests.find((r) => r.path.endsWith('/reschedule'))?.body).toEqual({
      starts_at: '2026-11-03T09:00:00Z',
      ends_at: '2026-11-03T09:15:00Z',
    })
    expect(wrapper.text()).toContain('Фактичний результат перенесення')
    expect(wrapper.text()).toContain('900')
    expect(backend.sessions[0]?.status).toBe('rescheduled')
  })
  it('rejects ambiguous DST time without sending a mutation', async () => {
    const backend = planningBackend()
    backend.sessions = [sessionFixture()]
    const { wrapper } = await renderApp('/planning/sessions/1', backend)
    await click(wrapper, 'Перенести сесію')
    await wrapper.get('#session-start').setValue('2026-10-25T03:30:00')
    await wrapper.get('#session-end').setValue('2026-10-25T04:30:00')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('повторюється')
    expect(backend.requests.some((r) => r.path.endsWith('/reschedule'))).toBe(false)
  })
  it('refreshes conflicts without retrying or marking success', async () => {
    const backend = planningBackend()
    backend.sessions = [sessionFixture()]
    backend.failure = { method: 'POST', path: /complete$/, status: 409 }
    const { wrapper } = await renderApp('/planning/sessions/1', backend)
    await click(wrapper, 'Завершити сесію')
    expect(wrapper.text()).toContain('Запит не повторювався')
    expect(backend.requests.filter((r) => r.path.endsWith('/complete'))).toHaveLength(1)
    expect(backend.sessions[0]?.status).toBe('planned')
  })
})
describe('HTTP integration contracts', () => {
  it('retains credentials, CSRF, envelopes and range metadata for all direct operations', async () => {
    document.cookie = 'XSRF-TOKEN=planning%2Bcsrf%3D'
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ data: [], meta: { timezone: 'Europe/Kyiv' } }),
    )
    vi.stubGlobal('fetch', fetch)
    await planningApi.freeSlots({ start_date: '2026-11-02', end_date: '2026-11-08' }, 30)
    await planningApi.preview({
      start_date: '2026-11-02',
      end_date: '2026-11-08',
      task_id: null,
      subtask_id: null,
    })
    await planningApi.confirm('opaque', false)
    await planningApi.replanConfirm('opaque2', false, false)
    await studySessionsApi.complete(1)
    await studySessionsApi.miss(1)
    await studySessionsApi.cancel(1)
    for (const [url, init] of fetch.mock.calls) {
      expect(init?.credentials).toBe('include')
      if (init?.method !== 'GET')
        expect(new Headers(init?.headers).get('X-XSRF-TOKEN')).toBe('planning+csrf=')
      expect(url).not.toContain('preview_token')
    }
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
      preview_token: 'opaque',
      accept_partial: false,
    })
    expect(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).toEqual({
      preview_token: 'opaque2',
      accept_partial: false,
      accept_unplaced_cancellation: false,
    })
  })
})

describe('Planning concurrency and recovery regressions', () => {
  it('prevents duplicate direct confirmations while the original request is unresolved', async () => {
    const { wrapper, backend } = await review()
    const original = globalThis.fetch
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let confirmations = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/confirm')) {
          confirmations++
          await held
        }
        return original(url, init)
      }),
    )
    await wrapper.get('input[type="checkbox"]').setValue(true)
    const confirm = wrapper.findAll('button').find((b) => b.text() === 'Підтвердити зміни')!
    await confirm.trigger('click')
    await confirm.trigger('click')
    expect(confirm.attributes('disabled')).toBeDefined()
    expect(confirm.attributes('aria-busy')).toBe('true')
    expect(confirmations).toBe(1)
    release()
    await flushPromises()
    expect(backend.requests.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(1)
    expect(wrapper.text()).toContain('Збережений результат')
  })
  it('aborts an abandoned preview and ignores its eventual response', async () => {
    const backend = planningBackend(),
      { wrapper } = await renderApp('/planning/preview', backend)
    const original = globalThis.fetch
    let signal: AbortSignal | undefined, resolve!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith('/preview')) {
          signal = init?.signal ?? undefined
          return new Promise<Response>((r) => {
            resolve = r
          })
        }
        return original(url, init)
      }),
    )
    await wrapper.get('form').trigger('submit')
    expect(signal?.aborted).toBe(false)
    wrapper.unmount()
    expect(signal?.aborted).toBe(true)
    resolve(json({ data: backend.plan }))
    await flushPromises()
    expect(sessionStorage.length).toBe(0)
    expect(backend.requests.some((r) => r.path.endsWith('/confirm'))).toBe(false)
  })
  it('sends a full allocation with false consent and no adaptive-only fields', async () => {
    const backend = planningBackend()
    backend.plan.summary = {
      requested_seconds: 1800,
      allocated_seconds: 1800,
      unscheduled_seconds: 0,
      fully_allocated: true,
    }
    const { wrapper } = await review('/planning/preview', backend)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.requests.find((r) => r.path.endsWith('/confirm'))?.body).toEqual({
      preview_token: 'opaquePlanToken==',
      accept_partial: false,
    })
  })
  it('recovers an uncertain adaptive confirmation through reads without replay', async () => {
    const { wrapper } = await review('/planning/replanning')
    const original = globalThis.fetch
    let writes = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.endsWith('/confirm')) {
          writes++
          return Promise.reject(new TypeError('lost response'))
        }
        return original(url, init)
      }),
    )
    for (const flag of wrapper.findAll('input[type="checkbox"]')) await flag.setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(writes).toBe(1)
    expect(wrapper.text()).toContain('Поточні сесії перевірено')
    expect(wrapper.text()).not.toContain('Збережений результат')
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Підтвердити зміни')
        ?.attributes('disabled'),
    ).toBeDefined()
  })
  it('does not turn a successful confirmation into failure when refresh fails', async () => {
    const backend = planningBackend(),
      { wrapper } = await review('/planning/preview', backend)
    backend.failure = { path: /study-sessions$/, method: 'GET', status: 503 }
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(wrapper.text()).toContain('Збережений результат')
    expect(wrapper.text()).toContain('Частину поточних даних не вдалося перевірити')
    expect(backend.requests.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(1)
  })
  it('does not query a malformed or overlong free-slot range', async () => {
    const backend = planningBackend(),
      { wrapper } = await renderApp('/planning/free-time', backend)
    const reads = backend.requests.filter((r) => r.path === '/api/planning/free-slots').length
    const dates = wrapper.findAll('input[type="date"]')
    await dates[0]!.setValue('2026-11-01')
    await dates[1]!.setValue('2026-12-02')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('31 календарного дня')
    expect(backend.requests.filter((r) => r.path === '/api/planning/free-slots')).toHaveLength(
      reads,
    )
  })
  it('preserves all historical lifecycle statuses in range reads', async () => {
    const backend = planningBackend()
    backend.sessions = ['planned', 'completed', 'missed', 'cancelled', 'rescheduled'].map(
      (status, id) => ({
        ...sessionFixture(id + 1),
        status: status as import('@/types/api').StudySession['status'],
      }),
    )
    const { wrapper } = await renderApp('/planning/sessions', backend)
    for (const label of ['Заплановано', 'Завершено', 'Пропущено', 'Скасовано', 'Перенесено'])
      expect(wrapper.text()).toContain(label)
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
  })
})
