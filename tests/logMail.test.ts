import { describe, expect, it } from 'vitest'
import { resetLinkFromLog } from '../e2e/support/logMail'

describe('private local reset-mail capture', () => {
  const recipient = 'synthetic@example.test'
  for (const prefix of ['12', 'ab', '3d']) {
    it(`preserves a plain token beginning ${prefix}`, () => {
      const token = prefix + 'a'.repeat(62)
      const url = `http://localhost:15173/reset-password?token=${token}&email=synthetic%40example.test`
      expect(resetLinkFromLog(`Reset Password: ${url}\n`, recipient)).toBe(url)
    })
  }
  it('selects the intended recipient from HTML and rejects incomplete links', () => {
    const valid = `http://localhost:15173/reset-password?token=${'a'.repeat(64)}&email=synthetic%40example.test`
    const foreign = valid.replace('synthetic%40', 'other%40')
    expect(
      resetLinkFromLog(`${foreign}\n<a href="${valid.replace('&', '&amp;')}">Reset</a>`, recipient),
    ).toBe(valid)
    expect(resetLinkFromLog(valid.replace('token=', 'missing='), recipient)).toBeUndefined()
  })
  it('handles explicit quoted-printable equals and soft breaks', () => {
    const token = 'b'.repeat(64)
    const encoded = `http://localhost:15173/reset-password?token=3D${token.slice(0, 30)}=\r\n${token.slice(30)}&email=3Dsynthetic%40example.test`
    expect(new URL(resetLinkFromLog(encoded, recipient)!).searchParams.get('token')).toBe(token)
  })
})
