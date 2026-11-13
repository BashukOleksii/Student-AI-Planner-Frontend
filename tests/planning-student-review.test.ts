import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StudyProposal from '@/components/planning/StudyProposal.vue'
import RecoveryReview from '@/components/planning/RecoveryReview.vue'
import RecoveryHistory from '@/components/planning/RecoveryHistory.vue'
import { planningBackend } from './helpers/planningBackend'
import RecoveryEvidence from '@/components/planning/RecoveryEvidence.vue'
import type { PublicObject } from '@/types/ai'
const interval = (hour: number, duration_seconds = 1800) => ({
  starts_at: `2026-11-02T${String(hour).padStart(2, '0')}:00:00Z`,
  ends_at: `2026-11-02T${String(hour).padStart(2, '0')}:30:00Z`,
  duration_seconds,
})
const mountProposal = (review: PublicObject) =>
  mount(StudyProposal, {
    props: { review, timezone: 'UTC', replanning: true },
    global: { stubs: { WorkLink: true, RouterLink: { template: '<a><slot/></a>' } } },
  })
describe('student-facing planning reviews', () => {
  it.each([1, 2])('shows every replacement of a source together (%s replacements)', (count) => {
    const replacements = Array.from({ length: count }, (_, i) => interval(10 + i))
    const wrapper = mountProposal({
      summary: { untransferred_seconds: 0 },
      session_results: [
        {
          task_id: 1,
          subtask_id: 2,
          original: interval(9, count * 1800),
          replacements,
          replacement: replacements[0]!,
          untransferred_seconds: 0,
          explanations: ['Час перетинається із заняттям.'],
        },
      ],
    })
    expect(wrapper.text()).toContain('Було')
    expect(wrapper.text()).toContain('Пропонуємо →')
    expect(wrapper.findAll('.session-card')).toHaveLength(count)
    expect(wrapper.text()).toContain('Час перетинається із заняттям.')
    expect(wrapper.text()).toContain('Увесь час, який потрібно було перенести, розміщено')
  })
  it('uses Ukrainian API explanations for partial relocation and keeps source data intact', () => {
    const review = {
      session_results: [
        {
          original: interval(9, 3600),
          replacements: [interval(10)],
          untransferred_seconds: 1800,
          reason_codes: ['lesson_overlap'],
          explanations: ['Час перетинається із заняттям.'],
          preview_token: 'private-token',
        },
      ],
    }
    const original = structuredClone(review)
    const wrapper = mountProposal(review)
    expect(wrapper.text()).toContain('У цьому періоді не знайдено нового часу для 30 хв роботи')
    expect(wrapper.text()).not.toMatch(/lesson_overlap|preview_token|private-token|starts_at/)
    expect(review).toEqual(original)
  })
  it('uses known Ukrainian reasons for old reviews and never displays unknown protocol codes', () => {
    const wrapper = mountProposal({
      excluded_items: [{ task_id: 1, reason_codes: ['missing_estimate', 'future_private_code'] }],
    })
    expect(wrapper.text()).toContain('Не вказано оцінку тривалості роботи')
    expect(wrapper.text()).not.toMatch(/missing_estimate|future_private_code/)
  })
  it('does not present optional information as an urgent warning', () => {
    const wrapper = mountProposal({ alerts: [{ code: 'fully_reserved', severity: 'info' }] })
    expect(wrapper.text()).toContain('майбутніми сесіями')
    expect(wrapper.find('.report-warning').exists()).toBe(false)
  })
  it('shows zero-result summary without empty lists', () => {
    const wrapper = mountProposal({
      user_summary: {
        title: 'Нових сесій не запропоновано',
        next_step: 'Перевірте доступні години.',
      },
      sessions: [],
      session_results: [],
      summary: { allocated_seconds: 0 },
    })
    expect(wrapper.text()).toContain('Нових сесій не запропоновано')
    expect(wrapper.find('.review-block').exists()).toBe(false)
  })
  it('shows unresolved session outcomes without offering the unrelated new plan', () => {
    const wrapper = mount(RecoveryReview, {
      props: {
        kind: 'decision_required',
        timezone: 'UTC',
        review: {
          unknown_session_decisions: [{ ...interval(9), id: 1, task_id: 1, subtask_id: 2 }],
          new_work_plan: { sessions: [interval(10)], summary: {} },
        },
      },
      global: { stubs: { RouterLink: { template: '<a><slot/></a>' }, WorkLink: true } },
    })
    expect(wrapper.text()).toContain('Потрібно вказати результат')
    expect(wrapper.text()).toContain('Записати результат сесії')
    expect(wrapper.text()).not.toContain('Час для роботи')
    expect(wrapper.find('details').exists()).toBe(false)
  })
  it('admits only safe student-facing evidence, even for nested unknown payloads', () => {
    const wrapper = mount(RecoveryEvidence, {
      props: {
        value: {
          summary: { allocated_seconds: 1800, preview_token: 'private-token' },
          user_summary: { title: 'Нові сесії' },
          unknown_field: { code: 'INTERNAL_ERROR' },
          reason_codes: ['private_code'],
          status: 'pending',
          message: 'SQLSTATE failure',
        },
      },
      global: { stubs: { RouterLink: { template: '<a><slot/></a>' } } },
    })
    expect(wrapper.text()).toContain('30 хв')
    expect(wrapper.text()).toContain('Нові сесії')
    expect(wrapper.text()).not.toMatch(
      /private|pending|unknown_field|SQLSTATE|INTERNAL_ERROR|preview_token|allocated_seconds/,
    )
  })
  it('paginates recovery history without dropping historical records', async () => {
    const diagnostics = planningBackend().recovery.recovery
    const source = diagnostics.missed_sessions[0]!
    diagnostics.missed_sessions = Array.from({ length: 5 }, (_, index) => ({
      ...source,
      study_session_id: index + 1,
    }))
    diagnostics.past_planned_sessions = []
    const wrapper = mount(RecoveryHistory, {
      props: { diagnostics, timezone: 'UTC' },
      global: { stubs: { WorkLink: true, RouterLink: { template: '<a><slot/></a>' } } },
    })
    expect(wrapper.findAll('.session-card')).toHaveLength(3)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Наступна')!
      .trigger('click')
    expect(wrapper.findAll('.session-card')).toHaveLength(2)
    expect(diagnostics.missed_sessions).toHaveLength(5)
    expect(wrapper.text()).toContain('Сторінка 2 із 2')
  })
})
