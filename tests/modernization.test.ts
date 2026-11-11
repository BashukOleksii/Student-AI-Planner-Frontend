import { describe, expect, it, vi } from 'vitest'
import { academicCalendarApi } from '@/api/academicCalendar'
import { recoveryApi } from '@/api/recovery'
import { reviewSupported } from '@/utils/ai'
import { semesterActionTypes } from '@/utils/aiSemester'
import { actionFixture } from './helpers/aiBackend'
import { json } from './fixtures'

describe('modernized backend boundaries', () => {
  it('uses unified academic endpoints without source filtering or session mixing', async () => {
    const data = { data: [], meta: { truncated: true, total: 101, returned: 100 } }
    const fetch = vi.fn(async () => json(data))
    vi.stubGlobal('fetch', fetch)
    expect(await academicCalendarApi.today()).toEqual(data)
    await academicCalendarApi.date('2026-11-02')
    await academicCalendarApi.week('2026-11-02')
    expect(fetch.mock.calls.map((call) => String((call as unknown[])[0]))).toEqual([
      'http://localhost:8000/api/academic-calendar/today',
      'http://localhost:8000/api/academic-calendar/date/2026-11-02',
      'http://localhost:8000/api/academic-calendar/week/2026-11-02',
    ])
  })
  it('keeps recovery decisions on the exact UUID with independent boolean consents', async () => {
    const fetch = vi.fn(async (_url: string, _options?: RequestInit) =>
      json({
        data: { id: 'review-id', receipt: { applied_at: '2026-11-02T12:00:00Z' } },
        replayed: true,
      }),
    )
    vi.stubGlobal('fetch', fetch)
    const result = await recoveryApi.confirm('review-id', {
      accept_partial: true,
      accept_unplaced_cancellation: false,
    })
    expect(result.replayed).toBe(true)
    expect(fetch.mock.calls[0]![0]).toContain('/recovery-suggestions/review-id/confirm')
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
      accept_partial: true,
      accept_unplaced_cancellation: false,
    })
    await recoveryApi.refresh('review-id')
    expect(fetch.mock.calls[1]![1]?.body).toBe('{}')
    expect(fetch.mock.calls[1]![0]).toContain('/review-id/refresh')
  })
  for (const type of semesterActionTypes) {
    it(`requires a complete scoped review for ${type}`, () => {
      const action = actionFixture(type)
      expect(reviewSupported(action)).toBe(true)
      const malformed = structuredClone(action)
      malformed.preview.after = {}
      expect(reviewSupported(malformed)).toBe(false)
      const unsafe = structuredClone(action)
      unsafe.preview.effects = { scope: 'one_date', reschedules_study_sessions: true }
      expect(reviewSupported(unsafe)).toBe(false)
      expect(reviewSupported({ ...action, type: 'propose_unknown' })).toBe(false)
    })
  }
})
