import type { LessonType } from './api'

export interface LessonInput {
  subject_id: number
  teacher_id: number | null
  academic_period_id: number | null
  type: LessonType
  room: string | null
  starts_at: string
  ends_at: string
}

export interface LessonDetail extends Omit<LessonInput, 'subject_id'> {
  id: number
  subject_id: number | null
  status: 'active' | 'cancelled' | 'replaced'
  replaces_lesson_id: number | null
  replacement_id: number | null
}
