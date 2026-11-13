import { describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { renderApp } from './helpers/renderApp'
import { planningBackend, sessionFixture } from './helpers/planningBackend'
import ReplanningReport from '@/components/planning/ReplanningReport.vue'
import type { ReplanningResult } from '@/types/planning'

async function click(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === text)
  expect(button, text).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}
function many(backend: ReturnType<typeof planningBackend>) {
  const source = backend.replan.session_results[0]!
  backend.replan.session_results = Array.from({ length: 7 }, (_, index) => ({
    ...source,
    study_session_id: index + 11,
    ...(index === 6
      ? {
          replacement: null,
          untransferred_seconds: 3600,
          replacement_reason_codes: ['no_replacement_capacity'],
        }
      : {}),
  }))
  backend.replan.warnings = []
  Object.assign(backend.replan.summary, {
    inspected_sessions: 7,
    affected_sessions: 7,
    valid_sessions: 0,
    cannot_replan_sessions: 0,
    proposed_replacements: 6,
    unplaced_sessions: 1,
    partial_replacements: 6,
    original_affected_seconds: 25200,
    replacement_seconds: 10800,
    untransferred_seconds: 14400,
  })
  return backend
}
async function preview(backend = planningBackend()) {
  const app = await renderApp('/planning/replanning', backend)
  await click(app.wrapper, 'Перевірити план')
  return app
}
describe('Period replanning page', () => {
  it('prefills dates without previewing, submits one whole-period request with no session or work scope', async () => {
    const backend = planningBackend()
    backend.failure = { path: /work-options$/, method: 'GET', status: 500 }
    const { wrapper } = await renderApp(
      '/planning/replanning?start_date=2026-11-09&end_date=2026-11-15&task_id=42&study_session_id=1',
      backend,
    )
    expect(wrapper.findAll('form input')).toHaveLength(2)
    expect(wrapper.find('select, [role="combobox"]').exists()).toBe(false)
    expect(
      wrapper
        .findAll('input[type="date"]')
        .map((field) => (field.element as HTMLInputElement).value),
    ).toEqual(['2026-11-09', '2026-11-15'])
    expect(backend.requests.some((request) => request.method === 'POST')).toBe(false)
    await click(wrapper, 'Перевірити план')
    expect(
      backend.requests
        .filter((request) => request.method === 'POST')
        .map(({ path, body }) => ({ path, body })),
    ).toEqual([
      {
        path: '/api/planning/replanning/preview',
        body: { start_date: '2026-11-09', end_date: '2026-11-15', task_id: null, subtask_id: null },
      },
    ])
    expect(
      backend.requests.some((request) => /study-sessions\/\d|work-options/.test(request.path)),
    ).toBe(false)
    expect(backend.sessions).toEqual([])
    expect(wrapper.get('.replanning-period').text()).toContain('2026-11-02 — 2026-11-08')
    expect(wrapper.text()).toContain('Ще не збережено')
    expect(wrapper.text()).not.toContain('Зміни збережено')
    expect(wrapper.html()).not.toContain('opaqueReplanToken')
  })
  it('keeps period validation and sends no preview for a range longer than 31 days', async () => {
    const { wrapper, backend } = await renderApp('/planning/replanning', planningBackend())
    await wrapper.findAll('input[type="date"]')[0]!.setValue('2026-11-01')
    await wrapper.findAll('input[type="date"]')[1]!.setValue('2026-12-02')
    await click(wrapper, 'Перевірити план')
    expect(wrapper.get('.field-error').text()).toContain('31')
    expect(backend.requests.some((request) => request.method === 'POST')).toBe(false)
  })
  it('shows a clean period without empty change cards or confirmation', async () => {
    const backend = planningBackend()
    backend.replan.session_results = []
    Object.assign(backend.replan.summary, {
      affected_sessions: 0,
      cannot_replan_sessions: 0,
      no_changes_needed: true,
    })
    backend.replan.warnings = []
    const { wrapper } = await preview(backend)
    expect(wrapper.text()).toContain('У цьому періоді нічого переносити не потрібно')
    expect(wrapper.find('.replanning-changes').exists()).toBe(false)
    expect(wrapper.find('.replanning-decision').exists()).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'Підтвердити зміни')).toBe(
      false,
    )
  })
  it('distinguishes missing replacements from a clean period and keeps cancellation consents visible', async () => {
    const backend = planningBackend()
    backend.replan.session_results = [backend.replan.session_results[1]!]
    Object.assign(backend.replan.summary, {
      affected_sessions: 1,
      proposed_replacements: 0,
      unplaced_sessions: 1,
      partial_replacements: 0,
      untransferred_seconds: 3600,
      cannot_replan_sessions: 0,
    })
    const { wrapper } = await preview(backend)
    expect(wrapper.text()).toContain('Проблеми є, але нового часу не знайдено')
    expect(wrapper.text()).not.toContain('У цьому періоді нічого переносити не потрібно')
    expect(wrapper.get('.replanning-source').text()).toContain('Без нового часу: 60 хв')
    expect(wrapper.get('.replanning-decision').findAll('input[type="checkbox"]')).toHaveLength(2)
  })
  it('keeps sessions requiring a manual decision distinct from a clean period', async () => {
    const backend = planningBackend()
    backend.replan.session_results = [backend.replan.session_results[3]!]
    Object.assign(backend.replan.summary, {
      affected_sessions: 0,
      proposed_replacements: 0,
      unplaced_sessions: 0,
      partial_replacements: 0,
      untransferred_seconds: 0,
      no_changes_needed: true,
    })
    const { wrapper } = await preview(backend)
    expect(wrapper.text()).not.toContain('У цьому періоді нічого переносити не потрібно')
    expect(wrapper.get('.replanning-source').text()).toContain('Потрібне ручне рішення')
    expect(wrapper.find('.replanning-source a[href="/planning/sessions/4"]').exists()).toBe(true)
    expect(wrapper.findAll('button').some((button) => button.text() === 'Підтвердити зміни')).toBe(
      false,
    )
  })
  it('groups every split interval under its source and removes repeated source warnings only', async () => {
    const backend = planningBackend(),
      source = backend.replan.session_results[0]!
    source.replacements = [
      source.replacement!,
      {
        ...source.replacement!,
        starts_at: '2026-11-04T09:00:00Z',
        ends_at: '2026-11-04T09:30:00Z',
      },
    ]
    backend.replan.session_results = [source]
    backend.replan.warnings = [
      { code: 'lesson_overlap', study_session_id: 1 },
      { code: 'missing_estimate', task_id: 2 },
      { reason_codes: ['lesson_overlap', 'deadline_expired'], study_session_id: 1 },
    ]
    const { wrapper } = await preview(backend)
    expect(wrapper.findAll('.replanning-changes .replanning-source')).toHaveLength(1)
    expect(wrapper.findAll('.replanning-source .replanning-intervals li')).toHaveLength(2)
    expect(wrapper.get('.replanning-source').text()).toContain('Поділ на 2 сесії')
    expect(wrapper.get('.replanning-warnings').text()).not.toContain('Перетинається')
    expect(wrapper.get('.replanning-warnings').text()).toContain('Не вказано потрібний час')
    expect(wrapper.get('.replanning-warnings').text()).toContain('Дедлайн уже минув')
    expect(wrapper.get('.replanning-decision').text()).toContain('погоджуюся на поділ')
  })
  it('confirms the whole proposal from page two without hiding independent consent controls', async () => {
    const backend = many(planningBackend()),
      { wrapper } = await preview(backend)
    expect(wrapper.findAll('.replanning-changes .replanning-source')).toHaveLength(5)
    await click(wrapper, 'Наступна')
    expect(wrapper.findAll('.replanning-changes .replanning-source')).toHaveLength(2)
    expect(wrapper.find('a[href="/planning/sessions/16"]').exists()).toBe(true)
    expect(wrapper.get('.replanning-decision').text()).toContain(
      'Підтвердження застосує всю пропозицію',
    )
    expect(wrapper.find('.replanning-changes input[type="checkbox"]').exists()).toBe(false)
    for (const checkbox of wrapper.get('.replanning-decision').findAll('input[type="checkbox"]'))
      await checkbox.setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    const requests = backend.requests.filter((request) => request.path.endsWith('/confirm'))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.body).toEqual({
      preview_token: 'opaqueReplanToken==',
      accept_partial: true,
      accept_unplaced_cancellation: true,
    })
    expect(wrapper.text()).toContain('Зміни збережено')
    expect(wrapper.find('.replanning-decision').exists()).toBe(false)
    expect(wrapper.get('.replanning-saved-actions a').text()).toBe('Навчальні сесії')
  })
  it.each([409, 422])('retains stale/expired confirmation handling (%s)', async (status) => {
    const { wrapper, backend } = await preview()
    backend.failure = { path: /confirm$/, method: 'POST', status }
    for (const checkbox of wrapper.findAll('input[type="checkbox"]')) await checkbox.setValue(true)
    await click(wrapper, 'Підтвердити зміни')
    expect(wrapper.find('.replanning-saved-summary').exists()).toBe(false)
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'Підтвердити зміни')!
        .attributes('disabled'),
    ).toBeDefined()
    await click(wrapper, 'Підтвердити зміни')
    expect(backend.requests.filter((request) => request.path.endsWith('/confirm'))).toHaveLength(1)
  })
})

