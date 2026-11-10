import { academicApi } from '@/api/academic'
import { useResource } from './useResource'

export function useSemesterPeriods(enabled = true) {
  return useResource(async (signal) => {
    if (!enabled) return null
    const [periods, institutions] = await Promise.all([
      academicApi.periods.list(signal),
      academicApi.institutions.list(signal),
    ])
    return { periods: periods.data, institutions: institutions.data }
  })
}
