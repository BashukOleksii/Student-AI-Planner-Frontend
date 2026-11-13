import { query, request } from './client'
import type { Resource } from '@/types/api'
import type {
  PlanningPreferences,
  PlanningDiagnostics,
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
  RecoveryPreview,
  WorkloadAdvice,
  WorkloadAnalytics,
} from '@/types/planning'
export interface WorkOptions {
  data: { id: number; title: string }[]
  meta: {
    current_page: number
    last_page: number
    total: number
    has_subtasks?: boolean
    all_subtasks_completed?: boolean
    task_available?: boolean
  }
}
export const planningApi = {
  workOptions: (
    filters: {
      search?: string
      page?: number
      task_id?: number
      subtask_id?: number
      mode?: 'planning' | 'replanning'
    },
    signal?: AbortSignal,
  ) => request<WorkOptions>(`/api/planning/work-options${query(filters)}`, { signal }),
  diagnostics: (range: DateRange, minimum?: number, signal?: AbortSignal) =>
    request<Resource<PlanningDiagnostics>>(
      `/api/planning/diagnostics${query({ ...range, min_slot_minutes: minimum })}`,
      { signal },
    ),
  workloadAdvice: (range: DateRange, signal?: AbortSignal) =>
    request<Resource<WorkloadAdvice>>(
      `/api/planning/workload-advice${query({ start_date: range.start_date, end_date: range.end_date })}`,
      { signal },
    ),
  workloadAnalytics: (range: DateRange, signal?: AbortSignal) =>
    request<Resource<WorkloadAnalytics>>(
      `/api/planning/workload-analytics${query({ start_date: range.start_date, end_date: range.end_date })}`,
      { signal },
    ),
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
  recoveryPreview: (body: WorkScope, signal?: AbortSignal) =>
    request<Resource<RecoveryPreview>>('/api/planning/recovery/preview', {
      method: 'POST',
      body,
      signal,
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
    accept_split_replacements = false,
  ) =>
    request<Resource<ReplanningResult>>('/api/planning/replanning/confirm', {
      method: 'POST',
      body: {
        preview_token,
        accept_partial,
        accept_unplaced_cancellation,
        ...(accept_split_replacements ? { accept_split_replacements } : {}),
      },
    }),
}
