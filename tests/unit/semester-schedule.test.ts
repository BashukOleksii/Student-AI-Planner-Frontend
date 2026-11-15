import { managementState, parseManagement } from '@/api/semesterPayloads'
import { calendarDate, displayDates } from '@/utils/semesterSchedule'
import { describe, expect, it } from 'vitest'
import { semesterBackend, weekly } from '../helpers/semesterBackend'
describe('Stage 5 Laravel response contracts', () => {
  it('keeps strict four-digit dates and ends the display range at the server boundary', () => {
    expect(calendarDate('0001-01-01')).toBe(true)
    expect(calendarDate('0000-01-01')).toBe(false)
    expect(calendarDate('2026-02-30')).toBe(false)
    expect(displayDates('9999-12-31', '9999-12-31')).toEqual(['9999-12-31'])
  })
  it('narrows the management resource and verifies its schedule identity and token', () => {
    const { response } = semesterBackend({ savedDays: true })
    expect(parseManagement(response, managementState, 1)).toEqual(response)
    expect(() =>
      parseManagement(
        { ...response, meta: { ...response.meta, schedule_token: 'wrong' } },
        managementState,
        1,
      ),
    ).toThrow()
    expect(() => parseManagement(response, managementState, 2)).toThrow()
    expect(() =>
      parseManagement(
        { ...response, data: { ...response.data, weekly_rules: [{ ...weekly, teacher: {} }] } },
        managementState,
        1,
      ),
    ).toThrow()
  })
})
