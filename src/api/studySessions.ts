import { query, request } from './client'
import type { Resource, StudySession } from '@/types/api'
import type { DateRange, RangeResource, ReschedulingResult } from '@/types/planning'
export const studySessionsApi = {
  list: (range: DateRange, signal?: AbortSignal) =>
    request<RangeResource<StudySession>>(`/api/study-sessions${query(range)}`, { signal }),
  get: (id: number, signal?: AbortSignal) =>
    request<Resource<StudySession>>(`/api/study-sessions/${id}`, { signal }),
  complete: (id: number, actual_minutes?: number) =>
    request<Resource<StudySession>>(`/api/study-sessions/${id}/complete`, {
      method: 'POST',
      body: actual_minutes === undefined ? {} : { actual_minutes },
    }),
  miss: (id: number) =>
    request<Resource<StudySession>>(`/api/study-sessions/${id}/miss`, { method: 'POST', body: {} }),
  cancel: (id: number) =>
    request<Resource<StudySession>>(`/api/study-sessions/${id}/cancel`, {
      method: 'POST',
      body: {},
    }),
  reschedule: (id: number, body: { starts_at: string; ends_at: string }) =>
    request<Resource<ReschedulingResult>>(`/api/study-sessions/${id}/reschedule`, {
      method: 'POST',
      body,
    }),
}
