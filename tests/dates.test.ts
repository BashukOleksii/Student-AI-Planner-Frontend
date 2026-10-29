import { describe, expect, it, vi } from 'vitest'
import {
  browserTimezone,
  addDays,
  localDate,
  localEndDate,
  toLocalInput,
  toUtc,
} from '@/utils/dates'
describe('profile timezone conversions', () => {
  it('uses profile timezone rather than browser timezone and whole-second UTC', () => {
    expect(toUtc('2026-10-06T10:30', 'Europe/Kyiv')).toBe('2026-10-06T07:30:00Z')
    expect(toLocalInput('2026-10-06T07:30:22Z', 'Europe/Kyiv')).toBe('2026-10-06T10:30:22')
    expect(toUtc('', 'Europe/Kyiv')).toBeNull()
  })
  it('rejects missing and repeated local times at DST transitions', () => {
    expect(() => toUtc('2026-03-29T03:30', 'Europe/Kyiv')).toThrow()
    expect(() => toUtc('2026-10-25T03:30', 'Europe/Kyiv')).toThrow()
  })
  it('adds calendar days over DST and respects offset date boundaries', () => {
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(localDate('2026-10-29T23:30:00Z', 'Europe/Kyiv')).toBe('2026-10-30')
    expect(localEndDate('2026-10-30T00:00:00+02:00', 'Europe/Kyiv')).toBe('2026-10-29')
  })
})

it('canonicalizes the browser Europe/Kiev alias accepted by neither the current Laravel timezone validator nor the registration contract', () => {
  const original = Intl.DateTimeFormat().resolvedOptions()
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    ...original,
    timeZone: 'Europe/Kiev',
  })
  expect(browserTimezone()).toBe('Europe/Kyiv')
})
