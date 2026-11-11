import { Temporal } from '@js-temporal/polyfill'
import { addDays } from './dates'
import type {
  LessonDefinitionInput,
  SemesterSchedule,
  SemesterTeacher,
  SnapshotLesson,
  WeekPattern,
  WeeklyLessonRule,
} from '@/types/semesterSchedule'

export const weekdays = {
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: 'П’ятниця',
} as const
export const patterns: Record<WeekPattern, string> = {
  all: 'Щотижня',
  numerator: 'Чисельник',
  denominator: 'Знаменник',
}
export const plannerSourceNotice =
  'Планування враховує заняття з семестрового та старого розкладів.'
export function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  try {
    return Temporal.PlainDate.from(value).year >= 1
  } catch {
    return false
  }
}
export function inPeriod(schedule: SemesterSchedule, date: string) {
  return date >= schedule.academic_period.starts_on && date <= schedule.academic_period.ends_on
}
export function displayDates(start: string, end: string) {
  const days: string[] = []
  for (let date = start; date <= end && days.length < 7; date = addDays(date, 1)) {
    days.push(date)
    if (date === end) break
  }
  return days
}
export const pairLabel = (number: number) => `${number * 2 - 1}-${number * 2}`
export function validPairNumber(number: number) {
  return Number.isInteger(number) && number >= 1 && number <= 255
}
export function localMinutes(value: string) {
  return value.slice(0, 5)
}
export function localSeconds(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value + ':00' : value
}
export function localTimeError(value: string): string | undefined {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value))
    return 'Укажіть час у форматі ГГ:ХХ від 00:00 до 23:59.'
}
interface TeacherFields {
  teacher_ids?: number[]
  teachers?: SemesterTeacher[]
  teacher_id?: number | null
  teacher?: SemesterTeacher | null
}
// Keep ambiguous historical identities unselected; never pick the first alias.
export function lessonTeacherId(lesson?: TeacherFields): number {
  if (!lesson) return 0
  const ids = new Set([
    ...(lesson.teacher_ids ?? []),
    ...(lesson.teachers?.map((item) => item.id) ?? []),
    ...(lesson.teacher ? [lesson.teacher.id] : []),
    ...(lesson.teacher_id ? [lesson.teacher_id] : []),
  ])
  if (ids.size !== 1 || lesson.teacher_id === null) return 0
  return lesson.teacher_id ?? lesson.teacher?.id ?? 0
}
export function semesterTeacherNames(lesson: TeacherFields): string {
  const teachers = lesson.teachers ?? (lesson.teacher ? [lesson.teacher] : [])
  return teachers.map((item) => item.name).join(', ') || 'Без викладача'
}
export function lessonInput(
  lesson?: WeeklyLessonRule | SnapshotLesson,
  pairNumber = 1,
): LessonDefinitionInput {
  return {
    pair_number: lesson?.pair_number ?? pairNumber,
    pair_label: lesson ? lesson.pair_label : pairLabel(pairNumber),
    starts_at_local: lesson?.starts_at_local ?? '',
    ends_at_local: lesson?.ends_at_local ?? '',
    subject_id: lesson?.subject.id ?? 0,
    teacher_id: lessonTeacherId(lesson),
    lesson_type: lesson?.lesson_type ?? null,
    room: lesson?.room ?? null,
  }
}

export function changedFields<T extends object>(original: T, draft: T): Partial<T> {
  const changes: Partial<T> = {}
  for (const field of Object.keys(draft) as (keyof T)[]) {
    if (original[field] !== draft[field]) changes[field] = draft[field]
  }
  return changes
}

export const lessonTypeLabels = {
  lecture: 'Лекція',
  laboratory: 'Лабораторна',
  practical: 'Практична',
  seminar: 'Семінар',
  consultation: 'Консультація',
  exam: 'Іспит',
  other: 'Інше',
} as const
export function lessonTypeLabel(type: import('@/types/api').LessonType | null) {
  return type ? lessonTypeLabels[type] : 'Не визначено'
}
