import { query, request } from './client'
import type { Resource } from '@/types/api'
import type {
  PlanningPreferences,
  AvailabilityWindow,
  AvailabilityInput,
  DateRange,
  WorkScope,
  Interval,
  RangeResource,
  StudyPlan,
  ProtectedPreview,
  ReplanningReview,
  ReplanningResult,
  PersistedPlan,
} from '@/types/planning'
export const planningApi = {
  preferences: (signal?: AbortSignal) =>
    request<Resource<PlanningPreferences>>('/api/planning-preferences', { signal }),
  savePreferences: (body: PlanningPreferences) =>
    request<Resource<PlanningPreferences>>('/api/planning-preferences', { method: 'PUT', body }),
  availability: (signal?: AbortSignal) =>
    request<Resource<AvailabilityWindow[]>>('/api/study-availability-windows', { signal }),
  createWindow: (body: AvailabilityInput) =>
    request<Resource<AvailabilityWindow>>('/api/study-availability-windows', {
      method: 'POST',
      body,
    }),
  updateWindow: (id: number, body: AvailabilityInput) =>
    request<Resource<AvailabilityWindow>>(`/api/study-availability-windows/${id}`, {
      method: 'PATCH',
      body,
    }),
  deleteWindow: (id: number) =>
    request<void>(`/api/study-availability-windows/${id}`, { method: 'DELETE' }),
  freeSlots: (range: DateRange, min_slot_minutes?: number, signal?: AbortSignal) =>
    request<RangeResource<Interval>>(
      `/api/planning/free-slots${query({ ...range, min_slot_minutes })}`,
      { signal },
    ),
  preview: (body: WorkScope, signal?: AbortSignal) =>
    request<Resource<ProtectedPreview<StudyPlan>>>('/api/planning/study-plans/preview', {
      method: 'POST',
      body,
      signal,
    }),
  confirm: (preview_token: string, accept_partial: boolean) =>
    request<Resource<PersistedPlan>>('/api/planning/study-plans/confirm', {
      method: 'POST',
      body: { preview_token, accept_partial },
    }),
  replanPreview: (body: WorkScope, signal?: AbortSignal) =>
    request<Resource<ProtectedPreview<ReplanningReview>>>('/api/planning/replanning/preview', {
      method: 'POST',
      body,
      signal,
    }),
  replanConfirm: (
    preview_token: string,
    accept_partial: boolean,
    accept_unplaced_cancellation: boolean,
  ) =>
    request<Resource<ReplanningResult>>('/api/planning/replanning/confirm', {
      method: 'POST',
      body: { preview_token, accept_partial, accept_unplaced_cancellation },
    }),
}
