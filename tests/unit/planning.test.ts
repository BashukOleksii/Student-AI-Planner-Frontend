import {
  canonicalWallTime,
  exactDateTime,
  nullableMinutes,
  reviewValue,
  validateRange,
} from '@/utils/planning'
import { describe, expect, it } from 'vitest'
describe('Planning input and timezone contracts', () => {
  it.each(['', '0', '-1', '1.5', '01', '65536', 'true'])(
    'validates optional integer %s',
    (value) => {
      if (value === '') expect(nullableMinutes(value)).toBeNull()
      else expect(() => nullableMinutes(value)).toThrow()
    },
  )
  it('accepts exact bounds and a 31-date period across DST', () => {
    expect(nullableMinutes('65535')).toBe(65535)
    expect(() => validateRange({ start_date: '2026-10-01', end_date: '2026-10-31' })).not.toThrow()
  })
  it.each([
    ['2026-10-01', '2026-11-01'],
    ['2026-11-02', '2026-11-01'],
    ['2026-02-30', '2026-03-01'],
    ['2026-1-01', '2026-01-01'],
  ])('rejects invalid range %s %s', (start_date, end_date) => {
    expect(() => validateRange({ start_date, end_date })).toThrow()
  })
  it('preserves recurring wall time and permits 24:00 only as end', () => {
    expect(canonicalWallTime('09:15')).toBe('09:15:00')
    expect(canonicalWallTime('24:00:00', true)).toBe('24:00:00')
    expect(() => canonicalWallTime('24:00:00')).toThrow()
    expect(() => canonicalWallTime('24:00:01', true)).toThrow()
  })
  it('shows repeated local times with distinct UTC offsets and exact seconds', () => {
    const a = exactDateTime('2026-10-25T00:30:10Z', 'Europe/Kyiv'),
      b = exactDateTime('2026-10-25T01:30:10Z', 'Europe/Kyiv')
    expect(a).not.toBe(b)
    expect(a).toContain(':10')
  })
  it('strips protected tokens at every display depth and escapes text through Vue', () => {
    expect(
      reviewValue({
        preview_token: 'secret',
        nested: { preview_token: 'secret', text: '<script>bad</script>' },
      }),
    ).toEqual({ nested: { text: '<script>bad</script>' } })
  })
})
