import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StudyProposal from '@/components/planning/StudyProposal.vue'
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
