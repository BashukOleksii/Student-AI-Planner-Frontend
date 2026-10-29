import type { FieldErrors, LessonType } from './api'
export type ImportStatus = 'uploaded' | 'validated' | 'committed' | 'failed' | 'cancelled'
export type ImportOperation = 'create' | 'update' | 'restore' | 'preserve' | 'noop'
export interface WorkbookSource {
  worksheet: string
  range: string
}
export interface OccurrenceSource extends WorkbookSource {
  rows: [number, number]
  pair_range: string
}
export interface ScheduleImportRow {
  row_number: number
  status: 'valid' | 'invalid' | 'duplicate'
  operation: ImportOperation | null
  group: string | null
  workbook_source: WorkbookSource | null
  local_date: string | null
  weekday: number | null
  pair_label: string | null
  parity: 'all' | 'numerator' | 'denominator' | null
  subject_name: string | null
  subject_id: number | null
  teacher_name: string | null
  teacher_id: number | null
  room: string | null
  type: LessonType | null
  starts_at_local: string | null
  ends_at_local: string | null
  starts_at_utc: string | null
  ends_at_utc: string | null
  source: OccurrenceSource | null
  validation_errors: FieldErrors | []
  matched_lesson_id: number | null
}
export interface ScheduleImportBatch {
  id: number
  academic_period_id: number
  status: ImportStatus
  original_filename: string
  total_rows: number
  valid_rows: number
  invalid_rows: number
  duplicate_rows: number
  error_message: string | null
  committed_at: string | null
  rows: ScheduleImportRow[]
}
