import WorkPicker from '@/components/planning/WorkPicker.vue'
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { json } from '../fixtures'
import { planningBackend } from '../helpers/planningBackend'
import { renderApp } from '../helpers/renderApp'
async function click(wrapper: VueWrapper, text: string) {
  await (wrapper.find('dialog').exists() ? wrapper.get('dialog') : wrapper)
    .findAll('button')
    .find((b) => b.text() === text)!
    .trigger('click')
  await flushPromises()
}
async function review(path = '/planning/preview', backend = planningBackend()) {
  const app = await renderApp(path, backend)
  await click(
    app.wrapper,
    path === '/planning/recovery'
      ? 'Знайти час для невиконаної роботи'
      : path.startsWith('/planning/replanning')
        ? 'Перевірити план'
        : 'Створити огляд',
  )
  return app
}
async function pick(wrapper: VueWrapper, id: string, value: number | null) {
  const picker = wrapper.findAllComponents(WorkPicker).find((picker) => picker.props('id') === id)!
  picker.vm.$emit('update:modelValue', value)
  await flushPromises()
}
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
    await wrapper.get('[aria-label^="Редагувати: Неділя"]').trigger('click')
    await wrapper.get('#availability-start').setValue('21:30:00')
    await wrapper.get('dialog form').trigger('submit')
    await flushPromises()
    expect(backend.windows[0]?.starts_at).toBe('21:30:00')
    await wrapper.get('[aria-label^="Видалити: Неділя"]').trigger('click')
    await click(wrapper, 'Скасувати')
    expect(backend.requests.some((r) => r.method === 'DELETE')).toBe(false)
    await wrapper.get('[aria-label^="Видалити: Неділя"]').trigger('click')
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
    expect(wrapper.text()).toContain('час початку: перевірте введене значення.')
    expect(wrapper.text()).not.toContain('Інтервали перетинаються.')
    expect(wrapper.find('dialog').exists()).toBe(true)
    expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(1)
  })
})
describe('Free slots and direct plan confirmations', () => {
  it('queries bounded local dates, omits blank minimum and renders empty and real slots', async () => {
    const backend = planningBackend(),
      { wrapper } = await renderApp('/planning/free-time', backend)
    expect(wrapper.text()).toContain('Для автоматичного планування ще не визначено доступний час')
    expect(wrapper.text()).not.toContain('Вільних інтервалів немає')
    expect(
      backend.requests.filter((r) => r.path === '/api/planning/free-slots').at(-1)?.search,
    ).not.toContain('min_slot_minutes')
    backend.windows = [{ id: 1, day_of_week: 1, starts_at: '09:00:00', ends_at: '10:00:00' }]
    await wrapper.get('#slot-min').setValue('30')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(
      backend.requests.filter((r) => r.path === '/api/planning/free-slots').at(-1)?.search,
    ).toContain('min_slot_minutes=30')
    expect(wrapper.text()).toContain('60 хв')
    expect(wrapper.text()).toContain('дедлайни, перерви та ліміти')
  })
  it('requires deliberate partial consent, hides token and shows persisted sessions', async () => {
    const { wrapper, backend } = await review()
    expect(wrapper.text()).toContain('Залишилося без часу')
    expect(wrapper.text()).toContain('Не вказано оцінку тривалості роботи')
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
    await vi.waitFor(() => expect(wrapper.text()).toContain('Новий план збережено.'))
    await vi.waitFor(() =>
      expect(wrapper.findAll('a').map((a) => a.attributes('href')?.split('?')[0])).toContain(
        '/planning/sessions/20',
      ),
    )
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
    await pick(wrapper, 'scope-task', 1)
    await flushPromises()
    await pick(wrapper, 'scope-subtask', 4)
    await click(wrapper, 'Створити огляд')
    expect(backend.requests.find((r) => r.path.endsWith('/preview'))?.body).toMatchObject({
      task_id: 1,
      subtask_id: 4,
    })
    await pick(wrapper, 'scope-task', null)
    await flushPromises()
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
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
    expect(wrapper.text()).toContain('Час залишається без змін')
    expect(wrapper.text()).toContain('Потребують ручного рішення: 1')
    expect(wrapper.text()).toContain('90 хв')
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
    await vi.waitFor(() => expect(wrapper.text()).toContain('Перепланування збережено.'))
    expect(
      backend.requests.some((r) => r.path === '/api/study-sessions' && r.method === 'GET'),
    ).toBe(true)
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
    await vi.waitFor(() => expect(wrapper.text()).toContain('Новий план збережено.'))
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
  it('does not turn a successful confirmation into failure when refresh fails', async () => {
    const backend = planningBackend(),
      { wrapper } = await review('/planning/preview', backend)
    backend.failure = { path: /study-sessions$/, method: 'GET', status: 503 }
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Новий план збережено.'))
    expect(wrapper.text()).toContain('Сервіс тимчасово недоступний.')
    expect(backend.requests.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(1)
  })
})
describe('Explicit split review consent', () => {
  it('keeps confirmation blocked until all replacements have been accepted', async () => {
    const backend = planningBackend()
    const row = backend.replan.session_results[0]!
    row.replacement = null
    row.replacements = [9, 14].map((hour) => ({
      starts_at: `2026-11-09T${String(hour).padStart(2, '0')}:00:00Z`,
      ends_at: `2026-11-09T${String(hour + 1).padStart(2, '0')}:00:00Z`,
      duration_seconds: 3600,
    }))
    row.untransferred_seconds = 0
    backend.replan.session_results = [row]
    Object.assign(backend.replan.summary, {
      unplaced_sessions: 0,
      partial_replacements: 0,
      proposed_replacements: 2,
      affected_sessions: 1,
      untransferred_seconds: 0,
    })
    const { wrapper } = await review('/planning/replanning', backend)
    const confirm = () => wrapper.findAll('button').find((b) => b.text() === 'Підтвердити зміни')!
    expect(confirm().attributes('disabled')).toBeDefined()
    expect(backend.requests.filter((r) => r.path.endsWith('/confirm'))).toHaveLength(0)
    await wrapper.get('input[type="checkbox"]').setValue(true)
    expect(confirm().attributes('disabled')).toBeUndefined()
    await confirm().trigger('click')
    await flushPromises()
    expect(
      backend.requests.find((r) => r.path.endsWith('/replanning/confirm'))?.body
        .accept_split_replacements,
    ).toBe(true)
  })
})
