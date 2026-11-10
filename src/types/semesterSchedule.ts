import type {
  AcademicPeriod,
  EducationInstitution,
  FieldErrors,
  Resource,
  Subject,
  Teacher,
} from './api'

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
  teacher_id: number | null
  room: string | null
}
export type WeeklyRuleInput = LessonDefinitionInput & PairSlot
interface LessonDefinition extends Omit<LessonDefinitionInput, 'subject_id' | 'teacher_id'> {
  id: number
  subject: SemesterSubject
  teacher: SemesterTeacher | null
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
  subject: SemesterSubject
  teacher: SemesterTeacher | null
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
export type ImportErrors = FieldErrors | []
export interface ImportPreviewRow extends Omit<WeeklyRuleInput, 'subject_id' | 'teacher_id'> {
  row_number: number
  subject_name: string
  teacher_name: string
  subject: SemesterSubject | null
  teacher: SemesterTeacher | null
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
  before: WeeklyRuleInput | null
  after: WeeklyRuleInput | null
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
    rows: ImportPreviewRow[]
    operations: ImportOperation[]
    counts: ImportCounts | []
    errors: ImportErrors
    impact?: ImportImpact
  }
  receipt: ImportReceipt | null
  committed_at: string | null
}
