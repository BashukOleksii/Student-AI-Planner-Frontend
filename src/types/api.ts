export interface Resource<T> {
  data: T
}
export interface Page<T> extends Resource<T[]> {
  links: { first: string; last: string; prev: string | null; next: string | null }
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
    from: number | null
    to: number | null
    path: string
    links: { url: string | null; label: string; active: boolean }[]
  }
}
export interface User {
  id: number
  name: string
  email: string
  timezone: string
}
export interface LoginInput {
  email: string
  password: string
}
export interface RegistrationInput extends LoginInput {
  name: string
  password_confirmation: string
  timezone?: string
}
export type ProfileInput = Pick<User, 'name' | 'email' | 'timezone'>
export interface Subject {
  id: number
  education_institution_id: number | null
  name: string
  code: string | null
  color: string | null
}
export type Priority = 1 | 2 | 3
export interface TaskInput {
  title: string
  description: string | null
  subject_id: number | null
  priority: Priority
  estimated_minutes: number | null
  deadline_at: string | null
}
export interface Task extends TaskInput {
  id: number
  status: 'pending' | 'completed'
  completed_at: string | null
}
export interface TaskFilters {
  status?: Task['status']
  priority?: Priority
  subject_id?: number
  deadline_from?: string
  deadline_to?: string
  page?: number
  per_page?: number
}
export type LessonType =
  'lecture' | 'practical' | 'laboratory' | 'seminar' | 'consultation' | 'exam' | 'other'
export interface Lesson {
  id: number
  subject: Pick<Subject, 'id' | 'name' | 'code' | 'color'> | null
  teacher: { id: number; name: string } | null
  type: LessonType
  room: string | null
  starts_at: string
  ends_at: string
  replaces_lesson_id: number | null
}
export interface Schedule extends Resource<Lesson[]> {
  meta: { timezone: string; start_date: string; end_date: string }
}
interface WorkProgress {
  current: { total: number; pending: number; completed: number; overdue_pending: number }
  completed_in_period: { total: number; on_time: number; late: number; without_deadline: number }
}
export interface Progress {
  as_of_utc: string
  timezone: string
  period: { start_date: string; end_date: string; session_attribution: 'starts_at' }
  tasks: WorkProgress
  subtasks: WorkProgress
  study_sessions: {
    started_in_period: Record<
      'planned' | 'completed' | 'missed' | 'rescheduled' | 'cancelled',
      { count: number; scheduled_seconds: number }
    > & {
      completed_actual_minutes: number
      completed_with_actual_minutes: number
      completed_without_actual_minutes: number
    }
  }
}
export type FieldErrors = Record<string, string[]>
