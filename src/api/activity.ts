import { request, query } from './client'
import type { Reminder, Resource, StudySession } from '@/types/api'
// Read integration for AI receipts; no additional management UI or mutation API.
export const activityApi = {
  reminder: (id: number, signal?: AbortSignal) =>
    request<Resource<Reminder>>(`/api/reminders/${id}`, { signal }),
  sessions: (start_date: string, end_date: string, signal?: AbortSignal) =>
    request<
      Resource<StudySession[]> & {
        meta: { timezone: string; start_date: string; end_date: string }
      }
    >(`/api/study-sessions${query({ start_date, end_date })}`, { signal }),
}
