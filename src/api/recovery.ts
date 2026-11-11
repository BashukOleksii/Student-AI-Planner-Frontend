import { recoveryResource, recoveryFeed } from './recoveryPayloads'
import { isObject } from '@/utils/ai'
import { ApiError } from './client'
import { request, query } from './client'
import type { Resource } from '@/types/api'
import type { PublicObject } from '@/types/ai'
const base = '/api/planning/recovery-suggestions'
export const recoveryApi = {
  list: (status = 'pending', page = 1, signal?: AbortSignal) =>
    request<unknown>(`${base}${query({ status, page, per_page: 10 })}`, { signal }).then(
      recoveryFeed,
    ),
  get: (id: string, signal?: AbortSignal) =>
    request<unknown>(`${base}/${encodeURIComponent(id)}`, { signal }).then((value) =>
      recoveryResource(value, id),
    ),
  confirm: (
    id: string,
    consent: { accept_partial: boolean; accept_unplaced_cancellation: boolean },
  ) =>
    request<unknown>(`${base}/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      body: consent,
    }).then((value) => {
      if (!isObject(value) || typeof value.replayed !== 'boolean') throw new ApiError(502)
      return { ...recoveryResource(value, id), replayed: value.replayed }
    }),
  reject: (id: string) =>
    request<unknown>(`${base}/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: {},
    }).then((value) => recoveryResource(value, id)),
  refresh: (id: string) =>
    request<unknown>(`${base}/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
      body: {},
    }).then((value) => recoveryResource(value)),
  diagnostics: (start_date: string, end_date: string, signal?: AbortSignal) =>
    request<Resource<PublicObject>>(
      `/api/planning/recovery/diagnostics${query({ start_date, end_date })}`,
      { signal },
    ),
}
