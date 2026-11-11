import { ApiError } from './client'
import { calendarDate } from '@/utils/semesterSchedule'
import {
  countedOperations,
  type ImportCounts,
  type ImportCatalogItem,
  type ImportRuleValues,
  type ImportErrors,
  type ImportImpact,
  type ImportOperation,
  type ImportPreviewRow,
  type ImportReceipt,
  type ManagementResponse,
  type OccurrenceResponse,
  type SemesterOccurrence,
  type ScheduleDateException,
  type SemesterManagementState,
  type SemesterSchedule,
  type SemesterScheduleImport,
  type SemesterSettings,
  type SemesterSubject,
  type SnapshotLesson,
  type SuppressedSlot,
  type WeeklyLessonRule,
} from '@/types/semesterSchedule'

export const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const string = (v: unknown): v is string => typeof v === 'string'
function timezone(value: unknown): value is string {
  if (!string(value)) return false
  try {
    new Intl.DateTimeFormat('uk-UA', { timeZone: value })
    return true
  } catch {
    return false
  }
}
const nullableString = (v: unknown) => v === null || string(v)
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const id = (v: unknown): v is number => integer(v) && v > 0
const nullableId = (v: unknown) => v === null || id(v)
const ids = (v: unknown) => Array.isArray(v) && v.every(id)
const token = (v: unknown): v is string => string(v) && /^[0-9a-f]{64}$/.test(v)
const parity = (v: unknown) => v === 'numerator' || v === 'denominator'
const pattern = (v: unknown) => v === 'all' || parity(v)
const weekday = (v: unknown) => integer(v) && v >= 1 && v <= 5
const named = (v: unknown) => record(v) && id(v.id) && string(v.name)
const subject = (v: unknown): v is SemesterSubject =>
  record(v) && named(v) && nullableString(v.code) && nullableString(v.color)
const teacher = (v: unknown) => v === null || named(v)
const settings = (v: unknown): v is SemesterSettings =>
  record(v) &&
  string(v.group_name) &&
  calendarDate(v.parity_anchor_on) &&
  parity(v.first_week_parity)
const slot = (v: Record<string, unknown>) =>
  weekday(v.weekday) && id(v.pair_number) && pattern(v.week_pattern)
const lesson = (v: Record<string, unknown>) =>
  id(v.pair_number) &&
  nullableString(v.pair_label) &&
  nullableString(v.room) &&
  string(v.starts_at_local) &&
  string(v.ends_at_local)
// Committed records require real IDs; only import proposals may contain null identities.
function teacherList(v: Record<string, unknown>): boolean {
  const teacherIds = v.teacher_ids
  const teachers = v.teachers
  if (v.teacher_id !== undefined && !nullableId(v.teacher_id)) return false
  if (
    teacherIds !== undefined &&
    (!ids(teacherIds) || new Set(teacherIds).size !== teacherIds.length)
  )
    return false
  if (
    teachers !== undefined &&
    (!Array.isArray(teachers) ||
      !teachers.every(named) ||
      new Set(teachers.map((item) => item.id)).size !== teachers.length)
  )
    return false
  return (
    !(Array.isArray(teacherIds) && Array.isArray(teachers)) ||
    (teacherIds.length === teachers.length &&
      teachers.every((item) => teacherIds.includes(item.id)))
  )
}
const definition = (v: Record<string, unknown>) =>
  lesson(v) && id(v.id) && subject(v.subject) && teacher(v.teacher) && teacherList(v)
export const semester = (v: unknown): v is SemesterSchedule =>
  record(v) &&
  settings(v) &&
  id(v.id) &&
  named(v.education_institution) &&
  record(v.academic_period) &&
  named(v.academic_period) &&
  calendarDate(v.academic_period.starts_on) &&
  calendarDate(v.academic_period.ends_on)
export const weeklyRule = (v: unknown): v is WeeklyLessonRule =>
  record(v) &&
  definition(v) &&
  slot(v) &&
  typeof v.is_manually_managed === 'boolean' &&
  nullableId(v.semester_schedule_import_id)
const snapshot = (v: unknown): v is SnapshotLesson =>
  record(v) && definition(v) && nullableId(v.source_weekly_rule_id)
export const dateException = (v: unknown): v is ScheduleDateException =>
  record(v) &&
  id(v.id) &&
  calendarDate(v.occurs_on) &&
  ((v.kind === 'replacement' && v.copied_weekday === null) ||
    (v.kind === 'working_saturday' && weekday(v.copied_weekday))) &&
  (v.source_week_parity === undefined ||
    v.source_week_parity === null ||
    (v.kind === 'working_saturday' && parity(v.source_week_parity))) &&
  Array.isArray(v.lessons) &&
  v.lessons.every(snapshot)
export const suppression = (v: unknown): v is SuppressedSlot => record(v) && id(v.id) && slot(v)
export const arrayOf =
  <T>(check: (value: unknown) => value is T) =>
  (value: unknown): value is T[] =>
    Array.isArray(value) && value.every(check)
