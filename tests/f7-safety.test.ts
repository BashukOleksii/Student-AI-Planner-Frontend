import { describe, it, expect } from 'vitest'
import { validateLiveGrant, dispatchAllowed, type BackendIdentity } from '../e2e/support/liveSafety'
import { trapDialogTab } from '@/utils/dialog'
const now = Date.parse('2026-10-30T09:00:00Z')
const identity: BackendIdentity = {
  environment: 'local',
  app_url: 'http://localhost:8000',
  connection: 'mysql',
  driver: 'mysql',
  database: 'isolated_planner',
  pending_migrations: [],
  timezone_column: true,
}
const grant = () => ({
  backend_origin: 'http://localhost:8000',
  environment: 'local',
  connection: 'mysql',
  database: 'isolated_planner',
  running_server_matches_backend_root: true,
  isolated_account: true,
  authorized_nonvaluable_data: true,
  allow_mutations: true,
  database_disposable: false,
  allow_registration: false,
  allow_dispatch: false,
  user_id: 7,
  storage_state: '.auth/operator.json',
  approved_at: '2026-10-30T08:59:00Z',
  expires_at: '2026-10-30T10:00:00Z',
})
describe('Live mutation authorization is explicit and bound to effective identity', () => {
  it('accepts an explicitly attested account without assuming the whole database is disposable', () => {
    expect(validateLiveGrant(grant(), identity, 'system', now).user_id).toBe(7)
  })
  it.each([
    { environment: 'production' },
    { database: 'another_database' },
    { backend_origin: 'https://production.example.test' },
    { allow_mutations: false },
    { allow_mutations: 'true' },
    { isolated_account: false },
    { authorized_nonvaluable_data: false },
    { running_server_matches_backend_root: false },
    { user_id: 0 },
    { storage_state: '' },
    { expires_at: '2026-10-30T08:59:59Z' },
    { approved_at: '2026-10-30T09:01:00Z' },
    { expires_at: '2026-11-01T09:00:00Z' },
  ])('refuses unsafe or stale grant %j', (patch) => {
    expect(() => validateLiveGrant({ ...grant(), ...patch }, identity, 'system', now)).toThrow()
  })
  it.each([
    { pending_migrations: ['missing'] },
    { timezone_column: false },
    { driver: 'sqlite' },
    { environment: 'production' },
    { database: 'unexpected' },
  ])('refuses changed runtime/schema %j', (patch) => {
    expect(() => validateLiveGrant(grant(), { ...identity, ...patch }, 'system', now)).toThrow()
  })
  it('requires separate disposable database and registration consent for the legacy account-creating workflow', () => {
    expect(() => validateLiveGrant(grant(), identity, 'registration', now)).toThrow()
    expect(
      validateLiveGrant(
        { ...grant(), allow_registration: true, database_disposable: true },
        identity,
        'registration',
        now,
      ).allow_registration,
    ).toBe(true)
  })
  it('requires all three independent dispatch gates', () => {
    const g = validateLiveGrant(grant(), identity, 'system', now)
    expect(dispatchAllowed(g, '1')).toBe(false)
    expect(dispatchAllowed({ ...g, allow_dispatch: true }, '1')).toBe(false)
    expect(
      dispatchAllowed({ ...g, allow_dispatch: true, database_disposable: true }, undefined),
    ).toBe(false)
    expect(dispatchAllowed({ ...g, allow_dispatch: true, database_disposable: true }, '1')).toBe(
      true,
    )
  })
})
describe('Explicit native dialog keyboard cycle', () => {
  it('wraps forward/backward and excludes disabled or hidden controls', () => {
    const dialog = document.createElement('dialog')
    dialog.open = true
    dialog.innerHTML =
      '<button>First</button><button disabled>Disabled</button><button hidden>Hidden</button><button>Last</button>'
    document.body.append(dialog)
    const first = dialog.querySelector('button')!,
      last = dialog.querySelectorAll('button')[3]!
    last.focus()
    const next = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    trapDialogTab(next, dialog)
    expect(next.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
    const previous = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
    trapDialogTab(previous, dialog)
    expect(document.activeElement).toBe(last)
    dialog.remove()
  })
  it('keeps focus on the dialog when a busy operation disables every control', () => {
    const dialog = document.createElement('dialog')
    dialog.open = true
    dialog.tabIndex = -1
    dialog.innerHTML = '<button disabled>Busy</button>'
    document.body.append(dialog)
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    trapDialogTab(event, dialog)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(dialog)
    dialog.remove()
  })
})
