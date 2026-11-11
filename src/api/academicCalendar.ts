import { request } from './client'
import type { AcademicCalendar } from '@/types/academicCalendar'
export const academicCalendarApi = {
  today: (signal?: AbortSignal) =>
    request<AcademicCalendar>('/api/academic-calendar/today', { signal }),
  date: (date: string, signal?: AbortSignal) =>
    request<AcademicCalendar>(`/api/academic-calendar/date/${encodeURIComponent(date)}`, {
      signal,
    }),
  week: (date: string, signal?: AbortSignal) =>
    request<AcademicCalendar>(`/api/academic-calendar/week/${encodeURIComponent(date)}`, {
      signal,
    }),
}
