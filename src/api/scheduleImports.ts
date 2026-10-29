import { ApiError, request } from './client'
import type { Resource, FieldErrors, LessonType } from '@/types/api'
import type {
  ScheduleImportBatch,
  ScheduleImportRow,
  WorkbookSource,
  OccurrenceSource,
} from '@/types/scheduleImport'
import { lessonTypes } from '@/utils/lessons'
const invalid = (): never => {
  throw new ApiError(502)
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid()
const string = (value: unknown) => (typeof value === 'string' ? value : invalid())
const number = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid()
const id = (value: unknown) => (number(value) > 0 ? number(value) : invalid())
const nullableString = (value: unknown) => (value === null ? null : string(value))
const nullableId = (value: unknown) => (value === null ? null : id(value))
function enumValue<const T extends string>(value: unknown, options: readonly T[]): T {
  return options.find((option) => option === value) ?? invalid()
}
function provenance(value: unknown): WorkbookSource | null {
  if (value === null) return null
  const v = object(value)
  return { worksheet: string(v.worksheet), range: string(v.range) }
}
function source(value: unknown): OccurrenceSource | null {
  if (value === null) return null
  const v = object(value)
  if (!Array.isArray(v.rows) || v.rows.length !== 2) return invalid()
  return {
    worksheet: string(v.worksheet),
    range: string(v.range),
    rows: [id(v.rows[0]), id(v.rows[1])],
    pair_range: string(v.pair_range),
  }
}
function errors(value: unknown): FieldErrors | [] {
  if (Array.isArray(value) && value.length === 0) return []
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, messages]) => {
      if (!Array.isArray(messages) || !messages.every((message) => typeof message === 'string'))
        return invalid()
      return [key, messages]
    }),
  )
}
function row(value: unknown): ScheduleImportRow {
  const v = object(value)
  return {
    row_number: id(v.row_number),
    status: enumValue(v.status, ['valid', 'invalid', 'duplicate']),
    operation:
      v.operation === null
        ? null
        : enumValue(v.operation, ['create', 'update', 'restore', 'preserve', 'noop']),
    group: nullableString(v.group),
    workbook_source: provenance(v.workbook_source),
    local_date: nullableString(v.local_date),
    weekday: v.weekday === null ? null : id(v.weekday),
    pair_label: nullableString(v.pair_label),
    parity: v.parity === null ? null : enumValue(v.parity, ['all', 'numerator', 'denominator']),
    subject_name: nullableString(v.subject_name),
    subject_id: nullableId(v.subject_id),
    teacher_name: nullableString(v.teacher_name),
    teacher_id: nullableId(v.teacher_id),
    room: nullableString(v.room),
    type: v.type === null ? null : enumValue(v.type, Object.keys(lessonTypes) as LessonType[]),
    starts_at_local: nullableString(v.starts_at_local),
    ends_at_local: nullableString(v.ends_at_local),
    starts_at_utc: nullableString(v.starts_at_utc),
    ends_at_utc: nullableString(v.ends_at_utc),
    source: source(v.source),
    validation_errors: errors(v.validation_errors),
    matched_lesson_id: nullableId(v.matched_lesson_id),
  }
}
export function parseImportBatch(value: unknown, expectedId?: number): ScheduleImportBatch {
  const v = object(value),
    batchId = id(v.id)
  if (expectedId !== undefined && batchId !== expectedId) return invalid()
  if (!Array.isArray(v.rows)) return invalid()
  return {
    id: batchId,
    academic_period_id: id(v.academic_period_id),
    status: enumValue(v.status, ['uploaded', 'validated', 'committed', 'failed', 'cancelled']),
    original_filename: string(v.original_filename),
    total_rows: number(v.total_rows),
    valid_rows: number(v.valid_rows),
    invalid_rows: number(v.invalid_rows),
    duplicate_rows: number(v.duplicate_rows),
    error_message: nullableString(v.error_message),
    committed_at: nullableString(v.committed_at),
    rows: v.rows.map(row),
  }
}
export class ImportPreviewChanged extends ApiError {
  constructor(public batch: ScheduleImportBatch) {
    super(409)
  }
}
export const scheduleImportsApi = {
  async upload(academicPeriodId: number, file: File) {
    const body = new FormData()
    body.append('academic_period_id', String(academicPeriodId))
    body.append('schedule_file', file)
    const result = await request<Resource<unknown>>('/api/schedule-imports', {
      method: 'POST',
      body,
    })
    return { data: parseImportBatch(result.data) }
  },
  async get(id: number, signal?: AbortSignal) {
    const response = await request<Resource<unknown>>(`/api/schedule-imports/${id}`, { signal })
    return { data: parseImportBatch(response.data, id) }
  },
  async revalidate(id: number) {
    const response = await request<Resource<unknown>>(`/api/schedule-imports/${id}/revalidate`, {
      method: 'POST',
    })
    return { data: parseImportBatch(response.data, id) }
  },
  async commit(id: number) {
    try {
      const response = await request<Resource<unknown>>(`/api/schedule-imports/${id}/commit`, {
        method: 'POST',
      })
      return { data: parseImportBatch(response.data, id) }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.conflictData !== undefined)
        throw new ImportPreviewChanged(parseImportBatch(error.conflictData, id))
      throw error
    }
  },
}
