import { Temporal } from '@js-temporal/polyfill'
import { addDays } from './dates'
import type {
  LessonDefinitionInput,
  SemesterSchedule,
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
  'Вільний час, навчальні плани та AI-помічник враховують заняття зі старого розкладу.'
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
export function localSeconds(value: string) {
  return value.length === 5 ? value + ':00' : value
}
export function lessonInput(lesson?: WeeklyLessonRule | SnapshotLesson): LessonDefinitionInput {
  return {
    pair_number: lesson?.pair_number ?? 1,
    pair_label: lesson?.pair_label ?? null,
    starts_at_local: lesson?.starts_at_local ?? '',
    ends_at_local: lesson?.ends_at_local ?? '',
    subject_id: lesson?.subject.id ?? 0,
    teacher_id: lesson?.teacher?.id ?? null,
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
