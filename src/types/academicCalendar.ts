import type { LessonType } from './api'
export interface AcademicLesson {
  id: string | number
  source_identity: string
  source_type: 'semester_occurrence' | 'legacy_lesson'
  source: string
  occurs_on: string
  occurrence_id: string | null
  lesson_id: number | null
  semester_schedule_id: number | null
  weekly_lesson_rule_id: number | null
  subject: { id: number; name: string } | null
  teacher: { id: number; name: string } | null
  type: LessonType | null
  room: string | null
  starts_at: string
  ends_at: string
}
export interface AcademicCalendar {
  data: AcademicLesson[]
  meta: {
    timezone: string
    start_date: string
    end_date: string
    truncated: boolean
    total: number
    returned: number
    limit: number
  }
}
