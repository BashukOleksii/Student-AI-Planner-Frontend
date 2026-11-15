import type { PublicObject } from '@/types/ai'
import { receiptLifecycleSessionId, reviewSupported, sessionLifecycleReview } from '@/utils/ai'
import { describe, expect, it } from 'vitest'
import { actionFixture } from '../helpers/aiBackend'
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
})
