import { shallowRef, watch } from 'vue'
import { semesterSchedulesApi } from '@/api/semesterSchedules'
import type { ManagementResponse } from '@/types/semesterSchedule'
import { useResource } from './useResource'
import { useSemesterMutation } from './useSemesterMutation'

export function useSemesterManagement(
  id: number,
  loader: (signal: AbortSignal) => Promise<ManagementResponse> = (signal) =>
    semesterSchedulesApi.management(id, signal),
  confirmLeave?: () => boolean | Promise<boolean>,
) {
  const action = useSemesterMutation(confirmLeave)
  const state = shallowRef<ManagementResponse | null>(null)
  const resource = useResource(loader)
  watch(resource.data, (value) => {
    if (!value) return
    state.value = value
    if (action.blocked.value) {
      action.blocked.value = null
      action.review.value = true
      action.error.value = null
    }
  })
  async function save(write: (token: string) => Promise<ManagementResponse>) {
    if (!state.value || resource.loading.value || resource.error.value) return
    const token = state.value.meta.schedule_token
    const result = await action.run(() => write(token))
    if (result) state.value = result
    return result
  }
  return { ...action, state, resource, save }
}
