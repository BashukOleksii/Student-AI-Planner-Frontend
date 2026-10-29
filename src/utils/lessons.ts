import type { LessonType } from '@/types/api'
export const lessonTypes: Record<LessonType, string> = {
  lecture: 'Лекція',
  practical: 'Практичне',
  laboratory: 'Лабораторна',
  seminar: 'Семінар',
  consultation: 'Консультація',
  exam: 'Іспит',
  other: 'Заняття',
}
export const lessonStatuses = { active: 'Активне', cancelled: 'Скасоване', replaced: 'Замінене' }
