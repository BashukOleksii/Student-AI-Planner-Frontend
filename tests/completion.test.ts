import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import {
  recoverySuggestion,
  recoveryResource,
  recoveryReviewSupported,
} from '@/api/recoveryPayloads'
import { actionFixture } from './helpers/aiBackend'
import { semesterReviewSupported } from '@/utils/aiSemester'
import { f2Backend } from './helpers/f2Backend'
import { renderApp } from './helpers/renderApp'
import { planningBackend, sessionFixture } from './helpers/planningBackend'
import RecoveryReview from '@/components/planning/RecoveryReview.vue'
import AiSemesterReview from '@/components/ai/AiSemesterReview.vue'
const suggestion: import('@/types/recovery').RecoverySuggestion = {
  id: 'owned',
  reason_codes: [],
  kind: 'replan',
  status: 'pending',
  period: { start_date: '2026-11-02', end_date: '2026-11-08', timezone: 'Europe/Kyiv' },
  actionable: true,
  confirmation_required: true,
  requires_lifecycle_decision: false,
  required_confirmation_fields: ['accept_partial'],
  review: { version: 1, kind: 'replan', adaptive_replanning: { session_results: [], summary: {} } },
  receipt: null,
  expires_at: null,
}
describe('final UX and contract boundaries', () => {
  it('rejects malformed controls and a response belonging to a different review', () => {
    expect(recoverySuggestion(suggestion).id).toBe('owned')
    expect(
      recoveryReviewSupported(suggestion as import('@/types/recovery').RecoverySuggestion),
    ).toBe(true)
    expect(
      recoveryReviewSupported({
        ...suggestion,
        review: { ...suggestion.review, version: 2 },
      } as import('@/types/recovery').RecoverySuggestion),
    ).toBe(false)
    expect(() => recoveryResource({ data: suggestion }, 'different')).toThrow()
    for (const field of ['actionable', 'confirmation_required', 'requires_lifecycle_decision'])
      expect(() => recoverySuggestion({ ...suggestion, [field]: 'true' })).toThrow()
    expect(() =>
      recoverySuggestion({ ...suggestion, required_confirmation_fields: 'accept_partial' }),
    ).toThrow()
  })
  it('accepts historical teacherless evidence without accepting a teacherless proposed replacement', () => {
    const action = actionFixture('propose_semester_rule_update')
    action.preview.before = structuredClone(action.preview.before!)
    const before = action.preview.before as Record<string, unknown>
    before.teacher_id = null
    before.teacher = null
    expect(semesterReviewSupported(action)).toBe(true)
    const after = action.preview.after as Record<string, unknown>
    after.teacher_id = null
    after.teacher = null
    expect(semesterReviewSupported(action)).toBe(false)
  })
  it('shows material recovery consequences before its optional complete evidence', () => {
    const wrapper = mount(RecoveryReview, {
      props: {
        kind: 'replan',
        timezone: 'Europe/Kyiv',
        review: {
          adaptive_replanning: {
            summary: { unplaced_sessions: 2 },
            session_results: [
              { study_session_id: 7, replacement: null, untransferred_seconds: 1800 },
            ],
          },
        },
      },
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.get('.report-warning').text()).toContain('нагадування')
    expect(wrapper.get('.review-introduction').text()).toContain('перенесення')
    expect(wrapper.find('details').attributes('open')).toBeUndefined()
    expect(
      wrapper
        .findAll('.review-block')
        .map((node) => node.text())
        .join(' '),
    ).toContain('1800')
  })
  it('renders semester comparisons without requiring students to read raw fields', () => {
    const wrapper = mount(AiSemesterReview, {
      props: { action: actionFixture('propose_semester_rule_update') },
      global: { stubs: { RouterLink: true } },
    })
    expect(wrapper.findAll('.review-comparison section')).toHaveLength(2)
    expect(wrapper.get('.review-comparison').text()).toContain('Математика')
    expect(wrapper.find('details').attributes('open')).toBeUndefined()
  })
  it('preserves task deep links and filters session presentation without sending unsupported API fields', async () => {
    const backend = planningBackend()
    backend.sessions = [sessionFixture(1), { ...sessionFixture(2), task_id: 9 }]
    const { wrapper } = await renderApp(
      '/planning/sessions?task_id=1&start_date=2026-11-02&end_date=2026-11-08',
      backend,
    )
    expect(wrapper.findAll('.session-card')).toHaveLength(1)
    const status = wrapper
      .findAll('select')
      .find((node) => node.find('option[value="completed"]').exists())!
    await status.setValue('completed')
    await flushPromises()
    expect(wrapper.findAll('.session-card')).toHaveLength(0)
    expect(backend.requests.filter((item) => item.path === '/api/study-sessions')).toHaveLength(1)
  })
  it('refreshes a durable review to its returned child deep link without applying it', async () => {
    const base = f2Backend()
    const writes: string[] = []
    const backend = {
      handle(url: string, method = 'GET', body = {}) {
        const path = new URL(url).pathname
        if (path.includes('/recovery-suggestions')) {
          if (method === 'POST') {
            writes.push(path)
            return { status: 200, body: { data: { ...suggestion, id: 'child' } } }
          }
          if (path.endsWith('/recovery-suggestions'))
            return {
              status: 200,
              body: {
                data: [suggestion],
                meta: { current_page: 1, last_page: 1 },
                automation: { last_scanned_at: null },
              },
            }
          return {
            status: 200,
            body: { data: { ...suggestion, id: path.endsWith('/child') ? 'child' : 'owned' } },
          }
        }
        return base.handle(url, method, body)
      },
    }
    const { wrapper, router } = await renderApp('/planning/suggestions/owned', backend)
    expect(wrapper.find('.recovery-review').exists()).toBe(true)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Новий огляд')!
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/planning/suggestions/child')
    expect(writes).toEqual(['/api/planning/recovery-suggestions/owned/refresh'])
  })
})
