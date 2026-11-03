import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  privateAuthPath,
  readBackendIdentity,
  validateLiveGrant,
  type BackendIdentity,
  type LiveGrant,
} from './liveSafety'

export const lessonTestProvider = 'Stage11Acceptance\\ScriptedLlmProvider'
export interface AiLessonLiveGrant extends LiveGrant {
  scope: 'stage11-ai-lessons'
  provider_class: typeof lessonTestProvider
  provider_no_external_requests: true
  subject_id: number
  second_user_id?: number
  second_storage_state?: string
}
export function validateAiLessonLiveGrant(
  value: unknown,
  identity: BackendIdentity,
  now = Date.now(),
): AiLessonLiveGrant {
  const grant = validateLiveGrant(value, identity, 'system', now)
  const extra = value as Record<string, unknown>
  if (
    extra.scope !== 'stage11-ai-lessons' ||
    identity.environment !== 'testing' ||
    !/^student_planner_isolated_stage11_[a-z0-9_]{1,24}$/.test(identity.database) ||
    grant.database_disposable !== true ||
    grant.allow_registration !== false ||
    grant.allow_dispatch !== false ||
    extra.provider_class !== lessonTestProvider ||
    extra.provider_no_external_requests !== true ||
    !Number.isSafeInteger(extra.subject_id) ||
    Number(extra.subject_id) <= 0 ||
    ((extra.second_user_id !== undefined || extra.second_storage_state !== undefined) &&
      (!Number.isSafeInteger(extra.second_user_id) ||
        Number(extra.second_user_id) <= 0 ||
        extra.second_user_id === grant.user_id ||
        typeof extra.second_storage_state !== 'string' ||
        !extra.second_storage_state))
  )
    throw new Error(
      'BLOCKED: Stage 11 requires a fresh scoped grant, disposable testing namespace and verified non-network provider seam.',
    )
  return value as AiLessonLiveGrant
}
export interface LessonRows {
  lessons: {
    id: number
    subject_id: number
    teacher_id: number | null
    academic_period_id: number | null
    type: string
    room: string | null
    starts_at: string
    ends_at: string
    status: string
    replaces_lesson_id: number | null
    deleted_at: string | null
  }[]
  study_sessions: unknown[]
}
export function inspectLessonRows(backendRoot: string, grant: AiLessonLiveGrant): LessonRows {
  // A narrow read-only SQL observer, never a seeder or a pending-action writer.
  return JSON.parse(
    execFileSync(
      'php',
      [
        resolve('e2e/support/inspect-ai-lessons.php'),
        backendRoot,
        grant.database,
        String(grant.user_id),
      ],
      {
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ),
  ) as LessonRows
}
export function authorizeAiLessonLive() {
  if (
    process.env.STAGE11_LIVE_ALLOW_MUTATIONS !== '1' ||
    !process.env.STAGE11_LIVE_GRANT ||
    !process.env.F7_BACKEND_ROOT
  )
    throw new Error(
      'BLOCKED: no new Stage 11 operator grant. No browser launched; no business requests sent.',
    )
  const document: unknown = JSON.parse(
    readFileSync(privateAuthPath(process.env.STAGE11_LIVE_GRANT), 'utf8'),
  )
  const backendRoot = resolve(process.env.F7_BACKEND_ROOT)
  const identity = readBackendIdentity(backendRoot)
  const grant = validateAiLessonLiveGrant(document, identity)
  const storageState = privateAuthPath(grant.storage_state)
  const secondStorageState = grant.second_storage_state
    ? privateAuthPath(grant.second_storage_state)
    : undefined
  // This also refuses the production OpenAI binding before launching a browser.
  inspectLessonRows(backendRoot, grant)
  return { grant, identity, backendRoot, storageState, secondStorageState }
}