export const managementState = (v: unknown): v is SemesterManagementState =>
  record(v) &&
  semester(v.schedule) &&
  arrayOf(weeklyRule)(v.weekly_rules) &&
  arrayOf(dateException)(v.date_exceptions) &&
  arrayOf(suppression)(v.suppressed_slots)
export function parseManagement<T>(
  v: unknown,
  check: (data: unknown) => data is T,
  scheduleId?: number,
): ManagementResponse<T> {
  if (
    !record(v) ||
    !check(v.data) ||
    !record(v.meta) ||
    !token(v.meta.schedule_token) ||
    !id(v.meta.semester_schedule_id) ||
    !timezone(v.meta.timezone) ||
    (scheduleId !== undefined && v.meta.semester_schedule_id !== scheduleId) ||
    (managementState(v.data) && v.data.schedule.id !== v.meta.semester_schedule_id)
  )
    throw new ApiError(502)
  return {
    data: v.data,
    meta: {
      schedule_token: v.meta.schedule_token,
      semester_schedule_id: v.meta.semester_schedule_id,
      timezone: v.meta.timezone,
    },
  }
}

const offsetTime = (v: unknown) =>
  string(v) && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const occurrence = (v: unknown): v is SemesterOccurrence =>
  record(v) &&
  string(v.occurrence_id) &&
  calendarDate(v.occurs_on) &&
  (v.source === 'base'
    ? id(v.weekly_lesson_rule_id) && v.schedule_date_exception_id === null
    : (v.source === 'replacement' || v.source === 'working_saturday') &&
      v.weekly_lesson_rule_id === null &&
      id(v.schedule_date_exception_id)) &&
  id(v.pair_number) &&
  nullableString(v.pair_label) &&
  nullableString(v.room) &&
  subject(v.subject) &&
  teacher(v.teacher) &&
  teacherList(v) &&
  offsetTime(v.starts_at) &&
  offsetTime(v.ends_at)

export function parseOccurrences(v: unknown, scheduleId: number, date: string): OccurrenceResponse {
  if (
    !record(v) ||
    !arrayOf(occurrence)(v.data) ||
    !record(v.meta) ||
    v.meta.semester_schedule_id !== scheduleId ||
    !calendarDate(v.meta.start_date) ||
    !calendarDate(v.meta.end_date) ||
    date < v.meta.start_date ||
    date > v.meta.end_date ||
    !timezone(v.meta.timezone)
  )
    throw new ApiError(502)
  const { start_date, end_date } = v.meta
  if (v.data.some((item) => item.occurs_on < start_date || item.occurs_on > end_date))
    throw new ApiError(502)
  return {
    data: v.data,
    meta: { semester_schedule_id: scheduleId, start_date, end_date, timezone: v.meta.timezone },
  }
}

const empty = (v: unknown): v is [] => Array.isArray(v) && v.length === 0
const errors = (v: unknown): v is ImportErrors =>
  empty(v) ||
  (record(v) &&
    Object.values(v).every(
      (values) =>
        Array.isArray(values) &&
        values.every(
          (message: unknown) =>
            string(message) ||
            (record(message) &&
              string(message.name) &&
              Array.isArray(message.errors) &&
              message.errors.every(string)),
        ),
    ))
const catalogItem = (v: unknown): v is ImportCatalogItem =>
  record(v) &&
  string(v.name) &&
  Array.isArray(v.errors) &&
  v.errors.every(string) &&
  (v.resolution === 'reuse'
    ? id(v.id)
    : v.resolution === 'create'
      ? v.id === null
      : v.resolution === 'invalid' && nullableId(v.id))
const catalog = (v: unknown, check: (item: unknown) => boolean) =>
  record(v) &&
  Array.isArray(v.subjects) &&
  v.subjects.every(check) &&
  Array.isArray(v.teachers) &&
  v.teachers.every(check)
const proposedNamed = (v: unknown) =>
  record(v) && nullableId(v.id) && string(v.name) && (v.resolution === undefined || catalogItem(v))
const proposedSubject = (v: unknown) =>
  record(v) && proposedNamed(v) && nullableString(v.code) && nullableString(v.color)
const proposedTeacher = (v: unknown) => v === null || proposedNamed(v)
const proposedIds = (v: unknown) => Array.isArray(v) && v.every(nullableId)
const counts = (v: unknown): v is ImportCounts =>
  record(v) &&
  countedOperations.every((op) => {
    const n = v[op]
    return integer(n) && n >= 0
  })
const values = (v: unknown): v is NonNullable<ImportOperation['before']> =>
  record(v) &&
  lesson(v) &&
  slot(v) &&
  id(v.subject_id) &&
  nullableId(v.teacher_id) &&
  teacherList(v)
const proposedValues = (v: unknown): v is ImportRuleValues =>
  record(v) &&
  lesson(v) &&
  slot(v) &&
  nullableId(v.subject_id) &&
  nullableId(v.teacher_id) &&
  (v.teacher_ids === undefined || proposedIds(v.teacher_ids))
