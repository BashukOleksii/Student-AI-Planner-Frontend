import { setAuthErrorHandler } from '@/api/client'
import { consentFields, reviewSupported, validMessage } from '@/utils/ai'
import { clearAiIntents, readIntent, saveIntent } from '@/utils/aiIntent'
import { beforeEach, describe, expect, it } from 'vitest'
import { actionFixture } from '../helpers/aiBackend'
beforeEach(() => setAuthErrorHandler(undefined))
describe('AI REST contracts', () => {
  it('blocks incomplete/unknown reviews and unsupported consent instead of guessing', () => {
    const resource = actionFixture()
    expect(reviewSupported({ ...resource, type: 'unknown' })).toBe(false)
    expect(reviewSupported({ ...resource, preview: {} })).toBe(false)
    expect(
      reviewSupported({
        ...resource,
        preview: { ...resource.preview, required_consent: ['accept_partial'] },
      }),
    ).toBe(false)
    expect(consentFields(actionFixture('propose_adaptive_replanning'))).toEqual([
      'accept_partial',
      'accept_unplaced_cancellation',
    ])
  })
})
describe('unresolved intent and input', () => {
  it('keeps exact text/key scoped to owner and conversation until resolved or explicitly cleared', () => {
    const pending = {
      ownerId: 1,
      conversationId: 2,
      key: crypto.randomUUID(),
      content: ' Exact\ntext ',
      createdAt: Date.now(),
    }
    expect(saveIntent(pending)).toBe(true)
    expect(readIntent(1, 2)).toEqual(pending)
    expect(readIntent(2, 2)).toBeNull()
    expect(localStorage.length).toBe(0)
    clearAiIntents()
    expect(readIntent(1, 2)).toBeNull()
    saveIntent({ ...pending, createdAt: Date.now() - 86400001 })
    expect(readIntent(1, 2)?.key).toBe(pending.key)
  })
  it('validates Unicode characters without trimming or counting surrogate pairs twice', () => {
    expect(validMessage('😀'.repeat(4000))).toBe(true)
    expect(validMessage('😀'.repeat(4001))).toBe(false)
    for (const value of ['', ' \n\u200b', '\u0000abc', '\ud800'])
      expect(validMessage(value)).toBe(false)
    expect(validMessage('  Вітаю\n')).toBe(true)
  })
})
