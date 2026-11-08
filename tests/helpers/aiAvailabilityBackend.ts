import { aiBackend } from './aiBackend'
import { availabilityWindow } from './aiAvailabilityFixtures'
import { isAvailabilityAction, availabilityReceipt } from '@/utils/aiAvailability'
import type { MockReply } from './f2Backend'

// Compose the existing chat/decision fixture; only availability current-state reads/writes are added.
export function aiAvailabilityBackend() {
  const ai = aiBackend()
  const windows = new Map([[12, availabilityWindow()]])
  const requests: { path: string; method: string; body: Record<string, unknown> }[] = []
  function handle(
    url: string,
    method = 'GET',
    body: Record<string, unknown> = {},
    headers?: HeadersInit,
  ): MockReply {
    const path = new URL(url).pathname
    requests.push({ path, method, body })
    if (path === '/api/study-availability-windows' && method === 'GET')
      return { status: 200, body: { data: [...windows.values()] } }
    const decision = path.match(/\/actions\/([^/]+)\/(confirm|reject)$/)
    const action = ai.actions.find((row) => row.id === decision?.[1])
    const availability = action && isAvailabilityAction(action.type) && method === 'POST'
    if (availability && Object.keys(body).length)
      return { status: 422, body: { errors: { body: ['Only an empty object is accepted.'] } } }
    const wasPending = action?.status === 'pending'
    const result = ai.handle(url, method, body, headers)
    if (availability && wasPending && action.status === 'executed') {
      const receipt = availabilityReceipt(action.receipt, action.type, action.id)!
      if (receipt.window) windows.set(receipt.window.id, structuredClone(receipt.window))
      if (receipt.deleted_window) windows.delete(receipt.deleted_window.id)
    }
    return result
  }
  return {
    ai,
    windows,
    requests,
    handle,
    get executions() {
      return ai.executions
    },
  }
}
