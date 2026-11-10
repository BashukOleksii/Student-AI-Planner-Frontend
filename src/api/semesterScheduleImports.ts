import { ApiError, request } from './client'
import { parseSemesterImport, record } from './semesterPayloads'
import type { Parity, PreviewToken } from '@/types/semesterSchedule'

const collection = '/api/semester-schedule-imports'
async function read(path: string, id?: number, options?: Parameters<typeof request>[1]) {
  const result = await request<unknown>(path, options)
  const batch = record(result) && parseSemesterImport(result.data, id)
  if (!batch) throw new ApiError(502)
  return batch
}
export const semesterScheduleImportsApi = {
  upload(period: number, file: File, anchor: string, parity: Parity) {
    const body = new FormData()
    body.set('academic_period_id', String(period))
    body.set('schedule_file', file)
    body.set('parity_anchor_on', anchor)
    body.set('first_week_parity', parity)
    return read(collection, undefined, { method: 'POST', body })
  },
  get: (id: number, signal?: AbortSignal) => read(`${collection}/${id}`, id, { signal }),
  revalidate: (id: number) => read(`${collection}/${id}/revalidate`, id, { method: 'POST' }),
  commit: (id: number, preview_token: PreviewToken, confirmed: true) =>
    read(`${collection}/${id}/commit`, id, { method: 'POST', body: { confirmed, preview_token } }),
}
