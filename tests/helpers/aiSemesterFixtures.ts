import type { AiAction, PublicObject } from '../../src/types/ai'
export const occurrenceType = 'propose_semester_occurrence_create'
const day = '2026-11-14'
export function semesterLesson(pair: number, start: string, end: string): PublicObject {
  return {
    occurrence_id: `semester:1:${day}:snapshot:${pair}`,
    occurs_on: day,
    source: 'exception',
    change_kind: pair === 2 ? 'added' : 'base',
    weekly_lesson_rule_id: null,
    schedule_date_exception_id: 20,
    pair_number: pair,
    pair_label: null,
    lesson_type: 'lecture',
    subject_id: pair,
    teacher_id: pair,
    subject: { id: pair, name: pair === 3 ? 'Фізика' : `Предмет ${pair}` },
    teacher: { id: pair, name: pair === 3 ? 'Олена Коваль' : `Викладач ${pair}` },
    teacher_ids: [pair],
    room: pair === 3 ? '301' : null,
    starts_at: `${day}T${start}+02:00`,
    ends_at: `${day}T${end}+02:00`,
  }
}
export function occurrencePreview(): PublicObject {
  const lessons = [
    semesterLesson(1, '09:00:00', '10:00:00'),
    semesterLesson(2, '10:15:00', '11:15:00'),
  ]
  return {
    type: occurrenceType,
    confirmation_required: true,
    semester_schedule_id: 1,
    timezone: 'Europe/Kyiv',
    before: {
      date: day,
      kind: 'working_saturday',
      copied_weekday: 2,
      source_week_parity: 'numerator',
      lessons,
    },
    after: {
      date: day,
      kind: 'working_saturday',
      copied_weekday: 2,
      source_week_parity: 'numerator',
      lessons: [
        ...structuredClone(lessons),
        { ...semesterLesson(3, '12:00:00', '13:00:00'), change_kind: 'added' },
      ],
    },
    effects: {
      scope: 'one_date',
      changes_academic_calendar: true,
      reschedules_study_sessions: false,
      changes_legacy_lessons: false,
      preserves_frozen_dates: false,
      may_suppress_imported_slot: false,
      restores_base_date: false,
    },
  }
}
export function semesterReceipt(action: AiAction): PublicObject {
  return {
    action_id: action.id,
    type: action.type,
    semester_schedule_id: action.preview.semester_schedule_id!,
    operation: action.type,
    timezone: action.preview.timezone!,
    after: structuredClone(action.preview.after!),
    effects: structuredClone(action.preview.effects!),
  }
}
