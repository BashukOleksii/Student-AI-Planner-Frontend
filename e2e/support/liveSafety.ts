import { readFileSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
export interface BackendIdentity {
  environment: string
  app_url: string
  connection: string
  driver: string
  database: string
  pending_migrations: string[]
  timezone_column: boolean
}
export interface LiveGrant {
  backend_origin: 'http://localhost:8000'
  environment: 'local' | 'testing'
  connection: string
  database: string
  running_server_matches_backend_root: true
  isolated_account: true
  authorized_nonvaluable_data: true
  allow_mutations: true
  database_disposable: boolean
  allow_registration: boolean
  allow_dispatch: boolean
  user_id: number
  storage_state: string
  approved_at: string
  expires_at: string
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid live safety document.')
  return value as Record<string, unknown>
}
export function validateLiveGrant(
  value: unknown,
  identity: BackendIdentity,
  mode: 'system' | 'registration',
  now = Date.now(),
): LiveGrant {
  const grant = object(value)
  const approved = Date.parse(String(grant.approved_at)),
    expires = Date.parse(String(grant.expires_at))
  if (
    grant.backend_origin !== 'http://localhost:8000' ||
    identity.app_url !== grant.backend_origin ||
    !['local', 'testing'].includes(String(grant.environment)) ||
    grant.environment !== identity.environment ||
    grant.connection !== identity.connection ||
    grant.database !== identity.database ||
    identity.driver !== 'mysql' ||
    !identity.timezone_column ||
    identity.pending_migrations.length !== 0 ||
    grant.running_server_matches_backend_root !== true ||
    grant.isolated_account !== true ||
    grant.authorized_nonvaluable_data !== true ||
    grant.allow_mutations !== true ||
    !Number.isSafeInteger(grant.user_id) ||
    Number(grant.user_id) <= 0 ||
    typeof grant.storage_state !== 'string' ||
    !grant.storage_state ||
    typeof grant.database_disposable !== 'boolean' ||
    typeof grant.allow_registration !== 'boolean' ||
    typeof grant.allow_dispatch !== 'boolean' ||
    !Number.isFinite(approved) ||
    !Number.isFinite(expires) ||
    approved > now ||
    expires <= now ||
    expires - approved > 86400000 ||
    expires <= approved ||
    (mode === 'registration' &&
      (grant.allow_registration !== true || grant.database_disposable !== true))
  )
    throw new Error(
      'Live mutation preflight refused: identity, schema, authorization or grant expiry mismatch. No business requests sent.',
    )
  return grant as unknown as LiveGrant
}
export function privateAuthPath(path: string): string {
  const file = realpathSync(resolve(path)),
    root = resolve('.auth') + sep
  if (!file.startsWith(root))
    throw new Error('Live authorization and storage state must be kept under ignored .auth/.')
  return file
}
export function readBackendIdentity(root: string): BackendIdentity {
  try {
    const value: unknown = JSON.parse(
      execFileSync('php', [resolve('e2e/support/inspect-backend.php'), resolve(root)], {
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )
    const identity = object(value)
    if (
      !['environment', 'app_url', 'connection', 'driver', 'database'].every(
        (key) => typeof identity[key] === 'string',
      ) ||
      !Array.isArray(identity.pending_migrations) ||
      !identity.pending_migrations.every((v) => typeof v === 'string') ||
      typeof identity.timezone_column !== 'boolean'
    )
      throw new Error()
    return identity as unknown as BackendIdentity
  } catch {
    throw new Error('Read-only effective backend/database probe failed. No business requests sent.')
  }
}
export function authorizeLive(mode: 'system' | 'registration') {
  if (
    process.env.F7_LIVE_ALLOW_MUTATIONS !== '1' ||
    !process.env.F7_LIVE_GRANT ||
    !process.env.F7_BACKEND_ROOT
  )
    throw new Error(
      'BLOCKED: live mutations require F7_LIVE_ALLOW_MUTATIONS=1, ignored F7_LIVE_GRANT and F7_BACKEND_ROOT. No browser launched.',
    )
  const identity = readBackendIdentity(process.env.F7_BACKEND_ROOT)
  const grant = validateLiveGrant(
    JSON.parse(readFileSync(privateAuthPath(process.env.F7_LIVE_GRANT), 'utf8')),
    identity,
    mode,
  )
  const storageState = privateAuthPath(grant.storage_state)
  return { grant, identity, storageState, backendRoot: resolve(process.env.F7_BACKEND_ROOT) }
}
export function dispatchAllowed(grant: LiveGrant, optIn: string | undefined) {
  return grant.allow_dispatch === true && grant.database_disposable === true && optIn === '1'
}