const row = (v: unknown): v is ImportPreviewRow =>
  record(v) &&
  lesson(v) &&
  slot(v) &&
  id(v.row_number) &&
  string(v.subject_name) &&
  nullableString(v.teacher_name) &&
  (v.subject === null || proposedSubject(v.subject)) &&
  proposedTeacher(v.teacher) &&
  (v.teacher_names === undefined ||
    (Array.isArray(v.teacher_names) && v.teacher_names.every(string))) &&
  (v.teacher_ids === undefined || proposedIds(v.teacher_ids)) &&
  (v.teachers === undefined || (Array.isArray(v.teachers) && v.teachers.every(proposedNamed))) &&
  string(v.import_key) &&
  nullableId(v.matched_rule_id) &&
  errors(v.errors) &&
  (v.operation === null ||
    v.operation === 'suppressed' ||
    v.operation === 'duplicate' ||
    v.operation === 'create' ||
    v.operation === 'update' ||
    v.operation === 'noop' ||
    v.operation === 'preserve') &&
  (v.suppressed_slot_ids === undefined || ids(v.suppressed_slot_ids)) &&
  record(v.source) &&
  string(v.source.worksheet) &&
  string(v.source.range) &&
  string(v.source.pair_range) &&
  ids(v.source.rows)
const operation = (v: unknown): v is ImportOperation =>
  record(v) &&
  nullableId(v.rule_id) &&
  string(v.import_key) &&
  (v.operation === 'create'
    ? v.before === null && proposedValues(v.after)
    : v.operation === 'delete'
      ? values(v.before) && v.after === null
      : (v.operation === 'update' || v.operation === 'noop' || v.operation === 'preserve') &&
        values(v.before) &&
        proposedValues(v.after))
const impact = (v: unknown): v is ImportImpact =>
  record(v) &&
  record(v.schedule) &&
  nullableId(v.schedule.id) &&
  (v.schedule.before === null || settings(v.schedule.before)) &&
  settings(v.schedule.after) &&
  ids(v.preserved_rule_ids) &&
  Array.isArray(v.preserved_exception_dates) &&
  v.preserved_exception_dates.every(calendarDate) &&
  (v.suppressed_slots === undefined || arrayOf(suppression)(v.suppressed_slots)) &&
  Array.isArray(v.detached_snapshot_references) &&
  v.detached_snapshot_references.every(
    (item: unknown) =>
      record(item) &&
      id(item.snapshot_lesson_id) &&
      id(item.source_weekly_rule_id) &&
      calendarDate(item.occurs_on),
  )
const timestamp = (v: unknown) =>
  string(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
const receipt = (v: unknown): v is ImportReceipt =>
  record(v) &&
  id(v.semester_schedule_id) &&
  counts(v.counts) &&
  ids(v.rule_ids) &&
  timestamp(v.committed_at) &&
  (v.parity_anchor_on === undefined || calendarDate(v.parity_anchor_on)) &&
  (v.first_week_parity === undefined || parity(v.first_week_parity)) &&
  (v.catalog === undefined ||
    catalog(
      v.catalog,
      (item) =>
        record(item) &&
        named(item) &&
        (item.resolution === 'created' || item.resolution === 'reused'),
    ))

export function parseSemesterImport(
  v: unknown,
  expectedId?: number,
): SemesterScheduleImport | null {
  if (
    !record(v) ||
    !id(v.id) ||
    (expectedId !== undefined && v.id !== expectedId) ||
    !id(v.academic_period_id) ||
    !string(v.original_filename) ||
    !calendarDate(v.parity_anchor_on) ||
    !parity(v.first_week_parity) ||
    !token(v.preview_token) ||
    (v.status !== 'ready' &&
      v.status !== 'invalid' &&
      v.status !== 'failed' &&
      v.status !== 'committed') ||
    v.can_commit !== (v.status === 'ready') ||
    !record(v.preview) ||
    !arrayOf(row)(v.preview.rows) ||
    !arrayOf(operation)(v.preview.operations) ||
    !errors(v.preview.errors) ||
    (v.preview.catalog !== undefined && !catalog(v.preview.catalog, catalogItem))
  )
    return null
  if (
    v.status === 'failed'
      ? !empty(v.preview.counts) || v.preview.impact !== undefined
      : !counts(v.preview.counts) || !impact(v.preview.impact)
  )
    return null
  if (
    v.status === 'committed'
      ? !receipt(v.receipt) || v.committed_at !== v.receipt.committed_at
      : v.receipt !== null || v.committed_at !== null
  )
    return null
  if (
    v.status === 'ready' &&
    ((record(v.preview.catalog) &&
      [
        ...(v.preview.catalog.subjects as ImportCatalogItem[]),
        ...(v.preview.catalog.teachers as ImportCatalogItem[]),
      ].some((item) => item.resolution === 'invalid' || item.errors.length)) ||
      Object.keys(v.preview.errors).length ||
      v.preview.rows.some(
        (item) =>
          Object.keys(item.errors).length || !item.operation || item.operation === 'suppressed',
      ))
  )
    return null
  // Every field consumed by the review and confirmation was checked above.
  return v as unknown as SemesterScheduleImport
}
