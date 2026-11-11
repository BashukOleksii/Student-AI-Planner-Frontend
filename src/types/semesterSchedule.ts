import type { LessonType } from './api'
import type { AcademicPeriod, EducationInstitution, Resource, Subject, Teacher } from './api'

export type Parity = 'numerator' | 'denominator'
export type WeekPattern = 'all' | Parity
export type Weekday = 1 | 2 | 3 | 4 | 5
export type ScheduleToken = string
export type PreviewToken = string
export type SemesterSubject = Omit<Subject, 'education_institution_id'>
export type SemesterTeacher = Pick<Teacher, 'id' | 'name'>
export interface SemesterSettings {
  group_name: string
  parity_anchor_on: string
  first_week_parity: Parity
}
export interface SemesterSchedule extends SemesterSettings {
  id: number
  academic_period: Omit<AcademicPeriod, 'education_institution_id'>
  education_institution: EducationInstitution
}
export interface PairSlot {
  weekday: Weekday
  pair_number: number
  week_pattern: WeekPattern
}
export interface LessonDefinitionInput {
  pair_number: number
  pair_label: string | null
  starts_at_local: string
  ends_at_local: string
  subject_id: number
  teacher_id: number
  lesson_type: LessonType | null
  room: string | null
}
export type WeeklyRuleInput = LessonDefinitionInput & PairSlot
interface LessonDefinition extends Omit<LessonDefinitionInput, 'subject_id' | 'teacher_id'> {
  teacher_id?: number | null
  teacher_ids?: number[]
  id: number
  subject: SemesterSubject
  teacher: SemesterTeacher | null
  teachers?: SemesterTeacher[]
}
export interface WeeklyLessonRule extends LessonDefinition, PairSlot {
  is_manually_managed: boolean
  semester_schedule_import_id: number | null
}
export interface SnapshotLesson extends LessonDefinition {
  source_weekly_rule_id: number | null
}
export type DateExceptionKind = 'replacement' | 'working_saturday'
export interface ScheduleDateException {
  id: number
  occurs_on: string
  kind: DateExceptionKind
  copied_weekday: Weekday | null
  source_week_parity?: Parity | null
  lessons: SnapshotLesson[]
}
export interface SuppressedSlot extends PairSlot {
  id: number
}
export interface SemesterManagementState {
  schedule: SemesterSchedule
  weekly_rules: WeeklyLessonRule[]
  date_exceptions: ScheduleDateException[]
  suppressed_slots: SuppressedSlot[]
}
export interface ManagementResponse<T = SemesterManagementState> extends Resource<T> {
  meta: { schedule_token: ScheduleToken; semester_schedule_id: number; timezone: string }
}
export interface SemesterOccurrence {
  occurrence_id: string
  occurs_on: string
  source: 'base' | DateExceptionKind
  weekly_lesson_rule_id: number | null
  schedule_date_exception_id: number | null
  pair_number: number
  pair_label: string | null
  lesson_type: LessonType | null
  subject: SemesterSubject
  teacher: SemesterTeacher | null
  teacher_id?: number | null
  teacher_ids?: number[]
  teachers?: SemesterTeacher[]
  room: string | null
  starts_at: string
  ends_at: string
}
export interface OccurrenceResponse extends Resource<SemesterOccurrence[]> {
  meta: { timezone: string; semester_schedule_id: number; start_date: string; end_date: string }
}
export type DateExceptionInput =
  | {
      mode: 'copy_base'
      changes: (Partial<LessonDefinitionInput> & {
        weekly_lesson_rule_id: number
        cancelled?: boolean
      })[]
      lessons: LessonDefinitionInput[]
    }
  | { mode: 'replace'; lessons: (LessonDefinitionInput & { id?: number })[] }

export const countedOperations = [
  'create',
  'update',
  'delete',
  'noop',
  'preserve',
  'duplicate',
] as const
export type CountedOperation = (typeof countedOperations)[number]
export type ImportRowOperation = CountedOperation | 'suppressed'
export type ImportCounts = Record<CountedOperation, number>
export type ImportErrorMessage = string | { name: string; errors: string[] }
export type ImportErrors = Record<string, ImportErrorMessage[]> | []
export interface ImportCatalogItem {
  id: number | null
  name: string
  resolution: 'reuse' | 'create' | 'invalid'
  errors: string[]
}
export type ImportSubject = Omit<SemesterSubject, 'id'> & {
  id: number | null
  resolution?: ImportCatalogItem['resolution']
  errors?: string[]
}
export type ImportTeacher = Pick<ImportSubject, 'id' | 'name' | 'resolution' | 'errors'>
export interface ImportCatalog<T> {
  subjects: T[]
  teachers: T[]
}
export interface ReceiptCatalogItem {
  id: number
  name: string
  resolution: 'created' | 'reused'
}
export interface ImportRuleValues extends Omit<
  WeeklyRuleInput,
  'subject_id' | 'teacher_id' | 'lesson_type'
> {
  subject_id: number | null
  teacher_id: number | null
  teacher_ids?: (number | null)[]
}
export interface ImportPreviewRow extends Omit<ImportRuleValues, 'subject_id' | 'teacher_id'> {
  row_number: number
  subject_name: string
  teacher_name: string | null
  subject: ImportSubject | null
  teacher: ImportTeacher | null
  teachers?: ImportTeacher[]
  teacher_names?: string[]
  source: { worksheet: string; rows: number[]; range: string; pair_range: string }
  import_key: string
  operation: Exclude<ImportRowOperation, 'delete'> | null
  matched_rule_id: number | null
  suppressed_slot_ids?: number[]
  errors: ImportErrors
}
export interface ImportOperation {
  operation: Exclude<CountedOperation, 'duplicate'>
  rule_id: number | null
  import_key: string
  before:
    | (Omit<WeeklyRuleInput, 'teacher_id' | 'lesson_type'> & {
        teacher_id: number | null
        teacher_ids?: number[]
      })
    | null
  after: ImportRuleValues | null
}
export interface ImportImpact {
  schedule: { id: number | null; before: SemesterSettings | null; after: SemesterSettings }
  preserved_rule_ids: number[]
  preserved_exception_dates: string[]
  suppressed_slots?: SuppressedSlot[]
  detached_snapshot_references: {
    snapshot_lesson_id: number
    source_weekly_rule_id: number
    occurs_on: string
  }[]
}
export interface ImportReceipt {
  catalog?: ImportCatalog<ReceiptCatalogItem>
  parity_anchor_on?: string
  first_week_parity?: Parity
  semester_schedule_id: number
  counts: ImportCounts
  rule_ids: number[]
  committed_at: string
}
export interface SemesterScheduleImport {
  id: number
  academic_period_id: number
  original_filename: string
  status: 'ready' | 'invalid' | 'failed' | 'committed'
  parity_anchor_on: string
  first_week_parity: Parity
  preview_token: PreviewToken
  can_commit: boolean
  preview: {
    catalog?: ImportCatalog<ImportCatalogItem>
    rows: ImportPreviewRow[]
    operations: ImportOperation[]
    counts: ImportCounts | []
    errors: ImportErrors
    impact?: ImportImpact
  }
  receipt: ImportReceipt | null
  committed_at: string | null
}
