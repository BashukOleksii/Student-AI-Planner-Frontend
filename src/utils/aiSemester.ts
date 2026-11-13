import { localDate } from './dates'
import type { AiAction, PublicObject, PublicValue } from '@/types/ai'
export const semesterActionTypes = [
  'propose_semester_rule_create',
  'propose_semester_rule_update',
  'propose_semester_rule_delete',
  'propose_semester_date_replace',
  'propose_semester_date_delete',
  'propose_semester_working_saturday',
  'propose_semester_occurrence_create',
  'propose_semester_occurrence_update',
  'propose_semester_occurrence_cancel',
  'propose_semester_settings_update',
] as const
export const isSemesterAction = (type: string) => semesterActionTypes.some((item) => item === type)
const object = (v: PublicValue | undefined): v is PublicObject =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const id = (v: PublicValue | undefined) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const date = (v: PublicValue | undefined) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v
const clock = (v: PublicValue | undefined) =>
  typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(v)
const instant = (v: PublicValue | undefined) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v))
function lesson(v: PublicValue | undefined, historical = false) {
  if (
    !object(v) ||
    !id(v.subject_id) ||
    !(id(v.teacher_id) || (historical && v.teacher_id === null && v.teacher === null)) ||
    !object(v.subject) ||
    v.subject.id !== v.subject_id ||
    typeof v.subject.name !== 'string' ||
    (!(historical && v.teacher_id === null && v.teacher === null) &&
      (!object(v.teacher) ||
        v.teacher.id !== v.teacher_id ||
        typeof v.teacher.name !== 'string')) ||
    typeof v.pair_number !== 'number' ||
    !Number.isInteger(v.pair_number) ||
    v.pair_number < 1 ||
    v.pair_number > 255
  )
    return false
  return (
    (clock(v.starts_at_local) &&
      clock(v.ends_at_local) &&
      String(v.starts_at_local) < String(v.ends_at_local)) ||
    (instant(v.starts_at) &&
      instant(v.ends_at) &&
      Date.parse(String(v.starts_at)) < Date.parse(String(v.ends_at)))
  )
}
export function semesterReviewSupported(action: AiAction) {
  const p = action.preview,
    e = p.effects
  if (
    !isSemesterAction(action.type) ||
    p.type !== action.type ||
    p.confirmation_required !== true ||
    action.confirmation_required !== (action.status === 'pending') ||
    !id(p.semester_schedule_id) ||
    typeof p.timezone !== 'string' ||
    !object(e)
  )
    return false
  try {
    new Intl.DateTimeFormat('uk-UA', { timeZone: p.timezone })
  } catch {
    return false
  }
  const scope = action.type.includes('_rule_')
    ? 'recurring_rule'
    : action.type.endsWith('settings_update')
      ? 'semester_settings'
      : 'one_date'
  if (
    e.scope !== scope ||
    e.reschedules_study_sessions !== false ||
    e.changes_legacy_lessons !== false ||
    [
      'changes_academic_calendar',
      'preserves_frozen_dates',
      'may_suppress_imported_slot',
      'restores_base_date',
    ].some((key) => typeof e[key] !== 'boolean')
  )
    return false
  if (scope === 'recurring_rule')
    return (
      ((p.before === null && action.type.endsWith('_create')) || lesson(p.before, true)) &&
      ((p.after === null && action.type.endsWith('_delete')) || lesson(p.after))
    )
  if (scope === 'semester_settings')
    return [p.before, p.after].every(
      (v) =>
        object(v) &&
        typeof v.group_name === 'string' &&
        date(v.parity_anchor_on) &&
        ['numerator', 'denominator'].includes(String(v.first_week_parity)),
    )
  if (action.type === 'propose_semester_occurrence_create')
    return (
      e.changes_academic_calendar === true &&
      e.preserves_frozen_dates === false &&
      e.may_suppress_imported_slot === false &&
      e.restores_base_date === false &&
      semesterOccurrenceAddition(p.before, p.after, p.timezone) !== null
    )
  return [p.before, p.after].every(
    (v) =>
      object(v) &&
      date(v.date) &&
      Array.isArray(v.lessons) &&
      v.lessons.every((row) => lesson(row, v === p.before)),
  )
}

