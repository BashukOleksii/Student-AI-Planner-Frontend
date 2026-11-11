import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AiActionReview from '@/components/ai/AiActionReview.vue'
import type { AiAction, PublicObject } from '@/types/ai'
import { receiptLifecycleSessionId, reviewSupported, sessionLifecycleReview } from '@/utils/ai'
import { actionFixture } from './helpers/aiBackend'

describe('AI study-session lifecycle actions', () => {
  it.each(['propose_session_mark_missed', 'propose_session_complete'] as const)(
    'accepts the complete %s lifecycle review and matching receipt',
    (type) => {
      const action = actionFixture(type)
      expect(reviewSupported(action)).toBe(true)
      expect(sessionLifecycleReview(action)).toMatchObject({
        study_session_id: 90,
        task_id: 1,
        subtask_id: null,
        current_status: 'planned',
        proposed_status: type === 'propose_session_complete' ? 'completed' : 'missed',
        dependent_reminders: {
          scheduled_count: 1,
          scheduled_reminder_ids: [80],
          effect_on_confirmation: 'cancel_scheduled',
        },
      })
      const receipt: PublicObject = {
        action_id: action.id,
        type,
        applied: true,
        session: { id: 90, status: type === 'propose_session_complete' ? 'completed' : 'missed' },
        effects: {
          cancelled_scheduled_reminder_ids: [80],
          replacement_sessions_created: false,
        },
      }
      expect(receiptLifecycleSessionId(receipt, action)).toBe(90)
      action.receipt = receipt
      action.status = 'executed'
      action.state = 'executed'
      action.confirmation_required = false
      expect(reviewSupported(action)).toBe(true)
    },
  )

  it.each([
    ['invalid session ID', (review: PublicObject) => (review.study_session_id = 0)],
    ['wrong current status', (review: PublicObject) => (review.current_status = 'missed')],
    ['wrong proposed status', (review: PublicObject) => (review.proposed_status = 'planned')],
    ['missing start time', (review: PublicObject) => Reflect.deleteProperty(review, 'starts_at')],
    ['offset timestamp', (review: PublicObject) => (review.ends_at = '2026-10-28T10:30:00+00:00')],
    [
      'fractional timestamp',
      (review: PublicObject) => (review.ends_at = '2026-10-28T10:30:00.000Z'),
    ],
    ['impossible date', (review: PublicObject) => (review.ends_at = '2026-02-30T10:30:00Z')],
    ['reversed interval', (review: PublicObject) => (review.starts_at = '2026-10-28T10:31:00Z')],
    [
      'reminder count mismatch',
      (review: PublicObject) => {
        ;(review.dependent_reminders as PublicObject).scheduled_count = 2
      },
    ],
    [
      'missing reminder dependency effect',
      (review: PublicObject) => {
        ;(review.dependent_reminders as PublicObject).effect_on_confirmation = 'keep'
      },
    ],
    ['actual minutes on missed action', (review: PublicObject) => (review.actual_minutes = 20)],
  ])('rejects lifecycle review with %s', (_label, edit) => {
    const action = actionFixture('propose_session_mark_missed')
    edit(action.preview.review as PublicObject)
    expect(reviewSupported(action)).toBe(false)
  })

  it.each([0, 1.5, 65536, '20'])('rejects invalid actual minutes %s', (minutes) => {
    const action = actionFixture('propose_session_complete')
    action.preview.review = { ...(action.preview.review as PublicObject), actual_minutes: minutes }
    expect(reviewSupported(action)).toBe(false)
  })

  it.each([
    ['different session', (receipt: PublicObject) => ((receipt.session as PublicObject).id = 91)],
    [
      'different reminder set',
      (receipt: PublicObject) =>
        ((receipt.effects as PublicObject).cancelled_scheduled_reminder_ids = [81]),
    ],
    [
      'replacement session',
      (receipt: PublicObject) =>
        ((receipt.effects as PublicObject).replacement_sessions_created = true),
    ],
  ])('rejects receipt with %s', (_label, edit) => {
    const action = actionFixture('propose_session_complete')
    const receipt: PublicObject = {
      action_id: action.id,
      type: action.type,
      applied: true,
      session: { id: 90, status: 'completed' },
      effects: { cancelled_scheduled_reminder_ids: [80], replacement_sessions_created: false },
    }
    edit(receipt)
    expect(receiptLifecycleSessionId(receipt, action)).toBeNull()
  })

  it('renders the lifecycle review, requires confirmation, and links the validated receipt session', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/')
    const action = actionFixture('propose_session_complete')
    const receipt: PublicObject = {
      action_id: action.id,
      type: action.type,
      applied: true,
      session: { id: 90, status: 'completed' },
      effects: { cancelled_scheduled_reminder_ids: [80], replacement_sessions_created: false },
    }
    const wrapper = mount(AiActionReview, {
      props: {
        action,
        timezone: 'UTC',
        consent: {},
        busy: false,
        blocked: false,
        needsProposal: false,
        uncertain: false,
        error: null,
        notice: '',
        domainError: null,
        domainBusy: false,
      },
      global: { plugins: [router] },
    })
    expect(wrapper.text()).toContain('Навчальна сесія №90')
    expect(wrapper.text()).toContain('Фактичний час:')
    expect(wrapper.text()).toContain('Нагадування №80')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()

    await wrapper.setProps({
      action: {
        ...action,
        status: 'executed',
        state: 'executed',
        confirmation_required: false,
        receipt,
      } satisfies AiAction,
    })
    expect(wrapper.text()).toContain('Квитанція виконання')
    expect(wrapper.find('a[href="/planning/sessions/90"]').exists()).toBe(true)
  })

  it('does not allow confirmation for malformed lifecycle reviews', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/')
    const action = actionFixture('propose_session_mark_missed')
    action.preview.review = { ...(action.preview.review as PublicObject), study_session_id: 0 }
    const wrapper = mount(AiActionReview, {
      props: {
        action,
        timezone: 'UTC',
        consent: {},
        busy: false,
        blocked: false,
        needsProposal: false,
        uncertain: false,
        error: null,
        notice: '',
        domainError: null,
        domainBusy: false,
      },
      global: { plugins: [router] },
    })
    expect(wrapper.text()).toContain('не підтримуються для безпечного підтвердження')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})
