import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { renderApp } from './helpers/renderApp'
import { planningBackend, sessionFixture } from './helpers/planningBackend'
import { json } from './fixtures'
import type { ProposedSession } from '@/types/planning'
import RecoverySessionList from '@/components/planning/RecoverySessionList.vue'

const path = '/planning/recovery'
const previewLabel = 'Знайти час для невиконаної роботи'
const button = (wrapper: Pick<VueWrapper, 'findAll'>, label: string) =>
  wrapper.findAll('button').find((item) => item.text() === label)!

async function preview(backend = planningBackend()) {
  const app = await renderApp(path, backend)
  await app.wrapper.get('form').trigger('submit')
  await flushPromises()
  return app
}
function sessions(count = 2): ProposedSession[] {
  return Array.from({ length: count }, (_, index) => {
    const start = Date.parse('2026-11-14T22:30:00Z') + index * 1800_000
    return {
      task_id: 1,
      subtask_id: null,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + 1800_000).toISOString(),
      duration_seconds: 1800,
    }
  })
}

describe('recovery page presentation', () => {
  it('keeps a compact initial form and validation while hiding unavailable subtask selection', async () => {
    const { wrapper } = await renderApp(`${path}?task_id=1`, planningBackend())
    expect(wrapper.findAll('form')).toHaveLength(1)
    expect(wrapper.findAll('input[type="date"]')).toHaveLength(2)
    expect(wrapper.find('#scope-task').exists()).toBe(true)
    expect(wrapper.find('#scope-subtask').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('У цього завдання немає підзавдань')
    expect(wrapper.text()).not.toContain('Оберіть роботу й період')
    expect(wrapper.text()).not.toContain('один до одного')
    expect(wrapper.text()).not.toContain('охоплює придатні')
    expect(wrapper.find('.recovery-plan-review').exists()).toBe(false)
    await wrapper.findAll('input[type="date"]')[1]!.setValue('1000-01-01')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(button(wrapper, previewLabel).exists()).toBe(true)
  })

  it('groups two November 15 sessions in review timezone and merges repeated outcome messages by session ID', async () => {
    const backend = planningBackend()
    backend.recovery.study_plan.sessions = sessions()
    backend.recovery.study_plan.summary = {
      requested_seconds: 3600,
      allocated_seconds: 3600,
      unscheduled_seconds: 0,
      fully_allocated: true,
    }
    const past = backend.recovery.recovery.past_planned_sessions[0]!
    backend.recovery.recovery.past_planned_sessions.push({ ...past })
    backend.recovery.study_plan.warnings.push(
      { ...backend.recovery.study_plan.warnings[0]! },
      { code: 'future_reservation_exceeds_remaining_work', task_id: 1, seconds: 600 },
    )
    const { wrapper, auth } = await preview(backend)
    auth.user!.timezone = 'UTC'
    await flushPromises()
    const proposed = wrapper.get('.recovery-new-sessions')
    expect(proposed.findAll('.recovery-date-group')).toHaveLength(1)
    expect(proposed.get('h3').text()).toContain('15 листопада')
    expect(proposed.get('h3 time').attributes('datetime')).toBe('2026-11-15')
    expect(proposed.findAll('.recovery-session-row')).toHaveLength(2)
    expect(proposed.text()).toContain('00:30 — 01:00')
    expect(proposed.text()).toContain('01:00 — 01:30')
    expect(proposed.text().match(/30 хв/g)).toHaveLength(2)
    expect(wrapper.findAll('a[href="/planning/sessions/92"]')).toHaveLength(1)
    expect(wrapper.get('.recovery-outcomes').text()).toContain('На сторінці сесії можна вказати')
    expect(wrapper.get('.recovery-other-warnings').text()).toContain(
      'У плані більше часу, ніж потрібно',
    )
    expect(wrapper.get('.recovery-plan-summary h2').text()).toBe('Пропозиція — ще не збережено')
    expect(wrapper.text()).not.toContain('Придатних до відновлення')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(button(wrapper, 'Підтвердити зміни').attributes('disabled')).toBeUndefined()
  })

  it('renders only the confirmed response period, timezone and actual sessions, keeping remaining work separate', async () => {
    const backend = planningBackend()
    backend.sessions = [{ ...sessionFixture(92), starts_at: '2026-11-07T09:00:00Z' }]
    const { wrapper } = await preview(backend)
    const original = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const response = await original(url, init)
        if (!url.endsWith('/study-plans/confirm')) return response
        const { data } = await response.json()
        return json({
          data: {
            ...data,
            start_date: '2026-11-17',
            end_date: '2026-11-18',
            timezone: 'UTC',
            sessions: [
              {
                ...sessionFixture(808),
                starts_at: '2026-11-17T12:00:00Z',
                ends_at: '2026-11-17T12:45:00Z',
                duration_seconds: 2700,
              },
            ],
            summary: {
              requested_seconds: 5400,
              allocated_seconds: 2700,
              unscheduled_seconds: 2700,
              fully_allocated: false,
            },
            work_results: [
              {
                task_id: 1,
                subtask_id: null,
                unscheduled_seconds: 2700,
                reason_codes: ['planning_horizon_exhausted'],
              },
            ],
          },
        })
      }),
    )
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await button(wrapper, 'Підтвердити зміни').trigger('click')
    await flushPromises()
    expect(wrapper.get('.recovery-plan-summary h2').text()).toBe('План збережено')
    expect(wrapper.get('.recovery-report-period').text()).toContain('2026-11-17 — 2026-11-18 · UTC')
    expect(wrapper.get('.recovery-new-sessions').text()).toContain('Додано до плану: 1')
    expect(wrapper.get('.recovery-new-sessions').text()).toContain('12:00 — 12:45')
    expect(wrapper.get('.recovery-new-sessions').text()).not.toContain('11:00 — 11:30')
    expect(wrapper.find('.recovery-new-sessions a[href="/planning/sessions/808"]').exists()).toBe(
      true,
    )
    expect(wrapper.get('.recovery-unplanned').text()).toContain('45 хв')
    expect(wrapper.get('.recovery-outcomes').findAll('.recovery-session-row')).toHaveLength(1)
    expect(wrapper.get('.recovery-outcomes').text()).toContain('09:00')
    expect(wrapper.text()).not.toContain('Запропоновано:')
    expect(wrapper.find('.recovery-decision').exists()).toBe(false)
    expect(wrapper.get('.recovery-saved-actions a').attributes('href')).toBe(
      '/planning/sessions?start_date=2026-11-17&end_date=2026-11-18',
    )
  })

  it('confirms the entire proposal from the second page while preserving partial consent', async () => {
    const backend = planningBackend()
    backend.recovery.study_plan.sessions = sessions(5)
    const original = structuredClone(backend.recovery.study_plan.sessions)
    const { wrapper } = await preview(backend)
    const list = wrapper.get('.recovery-new-sessions')
    await button(list, 'Наступна').trigger('click')
    expect(list.findAll('.recovery-session-row')).toHaveLength(2)
    expect(wrapper.get('.recovery-decision').text()).toContain(
      'Підтвердження застосує всю пропозицію',
    )
    expect(button(wrapper, 'Підтвердити зміни').attributes('disabled')).toBeDefined()
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await button(wrapper, 'Підтвердити зміни').trigger('click')
    await flushPromises()
    expect(backend.sessions.map(({ starts_at, ends_at }) => ({ starts_at, ends_at }))).toEqual(
      original.map(({ starts_at, ends_at }) => ({ starts_at, ends_at })),
    )
    expect(backend.requests.filter((row) => row.path.endsWith('/confirm'))).toHaveLength(1)
    expect(wrapper.get('.recovery-new-sessions').text()).toContain('Додано до плану: 5')
    expect(wrapper.get('.recovery-new-sessions').findAll('.recovery-session-row')).toHaveLength(3)
  })

  it('shows an empty proposal without empty history cards, expiry or a confirmation action', async () => {
    const backend = planningBackend()
    const plan = backend.recovery.study_plan
    plan.sessions = []
    plan.warnings = []
    plan.work_results = []
    plan.excluded_items = []
    plan.summary = {
      requested_seconds: 0,
      allocated_seconds: 0,
      unscheduled_seconds: 0,
      fully_allocated: true,
    }
    delete plan.preview_token
    delete plan.expires_at
    backend.recovery.recovery.past_planned_sessions = []
    backend.recovery.recovery.missed_sessions = []
    const { wrapper } = await preview(backend)
    expect(wrapper.get('.recovery-plan-summary').text()).toContain(
      'Немає нових сесій для відновлення',
    )
    expect(wrapper.find('.recovery-new-sessions').exists()).toBe(false)
    expect(wrapper.find('.recovery-outcomes').exists()).toBe(false)
    expect(wrapper.find('.recovery-other-warnings').exists()).toBe(false)
    expect(wrapper.find('.recovery-expiry').exists()).toBe(false)
    expect(wrapper.findAll('button').some((item) => item.text() === 'Підтвердити зміни')).toBe(
      false,
    )
    expect(wrapper.text()).not.toContain('План збережено')
    expect(wrapper.html()).not.toMatch(/NaN|Infinity|Invalid Date/)
  })

  it('keeps an expired or failed proposal unsaved and never replays confirmation', async () => {
    const backend = planningBackend()
    const { wrapper } = await preview(backend)
    backend.failure = {
      path: /study-plans\/confirm$/,
      method: 'POST',
      status: 422,
      fields: { preview_token: ['Строк огляду минув.'] },
    }
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await button(wrapper, 'Підтвердити зміни').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Строк огляду минув.')
    expect(wrapper.get('.recovery-plan-summary h2').text()).toBe('Пропозиція — ще не збережено')
    expect(button(wrapper, 'Підтвердити зміни').attributes('disabled')).toBeDefined()
    await button(wrapper, 'Підтвердити зміни').trigger('click')
    expect(backend.requests.filter((row) => row.path.endsWith('/confirm'))).toHaveLength(1)
    expect(backend.sessions).toHaveLength(0)
  })

  it('marks cross-midnight ends without repeating same-day dates', () => {
    const wrapper = mount(RecoverySessionList, {
      props: {
        sessions: [
          {
            ...sessions()[0]!,
            starts_at: '2026-11-15T21:45:00Z',
            ends_at: '2026-11-15T22:15:00Z',
            duration_seconds: 1800,
          },
        ],
        timezone: 'Europe/Kyiv',
        title: 'Запропоновані сесії',
      },
      global: { stubs: { WorkLink: true } },
    })
    expect(wrapper.get('h3 time').attributes('datetime')).toBe('2026-11-15')
    expect(wrapper.text()).toContain('23:45 — 00:15 (пн, 16 листопада)')
  })
})
