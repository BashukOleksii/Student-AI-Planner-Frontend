import type { PublicObject } from '@/types/ai'
import { reviewSupported, supportsAction } from '@/utils/ai'
import { savedSemesterOccurrence, semesterOccurrenceAddition } from '@/utils/aiSemester'
import { describe, expect, it } from 'vitest'
import { actionFixture } from '../helpers/aiBackend'
import {
  occurrencePreview,
  occurrenceType,
  semesterLesson,
  semesterReceipt,
} from '../helpers/aiSemesterFixtures'
function snapshots(p = occurrencePreview()) {
  const before = p.before as PublicObject,
    after = p.after as PublicObject
  return {
    p,
    before,
    after,
    oldRows: before.lessons as PublicObject[],
    newRows: after.lessons as PublicObject[],
  }
}
describe('semester occurrence review proof', () => {
  it('supports one added pair on a Saturday with another previously added pair', () => {
    const action = actionFixture(occurrenceType)
    expect(supportsAction(action)).toBe(true)
    expect(reviewSupported(action)).toBe(true)
    const { p, newRows } = snapshots(action.preview)
    expect(newRows.filter((row) => row.change_kind === 'added')).toHaveLength(2)
    expect(semesterOccurrenceAddition(p.before, p.after, 'Europe/Kyiv')?.lesson.pair_number).toBe(3)
  })
  it('matches existing pairs by displayed semantics even when base-day identities are replaced', () => {
    const { p, before, after, oldRows, newRows } = snapshots()
    before.kind = 'base'
    before.copied_weekday = null
    before.source_week_parity = null
    after.kind = 'replacement'
    after.copied_weekday = null
    after.source_week_parity = null
    for (const row of oldRows) row.occurrence_id = `semester:1:2026-11-14:rule:${row.pair_number}`
    for (const row of newRows)
      row.occurrence_id = `semester:1:2026-11-14:snapshot:new-${row.pair_number}`
    expect(semesterOccurrenceAddition(p.before, p.after, 'Europe/Kyiv')?.lesson.pair_number).toBe(3)
  })
  it('allows an empty base day and reordered unchanged rows', () => {
    const { p, before, after, newRows } = snapshots()
    before.kind = 'base'
    before.copied_weekday = null
    before.source_week_parity = null
    before.lessons = []
    after.kind = 'replacement'
    after.copied_weekday = null
    after.source_week_parity = null
    after.lessons = [newRows[2]!]
    expect(semesterOccurrenceAddition(p.before, p.after, 'Europe/Kyiv')).not.toBeNull()
    const reordered = snapshots()
    reordered.newRows.reverse()
    expect(
      semesterOccurrenceAddition(reordered.p.before, reordered.p.after, 'Europe/Kyiv'),
    ).not.toBeNull()
  })
  it.each([
    'subject',
    'room',
    'duplicate',
    'two-additions',
    'missing-teacher',
    'wrong-day',
    'overlap',
  ])('blocks an inconsistent or incomplete review (%s)', (field) => {
    const action = actionFixture(occurrenceType),
      { before, after, newRows } = snapshots(action.preview)
    if (field === 'overlap') newRows[2]!.starts_at = '2026-11-14T10:30:00+02:00'
    else if (field === 'date') after.date = '2026-11-15'
    else if (field === 'missing') after.lessons = newRows.slice(1)
    else if (field === 'duplicate') newRows[2]!.pair_number = 1
    else if (field === 'two-additions')
      newRows.push({ ...semesterLesson(4, '14:00:00', '15:00:00'), change_kind: 'added' })
    else if (field === 'metadata') after.copied_weekday = 5
    else if (field === 'missing-room') delete newRows[2]!.room
    else if (field === 'missing-teacher') delete newRows[2]!.teacher
    else if (field === 'wrong-day') newRows[2]!.starts_at = '2026-11-15T12:00:00+02:00'
    else if (field === 'subject') newRows[0]!.subject = { id: 1, name: 'Інший предмет' }
    else if (field === 'teacher') newRows[0]!.teacher = { id: 1, name: 'Інший викладач' }
    else if (field === 'starts_at' || field === 'ends_at')
      newRows[0]![field] = '2026-11-14T09:15:00+02:00'
    else if (field === 'pair_number') newRows[0]!.pair_number = 4
    else
      newRows[0]![field] =
        field === 'room' ? 'Інша аудиторія' : field === 'lesson_type' ? 'seminar' : 'Інша позначка'
    expect(before.date).toBe('2026-11-14')
    expect(reviewSupported(action)).toBe(false)
  })
  it('validates saved receipt and never interprets projected identities as saved links', () => {
    const action = actionFixture(occurrenceType)
    action.receipt = semesterReceipt(action)
    action.status = 'executed'
    action.confirmation_required = false
    action.state = 'executed'
    expect(savedSemesterOccurrence(action)?.lesson.pair_number).toBe(3)
    const after = action.receipt.after as PublicObject
    for (const row of after.lessons as PublicObject[]) row.occurrence_id = 'persisted-new-identity'
    expect(savedSemesterOccurrence(action)?.lesson.pair_number).toBe(3)
    action.receipt.action_id = 'foreign-action'
    expect(savedSemesterOccurrence(action)).toBeNull()
  })
})
