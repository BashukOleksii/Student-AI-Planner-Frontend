import { query, request } from './client'
import { progressApi } from './endpoints'
import type { Resource } from '@/types/api'
import type { DateRange } from '@/types/planning'
import type { ProgressTrends, ComparisonInput, ProgressComparison } from '@/types/statistics'
export const statisticsApi = {
  progress: (range: DateRange, signal?: AbortSignal) =>
    progressApi(range.start_date, range.end_date, signal),
  trends: (range: DateRange, signal?: AbortSignal) =>
    request<Resource<ProgressTrends>>(`/api/statistics/trends${query(range)}`, { signal }),
  comparison: (input: ComparisonInput, signal?: AbortSignal) =>
    request<Resource<ProgressComparison>>(`/api/statistics/reports/comparison${query(input)}`, {
      signal,
    }),
}
