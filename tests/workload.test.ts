import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { planningBackend, workloadFixture } from './helpers/planningBackend'
import { json } from './fixtures'
import { planningApi } from '@/api/planning'
import type { Resource } from '@/types/api'
import type { WorkloadAdvice } from '@/types/planning'
import { workloadReasonLabel, workloadRecommendation } from '@/utils/workload'

const path = '/planning/workload'
async function click(wrapper: VueWrapper, label: string) {
  await wrapper
    .findAll('button')
    .find((b) => b.text() === label)!
    .trigger('click')
  await flushPromises()
}
async function period(wrapper: VueWrapper, start = '2026-11-09', end = '2026-11-15') {
  const dates = wrapper.findAll('input[type="date"]')
  await dates[0]!.setValue(start)
  await dates[1]!.setValue(end)
  await flushPromises()
}
describe('Read-only workload advice', () => {
  it('uses an exact query-only authenticated GET and typed Resource envelope without preview fields', async () => {
    const response: Resource<WorkloadAdvice> = { data: workloadFixture() },
      controller = new AbortController(),
      fetch = vi.fn(async (_url: string, _options: RequestInit) => json(response))
    vi.stubGlobal('fetch', fetch)
    const range = {
      start_date: '2026-11-09',
      end_date: '2026-11-15',
      user_id: 5,
      task_id: 42,
      subtask_id: 7,
      timezone: 'UTC',
    }
    expectTypeOf<ReturnType<typeof planningApi.workloadAdvice>>().toEqualTypeOf<
      Promise<Resource<WorkloadAdvice>>
    >()
    expectTypeOf<
      Extract<keyof WorkloadAdvice, 'sessions' | 'preview_token' | 'expires_at'>
    >().toEqualTypeOf<never>()
    expect(await planningApi.workloadAdvice(range, controller.signal)).toEqual(response)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, options] = fetch.mock.calls[0]!
    expect(new URL(url).pathname).toBe('/api/planning/workload-advice')
    expect([...new URL(url).searchParams]).toEqual([
      ['start_date', '2026-11-09'],
      ['end_date', '2026-11-15'],
    ])
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    })
    expect(new Headers(options.headers).get('Accept')).toBe('application/json')
    expect(options.body).toBeUndefined()
  })
  it('shows authoritative partial totals once, preserves server order and distinguishes Tasks/Subtasks', async () => {
    const backend = planningBackend()
    backend.workload.work_advice.reverse()
    const { wrapper } = await renderApp(path, backend)
    expect(
      wrapper
        .get('.workload-summary')
        .findAll('dd:not(.metric-note)')
        .map((n) => n.text()),
    ).toEqual(['180 хв', '60 хв', '120 хв', '33%'])
    expect(wrapper.get('.coverage-ring').attributes('aria-label')).toContain('33%')
    const rows = wrapper.findAll('.workload-unplanned')
    expect(rows.slice(0, 2).map((row) => row.get('a').attributes('href'))).toEqual([
      '/tasks/9',
      '/tasks/42',
    ])
    expect(rows[1]!.text()).toContain('Підзавдання')
    expect(rows[1]!.text()).toContain('Денний ліміт замалий')
    expect(rows[1]!.get('details').text()).toContain('Замало часу у вибраному періоді')
    expect(wrapper.findAll('.workload-summary')).toHaveLength(1)
    expect(wrapper.text()).toContain('їхній час не додається')
    expect(wrapper.text()).not.toContain('математично неможливе')
  })
  it('keeps exclusions visible for fully allocated work and renders nullable effort as unknown', async () => {
    const backend = planningBackend()
    backend.workload.summary = {
      requested_seconds: 1800,
      allocated_seconds: 1800,
      unscheduled_seconds: 0,
      fully_allocated: true,
    }
    backend.workload.alerts = []
    const { wrapper } = await renderApp(path, backend)
    expect(wrapper.get('.coverage-copy').text()).toContain('Для цієї роботи часу вистачає')
    const excluded = wrapper
      .findAll('.workload-unplanned')
      .filter((row) => row.text().includes('Не вказано потрібний час'))
    expect(excluded).toHaveLength(2)
    expect(excluded.every((row) => row.text().includes('Час не вказано'))).toBe(true)
    expect(excluded[1]!.text()).toContain('Підзавдання')
    expect(wrapper.find('a[href="/tasks/88"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Це пропозиція')
  })
  it('shows zero eligible effort without a progress division, while preserving diagnostics', async () => {
    const backend = planningBackend()
    backend.workload.summary = {
      requested_seconds: 0,
      allocated_seconds: 0,
      unscheduled_seconds: 0,
      fully_allocated: true,
    }
    backend.workload.work_advice = []
    const { wrapper } = await renderApp(path, backend)
    expect(wrapper.get('.coverage-ring').text()).toContain('—')
    expect(wrapper.text()).toContain('Немає роботи для нового плану')
    expect(wrapper.findAll('.workload-unplanned')).toHaveLength(2)
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/)
  })
  it('separates the same allocation and persisted codes and labels days and ISO week-years literally', async () => {
    const backend = planningBackend()
    backend.workload.persisted_workload_violations[1]!.period = '2026-01'
    const { wrapper } = await renderApp(path, backend)
    expect(wrapper.get('[data-source="allocation"]').text()).toContain('Денний ліміт замалий')
    const measured = wrapper.get('[data-source="persisted_workload"]')
    expect(measured.text()).toContain('Перевищень лімітів: 2')
    expect(measured.findAll('.workload-limit strong').map((n) => n.text())).toEqual([
      'День 2026-11-10',
      'Тиждень 2026-01',
    ])
    expect(measured.text()).toContain('150 хв із 120 хв дозволених')
    expect(measured.text()).toContain('+30 хв')
    expect(measured.text()).toContain('660 хв із 600 хв дозволених')
    expect(measured.text()).toContain('+60 хв')
    expect(wrapper.get('[data-source="selection"]').text()).toContain('Час не вказано')
    expect(wrapper.get('[data-source="allocation"]').text()).toContain(
      'У плані більше часу, ніж потрібно',
    )
  })
  it('shows the selected period and offers only navigation and read refresh', async () => {
    const backend = planningBackend()
    backend.workload.timezone = 'Pacific/Honolulu'
    const { wrapper } = await renderApp(path, backend)
    await period(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.workload-freshness').text()).toContain('2026-11-09 — 2026-11-15')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.filter((r) => r.path.endsWith('/workload-advice'))).toHaveLength(3)
    expect(backend.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(wrapper.find('button[type="submit"]').text()).toBe('Проаналізувати навантаження')
    expect(wrapper.text()).not.toContain('Підтвердити зміни')
    expect(wrapper.html()).not.toMatch(/preview_token|expires_at|opaquePlanToken/)
    expect(backend.requests.some((r) => /preview|confirm/.test(r.path))).toBe(false)
    expect(backend.sessions).toEqual([])
  })
  it('localizes all known recommendations and allocation codes with safe future-code fallbacks', () => {
    for (const code of [
      'follow_planning_order',
      'review_planning_period',
      'consider_recovery_preview',
      'review_study_availability',
      'review_deadline',
      'review_study_limits',
      'review_session_duration',
      'review_break_preferences',
      'supply_estimated_effort',
    ]) {
      const advice = workloadRecommendation(code, 42)
      expect(advice.to).toBeTruthy()
      expect(advice.label).not.toContain(code)
    }
    for (const code of [
      'unscheduled_work',
      'no_available_study_time',
      'deadline_capacity_exhausted',
      'daily_study_limit_exceeded',
      'weekly_study_limit_exceeded',
      'below_minimum_session_duration',
      'above_maximum_session_duration',
      'outside_available_study_time',
      'overlapping_break_anchor',
      'insufficient_break_before',
      'insufficient_break_after',
      'deadline_exceeded',
      'planning_horizon_exhausted',
    ])
      expect(workloadReasonLabel(code)).not.toContain(code)
    expect(workloadRecommendation('future_code', 42)).toMatchObject({
      label: expect.stringContaining('Додаткова рекомендація'),
      to: undefined,
    })
    expect(workloadReasonLabel('future_code')).toContain('Додаткова умова обмежує планування')
  })
  it('renders unknown recommendations without guessing an action', async () => {
    const backend = planningBackend()
    backend.workload.work_advice[0]!.recommendation_codes = ['future_code']
    const { wrapper } = await renderApp(path, backend)
    expect(wrapper.text()).not.toContain('future_code')
    expect(wrapper.get('[data-source="selection"]').find('a[href="/tasks/42"]').exists()).toBe(true)
  })
  it('validates dates before GET and permits exactly 31 inclusive dates', async () => {
    const backend = planningBackend(),
      { wrapper } = await renderApp(path, backend)
    for (const [start, end] of [
      ['2026-11-09', '2026-12-10'],
      ['2026-11-15', '2026-11-09'],
    ]) {
      await period(wrapper, start, end)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.text()).toContain('Виберіть дійсний період від 1 до 31')
    }
    expect(backend.requests.filter((r) => r.path.endsWith('/workload-advice'))).toHaveLength(1)
    await period(wrapper, '2026-11-01', '2026-12-01')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(backend.requests.filter((r) => r.path.endsWith('/workload-advice'))).toHaveLength(2)
  })
  it.each([422, 500, 'network'] as const)(
    'replaces an old report with %s error and recovers via manual retry',
    async (failure) => {
      const backend = planningBackend(),
        { wrapper } = await renderApp(path, backend)
      const original = globalThis.fetch
      if (failure === 'network')
        vi.stubGlobal(
          'fetch',
          vi.fn(async (url: string, options?: RequestInit) => {
            if (url.includes('/workload-advice')) throw new TypeError('network lost')
            return original(url, options)
          }),
        )
      else
        backend.failure = {
          path: /workload-advice$/,
          method: 'GET',
          status: failure,
          fields: failure === 422 ? { end_date: ['Неприпустимий діапазон дат.'] } : {},
        }
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(wrapper.find('.workload-summary').exists()).toBe(false)
      if (failure === 422) expect(wrapper.text()).toContain('Неприпустимий діапазон дат.')
      vi.stubGlobal('fetch', original)
      await click(wrapper, 'Спробувати ще раз')
      expect(wrapper.find('.workload-summary').exists()).toBe(true)
    },
  )
  it('retains the authentication boundary for a 401 analysis response', async () => {
    const backend = planningBackend()
    backend.failure = { path: /workload-advice$/, method: 'GET', status: 401 }
    const { router, auth, wrapper } = await renderApp(path, backend)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(auth.user).toBeNull()
    expect(wrapper.find('.workload-analysis').exists()).toBe(false)
  })
  it('cancels an old read on date edits and never accepts its late response', async () => {
    const backend = planningBackend(),
      { wrapper } = await renderApp(path, backend),
      original = globalThis.fetch
    let resolve!: (value: Response) => void
    let oldSignal: AbortSignal | null | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes('/workload-advice')) {
          oldSignal = options?.signal
          return new Promise<Response>((done) => {
            resolve = done
          })
        }
        return original(url, options)
      }),
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Завантажуємо дані')
    expect(wrapper.find('.workload-summary').exists()).toBe(false)
    await period(wrapper, '2026-11-16', '2026-11-22')
    expect(oldSignal?.aborted).toBe(true)
    expect(wrapper.text()).toContain('Період змінено')
    vi.stubGlobal('fetch', original)
    backend.workload.summary.unscheduled_seconds = 60
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    resolve(json({ data: workloadFixture() }))
    await flushPromises()
    expect(wrapper.get('.workload-freshness').text()).toContain('2026-11-16 — 2026-11-22')
    expect(wrapper.get('.workload-summary').text()).toContain('1 хв')
    expect(wrapper.get('.workload-summary').text()).not.toContain('120 хв')
  })
  it('links the overview and Planning navigation to the protected analysis page', async () => {
    const { wrapper, router } = await renderApp('/planning')
    await wrapper.get('nav a[href="/planning/workload"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(path)
    expect(wrapper.get('h1').text()).toBe('Аналіз навчального навантаження')
  })
})

it('links exhausted step estimates to that step rather than the derived parent estimate', async () => {
  expect(workloadRecommendation('review_subtask_estimated_effort', 42, 7).to).toBe(
    '/tasks/42?subtask_id=7',
  )
  expect(workloadRecommendation('review_estimated_effort', 42).label).toContain(
    'Оновіть оцінку завдання',
  )
})
