import { query, request } from './client'
import type { Page, Reminder, Resource } from '@/types/api'
import type { ReminderInput, ReminderPatch, ReminderFilters } from '@/types/reminders'
export const remindersApi = {
  list: (filters: ReminderFilters = {}, signal?: AbortSignal) =>
    request<Page<Reminder>>(`/api/reminders${query(filters)}`, { signal }),
  get: (id: number, signal?: AbortSignal) =>
    request<Resource<Reminder>>(`/api/reminders/${id}`, { signal }),
  create: (body: ReminderInput) =>
    request<Resource<Reminder>>('/api/reminders', { method: 'POST', body }),
  update: (id: number, body: ReminderPatch) =>
    request<Resource<Reminder>>(`/api/reminders/${id}`, { method: 'PATCH', body }),
  cancel: (id: number) =>
    request<Resource<Reminder>>(`/api/reminders/${id}/cancel`, { method: 'POST', body: {} }),
}
