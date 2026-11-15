import { lessonActionTypes, type LessonActionType, type LessonPreview } from '@/types/ai'
import { actionLabels, consentFields, reviewSupported } from '@/utils/ai'
import { lessonPreview, lessonReceipt, samePublicValue } from '@/utils/aiLesson'
import { describe, expect, it } from 'vitest'
import { lessonActionFixture, lessonReceiptFixture } from '../helpers/aiLessonFixtures'
function reviewed(
  type: LessonActionType = lessonActionTypes[0],
  edit?: (preview: LessonPreview) => void,
) {
  const action = lessonActionFixture(type)
  edit?.(action.preview as LessonPreview)
  return action
}
describe('Lesson public review boundary', () => {
  it.each(lessonActionTypes)(
    'accepts complete %s with independent immutable confirmation flag and no consent',
    (type) => {
      const action = reviewed(type)
      expect(reviewSupported(action)).toBe(true)
      expect(consentFields(action)).toEqual([])
      expect(actionLabels[type]).toMatch(/заняття/)
      for (const status of ['rejected', 'expired', 'executed'] as const)
        expect(
          reviewSupported({ ...action, status, state: status, confirmation_required: false }),
        ).toBe(true)
    },
  )
  it('accepts nullable references, inactive update, cancelled replacement and historical replacement ID reuse', () => {
    const updated = reviewed('propose_lesson_update', (p) => {
      p.before!.status = 'replaced'
      p.after.status = 'replaced'
      p.before!.replacement_id = 20
      p.after.replacement_id = 20
    })
    expect(reviewSupported(updated)).toBe(true)
    const cancellation = reviewed('propose_lesson_cancel', (p) => {
      for (const s of [p.before!, p.after]) {
        s.replaces_lesson_id = 5
        s.subject_id = null
        s.subject = null
        s.teacher_id = null
        s.teacher = null
        s.academic_period_id = null
        s.academic_period = null
        s.room = null
      }
    })
    expect(reviewSupported(cancellation)).toBe(true)
    const reused = reviewed('propose_lesson_replacement', (p) => {
      p.after.id = 22
    })
    expect(reviewSupported(reused)).toBe(true)
    expect(lessonReceipt(lessonReceiptFixture(reused), reused.type, reused.id)?.lesson.id).toBe(22)
  })
  it('compares unordered objects semantically and blocks unknown future action types', () => {
    const action = reviewed('propose_lesson_cancel')
    const preview = action.preview as LessonPreview
    preview.after = Object.fromEntries(
      Object.entries(preview.after).reverse(),
    ) as typeof preview.after
    expect(reviewSupported(action)).toBe(true)
    expect(samePublicValue(preview.before, { ...preview.before, room: 'changed' })).toBe(false)
    expect(reviewSupported({ ...action, type: 'propose_lesson_delete' })).toBe(false)
    expect(lessonPreview({}, action.type)).toBeNull()
    expect(reviewSupported({ ...reviewed(), confirmation_required: false })).toBe(false)
  })
})
