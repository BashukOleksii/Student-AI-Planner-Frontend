import { emailVerificationApi } from '@/api/emailVerification'
import {
  validVerificationPath,
  verificationPathFromLink,
  verificationRetrySeconds,
} from '@/utils/emailVerification'
import { describe, expect, it, vi } from 'vitest'
import { verificationPage, verificationPath } from '../helpers/emailVerificationBackend'
const invalidPaths = [
  '',
  'https://evil.test' + verificationPath,
  '//evil.test' + verificationPath,
  '/api/profile/email/verify/1/' + 'a'.repeat(40),
  verificationPath + '&redirect=https://evil.test',
  verificationPath + '#fragment',
  verificationPath.replace('/verify/1/', '/verify/../'),
  verificationPath.replace('/verify/1/', '/verify/%31/'),
  verificationPath.replace('/verify/1/', '/verify/1\\/'),
  verificationPath.replace('expires=2000000000', 'expires=invalid'),
  verificationPath.replace('signature=' + 'b'.repeat(64), 'signature=short'),
  verificationPath.replace('/api/profile/email/verify/', '/api/tasks/'),
  verificationPath.replace('?', '?expires=1&'),
  encodeURIComponent(verificationPath),
  verificationPath + '\n',
]
describe('email verification path boundary', () => {
  it('decodes the outer wrapper exactly once and retains the original nested query order', async () => {
    const reordered = `/api/profile/email/verify/1/${'a'.repeat(40)}?signature=${'b'.repeat(64)}&expires=02000000000`
    expect(verificationPathFromLink(verificationPage(reordered))).toBe(reordered)
    const get = vi.spyOn(URLSearchParams.prototype, 'get')
    expect(verificationPathFromLink(verificationPage())).toBe(verificationPath)
    expect(get).toHaveBeenCalledTimes(1)
    get.mockRestore()
    expect(
      verificationPathFromLink(
        verificationPage() + '&verification_path=' + encodeURIComponent(verificationPath),
      ),
    ).toBeNull()
    expect(verificationPathFromLink('/verify-email')).toBeNull()
  })
  it.each(invalidPaths)(
    'rejects an unsafe/malformed target before any request: %s',
    async (path) => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      expect(validVerificationPath(path)).toBe(false)
      expect(verificationPathFromLink(verificationPage(path))).toBeNull()
      await expect(emailVerificationApi.confirm(path)).rejects.toMatchObject({ status: 400 })
      expect(fetch).not.toHaveBeenCalled()
    },
  )
  it('interprets seconds and HTTP dates for Retry-After without displaying raw text', () => {
    const now = Date.parse('2026-11-14T12:00:00Z')
    expect(verificationRetrySeconds('60', now)).toBe(60)
    expect(verificationRetrySeconds('Sat, 14 Nov 2026 12:01:00 GMT', now)).toBe(60)
    expect(verificationRetrySeconds('Sat, 14 Nov 2026 11:01:00 GMT', now)).toBe(0)
    expect(verificationRetrySeconds('PRIVATE_HEADER', now)).toBe(0)
    expect(verificationRetrySeconds(null, now)).toBe(0)
  })
})
