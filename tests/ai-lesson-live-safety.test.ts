import { describe, expect, it, vi } from 'vitest'
import {
  authorizeAiLessonLive,
  lessonTestProvider,
  validateAiLessonLiveGrant,
} from '../e2e/support/aiLessonLiveSafety'
import type { BackendIdentity } from '../e2e/support/liveSafety'
const now = Date.parse('2026-11-03T12:00:00Z')
const identity: BackendIdentity = {
  environment: 'testing',
  app_url: 'http://localhost:8000',
  connection: 'mysql',
  driver: 'mysql',
  database: 'student_planner_isolated_stage11_demo',
  pending_migrations: [],
  timezone_column: true,
}
const grant = {
  backend_origin: 'http://localhost:8000',
  environment: 'testing',
  connection: 'mysql',
  database: identity.database,
  running_server_matches_backend_root: true,
  isolated_account: true,
  authorized_nonvaluable_data: true,
  allow_mutations: true,
  database_disposable: true,
  allow_registration: false,
  allow_dispatch: false,
  user_id: 7,
  storage_state: '.auth/stage11-browser.json',
  approved_at: '2026-11-03T11:59:00Z',
  expires_at: '2026-11-03T13:00:00Z',
  scope: 'stage11-ai-lessons',
  provider_class: lessonTestProvider,
  provider_no_external_requests: true,
  subject_id: 4,
}
describe('Stage 11 isolated acceptance gates (pure fixtures; no DB or HTTP)', () => {
  it('accepts only the scoped disposable testing grant, optionally with a distinct second user', () => {
    expect(validateAiLessonLiveGrant(grant, identity, now).scope).toBe('stage11-ai-lessons')
    expect(
      validateAiLessonLiveGrant(
        { ...grant, second_user_id: 8, second_storage_state: '.auth/second.json' },
        identity,
        now,
      ).second_user_id,
    ).toBe(8)
  })
  it.each([
    'student_planner',
    'student_planner_testing',
    'studentplanneracceptance',
    'student_planner_isolated_other',
    'student_planner_isolated_stage11_',
  ])('refuses forbidden/retained database %s even with matching attestation', (database) => {
    expect(() =>
      validateAiLessonLiveGrant({ ...grant, database }, { ...identity, database }, now),
    ).toThrow()
  })
  it.each([
    { scope: 'stage8' },
    { scope: undefined },
    { database_disposable: false },
    { allow_registration: true },
    { allow_dispatch: true },
    { provider_class: 'App\\Services\\AI\\OpenAiResponsesProvider' },
    { provider_no_external_requests: false },
    { subject_id: 0 },
    { subject_id: '4' },
    { expires_at: '2026-11-03T11:59:59Z' },
    { second_user_id: 7, second_storage_state: '.auth/second.json' },
    { second_user_id: 8 },
    { second_storage_state: '.auth/second.json' },
  ])('refuses unsafe preparation %j', (patch) => {
    expect(() => validateAiLessonLiveGrant({ ...grant, ...patch }, identity, now)).toThrow()
  })
  it.each(['local', 'production'])(
    'requires testing, even if a grant matches %s',
    (environment) => {
      expect(() =>
        validateAiLessonLiveGrant({ ...grant, environment }, { ...identity, environment }, now),
      ).toThrow()
    },
  )
  it('refuses before identity probe/browser launch when the new grant is absent', () => {
    vi.stubEnv('STAGE11_LIVE_ALLOW_MUTATIONS', '')
    vi.stubEnv('STAGE11_LIVE_GRANT', '')
    try {
      expect(() => authorizeAiLessonLive()).toThrow(
        'No browser launched; no business requests sent',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
