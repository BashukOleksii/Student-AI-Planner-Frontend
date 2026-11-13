// Transport-to-store signal: no business rules or direct dependency on Pinia.
const listeners = new Set<() => void>()
export function onPlanningMutation(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function planningMutationSucceeded(path: string, method: string) {
  if (method === 'GET') return
  const planningInput =
    /^\/api\/(study-availability-windows|planning-preferences|tasks|lessons|academic-periods|semester-schedules|study-sessions)(?:\/|$)/.test(
      path,
    )
  const confirmedPlan = /^\/api\/planning\/(?:study-plans|replanning)\/confirm$/.test(path)
  const recoveryDecision =
    /^\/api\/planning\/recovery-suggestions\/[^/]+\/(?:confirm|reject|refresh)$/.test(path)
  const importCommit =
    /^\/api\/(?:schedule-imports|semester-schedule-imports)\/[^/]+\/commit$/.test(path)
  const aiConfirm = /^\/api\/ai\/conversations\/[^/]+\/actions\/[^/]+\/confirm$/.test(path)
  if (
    planningInput ||
    confirmedPlan ||
    recoveryDecision ||
    importCommit ||
    aiConfirm ||
    path === '/api/profile'
  ) {
    // Preview/upload operations do not change planning inputs.
    if (/\/(?:preview|revalidate)$/.test(path)) return
    for (const listener of listeners) listener()
  }
}