describe('Saved replanning presentation', () => {
  async function saved(result: ReplanningResult) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/planning/replanning')
    return mount(ReplanningReport, {
      props: { result, timezone: 'Europe/Kyiv' },
      global: { plugins: [router] },
    })
  }
  it('uses persisted successor groups, times and remainder rather than preview values', async () => {
    const wrapper = await saved({
      applied: true,
      original_sessions: [
        { id: 1, status: 'rescheduled' },
        { id: 2, status: 'cancelled' },
      ],
      replacement_sessions: [
        {
          ...sessionFixture(99),
          starts_at: '2026-11-19T22:30:00Z',
          ends_at: '2026-11-19T23:00:00Z',
          duration_seconds: 1800,
        },
      ],
      replacement_groups: [{ original_session_id: 1, successor_session_ids: [99] }],
      summary: { untransferred_seconds: 900 },
    })
    expect(wrapper.get('.replanning-saved-dates').text()).toContain('2026-11-20 — 2026-11-20')
    const sources = wrapper.findAll('.replanning-saved-changes .replanning-source')
    expect(sources[0]!.get('a[href="/planning/sessions/99"]').text()).toContain('00:30')
    expect(sources[1]!.text()).toContain('Скасовано без заміни')
    expect(wrapper.get('.replanning-saved-remainder').text()).toContain('Без нового часу: 15 хв')
    expect(wrapper.get('.replanning-saved-actions a').attributes('href')).toBe(
      '/planning/sessions?start_date=2026-11-20&end_date=2026-11-20',
    )
    expect(wrapper.find('.replanning-created').exists()).toBe(false)
  })
  it('shows cancellation without replacement separately from any created sessions', async () => {
    const wrapper = await saved({
      applied: true,
      original_sessions: [{ id: 2, status: 'cancelled' }],
      replacement_sessions: [],
      replacement_groups: [],
      summary: { untransferred_seconds: 3600 },
    })
    expect(wrapper.text()).toContain('Нових сесій не створено')
    expect(wrapper.text()).toContain('Без нового часу: 60 хв')
    expect(wrapper.find('.replanning-saved-dates').exists()).toBe(false)
    expect(wrapper.get('.replanning-saved-actions a').attributes('href')).toBe('/planning/sessions')
  })
  it('does not guess successor associations when a legacy response omits groups', async () => {
    const wrapper = await saved({
      applied: true,
      original_sessions: [{ id: 1, status: 'rescheduled' }],
      replacement_sessions: [sessionFixture(99)],
      summary: { untransferred_seconds: 0 },
    })
    expect(wrapper.find('.replanning-created a[href="/planning/sessions/99"]').exists()).toBe(true)
    expect(wrapper.find('.replanning-saved-remainder').exists()).toBe(false)
  })
})