export interface SemesterOccurrenceAddition {
  date: string
  lesson: PublicObject
}
// Compare the information shown in the review, not projected snapshot identities.
// A base day becomes a snapshot, so occurrence_id/source IDs cannot identify the addition.
function occurrenceData(row: PublicObject) {
  const subject = object(row.subject) ? row.subject : null,
    teacher = object(row.teacher) ? row.teacher : null
  return [
    row.pair_number,
    row.pair_label,
    row.subject_id,
    subject?.name,
    row.teacher_id,
    teacher?.name ?? null,
    Date.parse(String(row.starts_at)),
    Date.parse(String(row.ends_at)),
    row.room,
    row.lesson_type,
  ]
}
export function semesterOccurrenceAddition(
  before: PublicValue | undefined,
  after: PublicValue | undefined,
  timezone: string,
): SemesterOccurrenceAddition | null {
  if (
    !object(before) ||
    !object(after) ||
    !date(before.date) ||
    before.date !== after.date ||
    !Array.isArray(before.lessons) ||
    !Array.isArray(after.lessons) ||
    after.lessons.length !== before.lessons.length + 1
  )
    return null
  if (
    !['base', 'replacement', 'working_saturday'].includes(String(before.kind)) ||
    after.kind !== (before.kind === 'base' ? 'replacement' : before.kind) ||
    !Object.hasOwn(before, 'copied_weekday') ||
    !Object.hasOwn(before, 'source_week_parity') ||
    before.copied_weekday !== after.copied_weekday ||
    before.source_week_parity !== after.source_week_parity ||
    (before.kind !== 'base' && before.lessons.length === 0)
  )
    return null
  const validRow = (row: PublicValue) => {
    if (
      !object(row) ||
      !lesson(row, true) ||
      !instant(row.starts_at) ||
      !instant(row.ends_at) ||
      !(row.room === null || typeof row.room === 'string') ||
      !(row.pair_label === null || typeof row.pair_label === 'string') ||
      !(
        row.lesson_type === null ||
        ['lecture', 'practical', 'laboratory', 'seminar', 'consultation', 'exam', 'other'].includes(
          String(row.lesson_type),
        )
      ) ||
      !object(row.subject) ||
      !String(row.subject.name).trim() ||
      (object(row.teacher) && !String(row.teacher.name).trim())
    )
      return false
    try {
      return (
        localDate(String(row.starts_at), timezone) === before.date &&
        localDate(String(row.ends_at), timezone) === before.date &&
        (row.occurs_on === undefined || row.occurs_on === before.date)
      )
    } catch {
      return false
    }
  }
  if (![...before.lessons, ...after.lessons].every(validRow)) return null
  const oldRows = before.lessons.filter(object),
    newRows = after.lessons.filter(object)
  if (
    new Set(oldRows.map((row) => row.pair_number)).size !== oldRows.length ||
    new Set(newRows.map((row) => row.pair_number)).size !== newRows.length
  )
    return null
  for (const row of oldRows) {
    const retained = newRows.find((other) => other.pair_number === row.pair_number)
    if (
      !retained ||
      JSON.stringify(occurrenceData(row)) !== JSON.stringify(occurrenceData(retained))
    )
      return null
  }
  const chronological = [...newRows].sort(
    (a, b) => Date.parse(String(a.starts_at)) - Date.parse(String(b.starts_at)),
  )
  if (
    chronological.some(
      (row, index) =>
        index > 0 &&
        Date.parse(String(row.starts_at)) < Date.parse(String(chronological[index - 1]!.ends_at)),
    )
  )
    return null
  const added = newRows.filter(
    (row) => !oldRows.some((other) => other.pair_number === row.pair_number),
  )
  if (added.length !== 1 || added[0]!.change_kind !== 'added' || !lesson(added[0])) return null
  return { date: String(after.date), lesson: added[0]! }
}
export function savedSemesterOccurrence(action: AiAction): SemesterOccurrenceAddition | null {
  const r = action.receipt,
    p = action.preview
  if (
    action.type !== 'propose_semester_occurrence_create' ||
    !r ||
    r.action_id !== action.id ||
    r.type !== action.type ||
    r.operation !== action.type ||
    r.semester_schedule_id !== p.semester_schedule_id ||
    r.timezone !== p.timezone ||
    typeof r.timezone !== 'string'
  )
    return null
  const saved = semesterOccurrenceAddition(p.before, r.after, r.timezone),
    proposed = semesterOccurrenceAddition(p.before, p.after, r.timezone)
  return saved &&
    proposed &&
    JSON.stringify(occurrenceData(saved.lesson)) === JSON.stringify(occurrenceData(proposed.lesson))
    ? saved
    : null
}
