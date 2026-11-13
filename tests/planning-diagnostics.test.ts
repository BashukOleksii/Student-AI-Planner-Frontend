import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StudyProposal from '@/components/planning/StudyProposal.vue'
import { planningApi } from '@/api/planning'
import { vi } from 'vitest'
import { planningReasonLabel, reviewValue } from '@/utils/planning'

describe('Human planning diagnostics', () => {
  it.each([
    'no_available_study_time',
    'planning_horizon_exhausted',
    'below_minimum_session_duration',
    'insufficient_break_before',
    'insufficient_break_after',
    'deadline_capacity_exhausted',
    'subtasks_authoritative',
    'deadline_expired',
  ])('explains %s without exposing the code', (code) => {
    expect(planningReasonLabel(code)).not.toContain(code)
    expect(JSON.stringify(reviewValue({ reason_codes: [code] }))).not.toContain(code)
  })
  it('separates excluded work and never says all work has time for an empty eligible set', () => {
    const wrapper = mount(StudyProposal, {
      props: {
        timezone: 'Europe/Kyiv',
        review: {
          summary: {
            requested_seconds: 0,
            allocated_seconds: 0,
            unscheduled_seconds: 0,
            fully_allocated: true,
          },
          work_results: [],
          excluded_items: [{ reason_codes: ['deadline_expired'] }],
        },
      },
    })
    expect(wrapper.text()).toContain('Немає роботи, яку можна запланувати за поточних умов')
    expect(wrapper.text()).toContain('Робота, виключена з планування')
    expect(wrapper.text()).toContain('Дедлайн роботи вже минув')
    expect(wrapper.text()).not.toContain('Усю допущену роботу розміщено')
  })
})

describe('Split session review', () => {
  it('shows the source and every replacement with aggregate untransferred effort', () => {
    const wrapper = mount(StudyProposal, {
      props: {
        timezone: 'UTC',
        review: {
          session_results: [
            {
              study_session_id: 1,
              task_id: 2,
              subtask_id: null,
              classification: 'requires_replanning',
              original: {
                starts_at: '2026-11-16T09:00:00Z',
                ends_at: '2026-11-16T11:00:00Z',
                duration_seconds: 7200,
              },
              replacement: null,
              replacements: [9, 14].map((hour) => ({
                starts_at: `2026-11-16T${String(hour).padStart(2, '0')}:00:00Z`,
                ends_at: `2026-11-16T${String(hour + 1).padStart(2, '0')}:00:00Z`,
                duration_seconds: 3600,
              })),
              untransferred_seconds: 0,
              reason_codes: [],
              replacement_reason_codes: [],
            },
          ],
        },
      },
    })
    expect(wrapper.text()).toContain('Початкова сесія: 120 хв')
    expect(wrapper.text()).toContain('Нова сесія №1: 60 хв')
    expect(wrapper.text()).toContain('Нова сесія №2: 60 хв')
    expect(wrapper.text()).toContain('Неперенесено: 0 хв')
  })
  it('sends split consent only when explicitly selected', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => new Response(JSON.stringify({ data: {} }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    try {
      await planningApi.replanConfirm('token', false, false, true)
      expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
        accept_split_replacements: true,
      })
      await planningApi.replanConfirm('token', false, false)
      expect(JSON.parse(fetch.mock.calls[1]![1].body)).not.toHaveProperty(
        'accept_split_replacements',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Effective subtask deadline', () => {
  it('shows the server deadline and an edit action without changing expired work', async () => {
    const { renderApp } = await import('./helpers/renderApp')
    const { f2Backend } = await import('./helpers/f2Backend')
    const backend = f2Backend()
    backend.children = [
      {
        id: 8,
        task_id: 1,
        title: 'Успадкований строк',
        description: null,
        position: 1,
        status: 'pending',
        estimated_minutes: 30,
        deadline_at: null,
        effective_deadline_at: '2000-01-01T10:00:00Z',
        completed_at: null,
      },
    ]
    const { wrapper } = await renderApp('/tasks/1', backend)
    expect(wrapper.text()).toContain('Ефективний дедлайн:')
    expect(wrapper.text()).toContain('Враховано дедлайн основного завдання')
    expect(wrapper.text()).toContain('Дедлайн цього кроку минув')
    expect(
      wrapper
        .findAll('button')
        .some((button) => button.text() === 'Переглянути дедлайн підзавдання'),
    ).toBe(true)
    expect(backend.requests.every((request) => request.method === 'GET')).toBe(true)
  })
})
