import { request, query } from './client'
import type { Resource } from '@/types/api'
import type { RecoveryFeed, RecoverySuggestion } from '@/types/recovery'
import type { PublicObject } from '@/types/ai'
const base = '/api/planning/recovery-suggestions'
export const recoveryApi = {
  list: (status = 'pending', page = 1, signal?: AbortSignal) =>
    request<RecoveryFeed>(`${base}${query({ status, page, per_page: 10 })}`, { signal }),
  get: (id: string, signal?: AbortSignal) =>
    request<Resource<RecoverySuggestion>>(`${base}/${encodeURIComponent(id)}`, { signal }),
  confirm: (
    id: string,
    consent: { accept_partial: boolean; accept_unplaced_cancellation: boolean },
  ) =>
    request<Resource<RecoverySuggestion> & { replayed: boolean }>(
      `${base}/${encodeURIComponent(id)}/confirm`,
      { method: 'POST', body: consent },
    ),
  reject: (id: string) =>
    request<Resource<RecoverySuggestion>>(`${base}/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: {},
    }),
  refresh: (id: string) =>
    request<Resource<RecoverySuggestion>>(`${base}/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
      body: {},
    }),
  diagnostics: (start_date: string, end_date: string, signal?: AbortSignal) =>
    request<Resource<PublicObject>>(
      `/api/planning/recovery/diagnostics${query({ start_date, end_date })}`,
      { signal },
    ),
}
