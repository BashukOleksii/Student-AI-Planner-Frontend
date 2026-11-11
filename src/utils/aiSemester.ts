import type { AiAction, PublicObject, PublicValue } from '@/types/ai'
export const semesterActionTypes = [
  'propose_semester_rule_create',
  'propose_semester_rule_update',
  'propose_semester_rule_delete',
  'propose_semester_date_replace',
  'propose_semester_date_delete',
  'propose_semester_working_saturday',
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
  return [p.before, p.after].every(
    (v) =>
      object(v) &&
      date(v.date) &&
      Array.isArray(v.lessons) &&
      v.lessons.every((row) => lesson(row, v === p.before)),
  )
}
