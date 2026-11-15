import { receiptReminderId } from '@/utils/ai'
import { positiveContext, signedOffset, validReminderRange } from '@/utils/reminders'
import { validateComparison, validateReportRange } from '@/utils/statistics'
import { describe, expect, it } from 'vitest'
const range = { start_date: '2026-10-01', end_date: '2026-10-31' }
describe('Reminder contracts and input boundaries', () => {
  it.each(['-32768', '0', '32767'])('accepts signed offset %s', (value) =>
    expect(signedOffset(value)).toBe(Number(value)),
  )
  it.each(['-32769', '32768', '1.5', '+1', '01', 'true', ''])(
    'rejects noncanonical offset %s',
    (value) => expect(() => signedOffset(value)).toThrow(),
  )
  it('validates paired UTC range and exact elapsed limit', () => {
    expect(() => validReminderRange(null, null)).not.toThrow()
    expect(() => validReminderRange('2026-01-01T00:00:00Z', null)).toThrow()
    expect(() => validReminderRange('2026-01-01T00:00:00Z', '2027-01-02T00:00:00Z')).not.toThrow()
    expect(() => validReminderRange('2026-01-01T00:00:00Z', '2027-01-02T00:00:01Z')).toThrow()
  })
  it.each(['1e3', '0', '-1', 'https://evil.test', '1x'])(
    'rejects unsafe target context %s',
    (value) => expect(positiveContext(value)).toBeNull(),
  )
})
describe('Reminder/Inbox HTTP contracts', () => {
  it('exposes receipt-provided reminder identity without interpreting prose', () => {
    expect(receiptReminderId({ reminder: { id: 42 } })).toBe(42)
    expect(receiptReminderId({ content: 'reminder 99' })).toBeNull()
    expect(receiptReminderId({ reminder: { id: '42' } })).toBeNull()
  })
})
describe('Calendar report validation and authoritative metrics', () => {
  it('accepts 31 nominal dates across DST and year 0001 labels', () => {
    expect(() => validateReportRange(range)).not.toThrow()
    expect(() =>
      validateReportRange({ start_date: '0001-01-01', end_date: '0001-01-31' }),
    ).not.toThrow()
  })
  it.each([
    ['2026-10-01', '2026-11-01'],
    ['2026-11-02', '2026-11-01'],
    ['2026-02-30', '2026-03-01'],
    ['', '2026-11-01'],
  ])('rejects invalid report range %s %s', (start_date, end_date) =>
    expect(() => validateReportRange({ start_date, end_date })).toThrow(),
  )
  it.each([
    [
      { start_date: '2026-10-01', end_date: '2026-10-07' },
      { start_date: '2026-10-07', end_date: '2026-10-13' },
    ],
    [
      { start_date: '2026-10-01', end_date: '2026-10-07' },
      { start_date: '2026-10-08', end_date: '2026-10-15' },
    ],
    [
      { start_date: '2026-10-10', end_date: '2026-10-16' },
      { start_date: '2026-10-01', end_date: '2026-10-07' },
    ],
  ])('rejects overlapping, unequal or reversed comparison', (baseline, current) =>
    expect(() => validateComparison(baseline, current)).toThrow(),
  )
})
