import { query, request } from './client'
import type { Page, Resource } from '@/types/api'
import type { InboxNotification, InboxFilters } from '@/types/reminders'
export const notificationsApi = {
  list: (filters: InboxFilters = {}, signal?: AbortSignal) =>
    request<Page<InboxNotification>>(`/api/notifications${query(filters)}`, { signal }),
  read: (id: string) =>
    request<Resource<InboxNotification>>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    }),
}
